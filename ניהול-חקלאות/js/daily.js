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
    var day = getDay(curDate);

    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'סידור יומי' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { curDate = U.addDays(curDate, -1); App.render(); } }, '→ יום קודם'),
      dateInput(),
      U.el('button', { class: 'btn secondary small', onclick: function () { curDate = U.addDays(curDate, 1); App.render(); } }, 'יום הבא ←'),
      U.el('span', { class: 'tag', text: U.weekdayName(curDate) + ' · ' + U.hebrewDate(curDate) }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', onclick: dupPrev }, '⧉ שכפל מיום קודם'),
      U.el('button', { class: 'btn secondary', onclick: loadFromWeekly }, '📅 טען מתכנון'),
      U.el('button', { class: 'btn secondary', onclick: function () { window.print(); } }, '🖨 הדפסה'),
      U.el('button', { class: 'btn accent', onclick: exportExcel }, '⬇ ייצוא אקסל'),
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
    var arrived = 0, went = 0, total = 0;
    day.cards.forEach(function (c) {
      (c.students || []).forEach(function (s) {
        total++;
        if (s.arrived) arrived++;
        if (s.wentToWork) went++;
      });
    });
    return U.el('div', { class: 'totbar' }, [
      tot(day.cards.length, 'אתרים'),
      tot(total, 'משובצים'),
      tot(arrived, 'הגיעו'),
      tot(went, 'יצאו לעבודה')
    ]);
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
      Store.save(); App.render();
    });

    var meta = U.el('div', { class: 'sc-meta' });
    if (site) {
      if (site.location) meta.appendChild(U.el('div', { text: '📍 ' + site.location }));
      if (site.contactName || site.phone) meta.appendChild(U.el('div', { text: '☎ ' + [site.contactName, site.phone].filter(Boolean).join(' · ') }));
      if (site.access) meta.appendChild(U.el('div', { text: '🚗 ' + site.access }));
    }

    var head = U.el('div', { class: 'sc-head' }, [
      U.el('div', { style: 'display:flex;gap:4px;align-items:center;' }, [
        siteSel,
        U.el('button', { class: 'btn small danger no-print', title: 'הסר אתר', onclick: function () { removeCard(day, card); } }, '✕')
      ]),
      meta
    ]);

    // ---- גוף ----
    var body = U.el('div', { class: 'sc-body' });

    // הסעה / איש צוות / ראש צוות
    body.appendChild(labeledSelect('הסעה', 'transports', card, 'transportId'));
    body.appendChild(labeledSelect('איש צוות', 'staff', card, 'staffId', 'staff'));
    body.appendChild(labeledSelect('ראש צוות', 'staff', card, 'leaderId', 'leader'));

    // שעות + נסיעות
    var hoursInp = U.el('input', { type: 'number', value: card.hours == null ? '' : card.hours, style: 'width:70px;', step: '0.5' });
    hoursInp.addEventListener('change', function () { card.hours = hoursInp.value === '' ? '' : U.num(hoursInp.value); Store.save(); });
    var travelChk = U.el('input', { type: 'checkbox', checked: card.travel !== false });
    travelChk.addEventListener('change', function () { card.travel = travelChk.checked; Store.save(); });
    body.appendChild(U.el('div', { class: 'row', style: 'margin:6px 0;' }, [
      U.el('div', null, [U.el('label', { text: 'שעות' }), hoursInp]),
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

      var dutyChk = U.el('input', { type: 'checkbox', checked: !!st.duty, title: 'תורן' });
      dutyChk.addEventListener('change', function () { st.duty = dutyChk.checked; Store.save(); App.render(); });
      var arrChk = U.el('input', { type: 'checkbox', checked: !!st.arrived, title: 'הגיע' });
      arrChk.addEventListener('change', function () { st.arrived = arrChk.checked; if (arrChk.checked && st.wentToWork == null) {} Store.save(); App.render(); });
      var wentChk = U.el('input', { type: 'checkbox', checked: !!st.wentToWork, title: 'יצא לעבודה' });
      wentChk.addEventListener('change', function () { st.wentToWork = wentChk.checked; if (wentChk.checked) st.arrived = true; Store.save(); App.render(); });

      var li = U.el('li', { class: (st.teamLeader ? 'leader ' : '') + (st.duty ? 'duty' : ''), draggable: 'true' }, [
        U.el('span', { style: 'flex:1;', text: (st.teamLeader ? '⭐ ' : '') + (st.duty ? '★ ' : '') + name }),
        U.el('span', { class: 'chk no-print', title: 'תורן' }, [dutyChk, U.el('span', { text: 'ת', class: 'muted' })]),
        U.el('span', { class: 'chk', title: 'הגיע' }, [arrChk, U.el('span', { text: 'ה', class: 'muted' })]),
        U.el('span', { class: 'chk', title: 'יצא' }, [wentChk, U.el('span', { text: 'י', class: 'muted' })]),
        U.el('button', { class: 'btn small danger no-print', onclick: function () { removeStudent(card, st.studentId); } }, '✕')
      ]);
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
    var arr = (card.students || []).filter(function (s) { return s.arrived; }).length;
    var went = (card.students || []).filter(function (s) { return s.wentToWork; }).length;
    node.appendChild(U.el('div', { class: 'sc-foot' },
      'משובצים: ' + (card.students || []).length + ' · הגיעו: ' + arr + ' · יצאו: ' + went));

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
    card.students.push({ studentId: studentId, duty: false, arrived: false, wentToWork: false, teamLeader: !!teamLeader });
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

  function buildPool(day) {
    var assigned = assignedSet(day);
    var pool = U.el('div', { class: 'pool no-print' });

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

    var groupsWrap = U.el('div', { class: 'pool-groups' });

    var teams = global.TeamUtil.allTeams();
    teams.forEach(function (t) {
      var ids = global.TeamUtil.orderedStudentIds(t);
      if (!ids.length) return;
      groupsWrap.appendChild(buildTeamGroup(day, t, ids, assigned));
    });

    // תלמידים ללא צוות
    var noTeam = (Store.get().students || []).filter(function (s) {
      return s.active !== false && !global.TeamUtil.teamOfStudent(s.id);
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

  function studentChip(id, assigned) {
    var s = Store.getById('students', id);
    if (!s) return null;
    var chip = U.el('div', { class: 'chip' + (assigned[id] ? ' assigned' : ''), draggable: 'true', text: s.name });
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
    return U.el('div', { class: 'pool-group' }, [header, chips]);
  }

  function openAddStudents(day, card) {
    var assigned = assignedStudentIds(day, card.id);
    var students = activeList('students');
    var checks = [];
    var search = U.el('input', { type: 'text', placeholder: 'חיפוש…', style: 'width:100%;margin-bottom:8px;' });
    var listBox = U.el('div', { style: 'max-height:320px;overflow:auto;' });

    function build(filter) {
      U.clear(listBox); checks = [];
      U.GRADES.concat(['']).forEach(function (g) {
        var grp = students.filter(function (s) {
          return (s.grade || '') === g &&
            (!filter || s.name.indexOf(filter) !== -1);
        });
        if (!grp.length) return;
        listBox.appendChild(U.el('div', { class: 'muted', style: 'margin:6px 0 2px;font-weight:600;', text: g ? 'כיתה ' + g : 'ללא כיתה' }));
        grp.forEach(function (s) {
          var already = assigned[s.id] || (card.students || []).some(function (x) { return x.studentId === s.id; });
          var cb = U.el('input', { type: 'checkbox', checked: (card.students || []).some(function (x) { return x.studentId === s.id; }) });
          checks.push({ cb: cb, id: s.id });
          var lbl = U.el('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:400;color:var(--text);' + (already && !cb.checked ? 'opacity:.5;' : '') },
            [cb, s.name + (already && !cb.checked ? ' (משובץ באתר אחר)' : '')]);
          listBox.appendChild(lbl);
        });
      });
    }
    search.addEventListener('input', function () { build(search.value.trim()); });
    build('');

    Modal.open('הוספת תלמידים — ' + (card.siteId ? (Store.getById('sites', card.siteId) || {}).name : 'אתר'),
      U.el('div', null, [search, listBox]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var selected = {};
        checks.forEach(function (c) { if (c.cb.checked) selected[c.id] = true; });
        // הסר מהאתר את מי שבוטל
        card.students = (card.students || []).filter(function (s) { return selected[s.studentId]; });
        // הוסף חדשים (תוך הסרה מאתרים אחרים)
        Object.keys(selected).forEach(function (id) {
          if (!card.students.some(function (s) { return s.studentId === id; })) {
            day.cards.forEach(function (c) { if (c.id !== card.id) c.students = (c.students || []).filter(function (s) { return s.studentId !== id; }); });
            card.students.push({ studentId: id, duty: false, arrived: false, wentToWork: false });
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
        students: (c.students || []).map(function (s) { return { studentId: s.studentId, duty: s.duty, arrived: false, wentToWork: false }; })
      };
    });
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
      aoa.push(['תלמיד', 'כיתה', 'תורן', 'הגיע', 'יצא לעבודה']);
      (c.students || []).forEach(function (s) {
        var stu = Store.getById('students', s.studentId);
        aoa.push([stu ? stu.name : '', stu ? stu.grade : '', s.duty ? 'כן' : '', s.arrived ? 'כן' : '', s.wentToWork ? 'כן' : '']);
      });
      var arr = (c.students || []).filter(function (s) { return s.arrived; }).length;
      var went = (c.students || []).filter(function (s) { return s.wentToWork; }).length;
      aoa.push(['סה"כ הגיעו:', arr, 'סה"כ יצאו:', went]);
      aoa.push([]);
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'סידור');
    XLSX.writeFile(wb, 'סידור-' + curDate + '.xlsx');
  }

  global.DailyView = { render: render };
})(window);
