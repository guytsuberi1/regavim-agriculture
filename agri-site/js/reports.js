/* reports.js — דוחות תלמידים / אתרים / צוות */
(function (global) {
  'use strict';
  var U = global.U;
  var sub = 'students';
  var fromDate = U.addDays(U.todayISO(), -30);
  var toDate = U.todayISO();
  var summaryDate = U.todayISO(); // #1 סיכום יומי
  var cardStudentId = '';        // #3 כרטיס תלמיד

  function inRange(iso) { return iso >= fromDate && iso <= toDate; }

  // אוסף את כל הכרטיסים בטווח
  function eachCard(cb) {
    var days = Store.get().days;
    Object.keys(days).forEach(function (iso) {
      if (!inRange(iso)) return;
      (days[iso].cards || []).forEach(function (c) { cb(iso, c); });
    });
  }

  // ---------- עזרי נוכחות/היעדרות ----------
  function getAbs(iso, id) {
    var m = (Store.get().absenceInfo || {})[iso];
    return (m && m[id]) ? m[id] : { approved: false, reason: '' };
  }
  function setAbs(iso, id, info) {
    var d = Store.get();
    if (!d.absenceInfo) d.absenceInfo = {};
    if (!d.absenceInfo[iso]) d.absenceInfo[iso] = {};
    if (!info.approved && !(info.reason || '').trim()) delete d.absenceInfo[iso][id];
    else d.absenceInfo[iso][id] = { approved: !!info.approved, reason: info.reason || '' };
    if (d.absenceInfo[iso] && !Object.keys(d.absenceInfo[iso]).length) delete d.absenceInfo[iso];
    Store.save();
  }
  // סט מזהי תלמידים שיצאו ביום
  function wentOn(iso) {
    var set = {}, day = Store.get().days[iso];
    if (day) (day.cards || []).forEach(function (c) { (c.students || []).forEach(function (s) { if (s.wentToWork) set[s.studentId] = true; }); });
    return set;
  }
  // מי שלא יצא ביום: שובץ ולא סומן "יצא" + נעדרי היום (לא כולל מי שיצא)
  function nonAttendanceOn(iso) {
    var day = Store.get().days[iso], went = wentOn(iso), seen = {}, out = [];
    if (day) (day.cards || []).forEach(function (c) {
      var site = c.siteId ? Store.getById('sites', c.siteId) : null;
      (c.students || []).forEach(function (s) {
        if (s.wentToWork || went[s.studentId] || seen[s.studentId]) return;
        seen[s.studentId] = true;
        out.push({ studentId: s.studentId, site: site ? site.name : '(אתר)', rating: s.rating, marked: s.absent ? 'לא יצא' : 'לא סומן' });
      });
    });
    ((Store.get().dailyAbsent || {})[iso] || []).forEach(function (id) {
      if (went[id] || seen[id]) return;
      seen[id] = true;
      out.push({ studentId: id, site: null, rating: null, marked: 'נעדר היום' });
    });
    return out;
  }
  // מי שקיבל ציון ביום (כולל מי שיצא)
  function ratedOn(iso) {
    var day = Store.get().days[iso], seen = {}, out = [];
    if (day) (day.cards || []).forEach(function (c) {
      var site = c.siteId ? Store.getById('sites', c.siteId) : null;
      (c.students || []).forEach(function (s) {
        if (!s.rating || seen[s.studentId]) return;
        seen[s.studentId] = true;
        out.push({ studentId: s.studentId, site: site ? site.name : '(אתר)', rating: s.rating, went: !!s.wentToWork });
      });
    });
    return out;
  }

  function studentReport() {
    var stats = {};
    function ensure(id) { if (!stats[id]) stats[id] = { work: 0, absApproved: 0, absUnapproved: 0, ratingSum: 0, ratingCount: 0 }; return stats[id]; }
    // ציונים (מכל רשומת תלמיד עם ציון בטווח)
    eachCard(function (iso, c) {
      (c.students || []).forEach(function (s) {
        var st = ensure(s.studentId);
        if (s.rating) { st.ratingSum += U.num(s.rating); st.ratingCount++; }
      });
    });
    // נוכחות/היעדרות לכל יום בטווח
    var days = Store.get().days;
    Object.keys(days).forEach(function (iso) {
      if (!inRange(iso)) return;
      var went = wentOn(iso);
      Object.keys(went).forEach(function (id) { ensure(id).work++; });
      nonAttendanceOn(iso).forEach(function (r) {
        var st = ensure(r.studentId);
        if (getAbs(iso, r.studentId).approved) st.absApproved++; else st.absUnapproved++;
      });
    });
    return Object.keys(stats).map(function (id) {
      var stu = Store.getById('students', id) || { name: '(נמחק)', grade: '' };
      var st = stats[id];
      var avg = st.ratingCount ? (st.ratingSum / st.ratingCount).toFixed(1) : '';
      return { name: stu.name, grade: stu.grade || '', work: st.work, absApproved: st.absApproved, absUnapproved: st.absUnapproved, rating: avg };
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

  function transportReport() {
    var stats = {};
    eachCard(function (iso, c) {
      if (!c.transportId) return;
      if (!stats[c.transportId]) stats[c.transportId] = { days: {}, trips: 0, workers: 0 };
      var st = stats[c.transportId];
      st.days[iso] = true;
      st.trips++;
      st.workers += (c.students || []).filter(function (s) { return s.wentToWork; }).length;
    });
    return Object.keys(stats).map(function (id) {
      var tr = Store.getById('transports', id) || { name: '(נמחק)' };
      return { name: tr.name, days: Object.keys(stats[id].days).length, trips: stats[id].trips, workers: stats[id].workers };
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
      ['daily', 'סיכום יומי'], ['students', 'תלמידים'], ['card', 'כרטיס תלמיד'], ['sites', 'אתרים'], ['staff', 'צוות'], ['transports', 'הסעה']
    ].map(function (p) {
      return U.el('button', { class: sub === p[0] ? 'active' : '', onclick: function () { sub = p[0]; App.render(); } }, p[1]);
    })));

    if (sub === 'daily') root.appendChild(renderDailySummary());
    else if (sub === 'students') root.appendChild(renderStudents());
    else if (sub === 'card') root.appendChild(renderStudentCard());
    else if (sub === 'sites') root.appendChild(renderTable(['אתר', 'ימי פעילות', 'סה"כ עובדים', 'סה"כ שעות'], siteReport().map(function (r) { return [r.name, r.days, r.workers, r.hours]; })));
    else if (sub === 'staff') root.appendChild(renderTable(['שם', 'ימי פעילות'], staffReport().map(function (r) { return [r.name, r.days]; })));
    else root.appendChild(renderTable(['הסעה', 'ימי פעילות', 'מספר הסעות', 'סה"כ נוסעים'], transportReport().map(function (r) { return [r.name, r.days, r.trips, r.workers]; })));
  }

  function renderStudents() {
    var rep = studentReport();
    // סינון כיתה
    var wrap = U.el('div');
    var gradeFilter = U.el('select', { style: 'margin-bottom:10px;' }, [U.el('option', { value: '' }, 'כל הכיתות')].concat(U.GRADES.map(function (g) { return U.el('option', { value: g }, 'כיתה ' + g); })));
    var HEADERS = ['תלמיד', 'כיתה', 'ימי עבודה שיצא', 'לא יצא באישור', 'לא יצא בלי אישור', 'ציון ממוצע'];
    function rowOf(r) { return [r.name, r.grade, r.work, r.absApproved, r.absUnapproved, r.rating]; }
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

  // #1 — סיכום יומי
  function renderDailySummary() {
    var wrap = U.el('div');
    var dateInp = U.el('input', { type: 'date', value: summaryDate, style: 'margin-bottom:10px;' });
    dateInp.addEventListener('change', function () { if (dateInp.value) { summaryDate = dateInp.value; App.render(); } });
    wrap.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: 'תאריך' }), dateInp]));

    wrap.appendChild(U.el('h3', { style: 'margin:14px 0 6px;color:var(--green-dark);', text: 'מי שלא יצא — עדכון סיבה' }));
    var na = nonAttendanceOn(summaryDate);
    if (!na.length) {
      wrap.appendChild(U.el('div', { class: 'card empty' }, 'כל התלמידים יצאו ✓'));
    } else {
      var tb = U.el('tbody');
      na.forEach(function (r) {
        var stu = Store.getById('students', r.studentId) || { name: '(נמחק)', grade: '' };
        var info = getAbs(summaryDate, r.studentId);
        var selA = U.el('select', null, [U.el('option', { value: '0' }, 'לא באישור'), U.el('option', { value: '1' }, 'באישור')]);
        selA.value = info.approved ? '1' : '0';
        var note = U.el('input', { type: 'text', value: info.reason || '', placeholder: 'הערה', style: 'width:100%;' });
        function persist() { setAbs(summaryDate, r.studentId, { approved: selA.value === '1', reason: note.value }); }
        selA.addEventListener('change', persist);
        note.addEventListener('change', persist);
        tb.appendChild(U.el('tr', null, [
          U.el('td', { text: stu.name }),
          U.el('td', { class: 'center', text: stu.grade || '' }),
          U.el('td', { class: 'center', text: r.site || r.marked }),
          U.el('td', { class: 'center', text: r.rating || '' }),
          U.el('td', null, [selA]),
          U.el('td', null, [note])
        ]));
      });
      wrap.appendChild(U.el('table', { class: 'grid' }, [
        U.el('thead', null, [U.el('tr', null, ['תלמיד', 'כיתה', 'אתר/סטטוס', 'ציון', 'אישור', 'הערה'].map(function (h) { return U.el('th', { text: h }); }))]),
        tb
      ]));
    }

    wrap.appendChild(U.el('h3', { style: 'margin:18px 0 6px;color:var(--green-dark);', text: 'מי שקיבל ציון' }));
    var rated = ratedOn(summaryDate).filter(function (r) { return r.went; });
    if (!rated.length) wrap.appendChild(U.el('div', { class: 'card empty' }, 'אין ציונים ליום זה.'));
    else wrap.appendChild(renderTable(['תלמיד', 'כיתה', 'אתר', 'ציון'], rated.map(function (r) {
      var stu = Store.getById('students', r.studentId) || { name: '(נמחק)', grade: '' };
      return [stu.name, stu.grade || '', r.site, r.rating];
    })));
    return wrap;
  }

  // #3 — כרטיס תלמיד
  function renderStudentCard() {
    var wrap = U.el('div');
    var students = (Store.get().students || []).filter(function (s) { return s.active !== false; }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });
    var sel = U.el('select', { style: 'margin-bottom:10px;' }, [U.el('option', { value: '' }, 'בחר תלמיד…')].concat(students.map(function (s) { return U.el('option', { value: s.id }, s.name + (s.grade ? ' (' + s.grade + ')' : '')); })));
    sel.value = cardStudentId;
    sel.addEventListener('change', function () { cardStudentId = sel.value; App.render(); });
    wrap.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: 'תלמיד' }), sel]));
    if (!cardStudentId) { wrap.appendChild(U.el('div', { class: 'card empty' }, 'בחרו תלמיד לצפייה בכרטיס.')); return wrap; }

    var days = Store.get().days, rows = [], work = 0, notout = 0, absApproved = 0, absUnapproved = 0, rSum = 0, rCnt = 0, hoursSum = 0;
    Object.keys(days).filter(inRange).sort().forEach(function (iso) {
      var entry = null, site = '', cardHours = 0;
      (days[iso].cards || []).forEach(function (c) {
        (c.students || []).forEach(function (s) { if (s.studentId === cardStudentId) { entry = s; cardHours = c.hours; site = c.siteId ? ((Store.getById('sites', c.siteId) || {}).name || '(אתר)') : '(אתר)'; } });
      });
      var inAbsent = ((Store.get().dailyAbsent || {})[iso] || []).indexOf(cardStudentId) !== -1;
      if (!entry && !inAbsent) return;
      var didGo = !!(entry && entry.wentToWork);
      var info = getAbs(iso, cardStudentId);
      if (didGo) { work++; hoursSum += U.num(cardHours); } else { notout++; if (info.approved) absApproved++; else absUnapproved++; }
      if (entry && entry.rating) { rSum += U.num(entry.rating); rCnt++; }
      rows.push([
        U.gregLabel(iso),
        didGo ? site : (inAbsent ? 'נעדר היום' : (site || '')),
        didGo ? '✓ יצא' : 'לא יצא',
        (entry && entry.rating) || '',
        didGo ? '' : (info.approved ? 'באישור' : 'לא באישור'),
        (info.reason || '') || (entry && entry.note) || ''
      ]);
    });
    var total = work + notout;
    var pct = total ? Math.round(work / total * 100) : null;
    var pctCol = pct == null ? ['#475569', '#f1f5f9'] : (pct >= 75 ? ['#15803d', '#dcfce7'] : (pct >= 50 ? ['#b45309', '#fef3c7'] : ['#b91c1c', '#fee2e2']));
    function statCard(value, label, fg, bg) {
      return U.el('div', { style: 'flex:1;min-width:120px;background:' + (bg || '#fff') + ';border:1px solid var(--border,#e2e8f0);border-radius:12px;padding:12px;text-align:center;' }, [
        U.el('div', { style: 'font-size:24px;font-weight:800;color:' + (fg || 'var(--green-dark,#1b5e20)') + ';', text: String(value) }),
        U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:3px;', text: label })
      ]);
    }
    wrap.appendChild(U.el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;' }, [
      statCard(pct == null ? '—' : pct + '%', 'אחוז יציאה', pctCol[0], pctCol[1]),
      statCard(work, 'ימים שיצא'),
      statCard(hoursSum, 'סה"כ שעות'),
      statCard(absApproved, 'לא יצא — באישור'),
      statCard(absUnapproved, 'לא יצא — בלי אישור'),
      statCard(rCnt ? (rSum / rCnt).toFixed(1) : '—', 'ציון ממוצע')
    ]));
    wrap.appendChild(renderTable(['תאריך', 'אתר', 'יצא?', 'ציון', 'אישור', 'סיבה/הערה'], rows));
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['תלמיד', 'כיתה', 'ימי עבודה שיצא', 'לא יצא באישור', 'לא יצא בלי אישור', 'ציון ממוצע']].concat(sr.map(function (r) { return [r.name, r.grade, r.work, r.absApproved, r.absUnapproved, r.rating]; }))), 'תלמידים');
    var si = siteReport();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['אתר', 'ימי פעילות', 'סה"כ עובדים', 'סה"כ שעות']].concat(si.map(function (r) { return [r.name, r.days, r.workers, r.hours]; }))), 'אתרים');
    var sf = staffReport();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['שם', 'ימי פעילות']].concat(sf.map(function (r) { return [r.name, r.days]; }))), 'צוות');
    var tp = transportReport();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['הסעה', 'ימי פעילות', 'מספר הסעות', 'סה"כ נוסעים']].concat(tp.map(function (r) { return [r.name, r.days, r.trips, r.workers]; }))), 'הסעות');
    XLSX.writeFile(wb, 'דוחות-' + fromDate + '_' + toDate + '.xlsx');
  }

  global.ReportsView = { render: render };
})(window);
