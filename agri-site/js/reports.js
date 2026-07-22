/* reports.js — דוחות תלמידים / אתרים / צוות / הסעה */
(function (global) {
  'use strict';
  var U = global.U;
  var sub = 'students';
  var datePreset = 'custom';
  var fromDate = U.addDays(U.todayISO(), -30);
  var toDate = U.todayISO();
  var summaryDate = U.todayISO();
  var cardStudentId = '';

  function inRange(iso) { return iso >= fromDate && iso <= toDate; }
  function gi(g) { var i = U.GRADES.indexOf(g); return i < 0 ? 99 : i; }

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
  function wentOn(iso) {
    var set = {}, day = Store.get().days[iso];
    if (day) (day.cards || []).forEach(function (c) { (c.students || []).forEach(function (s) { if (s.wentToWork) set[s.studentId] = true; }); });
    return set;
  }
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

  // ---------- חישובי דוחות ----------
  function studentReport() {
    var stats = {};
    function ensure(id) { if (!stats[id]) stats[id] = { work: 0, absApproved: 0, absUnapproved: 0, ratingSum: 0, ratingCount: 0 }; return stats[id]; }
    eachCard(function (iso, c) {
      (c.students || []).forEach(function (s) {
        var st = ensure(s.studentId);
        if (s.rating) { st.ratingSum += U.num(s.rating); st.ratingCount++; }
      });
    });
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
      var stu = Store.getById('students', id) || { name: '(נמחק)', grade: '', className: '' };
      var st = stats[id];
      var avg = st.ratingCount ? (st.ratingSum / st.ratingCount).toFixed(1) : '';
      return { id: id, name: stu.name, grade: stu.grade || '', className: stu.className || stu.grade || '', work: st.work, absApproved: st.absApproved, absUnapproved: st.absUnapproved, rating: avg, ratingSum: st.ratingSum, ratingCount: st.ratingCount };
    }).sort(function (a, b) { return b.work - a.work; });
  }

  // כיתה מדויקת (ט1/ט2) — הפיצול בדוח הכיתות הוא לפי שדה "כיתה" של התלמיד
  function classGradeOf(cn) { return String(cn || '').replace(/[0-9\s\-'"׳״.]/g, ''); }
  function classCmp(a, b) {
    var d = gi(classGradeOf(a)) - gi(classGradeOf(b));
    if (d) return d;
    return String(a || '').localeCompare(String(b || ''), 'he');
  }
  function distinctClasses(rep) {
    var set = {};
    rep.forEach(function (r) { if (r.className) set[r.className] = true; });
    return Object.keys(set).sort(classCmp);
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
      var s = Store.getById('sites', id) || { name: '(נמחק)', location: '' };
      return { id: id, name: s.name, location: s.location || '', days: Object.keys(stats[id].days).length, workers: stats[id].workers, hours: stats[id].hours };
    }).sort(function (a, b) { return b.hours - a.hours; });
  }

  function staffReport() {
    var stats = {};
    function ensure(id, role) { if (!stats[id]) stats[id] = { days: {}, hours: 0, role: role }; return stats[id]; }
    eachCard(function (iso, c) {
      var sids = (c.staffIds && c.staffIds.length) ? c.staffIds : (c.staffId ? [c.staffId] : []);
      var h = U.num(c.hours);
      sids.forEach(function (sid) { if (!sid) return; var s = ensure(sid, 'איש צוות'); s.days[iso] = true; s.hours += h; });
      if (c.leaderId && sids.indexOf(c.leaderId) === -1) { var l = ensure(c.leaderId, 'ראש צוות'); l.days[iso] = true; l.hours += h; }
    });
    return Object.keys(stats).map(function (id) {
      var p = Store.getById('staff', id) || { name: '(נמחק)' };
      return { id: id, name: p.name, days: Object.keys(stats[id].days).length, hours: stats[id].hours };
    }).sort(function (a, b) { return b.days - a.days; });
  }

  function transportReport() {
    // הסעה יוצאת פעם אחת ביום (גם אם משובצת ל-2 אתרים — מורידה ב-2 נקודות). לכן מספר נסיעות = ימי פעילות.
    var stats = {};
    eachCard(function (iso, c) {
      if (!c.transportId) return;
      if (!stats[c.transportId]) stats[c.transportId] = { days: {}, workers: 0 };
      stats[c.transportId].days[iso] = true;
      stats[c.transportId].workers += (c.students || []).filter(function (s) { return s.wentToWork; }).length;
    });
    return Object.keys(stats).map(function (id) {
      var tr = Store.getById('transports', id) || { name: '(נמחק)' };
      return { id: id, name: tr.name, days: Object.keys(stats[id].days).length, workers: stats[id].workers };
    }).sort(function (a, b) { return b.days - a.days; });
  }

  // ---------- רכיבי UI ----------
  // כרטיס KPI — אותו עיצוב בדיוק כמו בדשבורד (אייקון בעיגול צבעוני, ערך גדול, פס צבע צדי)
  function repKpi(icon, value, label, tone, sub) {
    return U.el('div', { class: 'kpi kpi-' + (tone || 'neutral') }, [
      U.el('div', { class: 'kpi-ic', text: icon }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-row' }, [U.el('div', { class: 'kpi-val', text: String(value) })]),
        U.el('div', { class: 'kpi-lbl', text: label }),
        sub ? U.el('div', { class: 'kpi-sub', text: sub }) : null
      ])
    ]);
  }
  function kpiGrid(cards) { return U.el('div', { class: 'kpi-grid rep-kpis' }, cards); }
  // טון לפי אחוז יציאה: גבוה=ירוק, בינוני=כתום, נמוך=אדום
  function pctTone(pct) { return pct == null ? 'neutral' : (pct >= 75 ? 'good' : (pct >= 50 ? 'warn' : 'bad')); }
  // גרף פסים אופקיים (טופ־N) — באותו דפוס של גרף השוואת הכיתות
  function hbar(items, color) {
    var max = items.reduce(function (a, it) { return Math.max(a, it.value); }, 0) || 1;
    return U.el('div', { class: 'cls-chart' }, items.map(function (it) {
      return U.el('div', { class: 'cls-row' }, [
        U.el('span', { class: 'hbar-lbl', title: it.label, text: (it.prefix || '') + it.label }),
        U.el('div', { class: 'cls-track', title: it.label + ': ' + it.value + (it.unit ? ' ' + it.unit : '') }, [
          U.el('div', { class: 'cls-fill', style: 'width:' + Math.round(it.value / max * 100) + '%;background:' + (it.color || color || 'var(--green)') + ';' })
        ]),
        U.el('span', { class: 'cls-val', text: it.value.toLocaleString('he-IL') })
      ]);
    }));
  }

  function spot(icon, label, name, value, tone) {
    return U.el('div', { class: 'spot spot-' + (tone || 'n') }, [
      U.el('div', { class: 'spot-ic', text: icon }),
      U.el('div', { class: 'spot-body' }, [
        U.el('div', { class: 'spot-lbl', text: label }),
        U.el('div', { class: 'spot-name', text: name || '—' }),
        value != null ? U.el('div', { class: 'spot-val', text: value }) : null
      ])
    ]);
  }

  // טבלה הניתנת למיון (לחיצה על כותרת)
  function cellCmp(va, vb, header) {
    if (header === 'כיתה') return classCmp(va, vb);
    var sa = String(va == null ? '' : va), sb = String(vb == null ? '' : vb);
    var na = parseFloat(sa.replace(/[^0-9.\-]/g, '')), nb = parseFloat(sb.replace(/[^0-9.\-]/g, ''));
    var aNum = sa !== '' && !isNaN(na) && /[0-9]/.test(sa);
    var bNum = sb !== '' && !isNaN(nb) && /[0-9]/.test(sb);
    if (aNum && bNum) return na - nb;
    if (aNum !== bNum) return aNum ? -1 : 1;
    return sa.localeCompare(sb, 'he');
  }
  function sortableTable(headers, rows, emptyText, opts) {
    opts = opts || {};
    if (!rows.length) return U.el('div', { class: 'card empty' }, emptyText || 'אין נתונים בטווח התאריכים שנבחר.');
    var st = { col: -1, dir: 1 };
    var tbody = U.el('tbody');
    function fill() {
      U.clear(tbody);
      var sorted = rows.slice();
      if (st.col >= 0) sorted.sort(function (a, b) { return cellCmp(a[st.col], b[st.col], headers[st.col]) * st.dir; });
      sorted.forEach(function (r) {
        tbody.appendChild(U.el('tr', { class: opts.rowClass ? (opts.rowClass(r) || '') : '' },
          r.map(function (c, i) { return U.el('td', { class: (i === 0 ? '' : 'center') + (st.col === i ? ' sorted-col' : ''), text: c }); })));
      });
      // שורת סה"כ — נשארת תמיד בתחתית, גם אחרי מיון
      if (opts.totals) tbody.appendChild(U.el('tr', { class: 'total-row' },
        opts.totals.map(function (c, i) { return U.el('td', { class: i === 0 ? '' : 'center', html: '<b>' + (c == null ? '' : c) + '</b>' }); })));
    }
    var thRow = U.el('tr', null, headers.map(function (h, i) {
      var th = U.el('th', { class: 'sortable', title: 'מיון לפי ' + h, text: h });
      th.addEventListener('click', function () {
        if (st.col === i) st.dir = -st.dir; else { st.col = i; st.dir = 1; }
        Array.prototype.forEach.call(thRow.children, function (x, xi) {
          x.textContent = headers[xi] + (st.col === xi ? (st.dir === 1 ? ' ▲' : ' ▼') : '');
          x.classList.toggle('sorted-col', st.col === xi);
        });
        fill();
      });
      return th;
    }));
    fill();
    return U.el('table', { class: 'grid' }, [U.el('thead', null, [thRow]), tbody]);
  }
  function renderTable(headers, rows, emptyText) {
    if (!rows.length) return U.el('div', { class: 'card empty' }, emptyText || 'אין נתונים בטווח התאריכים שנבחר.');
    return U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, headers.map(function (h) { return U.el('th', { text: h }); }))]),
      U.el('tbody', null, rows.map(function (r) { return U.el('tr', null, r.map(function (c, i) { return U.el('td', { class: i === 0 ? '' : 'center', text: c }); })); }))
    ]);
  }

  // ---------- ניווט ראשי ----------
  function render(root) {
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '📊 דוחות' }),
      U.el('div', { class: 'spacer' }),
      // ייצוא כלל-הדוחות (כיתות/אתרים/צוות/הסעות) — לא רלוונטי בכרטיס תלמיד (שם יש ייצוא תמונה משלו)
      sub === 'card' ? null : U.actionMenu([
        { icon: '⬇', label: 'ייצוא כל הדוחות (אקסל)', title: 'כיתות, אתרים, צוות והסעות — קובץ אחד', onClick: exportExcel }
      ])
    ]);
    root.appendChild(head);
    root.appendChild(datePresetBar());

    // כרטיס תלמיד ראשון (הכי מימין)
    root.appendChild(U.el('div', { class: 'subtabs' }, [
      ['card', 'כרטיס תלמיד'], ['students', 'כיתות'], ['sites', 'אתרים'], ['staff', 'צוות'], ['transports', 'הסעה']
    ].map(function (p) {
      return U.el('button', { class: sub === p[0] ? 'active' : '', onclick: function () { sub = p[0]; App.render(); } }, p[1]);
    })));

    if (sub === 'students') root.appendChild(renderStudents());
    else if (sub === 'card') root.appendChild(renderStudentCard());
    else if (sub === 'sites') root.appendChild(renderSites());
    else if (sub === 'staff') root.appendChild(renderStaff());
    else root.appendChild(renderTransports());
  }

  // ---------- סרגל מסנן תאריכים ----------
  function setPreset(kind) {
    datePreset = kind;
    var today = U.todayISO();
    if (kind === 'week') { fromDate = U.startOfWeek(today); toDate = U.addDays(fromDate, 6); }
    else if (kind === 'month') { var d = U.fromISO(today); fromDate = U.toISO(new Date(d.getFullYear(), d.getMonth(), 1)); toDate = U.toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
    else if (kind === 'year') { // שנת פעילות: 1.9 עד 31.8
      var d0 = U.fromISO(today);
      var sy = d0.getFullYear() - (d0.getMonth() < 8 ? 1 : 0);
      fromDate = sy + '-09-01'; toDate = (sy + 1) + '-08-31';
    }
    App.render();
  }
  function datePresetBar() {
    var seg = [['week', 'שבוע'], ['month', 'חודש'], ['year', 'שנה'], ['custom', 'טווח']].map(function (p) {
      return U.el('button', { class: 'btn small ' + (datePreset === p[0] ? 'accent' : 'secondary'), onclick: function () { p[0] === 'custom' ? (datePreset = 'custom', App.render()) : setPreset(p[0]); } }, p[1]);
    });
    var children = [U.el('span', { class: 'muted', text: 'תקופה:' })].concat(seg);
    if (datePreset === 'custom') {
      // צ'יפים בעיצוב האחיד — לחיצה פותחת את בורר התאריך
      var f = U.el('input', { type: 'date', value: fromDate });
      f.addEventListener('change', function () { if (f.value) { fromDate = f.value; App.render(); } });
      var t = U.el('input', { type: 'date', value: toDate });
      t.addEventListener('change', function () { if (t.value) { toDate = t.value; App.render(); } });
      children.push(U.dateChip(U.gregLabel(fromDate), f, { title: 'מתאריך — לחצו לבחירה' }));
      children.push(U.el('span', { class: 'muted', text: '–' }));
      children.push(U.dateChip(U.gregLabel(toDate), t, { title: 'עד תאריך — לחצו לבחירה' }));
    } else {
      children.push(U.dateChip(U.gregLabel(fromDate) + ' – ' + U.gregLabel(toDate), null, { title: 'הטווח שנבחר' }));
    }
    return U.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;' }, children);
  }

  // ---------- דוח תלמידים ----------
  var STU_HEADERS = ['תלמיד', 'כיתה', 'ימי עבודה', 'לא יצא באישור', 'לא יצא בלי אישור', 'ציון ממוצע'];
  function stuRow(r) { return [r.name, r.className, r.work, r.absApproved, r.absUnapproved, r.rating]; }

  function classSummary(grade, rows) {
    var work = 0, absU = 0, rSum = 0, rCnt = 0;
    var bestAtt = null, bestAttP = -1, worstAbs = null, topAvg = null, lowAvg = null;
    rows.forEach(function (r) {
      work += r.work; absU += r.absUnapproved; rSum += r.ratingSum; rCnt += r.ratingCount;
      var t = r.work + r.absUnapproved;
      if (t) { var p = r.work / t; if (p > bestAttP) { bestAttP = p; bestAtt = r; } }
      if (r.absUnapproved > 0 && (!worstAbs || r.absUnapproved > worstAbs.absUnapproved)) worstAbs = r;
      if (r.ratingCount) { var a = r.ratingSum / r.ratingCount; if (!topAvg || a > topAvg.a) topAvg = { r: r, a: a }; if (!lowAvg || a < lowAvg.a) lowAvg = { r: r, a: a }; }
    });
    var total = work + absU;
    var pct = total ? Math.round(work / total * 100) : null;

    var spots = U.el('div', { class: 'spot-row' }, [
      spot('🏆', 'אחוז היציאה הגבוה ביותר', bestAtt ? bestAtt.name : null, bestAtt ? Math.round(bestAttP * 100) + '%' : null, 'good'),
      spot('⚠️', 'הכי הרבה היעדרויות (בלי אישור)', worstAbs ? worstAbs.name : null, worstAbs ? worstAbs.absUnapproved : null, 'bad'),
      spot('⭐', 'הציון הממוצע הגבוה ביותר', topAvg ? topAvg.r.name : null, topAvg ? topAvg.a.toFixed(1) : null, 'purple'),
      spot('📉', 'הציון הממוצע הנמוך ביותר', lowAvg ? lowAvg.r.name : null, lowAvg ? lowAvg.a.toFixed(1) : null, 'warn')
    ]);

    return U.el('div', { style: 'margin-bottom:16px;' }, [
      U.el('h3', { style: 'color:var(--green-dark);margin:0 0 8px;', text: 'סיכום כיתה ' + grade }),
      kpiGrid([
        repKpi('🚀', pct == null ? '—' : pct + '%', 'אחוז יציאה כיתתי', pctTone(pct)),
        repKpi('⭐', rCnt ? (rSum / rCnt).toFixed(1) : '—', 'ציון ממוצע כיתתי', 'purple'),
        repKpi('👥', rows.length, 'תלמידים', 'info'),
        repKpi('💪', work, 'סה"כ ימי עבודה', 'good'),
        repKpi('🚫', absU, 'היעדרויות בלי אישור', absU > 0 ? 'bad' : 'neutral')
      ]),
      spots
    ]);
  }

  function renderStudents() {
    var rep = studentReport();
    var wrap = U.el('div');
    var classes = distinctClasses(rep);
    var gradeFilter = U.el('select', { style: 'margin-bottom:12px;' }, [U.el('option', { value: '' }, 'כל הכיתות')].concat(classes.map(function (g) { return U.el('option', { value: g }, 'כיתה ' + g); })));
    var summaryWrap = U.el('div'), tableWrap = U.el('div');
    function rebuild() {
      var g = gradeFilter.value;
      U.clear(summaryWrap); U.clear(tableWrap);
      if (g) {
        var rows = rep.filter(function (r) { return r.className === g; });
        if (rows.length) summaryWrap.appendChild(classSummary(g, rows));
        tableWrap.appendChild(sortableTable(STU_HEADERS, rows.map(stuRow)));
      } else {
        // מקובץ לפי כיתות מדויקות (ט1/ט2…)
        var any = false;
        classes.concat(['']).forEach(function (gr) {
          var rows = rep.filter(function (r) { return (r.className || '') === gr; });
          if (!rows.length) return;
          any = true;
          tableWrap.appendChild(U.el('h3', { class: 'rep-grade-head', text: gr ? 'כיתה ' + gr : 'ללא כיתה' }));
          tableWrap.appendChild(sortableTable(STU_HEADERS, rows.map(stuRow)));
        });
        if (!any) tableWrap.appendChild(U.el('div', { class: 'card empty' }, 'אין נתונים בטווח התאריכים שנבחר.'));
      }
    }
    gradeFilter.addEventListener('change', rebuild);
    var cmp = classComparison(rep);
    if (cmp) wrap.appendChild(cmp);
    wrap.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: 'סינון כיתה' }), gradeFilter]));
    wrap.appendChild(summaryWrap);
    wrap.appendChild(tableWrap);
    rebuild();
    return wrap;
  }

  // השוואת כיתות (#16) — גרף + טבלה, מוצג לפני הסינון; לפי כיתה מדויקת (ט1/ט2)
  function classComparison(rep) {
    var byG = {};
    rep.forEach(function (r) { var g = r.className || ''; if (g) (byG[g] = byG[g] || []).push(r); });
    var order = Object.keys(byG).sort(classCmp);
    if (order.length < 2) return null; // אין טעם בהשוואה עם כיתה אחת
    var GRADE_COLORS = { 'ט': '#2563eb', 'י': '#16a34a', 'יא': '#d97706', 'יב': '#7c3aed' };
    var stats = order.map(function (g) {
      var list = byG[g], work = 0, absU = 0, rSum = 0, rCnt = 0;
      list.forEach(function (r) { work += r.work; absU += r.absUnapproved; rSum += r.ratingSum; rCnt += r.ratingCount; });
      var total = work + absU;
      return { g: g, n: list.length, pct: total ? Math.round(work / total * 100) : null, avg: rCnt ? (rSum / rCnt).toFixed(1) : '—', work: work, absU: absU };
    });

    // גרף אחוז יציאה לפי כיתה — בצבעי השכבה (ט1 ו-ט2 באותו צבע, תג נפרד)
    var chart = U.el('div', { class: 'cls-chart' }, stats.map(function (s2) {
      var gr = classGradeOf(s2.g);
      var gidx = U.GRADES.indexOf(gr);
      return U.el('div', { class: 'cls-row' }, [
        U.el('span', { class: 'grade-badge gb' + (gidx < 0 ? 'x' : gidx), text: s2.g }),
        U.el('div', { class: 'cls-track', title: 'כיתה ' + s2.g + ': ' + (s2.pct == null ? '—' : s2.pct + '% יציאה') }, [
          U.el('div', { class: 'cls-fill', style: 'width:' + (s2.pct == null ? 0 : s2.pct) + '%;background:' + (GRADE_COLORS[gr] || '#475569') + ';' })
        ]),
        U.el('span', { class: 'cls-val', text: s2.pct == null ? '—' : s2.pct + '%' })
      ]);
    }));

    var rows = stats.map(function (s2) {
      return ['כיתה ' + s2.g, s2.n, s2.pct == null ? '—' : s2.pct + '%', s2.avg, s2.work, s2.absU];
    });
    return U.el('div', { style: 'margin-bottom:16px;' }, [
      U.el('h3', { style: 'color:var(--green-dark);margin:0 0 8px;', text: '📊 השוואת כיתות' }),
      U.el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:4px;', text: 'אחוז יציאה לעבודה לפי כיתה:' }),
      chart,
      sortableTable(['כיתה', 'תלמידים', 'אחוז יציאה', 'ציון ממוצע', 'ימי עבודה', 'היעדרויות בלי אישור'], rows)
    ]);
  }

  // ---------- דוח אתרים ----------
  function renderSites() {
    var si = siteReport();
    var wrap = U.el('div');
    var totDays = si.reduce(function (a, r) { return a + r.days; }, 0);
    var totWorkers = si.reduce(function (a, r) { return a + r.workers; }, 0);
    var totHours = si.reduce(function (a, r) { return a + r.hours; }, 0);
    var top = si[0]; // ממוין לפי שעות — הראשון הוא המוביל
    // טופ 5 חקלאים לפי שעות — רואים במבט מי מוביל
    if (si.length > 1) {
      wrap.appendChild(U.el('h3', { style: 'color:var(--green-dark);margin:0 0 8px;', text: '📊 טופ 5 חקלאים לפי שעות' }));
      wrap.appendChild(U.el('div', { style: 'margin-bottom:16px;' }, [hbar(si.slice(0, 5).map(function (r) {
        return { label: r.name, value: Math.round(r.hours), prefix: '', unit: 'שעות' };
      }))]));
    }
    wrap.appendChild(sortableTable(['אתר', 'מיקום', 'ימי פעילות', 'סה"כ עובדים', 'סה"כ שעות'],
      si.map(function (r) { return [r.name, r.location || '—', r.days, r.workers, Math.round(r.hours)]; }),
      null, {
        totals: ['סה"כ (' + si.length + ' אתרים)', '', totDays, totWorkers, Math.round(totHours).toLocaleString('he-IL')]
      }));
    return wrap;
  }

  // ---------- דוח צוות ----------
  function renderStaff() {
    var sf = staffReport();
    var wrap = U.el('div');
    var totDays = sf.reduce(function (a, r) { return a + r.days; }, 0);
    var totHours = sf.reduce(function (a, r) { return a + r.hours; }, 0);
    var most = sf[0];
    wrap.appendChild(kpiGrid([
      repKpi('👤', sf.length, 'אנשי צוות פעילים', 'info'),
      repKpi('💪', totDays, 'סה"כ ימי עבודה', 'good'),
      repKpi('🕐', Math.round(totHours).toLocaleString('he-IL'), 'סה"כ שעות עבודה', 'purple'),
      most ? repKpi('🏆', most.name, 'הכי הרבה ימי עבודה', 'warn', most.days + ' ימים') : null
    ]));
    if (sf.length > 1) {
      wrap.appendChild(U.el('h3', { style: 'color:var(--green-dark);margin:0 0 8px;', text: 'ימי עבודה לפי איש צוות' }));
      wrap.appendChild(U.el('div', { style: 'margin-bottom:16px;' }, [hbar(sf.slice(0, 6).map(function (r, i) {
        return { label: r.name, value: r.days, prefix: i === 0 ? '🏆 ' : '', unit: 'ימים' };
      }))]));
    }
    wrap.appendChild(sortableTable(['שם', 'ימי עבודה', 'סה"כ שעות'],
      sf.map(function (r) { return [r.name, r.days, Math.round(r.hours)]; })));
    return wrap;
  }

  // ---------- דוח הסעות ----------
  function renderTransports() {
    var tp = transportReport();
    var wrap = U.el('div');
    var totRides = tp.reduce(function (a, r) { return a + r.days; }, 0);
    var totRiders = tp.reduce(function (a, r) { return a + r.workers; }, 0);
    wrap.appendChild(kpiGrid([
      repKpi('🚌', tp.length, 'הסעות פעילות', 'info'),
      repKpi('🛣️', totRides, 'סה"כ נסיעות', 'good'),
      repKpi('👥', totRiders.toLocaleString('he-IL'), 'סה"כ נוסעים', 'purple'),
      repKpi('📊', totRides ? (totRiders / totRides).toFixed(1) : '—', 'ממוצע נוסעים לנסיעה', 'neutral')
    ]));
    wrap.appendChild(U.el('p', { class: 'muted', style: 'font-size:12.5px;margin:0 0 10px;', text: 'הסעה יוצאת פעם אחת ביום — לכן "מספר נסיעות" שווה למספר ימי הפעילות (גם אם ההסעה מורידה תלמידים בכמה אתרים באותו יום).' }));
    wrap.appendChild(sortableTable(['הסעה', 'מספר נסיעות (= ימי פעילות)', 'סה"כ נוסעים'],
      tp.map(function (r) { return [r.name, r.days, r.workers]; })));
    return wrap;
  }

  // ---------- סיכום יומי (לדשבורד) ----------
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

  // ---------- כרטיס תלמיד ----------
  function renderStudentCard() {
    var wrap = U.el('div');
    var students = (Store.get().students || []).filter(function (s) { return s.active !== false; }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });
    var sel = U.el('select', { style: 'margin-bottom:10px;' }, [U.el('option', { value: '' }, 'בחר תלמיד…')].concat(students.map(function (s) { return U.el('option', { value: s.id }, s.name + (s.grade ? ' (' + s.grade + ')' : '')); })));
    sel.value = cardStudentId;
    sel.addEventListener('change', function () { cardStudentId = sel.value; App.render(); });
    wrap.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: 'תלמיד' }), sel]));
    if (!cardStudentId) { wrap.appendChild(U.el('div', { class: 'card empty' }, 'בחרו תלמיד לצפייה בכרטיס.')); return wrap; }

    var days = Store.get().days, rows = [], work = 0, absApproved = 0, absUnapproved = 0, rSum = 0, rCnt = 0, hoursSum = 0;
    var bySite = {};
    Object.keys(days).filter(inRange).sort().forEach(function (iso) {
      var entry = null, siteName = '', siteId = null, cardHours = 0;
      (days[iso].cards || []).forEach(function (c) {
        (c.students || []).forEach(function (s) { if (s.studentId === cardStudentId) { entry = s; cardHours = c.hours; siteId = c.siteId || null; siteName = c.siteId ? ((Store.getById('sites', c.siteId) || {}).name || '(אתר)') : '(אתר)'; } });
      });
      var inAbsent = ((Store.get().dailyAbsent || {})[iso] || []).indexOf(cardStudentId) !== -1;
      if (!entry && !inAbsent) return;
      var didGo = !!(entry && entry.wentToWork);
      var info = getAbs(iso, cardStudentId);
      if (didGo) { work++; hoursSum += U.num(cardHours); if (siteId) bySite[siteId] = (bySite[siteId] || 0) + 1; }
      else { if (info.approved) absApproved++; else absUnapproved++; }
      if (entry && entry.rating) { rSum += U.num(entry.rating); rCnt++; }
      rows.push([
        U.gregLabel(iso),
        didGo ? siteName : (inAbsent ? 'נעדר היום' : (siteName || '')),
        didGo ? '✓ יצא' : 'לא יצא',
        (entry && entry.rating) || '',
        didGo ? '' : (info.approved ? 'באישור' : 'לא באישור'),
        (info.reason || '') || (entry && entry.note) || ''
      ]);
    });
    var total = work + absUnapproved;
    var pct = total ? Math.round(work / total * 100) : null;

    // חקלאי שעבד אצלו הכי הרבה
    var topSiteId = null, topSiteN = 0;
    Object.keys(bySite).forEach(function (id) { if (bySite[id] > topSiteN) { topSiteN = bySite[id]; topSiteId = id; } });
    var topSiteName = topSiteId ? ((Store.getById('sites', topSiteId) || {}).name || '(אתר)') : '—';
    // הצוות שלו
    var team = global.TeamUtil ? global.TeamUtil.teamOfStudent(cardStudentId) : null;
    var teamName = team ? global.TeamUtil.teamLabel(team) : '—';

    var stu = Store.getById('students', cardStudentId) || { name: '', grade: '', className: '' };
    var report = U.el('div', { class: 'stu-report' }, [
      U.el('div', { class: 'stu-report-title' }, [
        U.el('div', { style: 'font-weight:800;font-size:18px;color:var(--green-dark);', text: '🌱 דוח תלמיד — ' + stu.name + ((stu.className || stu.grade) ? ' · ' + (stu.className || stu.grade) : '') }),
        U.el('div', { class: 'muted', style: 'font-size:13px;', text: 'רגבים בנימין · ' + U.gregLabel(fromDate) + ' – ' + U.gregLabel(toDate) })
      ]),
      kpiGrid([
        repKpi('🚀', pct == null ? '—' : pct + '%', 'אחוז יציאה', pctTone(pct)),
        repKpi('💪', work, 'ימים שיצא', 'good'),
        repKpi('🕐', hoursSum, 'סה"כ שעות', 'info'),
        repKpi('⭐', rCnt ? (rSum / rCnt).toFixed(1) : '—', 'ציון ממוצע', 'purple'),
        repKpi('📝', absApproved, 'לא יצא — באישור', 'neutral'),
        repKpi('🚫', absUnapproved, 'לא יצא — בלי אישור', absUnapproved > 0 ? 'bad' : 'neutral')
      ]),
      U.el('div', { class: 'spot-row', style: 'margin-bottom:14px;' }, [
        spot('🏆', 'חקלאי שעבד אצלו הכי הרבה', topSiteName, topSiteN ? topSiteN + ' ימים' : null, 'good'),
        spot('👥', 'צוות', teamName, null, 'info')
      ]),
      renderTable(['תאריך', 'אתר', 'יצא?', 'ציון', 'אישור', 'סיבה/הערה'], rows, 'אין פעילות לתלמיד בטווח שנבחר.')
    ]);
    wrap.appendChild(U.el('div', { class: 'no-print', style: 'margin-bottom:8px;display:flex;gap:8px;' }, [
      U.el('button', {
        class: 'btn ico', style: 'background:#25D366;color:#fff;border:0;',
        title: 'שליחת כרטיס התלמיד כתמונה בוואטסאפ', html: U.WA_SVG,
        onclick: function () { shareStudentCard(report, stu); }
      }),
      U.el('button', { class: 'btn secondary ico', title: 'הורדת הכרטיס כתמונה', onclick: function () { exportStudentCard(report, stu); } }, '📷')
    ]));
    wrap.appendChild(report);
    return wrap;
  }

  // שליחת כרטיס התלמיד כתמונה ישירות לוואטסאפ:
  // בנייד — חלון השיתוף של המכשיר (בוחרים וואטסאפ ונמען); בדסקטופ — הורדה + פתיחת וואטסאפ לצירוף
  function shareStudentCard(node, stu) {
    if (typeof global.html2canvas === 'undefined') { U.toast('רכיב הייצוא עדיין נטען — נסו שוב בעוד רגע.', 'info'); return; }
    global.html2canvas(node, { scale: 2, backgroundColor: '#ffffff' }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        var fname = 'דוח-תלמיד-' + (stu.name || '') + '.png';
        try {
          var file = new File([blob], fname, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'דוח תלמיד — ' + (stu.name || '') }).catch(function () {});
            return;
          }
        } catch (e) {}
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = fname;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        U.toast('התמונה הורדה — צרפו אותה בשיחת הוואטסאפ שנפתחה', 'info');
        window.open('https://wa.me/', '_blank', 'noopener');
      });
    }).catch(function (e) { U.toast('שגיאה בשיתוף: ' + e.message, 'error'); });
  }

  function exportStudentCard(node, stu) {
    if (typeof global.html2canvas === 'undefined') { U.toast('רכיב הייצוא עדיין נטען — נסו שוב בעוד רגע.', 'info'); return; }
    global.html2canvas(node, { scale: 2, backgroundColor: '#ffffff' }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'דוח-תלמיד-' + (stu.name || '') + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }).catch(function (e) { U.toast('שגיאה בייצוא התמונה: ' + e.message, 'error'); });
  }

  // ---------- ייצוא אקסל ----------
  function exportExcel() {
    var wb = XLSX.utils.book_new();
    var sr = studentReport();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([STU_HEADERS].concat(sr.map(stuRow))), 'תלמידים');
    var si = siteReport();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['אתר', 'מיקום', 'ימי פעילות', 'סה"כ עובדים', 'סה"כ שעות']].concat(si.map(function (r) { return [r.name, r.location, r.days, r.workers, Math.round(r.hours)]; }))), 'אתרים');
    var sf = staffReport();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['שם', 'ימי עבודה', 'סה"כ שעות']].concat(sf.map(function (r) { return [r.name, r.days, Math.round(r.hours)]; }))), 'צוות');
    var tp = transportReport();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['הסעה', 'מספר נסיעות', 'סה"כ נוסעים']].concat(tp.map(function (r) { return [r.name, r.days, r.workers]; }))), 'הסעות');
    XLSX.writeFile(wb, 'דוחות-' + fromDate + '_' + toDate + '.xlsx');
  }

  global.ReportsUtil = {
    renderDailySummary: renderDailySummary,
    nonAttendanceOn: nonAttendanceOn,
    wentOn: wentOn,
    getAbs: getAbs,
    setAbs: setAbs
  };
  global.ReportsView = { render: render };
})(window);
