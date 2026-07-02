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
      style: 'background:#25D366;color:#fff;border:0;margin-inline-start:6px;',
      title: 'תזכורת תשלום בוואטסאפ' + (wn ? '' : ' (אין מספר — בחרו ידנית)'),
      html: U.WA_SVG
    });
  }

  // צבע יתרה — רמזור מדורג: ירוק=שולם/אפס · כתום=חוב · אדום בוהק=חוב גבוה · כחול=זכות
  function balStyle(bal) {
    if (Math.abs(bal) < 0.005) return 'color:#15803d;';
    if (bal >= 5000) return 'color:#dc2626;background:#fee2e2;padding:1px 8px;border-radius:8px;';
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
    Object.keys(billed).forEach(function (siteId) {
      if (U.num(billed[siteId].total) <= 0) return;
      var a = ensure(siteId);
      a.billed = billed[siteId];
      a.balance += billingBalance(siteId, billed[siteId].total);
    });
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
      U.el('button', { class: 'btn secondary ico no-print', title: 'אקסל לדוגמה לייבוא', onclick: downloadDebtTemplate }, '📄'),
      U.el('button', { class: 'btn secondary ico no-print', title: 'ייבוא מאקסל', onclick: importDebtsExcel }, '📥'),
      (Store.serverMode ? U.el('button', { class: 'btn secondary ico no-print', title: 'ייבוא PDF מהעמותה — ניתוח AI', onclick: importDebtsPdf }, '🤖') : null),
      U.el('button', { class: 'btn secondary ico', title: 'ייצוא לאקסל', onclick: exportExcel }, '⬇'),
      U.el('button', { class: 'btn secondary ico no-print', title: 'הדפסה', onclick: function () { window.print(); } }, '🖨️'),
      U.el('button', { class: 'btn', onclick: function () { openRecord(null, selectedSiteId || ''); } }, '+ חוב חדש')
    ]);
    root.appendChild(head);

    // ----- סינון לפי סטטוס -----
    var statusSel = U.el('select', null, [U.el('option', { value: '' }, 'כל הסטטוסים')].concat(
      STATUSES.map(function (s) { return U.el('option', { value: s.value }, s.value); })));
    statusSel.value = filterStatus;
    statusSel.addEventListener('change', function () { filterStatus = statusSel.value; App.render(); });
    root.appendChild(U.el('div', { class: 'no-print', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;' }, [
      U.el('span', { class: 'muted', text: 'סינון לפי סטטוס:' }), statusSel
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
        U.el('td'), U.el('td'), U.el('td'), U.el('td')
      ]));
      root.appendChild(U.el('table', { class: 'grid' }, [
        U.el('thead', null, [U.el('tr', null,
          ['שם עסק', 'איש קשר', 'טלפון', 'יתרת חוב', 'סטטוס', 'מטופל ע"י', 'תאריך חוב', 'הערות']
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
      U.el('td', null, [U.el('span', { text: s.phone || '' }), (a.balance > 0.005 ? waDebtBtn(s, a.balance) : null)]),
      U.el('td', { class: 'center', html: '<b style="' + balStyle(a.balance) + '">' + money(a.balance) + '</b>' }),
      U.el('td', null, [statusCell]),
      U.el('td', { text: Object.keys(a.handlers).join(', ') }),
      U.el('td', { text: Object.keys(a.years).join(', ') }),
      U.el('td', { text: a.recs.map(function (r) { return r.notes; }).filter(Boolean).join(' · ') })
    ]);
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

    // כרטיסי חוב ידניים
    agg.recs.forEach(function (rec) {
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
        if (!siteId) { alert('יש לבחור אתר.'); return; }
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
        if (!amt) { alert('יש להזין סכום.'); return; }
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
    if (!aggs.length) { alert('אין נתונים לייצוא.'); return; }
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

  // ---------- ייבוא נתוני פתיחה (תמלול מהגיליון) ----------
  // הערה: התמלול מצילום מסך — מומלץ לעבור ולוודא שמות/סכומים.
  var MIGRATION = [
    { name: 'רשות העתיקות', contact: 'אפי', phone: '052-343-5561', amount: 106839, handledBy: 'שלמה גיא', status: 'בטיפול', year: '2025/6', note: 'תקוע בתהליך האישורים' },
    { name: 'צביקי סטרולין כרמי יין', contact: 'צביקי סטרולין', phone: '052-796-6615', amount: 78676, handledBy: 'שלמה', status: 'בטיפול', year: '2025/6', note: 'משלם כל שנה בחודש 10 אחרי הבציר' },
    { name: 'עצמונת תלע"ד', contact: 'מיב"צ', phone: '052-725-7868', amount: 39240, handledBy: 'שלמה גיא', status: 'בטיפול', year: '2025/6', note: 'בטיפול מול שרידים' },
    { name: 'ליבי בניה ותשתיות בע"מ', contact: 'אליקים', phone: '', amount: 34808, handledBy: 'שלמה', status: '', year: '2025/10', note: '' },
    { name: 'יקב בן פורת בע"מ', contact: '', phone: '052-771-0433', amount: 28408.25, handledBy: 'שלמה', status: 'בטיפול', year: '', note: '' },
    { name: 'פרץ שמעון', contact: 'שמעון חזות', phone: '050-521-7839', amount: 22100, handledBy: 'שלמה', status: '', year: '2025', note: '' },
    { name: 'יקב פסומה בע"מ', contact: 'משה מזין', phone: '052-720-3178', amount: 12034, handledBy: 'שלמה', status: 'בטיפול', year: '2025/6', note: '' },
    { name: 'אספי אזולאי', contact: 'אספי', phone: '052-478-5361', amount: 11000, handledBy: 'שלמה', status: '', year: '2026', note: '' },
    { name: 'אליהו סבג', contact: 'אליהו', phone: '058-497-0916', amount: 10880, handledBy: 'שלמה', status: '', year: '2025', note: '' },
    { name: 'יקב גבעות בע"מ', contact: 'אליאב', phone: '050-725-0806', amount: 10710, handledBy: 'שלמה', status: 'בטיפול', year: '2025', note: '' },
    { name: 'מקנה הרים בע"מ', contact: 'יובל', phone: '050-336-1055', amount: 9950, handledBy: 'שלמה', status: '', year: '2025/6', note: '' },
    { name: 'ישי זייצ\'יק', contact: 'ישי', phone: '052-607-0159', amount: 9625, handledBy: 'שלמה', status: '', year: '2025/6', note: '' },
    { name: 'גבריאל משה', contact: 'גבריאל משה', phone: '052-331-0505', amount: 5847, handledBy: 'שלמה', status: 'בטיפול', year: '2022', note: 'ישוב- פדיה' },
    { name: 'ארץ הצבי א.ש. בע"מ', contact: 'ארז בן סעדון', phone: '052-370-5105', amount: 5164.60, handledBy: 'שלמה', status: 'בטיפול', year: '2023', note: 'יקב טווא' },
    { name: 'גיורא ג\'- תירוש ההר', contact: 'גיורא', phone: '052-796-6598', amount: 4590, handledBy: 'שלמה', status: 'בטיפול', year: '2026', note: '' },
    { name: 'טווא אליהו יאיר', contact: 'אלי', phone: '052-423-8084', amount: 3960, handledBy: 'שלמה', status: '', year: '2024/5', note: '' },
    { name: 'ב.השדה חווה לחקלאות', contact: 'רועי', phone: '055-668-2063', amount: 3780, handledBy: 'שלמה', status: 'בטיפול', year: '2026', note: '' },
    { name: 'א.נעם הנדואי וחקלאות', contact: 'אורי', phone: '050-740-5556', amount: 3430, handledBy: 'שלמה', status: '', year: '2025', note: 'ישוב- כפר רות' },
    { name: 'כרם עלי', contact: 'אספי', phone: '050-998-9812', amount: 3028, handledBy: 'שלמה', status: '', year: '2025', note: 'ישוב- חמרה' },
    { name: 'משק וויים מוסי', contact: 'מוסי', phone: '052-384-9426', amount: 2445, handledBy: 'שלמה', status: '', year: '', note: '' },
    { name: 'כרמי משק אחיה בע"מ', contact: 'ידידיה ממן', phone: '058-636-6714', amount: 700, handledBy: 'שלמה', status: 'בטיפול', year: '', note: '' },
    { name: 'משק אחיה (ידידיה ממן)', contact: 'ידידיה ממן', phone: '058-636-6714', amount: 7686, handledBy: 'גיא', status: 'חוב אבוד', year: '2019/20', note: 'טוען ששילם- לעשות חובות אבודים' },
    { name: 'משק אחיה (ממן ידידיה)', contact: 'ידידיה ממן', phone: '058-636-6714', amount: 2100, handledBy: 'גיא', status: 'חוב אבוד', year: '2020', note: 'טוען ששילם- לעשות חובות אבודים' },
    { name: 'צמלביץ אפרים', contact: '', phone: '', amount: 1022.70, handledBy: '', status: '', year: '2019', note: 'חוב ישן' },
    { name: 'רבינו גידול ושיווק', contact: '', phone: '', amount: 11150, handledBy: '', status: 'פתוחה', year: '2019', note: 'לוודא מול שרי/שלנקוף' },
    { name: 'ראם בע"מ', contact: '', phone: '', amount: 1430, handledBy: '', status: 'פתוחה', year: '2024', note: 'לוודא מול שרי החקלאי' },
    { name: 'אתרי יודי קיי בע"מ', contact: '', phone: '', amount: 2350, handledBy: '', status: 'חוב אבוד', year: '2020', note: 'לשאול את הרב יצחק' },
    { name: 'תיכון בישעיה', contact: '', phone: '050-264-1426', amount: 1380, handledBy: '', status: '', year: '2024', note: '' },
    { name: 'דרור אזולאי', contact: '', phone: '', amount: 600, handledBy: '', status: 'פתוחה', year: '2025', note: 'שלמה שאל את אסף מי זה?' },
    { name: 'עופר אברהם', contact: 'עופר', phone: '050-567-5494', amount: 30844.10, handledBy: 'שלמה והרב יצחק', status: 'תהליך הוצל"פ', year: '2022/3', note: 'יש להתקשר לקראת חודש 07' },
    { name: 'יקב תגיא בע"מ', contact: 'יורם', phone: '', amount: 29876, handledBy: 'הרב יצחק', status: 'תהליך הוצל"פ', year: '', note: '' },
    { name: 'עת צור', contact: 'יאיר', phone: '052-946-0181', amount: 13308.20, handledBy: 'יאיר', status: 'תהליך הוצל"פ', year: '2023/4', note: 'לטעון שלא עבדנו מספיק טוב. לערב את ישראל שלנו' },
    { name: 'יקב הר קידה', contact: 'יאיר', phone: '052-946-0181', amount: 9322, handledBy: 'יאיר', status: 'תהליך הוצל"פ', year: '2022/3/4', note: '' }
  ];

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
          var wb = XLSX.read(e.target.result, { type: 'array' });
          var ws = wb.Sheets[wb.SheetNames[0]];
          importDebtRows(XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }));
        } catch (err) { alert('שגיאה בקריאת הקובץ: ' + (err.message || err)); }
      };
      reader.readAsArrayBuffer(f);
    };
    inp.click();
  }
  function importDebtRows(rows) {
    if (!rows || rows.length < 2) { alert('הקובץ ריק או חסר שורות נתונים.'); return; }
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
    if (ci.name < 0 || ci.amount < 0) { alert('לא נמצאו העמודות "שם עסק" ו"חוב פתיחה". הורידו את אקסל לדוגמה והשתמשו באותן כותרות.'); return; }
    function cell(r, i) { return i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : ''; }
    var data = rows.slice(1).filter(function (r) { return r && cell(r, ci.name); });
    if (!data.length) { alert('אין שורות נתונים.'); return; }
    if (!confirm('לייבא ' + data.length + ' חובות? אתרים שלא קיימים ייווצרו אוטומטית (כלא-פעילים).')) return;
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
      Store.upsert('debtRecords', {
        siteId: site.id, openingDebt: U.num(o.amount),
        debtYear: String(o.year == null ? '' : o.year).trim(), status: o.status || 'פתוחה',
        handledBy: o.handler || '', notes: o.note || '', imported: true
      });
      added++;
    });
    return { created: created, added: added };
  }

  // ---------- ייבוא PDF מהעמותה + ניתוח AI ----------
  function importDebtsPdf() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/pdf,.pdf';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      if (f.size > 15 * 1024 * 1024) { alert('הקובץ גדול מדי (מקסימום ~15MB).'); return; }
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
      if (!rows.length) { alert('ה-AI לא מצא חובות בקובץ. נסו קובץ ברור יותר, או ייבוא מאקסל.'); return; }
      openPdfPreview(rows);
    }).catch(function (err) {
      overlay.close();
      alert('שגיאה בניתוח ה-PDF: ' + ((err && err.message) || err));
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

  function openPdfPreview(rows) {
    var existing = {};
    (Store.get().sites || []).forEach(function (s) { existing[normName(s.name)] = true; });
    var state = rows.map(function (r) {
      return {
        include: true,
        name: String(r.name || '').trim(),
        total: U.num(r.total),
        date: String(r.date || '').trim(),
        customerNumber: String(r.customerNumber || '').trim(),
        invoiceCount: r.invoiceCount || 0
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
      var totInp = U.el('input', { type: 'number', step: '0.01', value: st.total, style: 'width:110px;' });
      totInp.addEventListener('input', function () { st.total = U.num(totInp.value); });
      var dtInp = U.el('input', { type: 'text', value: st.date, placeholder: 'dd/mm/yyyy', style: 'width:100px;' });
      dtInp.addEventListener('input', function () { st.date = dtInp.value; });

      tbody.appendChild(U.el('tr', null, [
        U.el('td', { class: 'center' }, [chk]),
        U.el('td', null, [nameInp]),
        U.el('td', { class: 'center' }, [totInp]),
        U.el('td', { class: 'center' }, [dtInp]),
        U.el('td', { class: 'center', text: st.invoiceCount ? String(st.invoiceCount) : '' }),
        siteCell
      ]));
    });

    var table = U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null,
        ['', 'שם עסק', 'יתרת חוב (₪)', 'תאריך', 'חשבוניות', 'אתר'].map(function (h) { return U.el('th', { text: h }); }))]),
      tbody
    ])]);
    var info = U.el('div', { class: 'muted', style: 'margin-bottom:10px;', html:
      'ה-AI חילץ <b>' + state.length + '</b> חובות מתוך ה-PDF. בדקו וערכו לפי הצורך, ובטלו סימון לשורות שלא לייבא. אתרים חדשים ייווצרו כלא-פעילים.' });

    Modal.open('🤖 תצוגה מקדימה — ייבוא חובות מ-PDF', U.el('div', null, [info, table]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'ייבא נבחרים', onClick: function (close) {
        var chosen = state.filter(function (s) { return s.include && String(s.name).trim() && s.total; });
        if (!chosen.length) { alert('לא נבחרו שורות לייבוא (ודאו שם ויתרה).'); return; }
        var objs = chosen.map(function (s) {
          var note = [];
          if (s.customerNumber) note.push('מס׳ לקוח ' + s.customerNumber);
          if (s.invoiceCount) note.push(s.invoiceCount + ' חשבוניות');
          note.push('יובא מ-PDF');
          return { name: s.name, amount: s.total, year: s.date, status: 'פתוחה', note: note.join(' · ') };
        });
        var res = commitDebtObjs(objs);
        close(); App.render();
        U.toast('הייבוא הושלם: ' + res.added + ' חובות' + (res.created ? ' · ' + res.created + ' אתרים חדשים' : ''));
      } }
    ]);
  }

  function importOpening() {
    if (records().some(function (r) { return r.imported; })) {
      if (!confirm('נראה שכבר יובאו נתוני פתיחה. לייבא שוב? (עלולות להיווצר כפילויות)')) return;
    }
    if (!confirm('לייבא ' + MIGRATION.length + ' חובות מנתוני הפתיחה? אתרים שלא קיימים ייווצרו אוטומטית (כלא-פעילים).')) return;

    var sites = Store.get().sites || [];
    var created = 0, addedRecords = 0;
    MIGRATION.forEach(function (row) {
      var site = null;
      for (var i = 0; i < sites.length; i++) {
        if (normName(sites[i].name) === normName(row.name)) { site = sites[i]; break; }
      }
      if (!site) {
        site = Store.upsert('sites', {
          name: row.name, contactName: row.contact || '', phone: row.phone || '',
          active: false, notes: 'נוצר מייבוא חובות'
        });
        sites = Store.get().sites;
        created++;
      }
      Store.upsert('debtRecords', {
        siteId: site.id, openingDebt: row.amount, debtYear: row.year || '',
        status: row.status || '', handledBy: row.handledBy || '', notes: row.note || '',
        imported: true
      });
      addedRecords++;
    });
    App.render();
    alert('הייבוא הושלם: ' + addedRecords + ' חובות' + (created ? ', ' + created + ' אתרים חדשים נוצרו' : '') + '.');
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
