/* debts.js — ניהול חובות חקלאים
   כל שורה = כרטיס חוב לעסק (אתר). אפשר כמה חובות לאותו עסק (כמו בגיליון).
   יתרה = חוב פתיחה ידני + חיובים ידניים − תשלומים − זיכויים.
   בנוסף מוצגות שורות "חיוב שוטף" אוטומטיות מדרישת התשלום (billing.js) לכל אתר שעבד. */
(function (global) {
  'use strict';
  var U = global.U;

  // מצב תצוגה (נשמר בין רינדורים)
  var expanded = {};        // rowKey -> bool
  var filterStatus = '';    // '' = הכול
  var onlyWithBalance = false;
  var search = '';

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

  // ---------- גישה לנתונים ----------
  function records() { return Store.get().debtRecords || []; }
  function entries() { return Store.get().debtEntries || []; }
  function entriesForRecord(rid) { return entries().filter(function (e) { return e.recordId === rid; }); }
  function sumKind(arr, kind) {
    return arr.filter(function (e) { return e.kind === kind; })
      .reduce(function (a, e) { return a + U.num(e.amount); }, 0);
  }
  function billedMap() { return (global.BillingUtil ? global.BillingUtil.billedBySite() : {}); }
  function siteOf(id) { return Store.getById('sites', id) || { name: '(אתר נמחק)' }; }

  // יתרת כרטיס ידני
  function recordBalance(rec) {
    var es = entriesForRecord(rec.id);
    return U.num(rec.openingDebt) + sumKind(es, 'charge') - sumKind(es, 'payment') - sumKind(es, 'credit');
  }
  // יתרת שורת "חיוב שוטף" (לפי אתר)
  function billingBalance(siteId, billedTotal) {
    var es = entriesForRecord('bill:' + siteId);
    return U.num(billedTotal) - sumKind(es, 'payment') - sumKind(es, 'credit');
  }

  // בניית רשימת השורות המאוחדת (ידני + חיוב שוטף)
  function buildRows() {
    var rows = [];
    records().forEach(function (rec) {
      rows.push({ key: 'm:' + rec.id, rid: rec.id, type: 'manual', rec: rec, siteId: rec.siteId, balance: recordBalance(rec) });
    });
    var billed = billedMap();
    Object.keys(billed).forEach(function (siteId) {
      if (U.num(billed[siteId].total) <= 0) return;
      rows.push({ key: 'b:' + siteId, rid: 'bill:' + siteId, type: 'billing', siteId: siteId, billed: billed[siteId], balance: billingBalance(siteId, billed[siteId].total) });
    });
    return rows;
  }

  function passesFilter(row) {
    if (onlyWithBalance && Math.abs(row.balance) < 0.005) return false;
    if (filterStatus) {
      if (row.type !== 'manual') return false;
      if ((row.rec.status || '') !== filterStatus) return false;
    }
    if (search) {
      var s = siteOf(row.siteId);
      var hay = [s.name, s.contactName, s.phone, row.type === 'manual' ? row.rec.handledBy : '', row.type === 'manual' ? row.rec.notes : '']
        .filter(Boolean).join(' ').toLowerCase();
      if (hay.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  // ---------- רינדור ראשי ----------
  function render(root) {
    var allRows = buildRows();
    var grandAll = allRows.reduce(function (a, r) { return a + r.balance; }, 0);
    var rows = allRows.filter(passesFilter).sort(function (a, b) { return b.balance - a.balance; });

    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '💰 ניהול חובות חקלאים' }),
      U.el('span', { class: 'tag', html: 'סה"כ חוב: <b>' + money(grandAll) + '</b>' }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn', onclick: function () { openRecord(null, ''); } }, '+ חוב חדש'),
      U.el('button', { class: 'btn accent', onclick: exportExcel }, '⬇ ייצוא לאקסל'),
      U.el('button', { class: 'btn secondary', onclick: function () { window.print(); } }, '🖨️ הדפסה'),
      U.el('button', { class: 'btn secondary no-print', onclick: importOpening }, '⬇ ייבוא נתוני פתיחה')
    ]);
    root.appendChild(head);

    // סרגל סינון
    var searchInp = U.el('input', { type: 'search', placeholder: 'חיפוש עסק / איש קשר…', value: search, style: 'min-width:200px;' });
    searchInp.addEventListener('input', function () { search = searchInp.value; rerenderKeepFocus(); });
    var statusSel = U.el('select', null, [U.el('option', { value: '' }, 'כל הסטטוסים')].concat(
      STATUSES.map(function (s) { return U.el('option', { value: s.value }, s.value); })));
    statusSel.value = filterStatus;
    statusSel.addEventListener('change', function () { filterStatus = statusSel.value; App.render(); });
    var balChk = U.el('input', { type: 'checkbox', checked: onlyWithBalance });
    balChk.addEventListener('change', function () { onlyWithBalance = balChk.checked; App.render(); });
    var filters = U.el('div', { class: 'no-print', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;' }, [
      searchInp, statusSel,
      U.el('label', { style: 'display:inline-flex;gap:5px;align-items:center;cursor:pointer;', text: '' }, [balChk, U.el('span', { text: 'רק עם יתרה' })])
    ]);
    root.appendChild(filters);

    if (!rows.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין חובות להצגה. הוסיפו "חוב חדש" או ייבאו נתוני פתיחה.'));
      return;
    }

    // ---------- טבלה ----------
    var shownTotal = 0;
    var tbody = U.el('tbody');
    rows.forEach(function (row) {
      shownTotal += row.balance;
      tbody.appendChild(buildRow(row));
      if (expanded[row.key]) tbody.appendChild(buildDetailRow(row));
    });
    tbody.appendChild(U.el('tr', null, [
      U.el('td', { html: '<b>סה"כ מוצג</b>' }), U.el('td'), U.el('td'),
      U.el('td', { class: 'center', html: '<b>' + money(shownTotal) + '</b>' }),
      U.el('td'), U.el('td'), U.el('td'), U.el('td'), U.el('td')
    ]));

    var table = U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null,
        ['שם עסק', 'איש קשר', 'טלפון', 'יתרת חוב', 'סטטוס', 'מטופל ע"י', 'שנת חוב', 'הערות', 'פעולות']
          .map(function (h) { return U.el('th', { text: h }); }))]),
      tbody
    ]);
    root.appendChild(table);
  }

  function rerenderKeepFocus() {
    // עדכון קל ללא איבוד פוקוס בשדה החיפוש: רינדור מלא ומיקוד מחדש
    var pos = document.activeElement === U.$('input[type=search]') ? (U.$('input[type=search]').selectionStart) : null;
    App.render();
    var inp = U.$('input[type=search]');
    if (inp && pos != null) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (e) {} }
  }

  function buildRow(row) {
    var s = siteOf(row.siteId);
    var caret = U.el('button', { class: 'btn small secondary', title: 'פירוט', onclick: function () { expanded[row.key] = !expanded[row.key]; App.render(); } }, expanded[row.key] ? '▾' : '▸');

    var nameCell;
    if (row.type === 'billing') {
      nameCell = U.el('td', null, [U.el('span', { text: s.name + ' ' }), U.el('span', { class: 'tag', style: 'background:#E0F2FE;color:#075985;', text: 'חיוב שוטף' })]);
    } else {
      nameCell = U.el('td', { text: s.name });
    }

    var actions;
    if (row.type === 'billing') {
      actions = U.el('td', null, [caret,
        U.el('button', { class: 'btn small', style: 'margin-inline-start:4px;', onclick: function () { openEntry('bill:' + row.siteId, row.siteId, 'payment'); } }, '💰')]);
    } else {
      actions = U.el('td', null, [caret,
        U.el('button', { class: 'btn small', style: 'margin-inline-start:4px;', title: 'רישום תשלום', onclick: function () { openEntry(row.rid, row.siteId, 'payment'); } }, '💰'),
        U.el('button', { class: 'btn small secondary', style: 'margin-inline-start:4px;', title: 'עריכה', onclick: function () { openRecord(row.rec, row.rec.siteId); } }, '✎')]);
    }

    return U.el('tr', null, [
      nameCell,
      U.el('td', { text: s.contactName || '' }),
      U.el('td', { text: s.phone || '' }),
      U.el('td', { class: 'center', html: '<b>' + money(row.balance) + '</b>' }),
      U.el('td', null, row.type === 'manual' ? [statusChip(row.rec.status)] : [U.el('span', { class: 'tag', style: 'background:#eee;color:#666;', text: 'מערכת' })]),
      U.el('td', { text: row.type === 'manual' ? (row.rec.handledBy || '') : '' }),
      U.el('td', { text: row.type === 'manual' ? (row.rec.debtYear || '') : '' }),
      U.el('td', { text: row.type === 'manual' ? (row.rec.notes || '') : '' }),
      actions
    ]);
  }

  function buildDetailRow(row) {
    var box = U.el('div', { style: 'padding:6px 4px;' });
    var lines = [];

    function entryLine(label, e, sign) {
      return U.el('div', { style: 'display:flex;gap:8px;align-items:center;padding:2px 0;' }, [
        U.el('span', { style: 'min-width:150px;', text: label + (e.date ? ' · ' + e.date : '') + (e.method ? ' · ' + e.method : '') + (e.note ? ' · ' + e.note : '') }),
        U.el('b', { text: sign + money(e.amount) }),
        U.el('button', { class: 'btn small danger', onclick: function () { if (confirm('למחוק תנועה זו?')) { Store.remove('debtEntries', e.id); App.render(); } } }, '🗑')
      ]);
    }

    if (row.type === 'manual') {
      lines.push(U.el('div', { style: 'padding:2px 0;', html: 'חוב פתיחה: <b>' + money(row.rec.openingDebt) + '</b>' }));
    } else {
      lines.push(U.el('div', { style: 'padding:2px 0;', html: 'חיוב שוטף מדרישת התשלום: <b>' + money(row.billed.total) + '</b>' }));
      var bm = row.billed.byMonth || {};
      Object.keys(bm).sort().forEach(function (mk) {
        lines.push(U.el('div', { class: 'muted', style: 'padding-inline-start:14px;font-size:13px;', text: U.monthLabel(mk) + ': ' + money(bm[mk]) }));
      });
    }

    var es = entriesForRecord(row.rid);
    es.filter(function (e) { return e.kind === 'charge'; }).forEach(function (e) { lines.push(entryLine('חיוב ידני', e, '+')); });
    es.filter(function (e) { return e.kind === 'payment'; }).forEach(function (e) { lines.push(entryLine('תשלום', e, '−')); });
    es.filter(function (e) { return e.kind === 'credit'; }).forEach(function (e) { lines.push(entryLine('זיכוי', e, '−')); });

    lines.push(U.el('div', { style: 'border-top:1px solid var(--border);margin-top:6px;padding-top:6px;', html: 'יתרת חוב: <b>' + money(row.balance) + '</b>' }));

    // כפתורי פעולה
    var btns = [
      U.el('button', { class: 'btn small', onclick: function () { openEntry(row.rid, row.siteId, 'payment'); } }, '+ תשלום'),
      U.el('button', { class: 'btn small secondary', onclick: function () { openEntry(row.rid, row.siteId, 'credit'); } }, '+ זיכוי')
    ];
    if (row.type === 'manual') {
      btns.push(U.el('button', { class: 'btn small secondary', onclick: function () { openEntry(row.rid, row.siteId, 'charge'); } }, '+ חיוב'));
      btns.push(U.el('button', { class: 'btn small secondary', onclick: function () { openRecord(row.rec, row.rec.siteId); } }, '✎ עריכת כרטיס'));
      btns.push(U.el('button', { class: 'btn small danger', onclick: function () { deleteRecord(row.rec); } }, '🗑 מחיקה'));
    }
    box.appendChild(U.el('div', null, lines));
    box.appendChild(U.el('div', { class: 'no-print', style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;' }, btns));

    var td = U.el('td', { style: 'background:#fafdfb;' }, [box]);
    td.setAttribute('colspan', '9');
    return U.el('tr', null, [td]);
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
    var yearInp = U.el('input', { type: 'text', value: rec ? (rec.debtYear || '') : '', placeholder: 'לדוגמה: 2025/6', style: 'width:100%;' });
    var statusSel = U.el('select', { style: 'width:100%;' }, [U.el('option', { value: '' }, '— ללא —')].concat(
      STATUSES.map(function (s) { return U.el('option', { value: s.value }, s.value); })));
    statusSel.value = rec ? (rec.status || '') : 'בטיפול';
    var handlerInp = U.el('input', { type: 'text', value: rec ? (rec.handledBy || '') : '', placeholder: 'מי מטפל', style: 'width:100%;' });
    var notesInp = U.el('textarea', { rows: '2', style: 'width:100%;', placeholder: 'הערות' });
    notesInp.value = rec ? (rec.notes || '') : '';

    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    var body = U.el('div', null, [
      fld('עסק (אתר)', siteSel),
      fld('חוב פתיחה (₪)', openInp),
      fld('שנת חוב', yearInp),
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
        Store.upsert('debtRecords', out);
        close(); App.render();
      } }
    ]);
  }

  function deleteRecord(rec) {
    var s = siteOf(rec.siteId);
    if (!confirm('למחוק את כרטיס החוב של "' + s.name + '" (' + money(recordBalance(rec)) + ')? כל התנועות שלו יימחקו.')) return;
    entriesForRecord(rec.id).forEach(function (e) { Store.remove('debtEntries', e.id); });
    Store.remove('debtRecords', rec.id);
    App.render();
  }

  // ---------- מודאל תנועה (תשלום/חיוב/זיכוי) ----------
  function openEntry(recordId, siteId, presetKind) {
    var s = siteOf(siteId);
    var kindSel = U.el('select', { style: 'width:100%;' }, [
      U.el('option', { value: 'payment' }, 'תשלום (מקטין חוב)'),
      U.el('option', { value: 'charge' }, 'חיוב (מגדיל חוב)'),
      U.el('option', { value: 'credit' }, 'זיכוי (מקטין חוב)')
    ]);
    kindSel.value = presetKind || 'payment';
    // לשורת "חיוב שוטף" אין חיוב ידני
    if (String(recordId).indexOf('bill:') === 0) {
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
        close(); App.render();
      } }
    ]);
  }

  // ---------- ייצוא אקסל (RTL, מעוצב — בסגנון דרישת תשלום) ----------
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
    var rows = buildRows().sort(function (a, b) { return b.balance - a.balance; });
    if (!rows.length) { alert('אין נתונים לייצוא.'); return; }
    var wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };

    var headers = ['שם עסק', 'איש קשר', 'טלפון', 'יתרת חוב', 'סוג', 'סטטוס', 'מטופל ע"י', 'שנת חוב', 'הערות'];
    var aoa = [['דוח חובות חקלאים — רגבים בנימין'], [], headers];
    var grand = 0;
    rows.forEach(function (row) {
      var s = siteOf(row.siteId);
      grand += row.balance;
      aoa.push([
        s.name || '', s.contactName || '', s.phone || '',
        Math.round(row.balance * 100) / 100,
        row.type === 'manual' ? 'ידני' : 'חיוב שוטף',
        row.type === 'manual' ? (row.rec.status || '') : 'מערכת',
        row.type === 'manual' ? (row.rec.handledBy || '') : '',
        row.type === 'manual' ? (row.rec.debtYear || '') : '',
        row.type === 'manual' ? (row.rec.notes || '') : ''
      ]);
    });
    aoa.push(['סה"כ חוב', '', '', Math.round(grand * 100) / 100, '', '', '', '', '']);

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var ncol = headers.length;
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: ncol - 1 } }];
    ws['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 30 }];
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

  function importOpening() {
    if (records().some(function (r) { return r.imported; })) {
      if (!confirm('נראה שכבר יובאו נתוני פתיחה. לייבא שוב? (עלולות להיווצר כפילויות)')) return;
    }
    if (!confirm('לייבא ' + MIGRATION.length + ' חובות מנתוני הפתיחה? אתרים שלא קיימים ייווצרו אוטומטית (כלא-פעילים).')) return;

    var sites = Store.get().sites || [];
    var created = 0, addedRecords = 0;
    MIGRATION.forEach(function (row) {
      // התאמה לאתר קיים לפי שם מנורמל
      var site = null;
      for (var i = 0; i < sites.length; i++) {
        if (normName(sites[i].name) === normName(row.name)) { site = sites[i]; break; }
      }
      if (!site) {
        site = Store.upsert('sites', {
          name: row.name, contactName: row.contact || '', phone: row.phone || '',
          active: false, notes: 'נוצר מייבוא חובות'
        });
        sites = Store.get().sites; // רענון הרשימה
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

  global.DebtsView = { render: render };
})(window);
