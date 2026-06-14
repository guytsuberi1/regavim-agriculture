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
    var travel = (adj && adj.travelOverride !== undefined && adj.travelOverride !== '') ? (adj.travelOverride === 'yes') : dayData.travel;
    return { workers: workers, hours: hours, travel: travel };
  }

  function siteTotals(siteEntry, mk) {
    var adjAll = adjFor(mk, siteEntry.site ? siteEntry.site.id : '_');
    var rate = siteEntry.site ? U.num(siteEntry.site.hourlyRate) : 0;
    var travelPay = siteEntry.site ? U.num(siteEntry.site.travelPay) : 0;
    var totHours = 0, workPay = 0, travelTot = 0, days = 0;
    Object.keys(siteEntry.days).sort().forEach(function (iso) {
      var eff = effective(siteEntry.days[iso], adjAll[iso]);
      var th = eff.workers * eff.hours;
      totHours += th;
      workPay += th * rate;
      if (eff.travel && eff.workers > 0) travelTot += travelPay;
      days++;
    });
    return { totHours: totHours, workPay: workPay, travelTot: travelTot, total: workPay + travelTot, days: days, rate: rate, travelPay: travelPay };
  }

  function render(root) {
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'דרישת תשלום חודשית' }),
      monthInput(),
      U.el('span', { class: 'tag', text: U.monthLabel(curMonth) }),
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
        U.el('td', { class: 'center', html: '<b>' + Math.round(t.total) + '</b>' })
      ]);
    });
    summaryRows.push(U.el('tr', null, [
      U.el('td', { html: '<b>סה"כ</b>' }), U.el('td'), U.el('td'), U.el('td'), U.el('td'), U.el('td'), U.el('td'), U.el('td'),
      U.el('td', { class: 'center', html: '<b>' + Math.round(grandTotal) + ' ₪</b>' })
    ]));

    var summary = U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null,
        ['שם עסקי', 'מיקום', 'איש קשר', 'ימים', 'סה"כ שעות', 'תשלום שעתי', 'תשלום עבודה', 'תשלום נסיעות', 'סה"כ לתשלום']
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

      var wInp = U.el('input', { type: 'number', value: adj.workersOverride !== undefined && adj.workersOverride !== '' ? adj.workersOverride : dd.workers, style: 'width:60px;' });
      wInp.addEventListener('change', function () { setAdj(id, iso, 'workersOverride', wInp.value); App.render(); });
      var hInp = U.el('input', { type: 'number', step: '0.5', value: adj.hoursOverride !== undefined && adj.hoursOverride !== '' ? adj.hoursOverride : dd.hours, style: 'width:60px;' });
      hInp.addEventListener('change', function () { setAdj(id, iso, 'hoursOverride', hInp.value); App.render(); });
      var travSel = U.el('select', null, [U.el('option', { value: '' }, 'אוטומטי'), U.el('option', { value: 'yes' }, 'כן'), U.el('option', { value: 'no' }, 'לא')]);
      travSel.value = adj.travelOverride || '';
      travSel.addEventListener('change', function () { setAdj(id, iso, 'travelOverride', travSel.value); App.render(); });
      var noteInp = U.el('input', { type: 'text', value: adj.note || '', placeholder: 'הערה / התאמה', style: 'width:100%;' });
      noteInp.addEventListener('change', function () { setAdj(id, iso, 'note', noteInp.value); });

      return U.el('tr', null, [
        U.el('td', { text: U.gregLabel(iso) + ' (' + U.weekdayName(iso) + ')' }),
        U.el('td', { class: 'center' }, [wInp]),
        U.el('td', { class: 'center' }, [hInp]),
        U.el('td', { class: 'center', text: th }),
        U.el('td', { class: 'center' }, [travSel]),
        U.el('td', null, [noteInp])
      ]);
    });

    var table = U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, ['תאריך', 'כמות עובדים', 'מס\' שעות', 'סה"כ שעות', 'נסיעות', 'הערה'].map(function (h) { return U.el('th', { text: h }); }))]),
      U.el('tbody', null, rows)
    ]);

    var info = U.el('div', { class: 'muted', style: 'margin:4px 0 8px;' },
      'תעריף שעתי: ' + t.rate + ' ₪ · נסיעות: ' + t.travelPay + ' ₪ · ' +
      'תשלום עבודה: ' + Math.round(t.workPay) + ' ₪ · נסיעות: ' + Math.round(t.travelTot) + ' ₪ · ' +
      'סה"כ: ' + Math.round(t.total) + ' ₪');

    return U.el('div', { class: 'card', style: 'margin-bottom:16px;' }, [
      U.el('h3', { style: 'margin-top:0;', text: s.name + (s.location ? ' · ' + s.location : '') }),
      info, table
    ]);
  }

  function setAdj(siteId, iso, field, value) {
    var adjAll = adjFor(curMonth, siteId);
    if (!adjAll[iso]) adjAll[iso] = {};
    adjAll[iso][field] = value;
    Store.save();
  }

  function monthInput() {
    var inp = U.el('input', { type: 'month', value: curMonth });
    inp.addEventListener('change', function () { if (inp.value) { curMonth = inp.value; App.render(); } });
    return inp;
  }

  // ---------- ייצוא אקסל בפורמט הגבייה ----------
  function exportExcel() {
    var bySite = computeMonth(curMonth);
    var siteIds = Object.keys(bySite);
    if (!siteIds.length) { alert('אין נתונים לייצוא בחודש זה.'); return; }
    var wb = XLSX.utils.book_new();

    // טבלה מסכמת
    var sum = [['דרישת תשלום — רגבים בנימין · ' + U.monthLabel(curMonth)], [],
      ['שם עסקי', 'מיקום', 'איש קשר', 'טלפון', 'ימים', 'סה"כ שעות', 'תשלום שעתי', 'תשלום עבודה', 'תשלום נסיעות', 'סה"כ לתשלום']];
    var grand = 0;
    siteIds.forEach(function (id) {
      var e = bySite[id], s = e.site || { name: '(נמחק)' }, t = siteTotals(e, curMonth);
      grand += t.total;
      sum.push([s.name, s.location || '', s.contactName || '', s.phone || '', t.days, t.totHours, t.rate, Math.round(t.workPay), Math.round(t.travelTot), Math.round(t.total)]);
    });
    sum.push(['', '', '', '', '', '', '', '', 'סה"כ', Math.round(grand)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'טבלה מסכמת');

    // גיליון לכל אתר
    var usedNames = {};
    siteIds.forEach(function (id) {
      var e = bySite[id], s = e.site || { name: 'אתר' }, adjAll = adjFor(curMonth, id);
      var aoa = [['שם עסקי:', s.name], ['מיקום:', s.location || ''], ['איש קשר:', s.contactName || ''], ['טלפון:', s.phone || ''],
        ['תשלום שעתי:', U.num(s.hourlyRate)], ['תשלום נסיעות:', U.num(s.travelPay)], [],
        ['תאריך', 'כמות עובדים', 'מס\' שעות', 'סה"כ שעות', 'נסיעות', 'הערה']];
      Object.keys(e.days).sort().forEach(function (iso) {
        var eff = effective(e.days[iso], adjAll[iso]);
        var th = eff.workers * eff.hours;
        aoa.push([U.gregLabel(iso), eff.workers, eff.hours, th, (eff.travel && eff.workers > 0) ? 'כן' : 'לא', (adjAll[iso] && adjAll[iso].note) || '']);
      });
      var t = siteTotals(e, curMonth);
      aoa.push([]);
      aoa.push(['סה"כ שעות', t.totHours, '', 'תשלום עבודה', Math.round(t.workPay)]);
      aoa.push(['תשלום נסיעות', Math.round(t.travelTot), '', 'סה"כ לתשלום', Math.round(t.total)]);
      // שם גיליון חוקי (≤31 תווים, ייחודי)
      var nm = (s.name || 'אתר').replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 28);
      var base = nm, i = 2;
      while (usedNames[nm]) { nm = base.slice(0, 26) + ' ' + (i++); }
      usedNames[nm] = true;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nm);
    });

    XLSX.writeFile(wb, 'דרישת-תשלום-' + curMonth + '.xlsx');
  }

  global.BillingView = { render: render };
})(window);
