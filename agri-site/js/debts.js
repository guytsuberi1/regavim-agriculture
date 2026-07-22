/* debts.js — ניהול חובות חקלאים
   מבנה: למעלה טבלה מסכמת (שורה לכל חקלאי + יתרה כוללת), למטה בורר חקלאי
   שפותח כרטיס עם פירוט חודשי (חיוב מערכת / ידני / תשלומים / זיכויים + יתרה מצטברת).
   יתרה = חוב פתיחה ידני + חיובים ידניים − תשלומים − זיכויים + חיוב שוטף מדרישת התשלום. */
(function (global) {
  'use strict';
  var U = global.U;

  // מצב תצוגה (נשמר בין רינדורים)
  var filterStatus = '';
  var selectedSiteId = null;

  // ---------- סטטוסים (תואם לצ'יפים בגיליון) ----------
  var STATUSES = [
    { value: 'בטיפול', bg: '#FEF3C7', fg: '#92400E' },
    { value: 'פתוחה', bg: '#DBEAFE', fg: '#1E40AF' },
    { value: 'תהליך הוצל"פ', bg: '#EDE9FE', fg: '#5B21B6' },
    { value: 'חוב אבוד', bg: '#FEE2E2', fg: '#991B1B' },
    { value: 'שולם', bg: '#DCFCE7', fg: '#166534' }
  ];
  function statusDef(v) {
    for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].value === v) return STATUSES[i];
    return null;
  }
  function statusChip(v) {
    var d = statusDef(v);
    if (!d) return U.el('span', { class: 'tag', style: 'background:#eee;color:#666;', text: v || '—' });
    return U.el('span', { style: 'display:inline-block;border-radius:12px;padding:2px 10px;font-size:12px;font-weight:600;background:' + d.bg + ';color:' + d.fg + ';', text: v });
  }

  // ---------- עזרי כסף ----------
  function money(n) {
    n = Math.round((U.num(n)) * 100) / 100;
    return n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ₪';
  }

  // תזכורת תשלום בוואטסאפ
  function waNum(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.indexOf('972') === 0) return d;
    if (d.charAt(0) === '0') return '972' + d.slice(1);
    if (d.length === 9) return '972' + d;
    return d;
  }
  function waDebtBtn(s, balance) {
    var wn = waNum(s.phone);
    var msg = 'שלום ' + (s.contactName || s.name) + ',\nתזכורת: נותרה יתרת חוב לתשלום בסך ' + money(balance) + '.\nנשמח להסדרה בהקדם. תודה, רגבים בנימין';
    return U.el('a', {
      class: 'btn small ico no-print', target: '_blank', rel: 'noopener',
      href: (wn ? 'https://wa.me/' + wn : 'https://wa.me/') + '?text=' + encodeURIComponent(msg),
      style: 'background:#25D366;color:#fff;border:0;',
      title: 'תזכורת תשלום בוואטסאפ' + (wn ? '' : ' (אין מספר — בחרו ידנית)'),
      html: U.WA_SVG
    });
  }

  // צבע יתרה — רמזור מדורג: ירוק=שולם/אפס · כתום=חוב · אדום בוהק=חוב גבוה · כחול=זכות
  function balStyle(bal) {
    if (Math.abs(bal) < 0.005) return 'color:#15803d;';
    if (bal >= 5000) return 'color:#dc2626;';
    if (bal > 0) return 'color:#b45309;';
    return 'color:#2563eb;';
  }

  // רינדור עם שמירת מיקום הגלילה (מונע קפיצה לראש הדף בעדכונים בתוך הדף)
  function renderKeepScroll() {
    var y = window.scrollY;
    App.render();
    window.scrollTo(0, y);
    requestAnimationFrame(function () { window.scrollTo(0, y); });
  }

  // ---------- גישה לנתונים ----------
  function records() { return Store.get().debtRecords || []; }
  function entries() { return Store.get().debtEntries || []; }
  function recordsForSite(siteId) { return records().filter(function (r) { return r.siteId === siteId; }); }
  function entriesForRecord(rid) { return entries().filter(function (e) { return e.recordId === rid; }); }
  function entriesForSite(siteId) { return entries().filter(function (e) { return e.siteId === siteId; }); }
  function sumKind(arr, kind) {
    return arr.filter(function (e) { return e.kind === kind; })
      .reduce(function (a, e) { return a + U.num(e.amount); }, 0);
  }
  function billedMap() { return (global.BillingUtil ? global.BillingUtil.billedBySite() : {}); }
  function siteOf(id) { return Store.getById('sites', id) || { name: '(אתר נמחק)' }; }

  function recordBalance(rec) {
    var es = entriesForRecord(rec.id);
    return U.num(rec.openingDebt) + sumKind(es, 'charge') - sumKind(es, 'payment') - sumKind(es, 'credit');
  }
  function billingBalance(siteId, billedTotal) {
    var es = entriesForRecord('bill:' + siteId);
    return U.num(billedTotal) - sumKind(es, 'payment') - sumKind(es, 'credit');
  }

  // אגרגציה לכל חקלאי (אתר)
  function farmerAgg() {
    var billed = billedMap();
    var map = {}; // siteId -> agg
    function ensure(siteId) {
      if (!map[siteId]) map[siteId] = { siteId: siteId, recs: [], billed: null, balance: 0, statuses: {}, handlers: {}, years: {} };
      return map[siteId];
    }
    records().forEach(function (rec) {
      var a = ensure(rec.siteId);
      a.recs.push(rec);
      // חוב בסטטוס "שולם" אינו נספר ביתרה/בסה"כ
      a.balance += (rec.status === 'שולם') ? 0 : recordBalance(rec);
      if (rec.status) a.statuses[rec.status] = true;
      if (rec.handledBy) a.handlers[rec.handledBy] = true;
      if (rec.debtYear) a.years[rec.debtYear] = true;
    });
    // חיוב שוטף מהמערכת — מוסתר כשמנהלים חובות מפנקס Priority (החיובים כבר בו, למניעת כפילות)
    if (!(Store.get().settings || {}).debtHideBilling) {
      Object.keys(billed).forEach(function (siteId) {
        if (U.num(billed[siteId].total) <= 0) return;
        var a = ensure(siteId);
        a.billed = billed[siteId];
        a.balance += billingBalance(siteId, billed[siteId].total);
      });
    }
    return map;
  }

  function aggPassesFilter(a) {
    if (filterStatus) { if (!a.statuses[filterStatus]) return false; }
    return true;
  }

  // ---------- רינדור ראשי ----------
  function render(root) {
    var map = farmerAgg();
    var allAggs = Object.keys(map).map(function (k) { return map[k]; });
    var grandAll = allAggs.reduce(function (a, x) { return a + x.balance; }, 0);

    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '💰 ניהול חובות חקלאים' }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn', onclick: function () { openRecord(null, selectedSiteId || ''); } }, '+ חוב חדש'),
      U.actionMenu([
        (Store.serverMode ? { icon: '🤖', label: 'ייבוא PDF מהעמותה (AI)', onClick: importDebtsPdf } : null) ,
        { html: U.XLS_SVG, label: 'ייבוא מאקסל', onClick: importDebtsExcel },
        { icon: '📄', label: 'אקסל לדוגמה לייבוא', onClick: downloadDebtTemplate },
        null,
        { icon: '⬇', label: 'ייצוא לאקסל', onClick: exportExcel },
        { icon: '🖨️', label: 'הדפסה', onClick: function () { window.print(); } }
      ].filter(Boolean))
    ]);
    root.appendChild(head);

    // ----- סינון לפי סטטוס -----
    var statusSel = U.el('select', null, [U.el('option', { value: '' }, 'כל הסטטוסים')].concat(
      STATUSES.map(function (s) { return U.el('option', { value: s.value }, s.value); })));
    statusSel.value = filterStatus;
    statusSel.addEventListener('change', function () { filterStatus = statusSel.value; App.render(); });
    var billChk = U.el('input', { type: 'checkbox', checked: !(Store.get().settings || {}).debtHideBilling });
    billChk.addEventListener('change', function () {
      var d = Store.get(); if (!d.settings) d.settings = {}; d.settings.debtHideBilling = !billChk.checked; Store.save(); App.render();
    });
    root.appendChild(U.el('div', { class: 'no-print', style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:12px;' }, [
      U.el('span', { class: 'muted', text: 'סינון לפי סטטוס:' }), statusSel,
      U.el('label', { style: 'display:inline-flex;gap:6px;align-items:center;cursor:pointer;', title: 'כשמנהלים חובות מפנקס Priority — כבו כדי לא לספור פעמיים' }, [billChk, U.el('span', { class: 'muted', text: 'הצג חיוב שוטף מהמערכת' })])
    ]));

    // ----- טבלה מסכמת (חלק עליון) -----
    root.appendChild(U.el('h3', { style: 'color:var(--green-dark);margin:6px 0;', text: 'טבלה מסכמת' }));
    var aggs = allAggs.filter(aggPassesFilter).sort(function (a, b) { return b.balance - a.balance; });
    if (!aggs.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין חובות להצגה. הוסיפו "חוב חדש" או ייבאו נתוני פתיחה.'));
    } else {
      var shownTotal = 0;
      var tbody = U.el('tbody');
      aggs.forEach(function (a) { shownTotal += a.balance; tbody.appendChild(buildSummaryRow(a)); });
      tbody.appendChild(U.el('tr', null, [
        U.el('td', { html: '<b>סה"כ מוצג</b>' }), U.el('td'), U.el('td'),
        U.el('td', { class: 'center', html: '<b>' + money(shownTotal) + '</b>' }),
        U.el('td'), U.el('td'), U.el('td')
      ]));
      root.appendChild(U.el('table', { class: 'grid' }, [
        U.el('thead', null, [U.el('tr', null,
          ['שם עסק', 'איש קשר', 'טלפון', 'יתרת חוב', 'סטטוס', 'מטופל ע"י', 'הערות']
            .map(function (h) { return U.el('th', { text: h }); }))]),
        tbody
      ]));
    }

    // ----- פירוט לפי חקלאי (חלק תחתון) -----
    root.appendChild(buildDetailPanel(allAggs));
  }

  function buildSummaryRow(a) {
    var s = siteOf(a.siteId);
    var statusCell;
    if (a.recs.length) {
      // סטטוס משותף לכל החובות (אם כולם זהים); אחרת "מעורב".
      var uniq = {};
      a.recs.forEach(function (r) { uniq[r.status || ''] = true; });
      var keys = Object.keys(uniq);
      var multi = a.recs.length > 1;
      var blankLabel = (multi && keys.length > 1) ? 'מעורב' : '—';
      var ssel = U.el('select', {
        class: 'debt-status-sel',
        title: multi ? 'שינוי הסטטוס לכל ' + a.recs.length + ' החובות של החקלאי' : 'שינוי סטטוס'
      }, [U.el('option', { value: '' }, blankLabel)].concat(
        STATUSES.map(function (st) { return U.el('option', { value: st.value }, st.value); })));
      ssel.value = (keys.length === 1) ? keys[0] : '';
      ssel.addEventListener('change', function () {
        a.recs.forEach(function (r) { r.status = ssel.value; });
        Store.save(); renderKeepScroll();
      });
      statusCell = ssel;
    } else if (a.billed) {
      statusCell = U.el('span', { class: 'tag', style: 'background:#E0F2FE;color:#075985;', text: 'חיוב שוטף' });
    } else statusCell = statusChip('');

    var nameBtn = U.el('button', {
      class: 'btn small secondary', style: 'font-weight:600;',
      onclick: function () { selectFarmer(a.siteId); }
    }, s.name);

    return U.el('tr', { style: (selectedSiteId === a.siteId ? 'background:var(--green-light);' : '') }, [
      U.el('td', null, [nameBtn]),
      U.el('td', { text: s.contactName || '' }),
      U.el('td', null, [U.el('div', { style: 'display:flex;align-items:center;gap:6px;white-space:nowrap;' }, [
        U.el('span', { text: s.phone || '' }),
        (a.balance > 0.005 ? waDebtBtn(s, a.balance) : null)
      ])]),
      U.el('td', { class: 'center', html: '<b style="' + balStyle(a.balance) + '">' + money(a.balance) + '</b>' }),
      U.el('td', null, [statusCell]),
      U.el('td', { text: Object.keys(a.handlers).join(', ') }),
      U.el('td', null, [noteInput(a.siteId)])
    ]);
  }

  // הערה חופשית לחקלאי (נשמרת פר-אתר, נערכת מהטבלה המסכמת)
  function farmerNote(siteId) { var m = Store.get().debtNotes || {}; return m[siteId] || ''; }
  function noteInput(siteId) {
    var inp = U.el('input', { type: 'text', value: farmerNote(siteId), placeholder: 'הערה…', style: 'width:100%;min-width:120px;' });
    inp.addEventListener('change', function () {
      var d = Store.get(); if (!d.debtNotes) d.debtNotes = {};
      var v = inp.value.trim();
      if (v) d.debtNotes[siteId] = v; else delete d.debtNotes[siteId];
      Store.save();
    });
    return inp;
  }

  function selectFarmer(siteId) {
    selectedSiteId = siteId;
    App.render();
    var anchor = U.$('#debt-detail');
    if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- פאנל פירוט חקלאי ----------
  function buildDetailPanel(allAggs) {
    var wrap = U.el('div', { id: 'debt-detail', style: 'margin-top:26px;' });
    wrap.appendChild(U.el('h3', { style: 'color:var(--green-dark);margin:6px 0;', text: 'פירוט לפי חקלאי' }));

    var farmers = allAggs.slice().sort(function (a, b) {
      return (siteOf(a.siteId).name || '').localeCompare(siteOf(b.siteId).name || '', 'he');
    });
    if (!farmers.length) { wrap.appendChild(U.el('div', { class: 'muted', text: 'אין נתונים.' })); return wrap; }

    var ids = farmers.map(function (a) { return a.siteId; });
    if (ids.indexOf(selectedSiteId) === -1) selectedSiteId = ids[0];

    var sel = U.el('select', { class: 'no-print', style: 'min-width:260px;margin-bottom:12px;' }, farmers.map(function (a) {
      return U.el('option', { value: a.siteId }, siteOf(a.siteId).name + ' — ' + money(a.balance));
    }));
    sel.value = selectedSiteId;
    sel.addEventListener('change', function () { selectedSiteId = sel.value; renderKeepScroll(); });
    wrap.appendChild(U.el('div', { class: 'no-print' }, [U.el('label', { style: 'font-weight:600;color:var(--green-dark);margin-inline-end:8px;', text: 'בחר חקלאי:' }), sel]));

    var agg = null;
    for (var i = 0; i < farmers.length; i++) if (farmers[i].siteId === selectedSiteId) { agg = farmers[i]; break; }
    if (agg) wrap.appendChild(buildFarmerCard(agg));
    return wrap;
  }

  function buildFarmerCard(agg) {
    var siteId = agg.siteId;
    var s = siteOf(siteId);
    var card = U.el('div', { class: 'card' });

    // כותרת
    card.appendChild(U.el('div', { style: 'display:flex;align-items:center;flex-wrap:wrap;gap:10px;' }, [
      U.el('h3', { style: 'margin:0;color:var(--green-dark);', text: s.name }),
      U.el('span', { class: 'muted', text: [s.contactName, s.phone].filter(Boolean).join(' · ') }),
      U.el('div', { class: 'spacer' }),
      U.el('span', { class: 'tag', html: 'יתרה: <b style="' + balStyle(agg.balance) + '">' + money(agg.balance) + '</b>' })
    ]));

    // פס התקדמות גבייה — כמה מסך החוב/החיוב כבר שולם
    (function () {
      var esAll = entriesForSite(siteId);
      var charged = agg.recs.reduce(function (a, r) { return a + U.num(r.openingDebt); }, 0)
        + sumKind(esAll, 'charge') + (agg.billed ? U.num(agg.billed.total) : 0);
      var reduced = sumKind(esAll, 'payment') + sumKind(esAll, 'credit');
      if (charged <= 0.005) return;
      var pct = Math.max(0, Math.min(100, reduced / charged * 100));
      card.appendChild(U.el('div', { class: 'debt-progress' }, [
        U.el('div', { class: 'dp-track' }, [U.el('div', { class: 'dp-fill', style: 'width:' + pct.toFixed(0) + '%;' })]),
        U.el('div', { class: 'dp-lbl', text: 'נגבה ' + money(reduced) + ' מתוך ' + money(charged) + ' (' + Math.round(pct) + '%)' })
      ]));
    })();

    // חובות ידניים — כרטיס לכל אחד (עם תנועות תשלום/חיוב/זיכוי)
    var manualRecs = agg.recs.filter(function (r) { return !r.imported; });
    var importedRecs = agg.recs.filter(function (r) { return r.imported; });
    manualRecs.forEach(function (rec) {
      var bal = recordBalance(rec);
      card.appendChild(U.el('div', { style: 'border:1px solid var(--border);border-radius:10px;padding:10px;margin-top:10px;' }, [
        U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
          statusChip(rec.status),
          U.el('span', { text: 'חוב פתיחה: ' }), U.el('b', { text: money(rec.openingDebt) }),
          rec.debtYear ? U.el('span', { class: 'muted', text: '· שנה ' + rec.debtYear }) : null,
          rec.handledBy ? U.el('span', { class: 'muted', text: '· מטפל: ' + rec.handledBy }) : null,
          U.el('div', { class: 'spacer' }),
          U.el('span', { html: 'יתרה: <b>' + money(bal) + '</b>' })
        ]),
        rec.notes ? U.el('div', { class: 'muted', style: 'margin-top:4px;', text: rec.notes }) : null,
        U.el('div', { class: 'no-print', style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;' }, [
          U.el('button', { class: 'btn small', onclick: function () { openEntry(rec.id, siteId, 'payment'); } }, '+ תשלום'),
          U.el('button', { class: 'btn small secondary', onclick: function () { openEntry(rec.id, siteId, 'charge'); } }, '+ חיוב'),
          U.el('button', { class: 'btn small secondary', onclick: function () { openEntry(rec.id, siteId, 'credit'); } }, '+ זיכוי'),
          U.el('button', { class: 'btn small secondary', onclick: function () { openRecord(rec, siteId); } }, '✎ עריכה'),
          U.el('button', { class: 'btn small danger', onclick: function () { deleteRecord(rec); } }, '🗑 מחיקה')
        ])
      ]));
    });

    // חשבוניות מיובאות — טבלה קומפקטית עם שורת סיכום וסימון "שולם" בלחיצה
    if (importedRecs.length) card.appendChild(buildInvoiceTable(siteId, importedRecs));

    // חיוב שוטף מהמערכת
    if (agg.billed) {
      card.appendChild(U.el('div', { style: 'border:1px solid var(--border);border-radius:10px;padding:10px;margin-top:10px;background:#f7fbfd;' }, [
        U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
          U.el('span', { class: 'tag', style: 'background:#E0F2FE;color:#075985;', text: 'חיוב שוטף' }),
          U.el('span', { html: 'מדרישת התשלום: <b>' + money(agg.billed.total) + '</b>' }),
          U.el('div', { class: 'spacer' }),
          U.el('span', { html: 'יתרה: <b>' + money(billingBalance(siteId, agg.billed.total)) + '</b>' })
        ]),
        U.el('div', { class: 'no-print', style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;' }, [
          U.el('button', { class: 'btn small', onclick: function () { openEntry('bill:' + siteId, siteId, 'payment'); } }, '+ תשלום'),
          U.el('button', { class: 'btn small secondary', onclick: function () { openEntry('bill:' + siteId, siteId, 'credit'); } }, '+ זיכוי')
        ])
      ]));
    }

    // ----- פירוט חודשי -----
    card.appendChild(U.el('h4', { style: 'color:var(--green-dark);margin:16px 0 6px;', text: 'פירוט חודשי' }));
    card.appendChild(buildMonthlyTable(agg));
    return card;
  }

  // טבלת חשבוניות לחקלאי + שורת סיכום; סימון "שולם" בלחיצה (גבייה חלקית)
  function buildInvoiceTable(siteId, recs) {
    function dkey(r) { var p = String(r.debtYear || '').split('/'); return p.length === 3 ? p[2] + p[1] + p[0] : String(r.debtYear || ''); }
    var sorted = recs.slice().sort(function (a, b) { return dkey(a) < dkey(b) ? -1 : (dkey(a) > dkey(b) ? 1 : 0); });
    var totDebt = 0, totOpen = 0, paidN = 0;
    var tbody = U.el('tbody');
    sorted.forEach(function (rec) {
      var isPaid = rec.status === 'שולם';
      totDebt += U.num(rec.openingDebt);
      if (isPaid) paidN++; else totOpen += recordBalance(rec);
      var invNo = String(rec.notes || '').split(' · ')[0];
      var toggle = U.el('button', {
        class: 'btn small' + (isPaid ? ' secondary' : ''), title: isPaid ? 'החזרה לסטטוס "פתוחה"' : 'סימון החשבונית כשולמה',
        onclick: function () { rec.status = isPaid ? 'פתוחה' : 'שולם'; Store.save(); renderKeepScroll(); }
      }, isPaid ? '↩ פתח' : '✓ שולם');
      tbody.appendChild(U.el('tr', { class: isPaid ? 'inv-paid' : '' }, [
        U.el('td', { text: rec.debtYear || '—' }),
        U.el('td', { text: invNo }),
        U.el('td', { class: 'center', text: money(rec.openingDebt) }),
        U.el('td', { class: 'center' }, [statusChip(rec.status)]),
        U.el('td', { class: 'center no-print', style: 'white-space:nowrap;' }, [
          toggle,
          U.el('button', { class: 'btn small secondary', title: 'עריכה', onclick: function () { openRecord(rec, siteId); } }, '✎'),
          U.el('button', { class: 'btn small danger', title: 'מחיקה', onclick: function () { deleteRecord(rec); } }, '🗑')
        ])
      ]));
    });
    // שורת סיכום לחקלאי
    tbody.appendChild(U.el('tr', { class: 'total-row' }, [
      U.el('td', { html: '<b>סה"כ ' + recs.length + ' חשבוניות' + (paidN ? ' · ' + paidN + ' שולמו' : '') + '</b>' }),
      U.el('td'),
      U.el('td', { class: 'center', html: '<b>' + money(totDebt) + '</b>' }),
      U.el('td', { class: 'center', html: 'יתרה: <b style="' + balStyle(totOpen) + '">' + money(totOpen) + '</b>' }),
      U.el('td', { class: 'no-print' })
    ]));
    return U.el('div', { style: 'margin-top:10px;', class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, ['תאריך', 'חשבונית', 'סכום', 'סטטוס', ''].map(function (h) { return U.el('th', { text: h }); }))]),
      tbody
    ])]);
  }

  function buildMonthlyTable(agg) {
    var siteId = agg.siteId;
    var byMonth = (agg.billed && agg.billed.byMonth) || {};
    var es = entriesForSite(siteId);

    // איסוף כל החודשים (מחיוב שוטף + מתאריכי תנועות)
    var monthsSet = {};
    Object.keys(byMonth).forEach(function (mk) { monthsSet[mk] = true; });
    es.forEach(function (e) { if (e.date) monthsSet[U.monthKey(e.date)] = true; });
    var months = Object.keys(monthsSet).sort();

    var opening = agg.recs.reduce(function (a, r) { return a + U.num(r.openingDebt); }, 0);
    var running = opening;
    var rows = [];

    if (opening !== 0) {
      rows.push(U.el('tr', null, [
        U.el('td', { text: 'חוב פתיחה' }),
        U.el('td', { class: 'center', text: money(opening) }),
        U.el('td', { class: 'center', text: '' }),
        U.el('td', { class: 'center', text: '' }),
        U.el('td', { class: 'center', text: '' }),
        U.el('td', { class: 'center', html: '<b>' + money(running) + '</b>' })
      ]));
    }

    months.forEach(function (mk) {
      var bCharge = U.num(byMonth[mk]);
      var mEs = es.filter(function (e) { return e.date && U.monthKey(e.date) === mk; });
      var mCharge = sumKind(mEs, 'charge');
      var pay = sumKind(mEs, 'payment');
      var cred = sumKind(mEs, 'credit');
      running += bCharge + mCharge - pay - cred;
      rows.push(U.el('tr', null, [
        U.el('td', { text: U.monthLabel(mk) }),
        U.el('td', { class: 'center', text: bCharge ? money(bCharge) : '' }),
        U.el('td', { class: 'center', text: mCharge ? money(mCharge) : '' }),
        U.el('td', { class: 'center', text: pay ? money(pay) : '' }),
        U.el('td', { class: 'center', text: cred ? money(cred) : '' }),
        U.el('td', { class: 'center', html: '<b>' + money(running) + '</b>' })
      ]));
    });

    if (!rows.length) {
      return U.el('div', { class: 'muted', text: 'אין תנועות חודשיות. היתרה כולה מחוב הפתיחה.' });
    }

    return U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null,
        ['חודש', 'חיוב מערכת', 'חיוב ידני', 'תשלום', 'זיכוי', 'יתרה מצטברת']
          .map(function (h) { return U.el('th', { text: h }); }))]),
      U.el('tbody', null, rows)
    ]);
  }

  // ---------- מודאל כרטיס חוב (הוספה/עריכה) ----------
  function openRecord(rec, presetSiteId) {
    var isEdit = !!rec;
    var sites = (Store.get().sites || []).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });

    var siteSel = U.el('select', { style: 'width:100%;' }, [U.el('option', { value: '' }, '— בחר אתר —')].concat(
      sites.map(function (s) { return U.el('option', { value: s.id }, s.name + (s.location ? ' · ' + s.location : '')); })));
    siteSel.value = (rec && rec.siteId) || presetSiteId || '';
    if (isEdit) siteSel.disabled = true;

    var openInp = U.el('input', { type: 'number', step: '0.01', value: rec ? rec.openingDebt : '', placeholder: '0', style: 'width:100%;' });
    var yearInp = U.el('input', { type: 'text', value: rec ? (rec.debtYear || '') : '', placeholder: 'dd/mm/yyyy', style: 'width:100%;' });
    var statusSel = U.el('select', { style: 'width:100%;' }, [U.el('option', { value: '' }, '— ללא —')].concat(
      STATUSES.map(function (s) { return U.el('option', { value: s.value }, s.value); })));
    statusSel.value = rec ? (rec.status || '') : 'פתוחה';
    var handlerInp = U.el('input', { type: 'text', value: rec ? (rec.handledBy || '') : '', placeholder: 'מי מטפל', style: 'width:100%;' });
    var notesInp = U.el('textarea', { rows: '2', style: 'width:100%;', placeholder: 'הערות' });
    notesInp.value = rec ? (rec.notes || '') : '';

    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    var body = U.el('div', null, [
      fld('עסק (אתר)', siteSel),
      fld('חוב פתיחה (₪)', openInp),
      fld('תאריך חוב', yearInp),
      fld('סטטוס', statusSel),
      fld('מטופל ע"י', handlerInp),
      fld('הערות', notesInp)
    ]);

    Modal.open(isEdit ? 'עריכת כרטיס חוב' : 'כרטיס חוב חדש', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var siteId = siteSel.value;
        if (!siteId) { U.toast('יש לבחור אתר.', 'error'); return; }
        var out = {
          id: rec ? rec.id : undefined,
          siteId: siteId,
          openingDebt: U.num(openInp.value),
          debtYear: yearInp.value.trim(),
          status: statusSel.value,
          handledBy: handlerInp.value.trim(),
          notes: notesInp.value.trim()
        };
        if (rec && rec.imported) out.imported = true;
        var saved = Store.upsert('debtRecords', out);
        if (!isEdit) selectedSiteId = saved.siteId;
        close(); App.render();
      } }
    ]);
  }

  function deleteRecord(rec) {
    var s = siteOf(rec.siteId);
    Modal.confirm({
      title: 'מחיקת כרטיס חוב',
      text: 'למחוק את כרטיס החוב של "' + s.name + '" (' + money(recordBalance(rec)) + ')?\nכל התנועות שלו יימחקו.',
      okLabel: 'מחק', danger: true
    }, function () {
      entriesForRecord(rec.id).forEach(function (e) { Store.remove('debtEntries', e.id); });
      Store.remove('debtRecords', rec.id);
      App.render();
      U.toast('כרטיס החוב נמחק');
    });
  }

  // ---------- מודאל תנועה (תשלום/חיוב/זיכוי) ----------
  function openEntry(recordId, siteId, presetKind) {
    var s = siteOf(siteId);
    var isBilling = String(recordId).indexOf('bill:') === 0;
    var kindSel = U.el('select', { style: 'width:100%;' }, [
      U.el('option', { value: 'payment' }, 'תשלום (מקטין חוב)'),
      U.el('option', { value: 'charge' }, 'חיוב (מגדיל חוב)'),
      U.el('option', { value: 'credit' }, 'זיכוי (מקטין חוב)')
    ]);
    kindSel.value = presetKind || 'payment';
    if (isBilling) {
      kindSel.querySelector('option[value=charge]').disabled = true;
      if (kindSel.value === 'charge') kindSel.value = 'payment';
    }
    var amtInp = U.el('input', { type: 'number', step: '0.01', placeholder: '0', style: 'width:100%;' });
    var dateInp = U.el('input', { type: 'date', value: U.todayISO(), style: 'width:100%;' });
    var methodInp = U.el('input', { type: 'text', placeholder: 'מזומן / העברה / צ׳ק…', style: 'width:100%;' });
    var noteInp = U.el('input', { type: 'text', placeholder: 'הערה', style: 'width:100%;' });

    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    var body = U.el('div', null, [
      U.el('div', { class: 'muted', style: 'margin-bottom:8px;', text: 'עסק: ' + s.name }),
      fld('סוג תנועה', kindSel),
      fld('סכום (₪)', amtInp),
      fld('תאריך', dateInp),
      fld('אמצעי / פירוט', methodInp),
      fld('הערה', noteInp)
    ]);

    Modal.open('רישום תנועה', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var amt = U.num(amtInp.value);
        if (!amt) { U.toast('יש להזין סכום.', 'error'); return; }
        Store.upsert('debtEntries', {
          recordId: recordId, siteId: siteId, kind: kindSel.value,
          amount: amt, date: dateInp.value || U.todayISO(),
          method: methodInp.value.trim(), note: noteInp.value.trim()
        });
        selectedSiteId = siteId;
        close(); App.render();
      } }
    ]);
  }

  // ---------- ייצוא אקסל (RTL, מעוצב) ----------
  var THIN = { style: 'thin', color: { rgb: 'CBD5C0' } };
  var BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
  var ST = {
    title: { font: { bold: true, sz: 14, color: { rgb: '1B5E20' } }, alignment: { horizontal: 'center', readingOrder: 2 } },
    head: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '2E7D32' } }, alignment: { horizontal: 'center', vertical: 'center', readingOrder: 2 }, border: BORDER },
    cell: { alignment: { horizontal: 'center', readingOrder: 2 }, border: BORDER },
    total: { font: { bold: true }, fill: { fgColor: { rgb: 'EFE6DB' } }, alignment: { horizontal: 'center', readingOrder: 2 }, border: BORDER }
  };
  var MONEY = '#,##0.00';
  function setStyle(ws, r, c, style, z) {
    var addr = XLSX.utils.encode_cell({ r: r, c: c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = style;
    if (z) ws[addr].z = z;
  }

  function exportExcel() {
    var map = farmerAgg();
    var aggs = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.balance - a.balance; });
    if (!aggs.length) { U.toast('אין נתונים לייצוא.', 'info'); return; }
    var wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };

    var headers = ['שם עסק', 'איש קשר', 'טלפון', 'יתרת חוב', 'סטטוס', 'מטופל ע"י', 'שנת חוב', 'הערות'];
    var aoa = [['דוח חובות חקלאים — רגבים בנימין'], [], headers];
    var grand = 0;
    aggs.forEach(function (a) {
      var s = siteOf(a.siteId);
      grand += a.balance;
      aoa.push([
        s.name || '', s.contactName || '', s.phone || '',
        Math.round(a.balance * 100) / 100,
        Object.keys(a.statuses).join(', ') || (a.billed && !a.recs.length ? 'חיוב שוטף' : ''),
        Object.keys(a.handlers).join(', '),
        Object.keys(a.years).join(', '),
        a.recs.map(function (r) { return r.notes; }).filter(Boolean).join(' · ')
      ]);
    });
    aoa.push(['סה"כ חוב', '', '', Math.round(grand * 100) / 100, '', '', '', '']);

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var ncol = headers.length;
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: ncol - 1 } }];
    ws['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 30 }];
    setStyle(ws, 0, 0, ST.title);
    for (var c = 0; c < ncol; c++) setStyle(ws, 2, c, ST.head);
    var lastRow = aoa.length - 1;
    for (var r = 3; r < lastRow; r++) {
      for (var cc = 0; cc < ncol; cc++) setStyle(ws, r, cc, ST.cell, cc === 3 ? MONEY : null);
    }
    for (var tc = 0; tc < ncol; tc++) setStyle(ws, lastRow, tc, ST.total, tc === 3 ? MONEY : null);

    XLSX.utils.book_append_sheet(wb, ws, 'חובות חקלאים');
    XLSX.writeFile(wb, 'חובות-חקלאים-' + U.todayISO() + '.xlsx');
  }


  function normName(s) { return String(s || '').replace(/["'״׳\s.\-]/g, '').replace(/בעמ$/, ''); }

  // ---------- אקסל לדוגמה + ייבוא מאקסל ----------
  var XL_HEADERS = ['שם עסק', 'איש קשר', 'טלפון', 'חוב פתיחה', 'תאריך חוב', 'סטטוס', 'מטופל ע"י', 'הערות'];
  function downloadDebtTemplate() {
    var example = ['לדוגמה: יקב הר קידה', 'ישראל ישראלי', '050-0000000', 1500, '31/12/2025', 'פתוחה', 'שלמה', 'הערה חופשית'];
    var ws = XLSX.utils.aoa_to_sheet([XL_HEADERS, example]);
    ws['!cols'] = XL_HEADERS.map(function () { return { wch: 18 }; });
    var wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'חובות');
    XLSX.writeFile(wb, 'תבנית-חובות-חקלאים.xlsx');
  }
  function importDebtsExcel() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xlsx,.xls';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
          // זיהוי פורמט: פנקס Priority (שורה לכל חשבונית) מול תבנית פשוטה (שורה לחקלאי)
          if (isLedgerFormat(rows)) importLedgerRows(rows);
          else importDebtRows(rows);
        } catch (err) { U.toast('שגיאה בקריאת הקובץ: ' + (err.message || err), 'error'); }
      };
      reader.readAsArrayBuffer(f);
    };
    inp.click();
  }
  // תאריך תא (Date או טקסט) → dd/mm/yyyy
  function fmtCellDate(v) {
    if (v instanceof Date && !isNaN(v)) return ('0' + v.getDate()).slice(-2) + '/' + ('0' + (v.getMonth() + 1)).slice(-2) + '/' + v.getFullYear();
    return String(v == null ? '' : v).trim();
  }

  // האם זה פנקס Priority — שורה לכל חשבונית (עמודות "שם לקוח" / "חשבונית")
  function isLedgerFormat(rows) {
    if (!rows || !rows.length) return false;
    var h = rows[0].map(function (x) { return String(x == null ? '' : x).trim(); }).join('|');
    return h.indexOf('שם לקוח') !== -1 || h.indexOf('חשבונית') !== -1 || h.indexOf('לקוח') !== -1;
  }

  // אגרגציה של פנקס Priority לפי לקוח → שורה אחת לכל חקלאי (יתרה = סכום החשבוניות פחות התשלומים)
  function importLedgerRows(rows) {
    var header = rows[0].map(function (x) { return String(x == null ? '' : x).trim(); });
    function colIdx(names) { for (var i = 0; i < header.length; i++) for (var j = 0; j < names.length; j++) if (header[i].indexOf(names[j]) !== -1) return i; return -1; }
    var ci = {
      cust: colIdx(['מס. לקוח', 'מס׳ לקוח', "מס' לקוח", 'מס לקוח', 'לקוח']),
      name: colIdx(['שם לקוח', 'שם עסק', 'שם']),
      inv: colIdx(['חשבונית']),
      date: colIdx(['תאריך']),
      amt: colIdx(['סכום', 'חוב', 'יתרה'])
    };
    if (ci.name < 0 || ci.amt < 0) { U.toast('לא נמצאו העמודות "שם לקוח" ו"סכום" בקובץ.', 'error'); return; }

    var map = {}, order = [];
    rows.slice(1).forEach(function (r) {
      if (!r) return;
      var name = String(r[ci.name] == null ? '' : r[ci.name]).trim();
      if (!name) return;
      var cust = ci.cust >= 0 ? String(r[ci.cust] == null ? '' : r[ci.cust]).trim() : '';
      var amt = U.num(r[ci.amt]);
      var key = cust || normName(name);
      if (!map[key]) { map[key] = { name: name, customerNumber: cust, total: 0, invoiceCount: 0, date: '', _dt: null, lines: [] }; order.push(key); }
      var g = map[key];
      g.total += amt;
      if (amt > 0) g.invoiceCount++; // שורה חיובית = חשבונית; שלילית = תשלום על חשבון
      var dv = ci.date >= 0 ? r[ci.date] : null;
      var lineDate = fmtCellDate(dv);
      if (dv instanceof Date && !isNaN(dv) && (!g._dt || dv > g._dt)) { g._dt = dv; g.date = lineDate; }
      // שמירת כל שורה בנפרד — חשבונית או תשלום — עם התאריך והמספר שלה
      g.lines.push({ amount: Math.round(amt * 100) / 100, date: lineDate, invoice: ci.inv >= 0 ? String(r[ci.inv] == null ? '' : r[ci.inv]).trim() : '' });
    });
    var agg = order.map(function (k) { var g = map[k]; g.total = Math.round(g.total * 100) / 100; return g; });
    if (!agg.length) { U.toast('לא נמצאו נתוני חובות בקובץ.', 'error'); return; }
    openDebtImportPreview(agg, 'אקסל (פנקס Priority)');
  }

  // מחיקת כל רשומות החוב והתשלומים הקיימים (ל"החלפה מלאה")
  function clearAllDebts() {
    (Store.get().debtEntries || []).slice().forEach(function (e) { Store.remove('debtEntries', e.id); });
    (Store.get().debtRecords || []).slice().forEach(function (r) { Store.remove('debtRecords', r.id); });
  }

  function importDebtRows(rows) {
    if (!rows || rows.length < 2) { U.toast('הקובץ ריק או חסר שורות נתונים.', 'error'); return; }
    var header = rows[0].map(function (h) { return String(h == null ? '' : h).trim(); });
    function colIdx(names) { for (var i = 0; i < header.length; i++) for (var j = 0; j < names.length; j++) if (header[i].indexOf(names[j]) !== -1) return i; return -1; }
    var ci = {
      name: colIdx(['שם עסק', 'עסק', 'אתר', 'שם']),
      contact: colIdx(['איש קשר', 'קשר']),
      phone: colIdx(['טלפון']),
      amount: colIdx(['חוב פתיחה', 'חוב', 'סכום', 'יתרה']),
      year: colIdx(['תאריך', 'שנה']),
      status: colIdx(['סטטוס']),
      handler: colIdx(['מטופל', 'מטפל']),
      note: colIdx(['הער'])
    };
    if (ci.name < 0 || ci.amount < 0) { U.toast('לא נמצאו העמודות "שם עסק" ו"חוב פתיחה". הורידו את אקסל לדוגמה והשתמשו באותן כותרות.', 'error'); return; }
    function cell(r, i) { return i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : ''; }
    var data = rows.slice(1).filter(function (r) { return r && cell(r, ci.name); });
    if (!data.length) { U.toast('אין שורות נתונים.', 'error'); return; }
    Modal.confirm({
      title: 'ייבוא חובות מאקסל',
      text: 'לייבא ' + data.length + ' חובות?\nאתרים שלא קיימים ייווצרו אוטומטית (כלא-פעילים).',
      okLabel: 'ייבא'
    }, function () {
      var objs = data.map(function (r) {
        return {
          name: cell(r, ci.name), contact: cell(r, ci.contact), phone: cell(r, ci.phone),
          amount: r[ci.amount], year: cell(r, ci.year), status: cell(r, ci.status),
          handler: cell(r, ci.handler), note: cell(r, ci.note)
        };
      });
      var res = commitDebtObjs(objs);
      App.render();
      U.toast('הייבוא הושלם: ' + res.added + ' חובות' + (res.created ? ' · ' + res.created + ' אתרים חדשים' : ''));
    });
  }

  // יצירת רשומות-חוב מתוך אובייקטים מנורמלים (משותף לאקסל ול-PDF). ללא confirm/alert.
  function commitDebtObjs(objs) {
    var sites = Store.get().sites || [];
    var created = 0, added = 0;
    objs.forEach(function (o) {
      var nm = String(o.name == null ? '' : o.name).trim();
      if (!nm) return;
      var site = null;
      for (var i = 0; i < sites.length; i++) if (normName(sites[i].name) === normName(nm)) { site = sites[i]; break; }
      if (!site) {
        site = Store.upsert('sites', { name: nm, contactName: o.contact || '', phone: o.phone || '', active: false, notes: 'נוצר מייבוא חובות' });
        sites = Store.get().sites; created++;
      }
      var custNote = o.customerNumber ? ('מס׳ לקוח ' + o.customerNumber) : '';
      if (o.lines && o.lines.length) {
        // רשומה נפרדת לכל חשבונית/תשלום — עם התאריך והמספר שלה (מאפשר גבייה חלקית)
        o.lines.forEach(function (ln) {
          var note = [ln.invoice ? 'חשבונית ' + ln.invoice : 'תשלום על חשבון'];
          if (custNote) note.push(custNote);
          Store.upsert('debtRecords', {
            siteId: site.id, openingDebt: U.num(ln.amount),
            debtYear: String(ln.date == null ? '' : ln.date).trim(), status: 'פתוחה',
            handledBy: '', notes: note.join(' · '), imported: true
          });
          added++;
        });
      } else {
        Store.upsert('debtRecords', {
          siteId: site.id, openingDebt: U.num(o.amount),
          debtYear: String(o.year == null ? '' : o.year).trim(), status: o.status || 'פתוחה',
          handledBy: o.handler || '', notes: o.note || '', imported: true
        });
        added++;
      }
    });
    return { created: created, added: added };
  }

  // ---------- ייבוא PDF מהעמותה + ניתוח AI ----------
  function importDebtsPdf() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/pdf,.pdf';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      if (f.size > 15 * 1024 * 1024) { U.toast('הקובץ גדול מדי (מקסימום ~15MB).', 'error'); return; }
      var reader = new FileReader();
      reader.onload = function (e) {
        var dataUrl = String(e.target.result || '');
        var comma = dataUrl.indexOf(',');
        var b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        runPdfParse(b64, f.type || 'application/pdf');
      };
      reader.readAsDataURL(f);
    };
    inp.click();
  }

  function runPdfParse(b64, mime) {
    var overlay = showAiLoading();
    Store.parseDebtsPdf({ pdfBase64: b64, mimeType: mime }).then(function (res) {
      overlay.close();
      var rows = (res && res.rows) || [];
      if (!rows.length) { U.toast('ה-AI לא מצא חובות בקובץ. נסו קובץ ברור יותר, או ייבוא מאקסל.', 'error'); return; }
      openDebtImportPreview(rows, 'PDF (ניתוח AI)');
    }).catch(function (err) {
      overlay.close();
      U.toast('שגיאה בניתוח ה-PDF: ' + ((err && err.message) || err), 'error');
    });
  }

  function showAiLoading() {
    var box = U.el('div', { class: 'ai-load' }, [
      U.el('div', { class: 'ai-spin' }),
      U.el('div', { style: 'margin-top:14px;font-weight:600;', text: '🤖 מנתח את ה-PDF עם AI…' }),
      U.el('div', { class: 'muted', style: 'margin-top:4px;font-size:13px;', text: 'זה עשוי לקחת עד דקה' })
    ]);
    var bg = U.el('div', { class: 'modal-bg' }, [box]);
    document.body.appendChild(bg);
    return { close: function () { if (bg.parentNode) bg.parentNode.removeChild(bg); } };
  }

  function openDebtImportPreview(rows, sourceLabel) {
    var existing = {};
    (Store.get().sites || []).forEach(function (s) { existing[normName(s.name)] = true; });
    var state = rows.map(function (r) {
      return {
        include: true,
        name: String(r.name || '').trim(),
        total: U.num(r.total),
        date: String(r.date || '').trim(),
        customerNumber: String(r.customerNumber || '').trim(),
        invoiceCount: r.invoiceCount || 0,
        lines: r.lines || null // פירוט חשבוניות (אם קיים) — נשמר כרשומה נפרדת לכל חשבונית
      };
    });

    var tbody = U.el('tbody');
    state.forEach(function (st) {
      var newTag = U.el('span', { class: 'tag', style: 'background:#FEF3C7;color:#92400E;', text: 'אתר חדש' });
      var oldTag = U.el('span', { class: 'muted', text: 'קיים' });
      var siteCell = U.el('td', { class: 'center' }, [existing[normName(st.name)] ? oldTag : newTag]);

      var chk = U.el('input', { type: 'checkbox', checked: true });
      chk.addEventListener('change', function () { st.include = chk.checked; });
      var nameInp = U.el('input', { type: 'text', value: st.name, style: 'width:100%;min-width:150px;' });
      nameInp.addEventListener('input', function () {
        st.name = nameInp.value;
        var has = existing[normName(st.name)];
        siteCell.innerHTML = '';
        siteCell.appendChild(has ? U.el('span', { class: 'muted', text: 'קיים' }) : U.el('span', { class: 'tag', style: 'background:#FEF3C7;color:#92400E;', text: 'אתר חדש' }));
      });
      // כשיש פירוט חשבוניות — היתרה והתאריך מחושבים מהשורות (לתצוגה בלבד); אחרת ניתנים לעריכה
      var hasLines = st.lines && st.lines.length;
      var totCell, dtCell;
      if (hasLines) {
        totCell = U.el('td', { class: 'center', title: 'סכום החשבוניות פחות התשלומים', text: money(st.total) });
        dtCell = U.el('td', { class: 'center muted', text: st.date || '—' });
      } else {
        var totInp = U.el('input', { type: 'number', step: '0.01', value: st.total, style: 'width:110px;' });
        totInp.addEventListener('input', function () { st.total = U.num(totInp.value); });
        totCell = U.el('td', { class: 'center' }, [totInp]);
        var dtInp = U.el('input', { type: 'text', value: st.date, placeholder: 'dd/mm/yyyy', style: 'width:100px;' });
        dtInp.addEventListener('input', function () { st.date = dtInp.value; });
        dtCell = U.el('td', { class: 'center' }, [dtInp]);
      }

      tbody.appendChild(U.el('tr', null, [
        U.el('td', { class: 'center' }, [chk]),
        U.el('td', null, [nameInp]),
        totCell,
        dtCell,
        U.el('td', { class: 'center', text: st.invoiceCount ? String(st.invoiceCount) : '' }),
        siteCell
      ]));
    });

    var anyLines = state.some(function (s) { return s.lines && s.lines.length; });
    var table = U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null,
        ['', 'שם עסק', 'יתרת חוב (₪)', 'תאריך אחרון', 'חשבוניות', 'אתר'].map(function (h) { return U.el('th', { text: h }); }))]),
      tbody
    ])]);
    var src = sourceLabel || 'הקובץ';
    var totalInv = state.reduce(function (a, s) { return a + (s.lines ? s.lines.length : 0); }, 0);
    var info = U.el('div', { class: 'muted', style: 'margin-bottom:10px;', html:
      'חולצו <b>' + state.length + '</b> חקלאים מ' + src + '.' +
      (anyLines ? ' כל חשבונית תישמר כשורה נפרדת עם התאריך שלה (' + totalInv + ' חשבוניות בסך הכל) — כך תוכלו לסמן גבייה חלקית.' : '') +
      ' בדקו, ובטלו סימון לשורות שלא לייבא. אתרים חדשים ייווצרו כלא-פעילים.' });

    // אפשרות החלפה מלאה — מחיקת כל החובות הקיימים לפני הייבוא
    var replaceChk = U.el('input', { type: 'checkbox' });
    var replaceRow = U.el('label', { style: 'display:flex;gap:8px;align-items:center;margin:4px 0 12px;padding:8px 10px;border:1px solid var(--danger);border-radius:8px;background:#fef2f2;color:var(--danger);font-weight:600;cursor:pointer;' },
      [replaceChk, U.el('span', { text: '🗑️ החלפה מלאה — מחיקת כל החובות הקיימים והסתרת החיוב השוטף מהמערכת (החשבוניות כבר בקובץ)' })]);

    Modal.open('📥 תצוגה מקדימה — ייבוא חובות', U.el('div', null, [info, replaceRow, table]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'ייבא נבחרים', onClick: function (close) {
        var chosen = state.filter(function (s) { return s.include && String(s.name).trim() && (s.total || (s.lines && s.lines.length)); });
        if (!chosen.length) { U.toast('לא נבחרו שורות לייבוא (ודאו שם ויתרה).', 'error'); return; }
        var doImport = function () {
          if (replaceChk.checked) {
            clearAllDebts();
            var d = Store.get(); if (!d.settings) d.settings = {}; d.settings.debtHideBilling = true; // החיובים כבר בקובץ
          }
          var objs = chosen.map(function (s) {
            if (s.lines && s.lines.length) {
              // פירוט חשבוניות — רשומה לכל חשבונית (התאריך והמספר נשמרים בכל אחת)
              return { name: s.name, customerNumber: s.customerNumber, lines: s.lines };
            }
            var note = [];
            if (s.customerNumber) note.push('מס׳ לקוח ' + s.customerNumber);
            if (s.invoiceCount) note.push(s.invoiceCount + ' חשבוניות');
            note.push('יובא מ' + src);
            return { name: s.name, amount: s.total, year: s.date, status: 'פתוחה', note: note.join(' · ') };
          });
          var res = commitDebtObjs(objs);
          close(); App.render();
          U.toast('הייבוא הושלם: ' + res.added + ' חובות' + (res.created ? ' · ' + res.created + ' אתרים חדשים' : '') + (replaceChk.checked ? ' · החובות הקודמים נמחקו' : ''));
        };
        if (replaceChk.checked) {
          Modal.confirm({ title: '⚠ החלפה מלאה', text: 'פעולה זו תמחק את כל ' + records().length + ' רשומות החוב הקיימות ותחליף אותן ב-' + chosen.length + ' מהקובץ.\nגיבוי אוטומטי נשמר בענן. להמשיך?', okLabel: 'מחק והחלף', danger: true }, doImport);
        } else doImport();
      } }
    ]);
  }

  global.DebtUtil = {
    farmerAgg: farmerAgg,
    totalOutstanding: function () {
      var m = farmerAgg();
      return Object.keys(m).reduce(function (a, k) { return a + m[k].balance; }, 0);
    },
    totalCollected: function () {
      return (Store.get().debtEntries || [])
        .filter(function (e) { return e.kind === 'payment'; })
        .reduce(function (a, e) { return a + U.num(e.amount); }, 0);
    }
  };
  global.DebtsView = { render: render };
})(window);
