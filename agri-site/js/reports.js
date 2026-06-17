/* reports.js — דוחות תלמידים / אתרים / צוות */
(function (global) {
  'use strict';
  var U = global.U;
  var sub = 'students';
  var fromDate = U.addDays(U.todayISO(), -30);
  var toDate = U.todayISO();

  function inRange(iso) { return iso >= fromDate && iso <= toDate; }

  // אוסף את כל הכרטיסים בטווח
  function eachCard(cb) {
    var days = Store.get().days;
    Object.keys(days).forEach(function (iso) {
      if (!inRange(iso)) return;
      (days[iso].cards || []).forEach(function (c) { cb(iso, c); });
    });
  }

  function studentReport() {
    var stats = {}; // studentId -> {days:Set, work:0, arrived:0}
    eachCard(function (iso, c) {
      (c.students || []).forEach(function (s) {
        if (!stats[s.studentId]) stats[s.studentId] = { days: {}, work: 0, sick: 0, hours: 0, ratingSum: 0, ratingCount: 0 };
        var st = stats[s.studentId];
        if (s.wentToWork) { st.days[iso] = true; st.work++; st.hours += U.num(c.hours); }
        if (s.sick) st.sick++;
        if (s.rating) { st.ratingSum += U.num(s.rating); st.ratingCount++; }
      });
    });
    return Object.keys(stats).map(function (id) {
      var stu = Store.getById('students', id) || { name: '(נמחק)', grade: '' };
      var st = stats[id];
      var avg = st.ratingCount ? (st.ratingSum / st.ratingCount).toFixed(1) : '';
      return { name: stu.name, grade: stu.grade || '', days: Object.keys(st.days).length, work: st.work, sick: st.sick, hours: st.hours, rating: avg };
    }).sort(function (a, b) { return b.work - a.work; });
  }

  function siteReport() {
    var stats = {};
    eachCard(function (iso, c) {
      if (!c.siteId) return;
      if (!stats[c.siteId]) stats[c.siteId] = { days: {}, workers: 0, hours: 0 };
      var st = stats[c.siteId];
      st.days[iso] = true;
      var w = (c.students || []).filter(function (s) { return s.wentToWork; }).length;
      st.workers += w;
      st.hours += w * U.num(c.hours);
    });
    return Object.keys(stats).map(function (id) {
      var s = Store.getById('sites', id) || { name: '(נמחק)' };
      return { name: s.name, days: Object.keys(stats[id].days).length, workers: stats[id].workers, hours: stats[id].hours };
    }).sort(function (a, b) { return b.hours - a.hours; });
  }

  function staffReport() {
    var stats = {};
    function bump(id, iso, role) {
      if (!id) return;
      if (!stats[id]) stats[id] = { days: {}, role: role };
      stats[id].days[iso] = true;
    }
    eachCard(function (iso, c) {
      var sids = (c.staffIds && c.staffIds.length) ? c.staffIds : (c.staffId ? [c.staffId] : []);
      sids.forEach(function (sid) { bump(sid, iso, 'איש צוות'); });
      bump(c.leaderId, iso, 'ראש צוות');
    });
    return Object.keys(stats).map(function (id) {
      var p = Store.getById('staff', id) || { name: '(נמחק)' };
      return { name: p.name, days: Object.keys(stats[id].days).length };
    }).sort(function (a, b) { return b.days - a.days; });
  }

  function render(root) {
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'דוחות' }),
      dateRange(),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn accent', onclick: exportExcel }, '⬇ ייצוא אקסל')
    ]);
    root.appendChild(head);

    root.appendChild(U.el('div', { class: 'subtabs' }, [
      ['students', 'תלמידים'], ['sites', 'אתרים'], ['staff', 'צוות']
    ].map(function (p) {
      return U.el('button', { class: sub === p[0] ? 'active' : '', onclick: function () { sub = p[0]; App.render(); } }, p[1]);
    })));

    if (sub === 'students') root.appendChild(renderStudents());
    else if (sub === 'sites') root.appendChild(renderTable(['אתר', 'ימי פעילות', 'סה"כ עובדים', 'סה"כ שעות'], siteReport().map(function (r) { return [r.name, r.days, r.workers, r.hours]; })));
    else root.appendChild(renderTable(['שם', 'ימי פעילות'], staffReport().map(function (r) { return [r.name, r.days]; })));
  }

  function renderStudents() {
    var rep = studentReport();
    // סינון כיתה
    var wrap = U.el('div');
    var gradeFilter = U.el('select', { style: 'margin-bottom:10px;' }, [U.el('option', { value: '' }, 'כל הכיתות')].concat(U.GRADES.map(function (g) { return U.el('option', { value: g }, 'כיתה ' + g); })));
    var HEADERS = ['תלמיד', 'כיתה', 'ימי עבודה', 'חולה', 'סה"כ שעות', 'ציון ממוצע'];
    function rowOf(r) { return [r.name, r.grade, r.work, r.sick, r.hours, r.rating]; }
    gradeFilter.addEventListener('change', function () {
      U.clear(tableWrap);
      var rows = rep.filter(function (r) { return !gradeFilter.value || r.grade === gradeFilter.value; }).map(rowOf);
      tableWrap.appendChild(renderTable(HEADERS, rows));
    });
    var tableWrap = U.el('div');
    tableWrap.appendChild(renderTable(HEADERS, rep.map(rowOf)));
    wrap.appendChild(gradeFilter);
    wrap.appendChild(tableWrap);
    return wrap;
  }

  function renderTable(headers, rows) {
    if (!rows.length) return U.el('div', { class: 'card empty' }, 'אין נתונים בטווח התאריכים שנבחר.');
    return U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, headers.map(function (h) { return U.el('th', { text: h }); }))]),
      U.el('tbody', null, rows.map(function (r) { return U.el('tr', null, r.map(function (c, i) { return U.el('td', { class: i === 0 ? '' : 'center', text: c }); })); }))
    ]);
  }

  function dateRange() {
    var f = U.el('input', { type: 'date', value: fromDate });
    f.addEventListener('change', function () { if (f.value) { fromDate = f.value; App.render(); } });
    var t = U.el('input', { type: 'date', value: toDate });
    t.addEventListener('change', function () { if (t.value) { toDate = t.value; App.render(); } });
    return U.el('span', { style: 'display:inline-flex;gap:6px;align-items:center;' }, [U.el('label', { style: 'margin:0;', text: 'מ' }), f, U.el('label', { style: 'margin:0;', text: 'עד' }), t]);
  }

  function exportExcel() {
    var wb = XLSX.utils.book_new();
    var sr = studentReport();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['תלמיד', 'כיתה', 'ימי עבודה', 'חולה', 'סה"כ שעות', 'ציון ממוצע']].concat(sr.map(function (r) { return [r.name, r.grade, r.work, r.sick, r.hours, r.rating]; }))), 'תלמידים');
    var si = siteReport();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['אתר', 'ימי פעילות', 'סה"כ עובדים', 'סה"כ שעות']].concat(si.map(function (r) { return [r.name, r.days, r.workers, r.hours]; }))), 'אתרים');
    var sf = staffReport();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['שם', 'ימי פעילות']].concat(sf.map(function (r) { return [r.name, r.days]; }))), 'צוות');
    XLSX.writeFile(wb, 'דוחות-' + fromDate + '_' + toDate + '.xlsx');
  }

  global.ReportsView = { render: render };
})(window);
