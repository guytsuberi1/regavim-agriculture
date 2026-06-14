/* daily.js — מסך סידור יומי */
(function (global) {
  'use strict';
  var U = global.U;
  var curDate = U.todayISO();

  function getDay(iso) {
    var data = Store.get();
    if (!data.days[iso]) data.days[iso] = { cards: [] };
    return data.days[iso];
  }

  function activeList(coll) {
    return (Store.get()[coll] || []).filter(function (x) { return x.active !== false; });
  }

  function assignedStudentIds(day, exceptCardId) {
    var set = {};
    day.cards.forEach(function (c) {
      if (c.id === exceptCardId) return;
      (c.students || []).forEach(function (s) { set[s.studentId] = true; });
    });
    return set;
  }

  function render(root) {
    bindAutoScroll();
    Sync.mergeDate(curDate); // ודא שאתרים מהתכנון השבועי מופיעים ביום זה
    var day = getDay(curDate);

    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'סידור יומי' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { curDate = U.addDays(curDate, -1); App.render(); } }, '→ יום קודם'),
      dateInput(),
      U.el('button', { class: 'btn secondary small', onclick: function () { curDate = U.addDays(curDate, 1); App.render(); } }, 'יום הבא ←'),
      U.el('span', { class: 'tag', text: U.weekdayName(curDate) + ' · ' + U.hebrewDate(curDate) }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', onclick: openAbsentDialog }, '🚫 נעדרים היום' + (Store.get().dailyAbsent[curDate] && Store.get().dailyAbsent[curDate].length ? ' (' + Store.get().dailyAbsent[curDate].length + ')' : '')),
      U.el('button', { class: 'btn secondary', onclick: dupPrev }, '⧉ שכפל מיום קודם'),
      U.el('button', { class: 'btn secondary', onclick: loadFromWeekly }, '📅 טען מתכנון'),
      U.el('button', { class: 'btn accent', onclick: exportImage }, '🖼 ייצוא תמונה'),
      U.el('button', { class: 'btn secondary', onclick: exportExcel }, '⬇ אקסל'),
      U.el('button', { class: 'btn', onclick: addCard }, '+ הוסף אתר')
    ]);
    root.appendChild(head);

    root.appendChild(U.el('div', { class: 'print-only', style: 'text-align:center;margin-bottom:8px;' }, [
      U.el('h2', { text: 'סידור עבודה — רגבים בנימין' }),
      U.el('div', { text: U.weekdayName(curDate) + ' · ' + U.hebrewDate(curDate) + ' · ' + U.gregLabel(curDate) })
    ]));

    root.appendChild(buildTotals(day));

    if (!day.cards.length) {
      root.appendChild(U.el('div', { class: 'card empty no-print' }, 'אין אתרים ליום זה. לחצו "הוסף אתר", "שכפל מיום קודם" או "טען מתכנון".'));
    } else {
      var board = U.el('div', { class: 'day-board' });
      day.cards.forEach(function (card) { board.appendChild(buildCard(day, card)); });
      root.appendChild(board);
    }

    // מאגר התלמידים בתחתית המסך (מחולק לצוותים) — לגרירה
    root.appendChild(buildPool(day));
  }

  function dateInput() {
    var inp = U.el('input', { type: 'date', value: curDate });
    inp.addEventListener('change', function () { if (inp.value) { curDate = inp.value; App.render(); } });
    return inp;
  }

  function buildTotals(day) {
    var went = 0, total = 0, target = 0, sickN = 0;
    day.cards.forEach(function (c) {
      target += U.num(c.targetWorkers);
      (c.students || []).forEach(function (s) {
        total++;
        if (s.wentToWork) went++;
        if (s.sick) sickN++;
      });
    });
    var items = [
      tot(day.cards.length, 'אתרים'),
      tot(total, 'משובצים'),
      tot(went, 'יצאו לעבודה')
    ];
    if (sickN > 0) items.push(tot(sickN, 'חולים'));
    if (target > 0) items.splice(1, 0, tot(target, 'מתוכננים'));
    return U.el('div', { class: 'totbar' }, items);
  }
  function tot(n, label) { return U.el('div', { class: 't' }, [U.el('b', { text: n }), U.el('span', { text: label })]); }

  function buildCard(day, card) {
    var site = card.siteId ? Store.getById('sites', card.siteId) : null;
    var node = U.el('div', { class: 'site-card' });

    // ---- ראש כרטיס ----
    var siteSel = selectFrom('sites', card.siteId, 'בחר אתר…', true);
    siteSel.addEventListener('change', function () {
      card.siteId = siteSel.value || null;
      var s = card.siteId ? Store.getById('sites', card.siteId) : null;
      if (s && (card.hours == null || card.hours === '')) card.hours = s.defaultHours || Store.get().settings.defaultHours;
      if (s && !card.transportId && s.defaultTransportId) card.transportId = s.defaultTransportId;
      Sync.dayChanged(curDate);
      Store.save(); App.render();
    });

    var meta = U.el('div', { class: 'sc-meta' });
    if (site) {
      if (site.location) meta.appendChild(U.el('div', { text: '📍 ' + site.location }));
      if (site.contactName || site.phone) meta.appendChild(U.el('div', { text: '☎ ' + [site.contactName, site.phone].filter(Boolean).join(' · ') }));
      if (site.access) meta.appendChild(U.el('div', { text: '🚗 ' + site.access }));
    }

    // מונה צבעוני: משובצים מול הכמות הרצויה (מהתכנון השבועי)
    var counter = null;
    if (card.targetWorkers !== '' && card.targetWorkers != null) {
      var assignedN = (card.students || []).length;
      var targetN = U.num(card.targetWorkers);
      var cls = assignedN < targetN ? 'under' : (assignedN > targetN ? 'over' : 'ok');
      counter = U.el('div', { class: 'tw-counter ' + cls, text: 'משובצים ' + assignedN + ' / רצוי ' + targetN });
    }

    var head = U.el('div', { class: 'sc-head' }, [
      U.el('div', { style: 'display:flex;gap:4px;align-items:center;' }, [
        siteSel,
        U.el('button', { class: 'btn small danger no-print', title: 'הסר אתר', onclick: function () { removeCard(day, card); } }, '✕')
      ]),
      counter,
      meta
    ]);

    // ---- גוף ----
    var body = U.el('div', { class: 'sc-body' });

    // הסעה / איש צוות / ראש צוות
    body.appendChild(labeledSelect('הסעה', 'transports', card, 'transportId'));
    body.appendChild(labeledSelect('איש צוות', 'staff', card, 'staffId', 'staff'));

    // שעות + נסיעות
    var hoursInp = U.el('input', { type: 'number', value: card.hours == null ? '' : card.hours, style: 'width:70px;', step: '0.5' });
    hoursInp.addEventListener('change', function () { card.hours = hoursInp.value === '' ? '' : U.num(hoursInp.value); Store.save(); });
    var travelChk = U.el('input', { type: 'checkbox', checked: card.travel !== false });
    travelChk.addEventListener('change', function () { card.travel = travelChk.checked; Store.save(); });
    var targetInp = U.el('input', { type: 'number', value: (card.targetWorkers === '' || card.targetWorkers == null) ? '' : card.targetWorkers, style: 'width:70px;', min: '0', title: 'כמות עובדים רצויה (מהתכנון השבועי)' });
    targetInp.addEventListener('change', function () {
      card.targetWorkers = targetInp.value === '' ? '' : U.num(targetInp.value);
      Sync.dayChanged(curDate); // עדכון התכנון השבועי בהתאם
      Store.save(); App.render();
    });
    body.appendChild(U.el('div', { class: 'row', style: 'margin:6px 0;' }, [
      U.el('div', null, [U.el('label', { text: 'שעות' }), hoursInp]),
      U.el('div', null, [U.el('label', { text: 'רצוי' }), targetInp]),
      U.el('div', null, [U.el('label', { text: 'נסיעות' }), U.el('div', null, [travelChk])])
    ]));

    // תלמידים — ראשי צוות מוצגים ראשונים
    var ul = U.el('ul', { class: 'sc-students' });
    var ordered = (card.students || []).slice().sort(function (a, b) {
      return (b.teamLeader ? 1 : 0) - (a.teamLeader ? 1 : 0);
    });
    ordered.forEach(function (st) {
      var stu = Store.getById('students', st.studentId);
      var name = stu ? stu.name + (stu.grade ? ' (' + stu.grade + ')' : '') : '⚠ נמחק';

      var wentChk = U.el('input', { type: 'checkbox', checked: !!st.wentToWork, title: 'יצא לעבודה' });
      wentChk.addEventListener('change', function () { st.wentToWork = wentChk.checked; Store.save(); App.render(); });
      // ציון 1-5
      var ratingSel = U.el('select', { class: 'rating-sel', title: 'ציון 1-5' },
        [U.el('option', { value: '' }, '–')].concat([1, 2, 3, 4, 5].map(function (n) { return U.el('option', { value: n }, n); })));
      ratingSel.value = st.rating == null ? '' : st.rating;
      ratingSel.addEventListener('change', function () { st.rating = ratingSel.value === '' ? null : U.num(ratingSel.value); Store.save(); });

      var gradeColors = { 'ט': '#fff3cd', 'י': '#d1ecf1', 'יא': '#d4edda', 'יב': '#f8d7da' };
      var li = U.el('li', { class: (st.teamLeader ? 'leader ' : ''), draggable: 'true' }, [
        U.el('span', { style: 'flex:1;', text: (st.teamLeader ? '⭐ ' : '') + name }),
        U.el('span', { class: 'chk', title: 'יצא לעבודה' }, [wentChk, U.el('span', { text: 'יצא', class: 'muted' })]),
        U.el('span', { class: 'chk no-print', title: 'ציון' }, [ratingSel]),
        U.el('button', { class: 'btn small danger no-print', onclick: function () { removeStudent(card, st.studentId); } }, '✕')
      ]);
      if (stu && stu.grade && gradeColors[stu.grade]) li.style.setProperty('background', gradeColors[stu.grade], 'important');
      li.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'student:' + st.studentId); e.dataTransfer.effectAllowed = 'move'; });
      ul.appendChild(li);
    });
    body.appendChild(ul);
    body.appendChild(U.el('button', { class: 'btn small secondary no-print', onclick: function () { openAddStudents(day, card); } }, '+ הוסף תלמידים'));

    // הערות
    var notesInp = U.el('input', { type: 'text', value: card.notes || '', placeholder: 'הערות…', style: 'width:100%;margin-top:6px;' });
    notesInp.addEventListener('change', function () { card.notes = notesInp.value; Store.save(); });
    body.appendChild(notesInp);

    node.appendChild(head);
    node.appendChild(body);

    // ---- תחתית: סיכום ----
    var went = (card.students || []).filter(function (s) { return s.wentToWork; }).length;
    var sickN = (card.students || []).filter(function (s) { return s.sick; }).length;
    node.appendChild(U.el('div', { class: 'sc-foot' },
      'משובצים: ' + (card.students || []).length + ' · יצאו: ' + went + (sickN ? ' · חולים: ' + sickN : '')));

    // אזור גרירה — קבלת תלמיד בודד או צוות שלם
    node.addEventListener('dragover', function (e) { e.preventDefault(); node.classList.add('drag-over'); });
    node.addEventListener('dragleave', function () { node.classList.remove('drag-over'); });
    node.addEventListener('drop', function (e) {
      e.preventDefault();
      node.classList.remove('drag-over');
      handleDrop(day, card, e.dataTransfer.getData('text/plain'));
    });

    return node;
  }

  function labeledSelect(label, coll, card, prop, roleFilter) {
    var sel = selectFrom(coll, card[prop], '—', false, roleFilter);
    sel.addEventListener('change', function () { card[prop] = sel.value || null; Store.save(); });
    return U.el('div', { class: 'field', style: 'margin:6px 0;' }, [U.el('label', { text: label }), sel]);
  }

  function selectFrom(coll, selectedId, placeholder, isSite, roleFilter) {
    var items = activeList(coll);
    if (roleFilter) items = items.filter(function (x) { return (x.role || 'staff') === roleFilter; });
    var opts = [U.el('option', { value: '' }, placeholder)];
    items.forEach(function (it) {
      var label = it.name;
      var o = U.el('option', { value: it.id }, label);
      opts.push(o);
    });
    var sel = U.el('select', { style: isSite ? 'flex:1;font-weight:600;' : 'width:100%;' }, opts);
    sel.value = selectedId || '';
    return sel;
  }

  // ---------- פעולות ----------
  function addCard() {
    var day = getDay(curDate);
    day.cards.push({ id: Store.uid(), siteId: null, transportId: null, staffId: null, leaderId: null, hours: Store.get().settings.defaultHours, travel: true, notes: '', students: [] });
    Store.save(); App.render();
  }

  function removeCard(day, card) {
    if ((card.students || []).length && !confirm('להסיר את האתר וכל השיבוצים בו?')) return;
    day.cards = day.cards.filter(function (c) { return c.id !== card.id; });
    Sync.dayChanged(curDate);
    Store.save(); App.render();
  }

  function removeStudent(card, studentId) {
    card.students = card.students.filter(function (s) { return s.studentId !== studentId; });
    Store.save(); App.render();
  }

  // שיבוץ תלמיד לכרטיס ללא שמירה/רינדור (לשימוש פנימי)
  function placeStudent(day, card, studentId, teamLeader) {
    day.cards.forEach(function (c) {
      c.students = (c.students || []).filter(function (s) { return s.studentId !== studentId; });
    });
    card.students.push({ studentId: studentId, wentToWork: false, sick: false, rating: null, teamLeader: !!teamLeader });
  }

  function addStudentToCard(day, card, studentId) {
    placeStudent(day, card, studentId, false);
    Store.save(); App.render();
  }

  // שיבוץ צוות שלם לאתר — ראש הצוות מסומן כראש צוות
  function assignTeamToCard(day, card, teamId) {
    var team = Store.getById('teams', teamId);
    if (!team) return;
    var ids = global.TeamUtil.orderedStudentIds(team);
    ids.forEach(function (id) { placeStudent(day, card, id, id === team.leaderStudentId); });
    Store.save(); App.render();
  }

  // הסרת תלמיד מכל האתרים של היום (גרירה חזרה למאגר)
  function unassignStudent(day, studentId) {
    day.cards.forEach(function (c) {
      c.students = (c.students || []).filter(function (s) { return s.studentId !== studentId; });
    });
    Store.save(); App.render();
  }

  function unassignTeam(day, teamId) {
    var team = Store.getById('teams', teamId);
    if (!team) return;
    var ids = global.TeamUtil.orderedStudentIds(team);
    var set = {}; ids.forEach(function (id) { set[id] = true; });
    day.cards.forEach(function (c) {
      c.students = (c.students || []).filter(function (s) { return !set[s.studentId]; });
    });
    Store.save(); App.render();
  }

  // טיפול בגרירה לתוך כרטיס אתר
  function handleDrop(day, card, payload) {
    if (!payload) return;
    if (payload.indexOf('team:') === 0) assignTeamToCard(day, card, payload.slice(5));
    else if (payload.indexOf('student:') === 0) { placeStudent(day, card, payload.slice(8), false); Store.save(); App.render(); }
  }

  // ---------- מאגר התלמידים בתחתית (מחולק לצוותים) ----------
  function assignedSet(day) {
    var set = {};
    day.cards.forEach(function (c) { (c.students || []).forEach(function (s) { set[s.studentId] = true; }); });
    return set;
  }

  function getPoolHeight() {
    var h = parseInt(localStorage.getItem('agri_pool_height'), 10);
    return (isNaN(h) ? 240 : Math.max(60, Math.min(640, h)));
  }
  function setPoolHeight(h) { localStorage.setItem('agri_pool_height', Math.max(60, Math.min(640, Math.round(h)))); }

  function getHiddenGrades() {
    try { return JSON.parse(localStorage.getItem('agri_pool_grades') || '{}'); } catch (e) { return {}; }
  }
  function setGradeHidden(g, hide) {
    var h = getHiddenGrades();
    if (hide) h[g] = true; else delete h[g];
    localStorage.setItem('agri_pool_grades', JSON.stringify(h));
  }

  // תלמידים שיורדים מהמאגר היום (תורנים/חולים שבועיים + נעדרים יומיים) → { studentId: 'סיבה' }
  function excludedSet() {
    var d = Store.get();
    var wk = U.startOfWeek(curDate);
    var set = {};
    (d.weeklyDuty[wk] || []).forEach(function (id) { set[id] = 'תורן שבועי'; });
    (d.weeklySick[wk] || []).forEach(function (id) { set[id] = 'חולה השבוע'; });
    (d.dailyAbsent[curDate] || []).forEach(function (id) { set[id] = 'נעדר היום'; });
    return set;
  }

  // ניהול נעדרים ליום הנוכחי
  function openAbsentDialog() {
    var d = Store.get();
    if (!d.dailyAbsent[curDate]) d.dailyAbsent[curDate] = [];
    pickStudents('נעדרים ליום ' + U.gregLabel(curDate), d.dailyAbsent[curDate], function (sel) {
      d.dailyAbsent[curDate] = sel;
      if (!sel.length) delete d.dailyAbsent[curDate];
      Store.save(); App.render();
    });
  }

  // בורר תלמידים גנרי (שומר סימונים תוך כדי חיפוש) — לשימוש בנעדרים/תורנים/חולים
  function pickStudents(title, preselectedIds, onSave) {
    var students = activeList('students');
    var selected = {};
    (preselectedIds || []).forEach(function (id) { selected[id] = true; });
    var search = U.el('input', { type: 'text', placeholder: 'חיפוש…', style: 'width:100%;margin-bottom:8px;' });
    var countEl = U.el('span', { class: 'tag' });
    var listBox = U.el('div', { style: 'max-height:340px;overflow:auto;' });
    function updateCount() { countEl.textContent = 'נבחרו: ' + Object.keys(selected).filter(function (k) { return selected[k]; }).length; }
    function build(filter) {
      U.clear(listBox);
      U.GRADES.concat(['']).forEach(function (g) {
        var grp = students.filter(function (s) { return (s.grade || '') === g && (!filter || s.name.indexOf(filter) !== -1); });
        if (!grp.length) return;
        listBox.appendChild(U.el('div', { class: 'muted', style: 'margin:6px 0 2px;font-weight:600;', text: g ? 'כיתה ' + g : 'ללא כיתה' }));
        grp.forEach(function (s) {
          var cb = U.el('input', { type: 'checkbox', checked: !!selected[s.id] });
          cb.addEventListener('change', function () { selected[s.id] = cb.checked; updateCount(); });
          listBox.appendChild(U.el('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:400;color:var(--text);padding:2px 0;' }, [cb, s.name]));
        });
      });
    }
    search.addEventListener('input', function () { build(search.value.trim()); });
    build(''); updateCount();
    Modal.open(title, U.el('div', null, [U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px;' }, [search, countEl]), listBox]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        onSave(Object.keys(selected).filter(function (k) { return selected[k]; }));
        close();
      } }
    ]);
  }
  global.PickStudents = pickStudents; // לשימוש גם במסך התכנון השבועי

  function buildPool(day) {
    var assigned = assignedSet(day);
    var pool = U.el('div', { class: 'pool no-print' });

    // ידית גרירה לשינוי גובה המאגר (מעלה/מטה)
    var resizer = U.el('div', { class: 'pool-resizer', title: 'גררו מעלה/מטה לשינוי גובה המאגר' });
    pool.appendChild(resizer);

    var head = U.el('div', { style: 'display:flex;align-items:center;gap:10px;' }, [
      U.el('h3', { style: 'margin:0;color:var(--green-dark);', text: '👥 מאגר תלמידים' }),
      U.el('span', { class: 'muted', text: 'גררו צוות שלם (מהכותרת ⠿) או תלמיד בודד לאתר. גרירה לכאן מבטלת שיבוץ.' })
    ]);
    pool.appendChild(head);

    // אזור שחרור לביטול שיבוץ
    pool.addEventListener('dragover', function (e) { e.preventDefault(); pool.classList.add('drag-over'); });
    pool.addEventListener('dragleave', function () { pool.classList.remove('drag-over'); });
    pool.addEventListener('drop', function (e) {
      e.preventDefault(); pool.classList.remove('drag-over');
      var p = e.dataTransfer.getData('text/plain');
      if (p.indexOf('team:') === 0) unassignTeam(day, p.slice(5));
      else if (p.indexOf('student:') === 0) unassignStudent(day, p.slice(8));
    });

    // סינון לפי כיתה — ביטול סימון מסתיר את כל תלמידי הכיתה מהמאגר
    var hidden = getHiddenGrades();
    function gradeVisible(g) { return !hidden[g || '']; }
    var filterRow = U.el('div', { class: 'pool-filter' },
      [U.el('span', { class: 'muted', text: 'הצג כיתות:' })].concat(
        U.GRADES.map(function (g) {
          var cb = U.el('input', { type: 'checkbox', checked: !hidden[g] });
          cb.addEventListener('change', function () { setGradeHidden(g, !cb.checked); App.render(); });
          return U.el('label', { class: 'gf' }, [cb, ' ' + g]);
        })
      ));
    pool.appendChild(filterRow);

    var groupsWrap = U.el('div', { class: 'pool-groups' });
    groupsWrap.style.height = getPoolHeight() + 'px';

    // לוגיקת גרירת הידית לשינוי גובה
    resizer.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var startY = e.clientY;
      var startH = groupsWrap.getBoundingClientRect().height;
      document.body.style.userSelect = 'none';
      function onMove(ev) {
        var nh = startH + (startY - ev.clientY); // גרירה מעלה = גדל
        nh = Math.max(60, Math.min(640, nh));
        groupsWrap.style.height = nh + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        setPoolHeight(parseInt(groupsWrap.style.height, 10));
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // תלמידים שיורדים מהמאגר היום: תורנים/חולים שבועיים + נעדרים יומיים
    var excluded = excludedSet();
    function show(id, g) { return gradeVisible(g) && !excluded[id]; }

    var teams = global.TeamUtil.allTeams();
    teams.forEach(function (t) {
      var ids = global.TeamUtil.orderedStudentIds(t).filter(function (id) {
        var s = Store.getById('students', id); return s && show(id, s.grade);
      });
      if (!ids.length) return;
      groupsWrap.appendChild(buildTeamGroup(day, t, ids, assigned));
    });

    // תלמידים ללא צוות
    var noTeam = (Store.get().students || []).filter(function (s) {
      return s.active !== false && show(s.id, s.grade) && !global.TeamUtil.teamOfStudent(s.id);
    });
    if (noTeam.length) {
      groupsWrap.appendChild(buildLooseGroup(noTeam, assigned));
    }

    if (!teams.length && !noTeam.length) {
      groupsWrap.appendChild(U.el('div', { class: 'muted', text: 'אין תלמידים. הוסיפו תלמידים ב"נתוני בסיס" וצוותים ב"צוותים".' }));
    }

    pool.appendChild(groupsWrap);
    return pool;
  }

  var chipGradeColors = { 'ט': '#fff3cd', 'י': '#d1ecf1', 'יא': '#d4edda', 'יב': '#f8d7da' };

  function studentChip(id, assigned) {
    var s = Store.getById('students', id);
    if (!s) return null;
    var chip = U.el('div', { class: 'chip' + (assigned[id] ? ' assigned' : ''), draggable: 'true', text: s.name });
    if (s.grade && chipGradeColors[s.grade]) chip.style.setProperty('background', chipGradeColors[s.grade], 'important');
    chip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'student:' + id); e.dataTransfer.effectAllowed = 'move'; });
    return chip;
  }

  function buildTeamGroup(day, team, ids, assigned) {
    var grip = U.el('span', { class: 'grip', draggable: 'true', title: 'גרור צוות שלם', text: '⠿' });
    grip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'team:' + team.id); e.dataTransfer.effectAllowed = 'move'; });

    var allAssigned = ids.every(function (id) { return assigned[id]; });
    var header = U.el('div', { class: 'pg-head' + (allAssigned ? ' all-assigned' : '') }, [
      grip,
      U.el('span', { class: 'pg-title', text: '⭐ ' + global.TeamUtil.teamLabel(team) }),
      U.el('span', { class: 'muted', style: 'font-size:11px;', text: '(' + ids.length + ')' })
    ]);

    var chips = U.el('div', { class: 'pg-chips' });
    ids.forEach(function (id) { var c = studentChip(id, assigned); if (c) chips.appendChild(c); });

    return U.el('div', { class: 'pool-group' }, [header, chips]);
  }

  function buildLooseGroup(students, assigned) {
    var header = U.el('div', { class: 'pg-head' }, [U.el('span', { class: 'pg-title', text: 'ללא צוות' }),
      U.el('span', { class: 'muted', style: 'font-size:11px;', text: '(' + students.length + ')' })]);
    var chips = U.el('div', { class: 'pg-chips' });
    students.forEach(function (s) { var c = studentChip(s.id, assigned); if (c) chips.appendChild(c); });
    return U.el('div', { class: 'pool-group loose' }, [header, chips]);
  }

  function openAddStudents(day, card) {
    var assigned = assignedStudentIds(day, card.id);
    var students = activeList('students');

    // הסימונים נשמרים במפה קבועה — כך חיפוש לא מאפס בחירות קודמות
    var selectedMap = {};
    (card.students || []).forEach(function (x) { selectedMap[x.studentId] = true; });

    var search = U.el('input', { type: 'text', placeholder: 'חיפוש…', style: 'width:100%;margin-bottom:8px;' });
    var countEl = U.el('span', { class: 'tag', text: '' });
    var listBox = U.el('div', { style: 'max-height:320px;overflow:auto;' });

    function updateCount() {
      countEl.textContent = 'נבחרו: ' + Object.keys(selectedMap).filter(function (k) { return selectedMap[k]; }).length;
    }

    function build(filter) {
      U.clear(listBox);
      U.GRADES.concat(['']).forEach(function (g) {
        var grp = students.filter(function (s) {
          return (s.grade || '') === g &&
            (!filter || s.name.indexOf(filter) !== -1);
        });
        if (!grp.length) return;
        listBox.appendChild(U.el('div', { class: 'muted', style: 'margin:6px 0 2px;font-weight:600;', text: g ? 'כיתה ' + g : 'ללא כיתה' }));
        grp.forEach(function (s) {
          var already = assigned[s.id] || !!selectedMap[s.id];
          var cb = U.el('input', { type: 'checkbox', checked: !!selectedMap[s.id] });
          cb.addEventListener('change', function () { selectedMap[s.id] = cb.checked; updateCount(); });
          var lbl = U.el('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:400;color:var(--text);' + (assigned[s.id] && !selectedMap[s.id] ? 'opacity:.5;' : '') },
            [cb, s.name + (assigned[s.id] && !selectedMap[s.id] ? ' (משובץ באתר אחר)' : '')]);
          listBox.appendChild(lbl);
        });
      });
    }
    search.addEventListener('input', function () { build(search.value.trim()); });
    build('');
    updateCount();

    var headRow = U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px;' }, [search, countEl]);
    Modal.open('הוספת תלמידים — ' + (card.siteId ? (Store.getById('sites', card.siteId) || {}).name : 'אתר'),
      U.el('div', null, [headRow, listBox]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var selected = {};
        Object.keys(selectedMap).forEach(function (k) { if (selectedMap[k]) selected[k] = true; });
        // הסר מהאתר את מי שבוטל
        card.students = (card.students || []).filter(function (s) { return selected[s.studentId]; });
        // הוסף חדשים (תוך הסרה מאתרים אחרים)
        Object.keys(selected).forEach(function (id) {
          if (!card.students.some(function (s) { return s.studentId === id; })) {
            day.cards.forEach(function (c) { if (c.id !== card.id) c.students = (c.students || []).filter(function (s) { return s.studentId !== id; }); });
            card.students.push({ studentId: id, wentToWork: false, sick: false, rating: null });
          }
        });
        Store.save(); close(); App.render();
      } }
    ]);
  }

  function dupPrev() {
    var day = getDay(curDate);
    if (day.cards.length && !confirm('היום הנוכחי כבר מכיל אתרים. להחליף בשכפול מיום קודם?')) return;
    // מצא את היום הקודם עם נתונים (עד 14 ימים אחורה)
    var src = null, probe = curDate;
    for (var i = 0; i < 14; i++) {
      probe = U.addDays(probe, -1);
      var d = Store.get().days[probe];
      if (d && d.cards && d.cards.length) { src = d; break; }
    }
    if (!src) { alert('לא נמצא יום קודם עם נתונים.'); return; }
    day.cards = src.cards.map(function (c) {
      return {
        id: Store.uid(), siteId: c.siteId, transportId: c.transportId,
        staffId: c.staffId, leaderId: c.leaderId, hours: c.hours, travel: c.travel, notes: c.notes,
        targetWorkers: c.targetWorkers, group: c.group || '',
        students: (c.students || []).map(function (s) { return { studentId: s.studentId, wentToWork: false, sick: false, rating: null, teamLeader: s.teamLeader }; })
      };
    });
    Sync.dayChanged(curDate);
    Store.save(); App.render();
  }

  function loadFromWeekly() {
    var plan = Store.get().weeklyPlan[curDate];
    if (!plan || !plan.length) { alert('אין תכנון שבועי לתאריך זה.'); return; }
    var day = getDay(curDate);
    if (day.cards.length && !confirm('להוסיף את אתרי התכנון לסידור הקיים?')) return;
    plan.forEach(function (p) {
      var s = p.siteId ? Store.getById('sites', p.siteId) : null;
      day.cards.push({
        id: Store.uid(), siteId: p.siteId || null, transportId: p.transportId || (s ? s.defaultTransportId : null),
        staffId: null, leaderId: null, hours: s ? (s.defaultHours || Store.get().settings.defaultHours) : Store.get().settings.defaultHours,
        travel: true, notes: p.note || '', students: []
      });
    });
    Store.save(); App.render();
  }

  // ---------- ייצוא אקסל ----------
  function exportExcel() {
    var day = getDay(curDate);
    var aoa = [['סידור עבודה — רגבים בנימין'], [U.weekdayName(curDate) + ' · ' + U.hebrewDate(curDate) + ' · ' + U.gregLabel(curDate)], []];
    day.cards.forEach(function (c) {
      var site = c.siteId ? Store.getById('sites', c.siteId) : null;
      var staff = c.staffId ? Store.getById('staff', c.staffId) : null;
      var leader = c.leaderId ? Store.getById('staff', c.leaderId) : null;
      var trans = c.transportId ? Store.getById('transports', c.transportId) : null;
      aoa.push(['אתר:', site ? site.name : '']);
      if (site && site.location) aoa.push(['מיקום:', site.location]);
      if (site && (site.contactName || site.phone)) aoa.push(['איש קשר:', [site.contactName, site.phone].filter(Boolean).join(' ')]);
      aoa.push(['הסעה:', trans ? trans.name : '', 'איש צוות:', staff ? staff.name : '', 'ראש צוות:', leader ? leader.name : '']);
      aoa.push(['שעות:', c.hours, 'נסיעות:', c.travel !== false ? 'כן' : 'לא']);
      aoa.push(['תלמיד', 'כיתה', 'יצא לעבודה', 'חולה', 'ציון']);
      (c.students || []).forEach(function (s) {
        var stu = Store.getById('students', s.studentId);
        aoa.push([stu ? stu.name : '', stu ? stu.grade : '', s.wentToWork ? 'כן' : '', s.sick ? 'כן' : '', s.rating || '']);
      });
      var went = (c.students || []).filter(function (s) { return s.wentToWork; }).length;
      var sickN = (c.students || []).filter(function (s) { return s.sick; }).length;
      aoa.push(['סה"כ יצאו:', went, 'חולים:', sickN]);
      aoa.push([]);
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'סידור');
    XLSX.writeFile(wb, 'סידור-' + curDate + '.xlsx');
  }

  // ---------- ייצוא תמונה מסודרת של הסידור היומי (לתלמידים) ----------
  // מציג: שם חקלאי, מיקום, איש קשר, הסעה, איש צוות, ורשימת תלמידים בלבד.
  function buildExportCard(card) {
    var site = card.siteId ? Store.getById('sites', card.siteId) : null;
    var staff = card.staffId ? Store.getById('staff', card.staffId) : null;
    var trans = card.transportId ? Store.getById('transports', card.transportId) : null;

    var lines = [];
    if (site && site.location) lines.push('📍 ' + site.location);
    if (site && (site.contactName || site.phone)) lines.push('☎ ' + [site.contactName, site.phone].filter(Boolean).join(' · '));
    if (trans) lines.push('🚌 ' + trans.name);
    if (staff) lines.push('👤 איש צוות: ' + staff.name);

    var metaNodes = lines.map(function (t) { return U.el('div', { style: 'font-size:12px;color:#555;line-height:1.6;', text: t }); });

    var ordered = (card.students || []).slice().sort(function (a, b) { return (b.teamLeader ? 1 : 0) - (a.teamLeader ? 1 : 0); });
    var lis = ordered.map(function (st) {
      var stu = Store.getById('students', st.studentId);
      var nm = stu ? stu.name + (stu.grade ? ' (' + stu.grade + ')' : '') : '⚠';
      return U.el('li', { style: 'padding:3px 6px;font-size:13px;border-bottom:1px solid #eee;' + (st.teamLeader ? 'font-weight:700;background:#fff8e1;' : ''), text: (st.teamLeader ? '⭐ ' : '') + nm });
    });

    return U.el('div', { style: 'width:250px;border:1px solid #2e7d32;border-top:5px solid #2e7d32;border-radius:10px;background:#fff;overflow:hidden;' }, [
      U.el('div', { style: 'background:#e8f5e9;padding:8px 10px;' }, [
        U.el('div', { style: 'font-weight:700;font-size:16px;color:#1b5e20;', text: site ? site.name : '(אתר)' })
      ].concat(metaNodes)),
      U.el('ul', { style: 'list-style:none;margin:0;padding:4px 8px 8px;' }, lis.length ? lis : [U.el('li', { style: 'font-size:12px;color:#999;', text: 'אין תלמידים' })])
    ]);
  }

  function exportImage() {
    var day = getDay(curDate);
    if (!day.cards.length) { alert('אין אתרים להצגה ביום זה.'); return; }
    if (typeof global.html2canvas === 'undefined') { alert('רכיב הייצוא עדיין נטען — נסו שוב בעוד רגע.'); return; }

    var temp = U.el('div', { style: 'position:fixed;top:0;right:-12000px;background:#fff;padding:18px;direction:rtl;font-family:Arial,sans-serif;' });
    temp.appendChild(U.el('div', { style: 'text-align:center;font-weight:700;font-size:20px;color:#1b5e20;margin-bottom:4px;', text: 'סידור עבודה — רגבים בנימין' }));
    temp.appendChild(U.el('div', { style: 'text-align:center;font-size:15px;margin-bottom:12px;', text: U.weekdayName(curDate) + ' · ' + U.hebrewDate(curDate) + ' · ' + U.gregLabel(curDate) }));
    var board = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;direction:rtl;' });
    day.cards.forEach(function (c) { board.appendChild(buildExportCard(c)); });
    temp.appendChild(board);
    document.body.appendChild(temp);

    global.html2canvas(temp, { scale: 2, backgroundColor: '#ffffff' }).then(function (canvas) {
      document.body.removeChild(temp);
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'סידור-' + curDate + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }).catch(function (e) {
      if (temp.parentNode) document.body.removeChild(temp);
      alert('שגיאה בייצוא התמונה: ' + e.message);
    });
  }

  // ---------- גלילה אוטומטית בזמן גרירה (כשהיעד רחוק) ----------
  var autoScrollBound = false;
  function bindAutoScroll() {
    if (autoScrollBound) return; autoScrollBound = true;
    document.addEventListener('dragover', function (e) {
      var edge = 70, step = 28;
      if (e.clientY < edge) window.scrollBy(0, -step);
      else if (window.innerHeight - e.clientY < edge) window.scrollBy(0, step);
      var board = document.querySelector('.day-board');
      if (board) {
        var r = board.getBoundingClientRect();
        if (e.clientY > r.top && e.clientY < r.bottom) {
          if (e.clientX - r.left < edge) board.scrollLeft -= step;
          else if (r.right - e.clientX < edge) board.scrollLeft += step;
        }
      }
    });
  }

  global.DailyView = { render: render };
})(window);
