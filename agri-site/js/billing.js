/* billing.js — דרישת תשלום חודשית לגבייה */
(function (global) {
  'use strict';
  var U = global.U;
  var curMonth = U.monthKey(U.todayISO());

  // אגרגציה: לכל אתר, רשימת ימים בחודש עם כמות עובדים/שעות/נסיעות
  function computeMonth(mk) {
    var data = Store.get();
    var bySite = {}; // siteId -> { site, days: { iso: {workers, hours, travel} } }
    Object.keys(data.days).forEach(function (iso) {
      if (U.monthKey(iso) !== mk) return;
      (data.days[iso].cards || []).forEach(function (c) {
        if (!c.siteId) return;
        var workers = (c.students || []).filter(function (s) { return s.wentToWork; }).length;
        if (workers === 0 && !(c.students || []).length) return;
        if (!bySite[c.siteId]) bySite[c.siteId] = { site: Store.getById('sites', c.siteId), days: {} };
        var d = bySite[c.siteId].days[iso] || { workers: 0, hours: 0, travel: false };
        d.workers += workers;
        d.hours = Math.max(d.hours, U.num(c.hours));
        d.travel = d.travel || (c.travel !== false);
        bySite[c.siteId].days[iso] = d;
      });
    });
    return bySite;
  }

  function adjFor(mk, siteId) {
    var data = Store.get();
    var key = mk + '|' + siteId;
    if (!data.billingAdjustments[key]) data.billingAdjustments[key] = {};
    return data.billingAdjustments[key];
  }

  // ערך אפקטיבי ליום (לאחר התאמות ידניות)
  function effective(dayData, adj) {
    var workers = (adj && adj.workersOverride !== undefined && adj.workersOverride !== '') ? U.num(adj.workersOverride) : dayData.workers;
    var hours = (adj && adj.hoursOverride !== undefined && adj.hoursOverride !== '') ? U.num(adj.hoursOverride) : dayData.hours;
    // תשלום נסיעות ניתן תמיד לפי הגדרת האתר בנתוני הבסיס (travelPay)
    return { workers: workers, hours: hours, travel: true };
  }

  function siteTotals(siteEntry, mk) {
    var adjAll = adjFor(mk, siteEntry.site ? siteEntry.site.id : '_');
    var rate = siteEntry.site ? U.num(siteEntry.site.hourlyRate) : 0;
    var travelPay = siteEntry.site ? U.num(siteEntry.site.travelPay) : 0;
    var totHours = 0, workPay = 0, travelTot = 0, days = 0, dayDiscounts = 0;
    Object.keys(siteEntry.days).sort().forEach(function (iso) {
      var adj = adjAll[iso] || {};
      var eff = effective(siteEntry.days[iso], adj);
      var th = eff.workers * eff.hours;
      totHours += th;
      workPay += th * rate;
      if (eff.travel && eff.workers > 0) travelTot += travelPay;
      dayDiscounts += U.num(adj.discount);
      days++;
    });
    var monthDiscount = U.num(adjAll._discount); // הנחה כללית לחודש (אופציונלי / תאימות לאחור)
    var discount = dayDiscounts + monthDiscount;
    var discountNote = adjAll._discountNote || '';
    return { totHours: totHours, workPay: workPay, travelTot: travelTot, discount: discount, dayDiscounts: dayDiscounts, monthDiscount: monthDiscount, discountNote: discountNote, total: workPay + travelTot - discount, days: days, rate: rate, travelPay: travelPay };
  }

  function render(root) {
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'דרישת תשלום חודשית' }),
      monthInput(),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn accent', onclick: exportExcel }, '⬇ ייצוא לגבייה (אקסל)')
    ]);
    root.appendChild(head);

    var bySite = computeMonth(curMonth);
    var siteIds = Object.keys(bySite);
    if (!siteIds.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין נתוני עבודה בחודש זה. הזינו סידורים יומיים תחילה.'));
      return;
    }

    // ---- טבלה מסכמת ----
    var grandTotal = 0;
    var summaryRows = siteIds.map(function (id) {
      var t = siteTotals(bySite[id], curMonth);
      grandTotal += t.total;
      var s = bySite[id].site || { name: '(אתר נמחק)' };
      return U.el('tr', null, [
        U.el('td', { text: s.name }),
        U.el('td', { text: s.location || '' }),
        U.el('td', { text: [s.contactName, s.phone].filter(Boolean).join(' ') }),
        U.el('td', { class: 'center', text: t.days }),
        U.el('td', { class: 'center', text: t.totHours }),
        U.el('td', { class: 'center', text: t.rate }),
        U.el('td', { class: 'center', text: Math.round(t.workPay) }),
        U.el('td', { class: 'center', text: Math.round(t.travelTot) }),
        U.el('td', { class: 'center', text: t.discount ? Math.round(t.discount) : '' }),
        U.el('td', { class: 'center', html: '<b>' + Math.round(t.total) + '</b>' })
      ]);
    });
    summaryRows.push(U.el('tr', null, [
      U.el('td', { html: '<b>סה"כ</b>' }), U.el('td'), U.el('td'), U.el('td'), U.el('td'), U.el('td'), U.el('td'), U.el('td'), U.el('td'),
      U.el('td', { class: 'center', html: '<b>' + Math.round(grandTotal) + ' ₪</b>' })
    ]));

    var summary = U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null,
        ['שם עסקי', 'מיקום', 'איש קשר', 'ימים', 'סה"כ שעות', 'תשלום שעתי', 'תשלום עבודה', 'תשלום נסיעות', 'הנחה', 'סה"כ לתשלום']
          .map(function (h) { return U.el('th', { text: h }); }))]),
      U.el('tbody', null, summaryRows)
    ]);
    root.appendChild(U.el('h3', { style: 'color:var(--green-dark);', text: 'טבלה מסכמת' }));
    root.appendChild(summary);

    // ---- פירוט לכל אתר ----
    root.appendChild(U.el('h3', { style: 'color:var(--green-dark);margin-top:24px;', text: 'פירוט לפי אתר' }));
    siteIds.forEach(function (id) { root.appendChild(buildSiteDetail(id, bySite[id])); });
  }

  function buildSiteDetail(id, entry) {
    var s = entry.site || { name: '(אתר נמחק)' };
    var adjAll = adjFor(curMonth, id);
    var t = siteTotals(entry, curMonth);

    var rows = Object.keys(entry.days).sort().map(function (iso) {
      var dd = entry.days[iso];
      var adj = adjAll[iso] || {};
      var eff = effective(dd, adj);
      var th = eff.workers * eff.hours;
      var dayTravel = (eff.travel && eff.workers > 0) ? t.travelPay : 0;
      var dayDisc = U.num(adj.discount);
      var dayTotal = th * t.rate + dayTravel - dayDisc;

      var wInp = U.el('input', { type: 'number', value: adj.workersOverride !== undefined && adj.workersOverride !== '' ? adj.workersOverride : dd.workers, style: 'width:60px;' });
      wInp.addEventListener('change', function () { setAdj(id, iso, 'workersOverride', wInp.value); App.render(); });
      var hInp = U.el('input', { type: 'number', step: '0.5', value: adj.hoursOverride !== undefined && adj.hoursOverride !== '' ? adj.hoursOverride : dd.hours, style: 'width:60px;' });
      hInp.addEventListener('change', function () { setAdj(id, iso, 'hoursOverride', hInp.value); App.render(); });
      var discInpDay = U.el('input', { type: 'number', value: adj.discount !== undefined && adj.discount !== '' ? adj.discount : '', placeholder: '0', style: 'width:70px;', title: 'הנחה ליום זה (₪)' });
      discInpDay.addEventListener('change', function () { setAdj(id, iso, 'discount', discInpDay.value); App.render(); });
      var noteInp = U.el('input', { type: 'text', value: adj.note || '', placeholder: 'הערה / סיבת הנחה', style: 'width:100%;' });
      noteInp.addEventListener('change', function () { setAdj(id, iso, 'note', noteInp.value); });

      return U.el('tr', null, [
        U.el('td', { text: U.gregLabel(iso) + ' (' + U.weekdayName(iso) + ')' }),
        U.el('td', { class: 'center' }, [wInp]),
        U.el('td', { class: 'center' }, [hInp]),
        U.el('td', { class: 'center', text: th }),
        U.el('td', { class: 'center', text: t.rate }),
        U.el('td', { class: 'center', text: Math.round(dayTravel) }),
        U.el('td', { class: 'center' }, [discInpDay]),
        U.el('td', { class: 'center', html: '<b>' + Math.round(dayTotal) + '</b>' }),
        U.el('td', null, [noteInp])
      ]);
    });

    var table = U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, ['תאריך', 'כמות עובדים', 'מס\' שעות', 'סה"כ שעות', 'שכר שעתי', 'עלות נסיעות', 'הנחה', 'סה"כ יומי', 'הערה'].map(function (h) { return U.el('th', { text: h }); }))]),
      U.el('tbody', null, rows)
    ]);

    var info = U.el('div', { class: 'muted', style: 'margin:4px 0 8px;' },
      'תעריף שעתי: ' + t.rate + ' ₪ · נסיעות: ' + t.travelPay + ' ₪ · ' +
      'תשלום עבודה: ' + Math.round(t.workPay) + ' ₪ · נסיעות: ' + Math.round(t.travelTot) + ' ₪' +
      (t.discount ? ' · הנחה: ' + Math.round(t.discount) + ' ₪' : '') +
      ' · סה"כ: ' + Math.round(t.total) + ' ₪');

    // הנחה כללית לחודש (אופציונלי) + הערה — בנוסף להנחות היומיות שבטבלה
    var discInp = U.el('input', { type: 'number', value: adjAll._discount || '', placeholder: '0', style: 'width:90px;' });
    discInp.addEventListener('change', function () { setAdjMonth(id, '_discount', discInp.value); App.render(); });
    var discNote = U.el('input', { type: 'text', value: adjAll._discountNote || '', placeholder: 'הערה להנחה (תוצג לחקלאי)', style: 'flex:1;min-width:200px;' });
    discNote.addEventListener('change', function () { setAdjMonth(id, '_discountNote', discNote.value); });
    var discRow = U.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;' }, [
      U.el('label', { style: 'font-weight:600;', text: 'הנחה כללית לחודש (אופציונלי, ₪):' }), discInp, discNote
    ]);

    var exportBtn = U.el('button', {
      class: 'btn small secondary no-print', title: 'ייצוא פירוט אישי לחקלאי זה (אקסל)',
      onclick: function () { exportSiteExcel(id); }
    }, '⬇ ייצוא פירוט אישי');
    var cardHead = U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;' }, [
      U.el('h3', { style: 'margin:0;flex:1;', text: s.name + (s.location ? ' · ' + s.location : '') }),
      exportBtn
    ]);

    return U.el('div', { class: 'card', style: 'margin-bottom:16px;' }, [
      cardHead, info, table, discRow
    ]);
  }

  function setAdj(siteId, iso, field, value) {
    var adjAll = adjFor(curMonth, siteId);
    if (!adjAll[iso]) adjAll[iso] = {};
    adjAll[iso][field] = value;
    Store.save();
  }

  // התאמה ברמת החודש (הנחה/הערת הנחה) — נשמרת תחת מפתח שמור (לא תאריך)
  function setAdjMonth(siteId, field, value) {
    var adjAll = adjFor(curMonth, siteId);
    if (value === '' || value === null || value === undefined) delete adjAll[field];
    else adjAll[field] = value;
    Store.save();
  }

  function monthInput() {
    var inp = U.el('input', { type: 'month', value: curMonth });
    inp.addEventListener('change', function () { if (inp.value) { curMonth = inp.value; App.render(); } });
    return inp;
  }

  var THIN = { style: 'thin', color: { rgb: 'CBD5C0' } };
  var BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
  var ST = {
    title: { font: { bold: true, sz: 14, color: { rgb: '1B5E20' } }, alignment: { horizontal: 'center', readingOrder: 2 } },
    head:  { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '2E7D32' } }, alignment: { horizontal: 'center', vertical: 'center', readingOrder: 2 }, border: BORDER },
    label: { font: { bold: true, color: { rgb: '1B5E20' } }, fill: { fgColor: { rgb: 'E8F5E9' } }, alignment: { readingOrder: 2 }, border: BORDER },
    cell:  { alignment: { horizontal: 'center', readingOrder: 2 }, border: BORDER },
    total: { font: { bold: true }, fill: { fgColor: { rgb: 'EFE6DB' } }, alignment: { horizontal: 'center', readingOrder: 2 }, border: BORDER }
  };
  var MONEY = '#,##0';
  function setStyle(ws, r, c, style, z) {
    var addr = XLSX.utils.encode_cell({ r: r, c: c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = style;
    if (z) ws[addr].z = z;
  }

  // ---------- ייצוא אקסל בפורמט הגבייה (מעוצב + RTL) ----------
  function exportExcel() {
    var bySite = computeMonth(curMonth);
    var siteIds = Object.keys(bySite);
    if (!siteIds.length) { alert('אין נתונים לייצוא בחודש זה.'); return; }
    var wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] }; // כל הגיליונות נפתחים מימין לשמאל

    // ---- גיליון מסכם (מסובב: שדות בשורות, חקלאי לכל עמודה) ----
    var labels = ['שם עסקי:', 'מיקום:', 'שם', 'טלפון:', 'שעות עבודה', 'תשלום שעתי', 'תשלום עבודה', 'תשלום נסיעות', 'הנחה', 'סה"כ לתשלום'];
    var rows = labels.map(function (l) { return [l]; });
    siteIds.forEach(function (id) {
      var e = bySite[id], s = e.site || { name: '(נמחק)' }, t = siteTotals(e, curMonth);
      rows[0].push(s.name || ''); rows[1].push(s.location || ''); rows[2].push(s.contactName || ''); rows[3].push(s.phone || '');
      rows[4].push(t.totHours); rows[5].push(t.rate); rows[6].push(Math.round(t.workPay)); rows[7].push(Math.round(t.travelTot)); rows[8].push(Math.round(t.discount)); rows[9].push(Math.round(t.total));
    });
    var sumAoa = [['דרישת תשלום — רגבים בנימין · ' + U.monthLabel(curMonth)], []].concat(rows);
    var ws1 = XLSX.utils.aoa_to_sheet(sumAoa);
    var ncol = 1 + siteIds.length;
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: ncol - 1 } }];
    ws1['!cols'] = [{ wch: 16 }].concat(siteIds.map(function () { return { wch: 14 }; }));
    setStyle(ws1, 0, 0, ST.title);
    for (var c1 = 0; c1 < ncol; c1++) setStyle(ws1, 2, c1, c1 === 0 ? ST.label : ST.head); // שורת שמות החקלאים
    for (var ri = 3; ri <= 11; ri++) {
      for (var ci = 0; ci < ncol; ci++) {
        if (ci === 0) { setStyle(ws1, ri, ci, ST.label); continue; }
        setStyle(ws1, ri, ci, ri === 11 ? ST.total : ST.cell, ri >= 7 ? MONEY : null);
      }
    }
    XLSX.utils.book_append_sheet(wb, ws1, 'טבלה מסכמת');

    // ---- גיליון לכל חקלאי (רק ימים שעבדו) ----
    var usedNames = {};
    siteIds.forEach(function (id) { appendFarmerSheet(wb, id, bySite[id], usedNames); });

    XLSX.writeFile(wb, 'דרישת-תשלום-' + curMonth + '.xlsx');
  }

  // בונה גיליון-אקסל מעוצב לחקלאי בודד ומצרף לחוברת (משותף לייצוא הכללי ולייצוא האישי)
  function appendFarmerSheet(wb, id, entry, usedNames) {
    var s = entry.site || { name: 'אתר' }, adjAll = adjFor(curMonth, id), t = siteTotals(entry, curMonth);
    var aoa = [[s.name || 'אתר'],
      ['פירוט', 'תאריך', 'כמות עובדים', 'מס\' שעות', 'סה"כ שעות', 'עלות נסיעות', 'הנחה', 'סה"כ יומי']];
    Object.keys(entry.days).sort().forEach(function (iso) {
      var adj = adjAll[iso] || {};
      var eff = effective(entry.days[iso], adj);
      var th = eff.workers * eff.hours;
      var travAmt = (eff.travel && eff.workers > 0) ? t.travelPay : 0;
      var dDisc = U.num(adj.discount);
      aoa.push([adj.note || '', parseInt(iso.split('-')[2], 10), eff.workers, eff.hours, th, travAmt, dDisc || '', Math.round(th * t.rate + travAmt - dDisc)]);
    });
    var nDays = aoa.length - 2;
    aoa.push([]);
    var totalsRows = [
      ['סה"כ שעות עבודה', t.totHours],
      ['תשלום שעתי', t.rate],
      ['תשלום עבודה', Math.round(t.workPay)],
      ['תשלום נסיעות', Math.round(t.travelTot)]
    ];
    if (t.discount) totalsRows.push(['הנחה', Math.round(t.discount)]);
    if (t.discountNote) totalsRows.push(['הערת הנחה', t.discountNote]);
    totalsRows.push(['סה"כ לתשלום', Math.round(t.total)]);
    totalsRows.forEach(function (r) { aoa.push(r); });

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    ws['!cols'] = [{ wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
    setStyle(ws, 0, 0, ST.title);
    for (var hc = 0; hc < 8; hc++) setStyle(ws, 1, hc, ST.head);
    for (var dr = 0; dr < nDays; dr++) {
      for (var dc = 0; dc < 8; dc++) setStyle(ws, 2 + dr, dc, ST.cell, (dc === 5 || dc === 6 || dc === 7) ? MONEY : null);
    }
    var tbase = aoa.length - totalsRows.length;
    for (var tr = 0; tr < totalsRows.length; tr++) {
      setStyle(ws, tbase + tr, 0, ST.label);
      var isNote = totalsRows[tr][0] === 'הערת הנחה';
      setStyle(ws, tbase + tr, 1, ST.total, (!isNote && tr >= 1) ? MONEY : null);
    }
    // שם גיליון חוקי (≤31 תווים, ייחודי)
    var nm = (s.name || 'אתר').replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 28);
    var bn = nm, i = 2;
    while (usedNames[nm]) { nm = bn.slice(0, 26) + ' ' + (i++); }
    usedNames[nm] = true;
    XLSX.utils.book_append_sheet(wb, ws, nm);
  }

  // ---------- ייצוא פירוט אישי לחקלאי בודד (לשליחה אישית) ----------
  function exportSiteExcel(id) {
    var bySite = computeMonth(curMonth);
    if (!bySite[id]) { alert('אין נתוני עבודה לחקלאי זה בחודש הנבחר.'); return; }
    var wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    appendFarmerSheet(wb, id, bySite[id], {});
    var s = bySite[id].site || { name: 'אתר' };
    var safe = (s.name || 'אתר').replace(/[\\\/\?\*\[\]:]/g, ' ').trim();
    XLSX.writeFile(wb, 'פירוט-' + safe + '-' + curMonth + '.xlsx');
  }

  // ---------- עזר ציבורי: חישוב חיוב-עבודה לשימוש חוזר (מודול החובות) ----------
  // מחזיר את אותו חישוב של "דרישת תשלום" (כולל התאמות ידניות), מצטבר על כל החודשים.
  function allMonths() {
    var set = {};
    Object.keys(Store.get().days || {}).forEach(function (iso) { set[U.monthKey(iso)] = true; });
    return Object.keys(set).sort();
  }
  function billedBySite() { // { siteId: { total, byMonth: { 'YYYY-MM': total } } }
    var out = {};
    allMonths().forEach(function (mk) {
      var bySite = computeMonth(mk);
      Object.keys(bySite).forEach(function (id) {
        var t = siteTotals(bySite[id], mk);
        if (!out[id]) out[id] = { total: 0, byMonth: {} };
        out[id].total += t.total;
        out[id].byMonth[mk] = (out[id].byMonth[mk] || 0) + t.total;
      });
    });
    return out;
  }

  global.BillingUtil = { allMonths: allMonths, billedBySite: billedBySite };
  global.BillingView = { render: render };
})(window);
