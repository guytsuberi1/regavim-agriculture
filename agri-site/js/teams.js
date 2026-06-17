/* teams.js — מסך ניהול צוותים + עזרי צוות משותפים */
(function (global) {
  'use strict';
  var U = global.U;

  // ---------- עזרים משותפים (גם daily.js משתמש) ----------
  function allTeams() { return Store.get().teams || []; }

  // הצוות שאליו שייך התלמיד (כראש צוות או כחבר), או null
  function teamOfStudent(studentId) {
    var teams = allTeams();
    for (var i = 0; i < teams.length; i++) {
      var t = teams[i];
      if (t.leaderStudentId === studentId) return t;
      if ((t.memberIds || []).indexOf(studentId) !== -1) return t;
    }
    return null;
  }

  function isInAnyTeam(studentId) { return !!teamOfStudent(studentId); }

  // מזהי התלמידים בצוות לפי סדר: ראש צוות ואז חברים (רק קיימים)
  function orderedStudentIds(team) {
    var ids = [];
    if (team.leaderStudentId && Store.getById('students', team.leaderStudentId)) ids.push(team.leaderStudentId);
    (team.memberIds || []).forEach(function (id) {
      if (Store.getById('students', id)) ids.push(id);
    });
    return ids;
  }

  function teamLabel(team) {
    if (team.name && team.name.trim()) return team.name.trim();
    var l = team.leaderStudentId ? Store.getById('students', team.leaderStudentId) : null;
    if (l && l.name && l.name.trim()) {
      var parts = l.name.trim().split(/\s+/);
      return 'צוות ' + parts[parts.length - 1]; // שם המשפחה של ראש הצוות
    }
    return '(ללא ראש צוות)';
  }

  global.TeamUtil = {
    allTeams: allTeams, teamOfStudent: teamOfStudent, isInAnyTeam: isInAnyTeam,
    orderedStudentIds: orderedStudentIds, teamLabel: teamLabel
  };

  // ---------- מסך הניהול ----------
  function render(root) {
    var teams = allTeams();

    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'ניהול צוותים' }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn', onclick: addTeam }, '+ צוות חדש')
    ]));

    root.appendChild(U.el('p', { class: 'muted', text:
      'כל צוות מורכב מראש צוות וחברי הצוות. גררו תלמיד מכרטיס לכרטיס כדי להעבירו בין צוותים · לחצו ✏️ לשם או הערה לצוות · בסידור היומי אפשר לגרור צוות שלם לאתר.' }));

    if (!teams.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין עדיין צוותים. לחצו "צוות חדש".'));
      return;
    }

    var grid = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:14px;' });
    teams.forEach(function (t) { grid.appendChild(buildTeamCard(t)); });
    root.appendChild(grid);
  }

  function buildTeamCard(team) {
    var leader = team.leaderStudentId ? Store.getById('students', team.leaderStudentId) : null;
    var title = (team.name && team.name.trim()) ? team.name.trim() : (leader ? leader.name : '(ללא ראש צוות)');

    var memberLis = (team.memberIds || []).map(function (id) {
      var s = Store.getById('students', id);
      var li = U.el('li', { class: 'team-member', draggable: 'true', style: 'display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:6px;' }, [
        U.el('span', { class: 'grip', style: 'color:var(--muted);cursor:grab;', text: '⠿' }),
        U.el('span', { style: 'flex:1;', text: s ? s.name + (s.grade ? ' · ' + s.grade : '') : '⚠ נמחק' }),
        U.el('button', { class: 'btn small danger', onclick: function () { removeMember(team, id); } }, '✕')
      ]);
      li.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'student:' + id); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
      li.addEventListener('dragend', function () { li.classList.remove('dragging'); });
      return li;
    });

    var headerRow = U.el('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
      U.el('h3', { style: 'margin:0;flex:1;color:var(--green-dark);', text: '⭐ ' + title }),
      U.el('button', { class: 'btn small secondary', title: 'שם והערה לצוות', onclick: function () { editTeam(team); } }, '✏️'),
      U.el('button', { class: 'btn small danger', title: 'מחק צוות', onclick: function () { deleteTeam(team); } }, '🗑')
    ]);
    var subtitle = U.el('div', { class: 'muted', style: 'font-size:12px;margin:2px 0 8px;', text:
      'ראש צוות: ' + (leader ? leader.name : '—') + (leader && leader.grade ? ' · כיתה ' + leader.grade : '') + ' · ' + (team.memberIds || []).length + ' חברים' });
    var ul = U.el('ul', { class: 'team-members', style: 'list-style:none;margin:0 0 8px;padding:0;min-height:24px;' },
      memberLis.length ? memberLis : [U.el('li', { class: 'muted', text: 'אין חברים — גררו לכאן תלמיד מצוות אחר' })]);
    var addBtn = U.el('button', { class: 'btn small secondary', onclick: function () { addMembers(team); } }, '+ הוסף חברים');

    var children = [headerRow, subtitle];
    if (team.note && team.note.trim()) {
      children.push(U.el('div', { style: 'font-size:12px;background:var(--green-light);color:var(--green-dark);border-radius:8px;padding:6px 8px;margin-bottom:8px;white-space:pre-wrap;', text: '📝 ' + team.note.trim() }));
    }
    children.push(ul, addBtn);

    var card = U.el('div', { class: 'card team-card-mgmt', style: 'width:300px;border-top:4px solid var(--accent);' }, children);

    // יעד שחרור: גרירת תלמיד מצוות אחר לתוך הכרטיס מעבירה אותו לצוות זה
    card.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; card.classList.add('team-drop-over'); });
    card.addEventListener('dragleave', function (e) { if (!card.contains(e.relatedTarget)) card.classList.remove('team-drop-over'); });
    card.addEventListener('drop', function (e) {
      e.preventDefault(); card.classList.remove('team-drop-over');
      var data = e.dataTransfer.getData('text/plain') || '';
      if (data.indexOf('student:') === 0) moveStudentToTeam(data.slice(8), team);
    });
    return card;
  }

  // ---------- פעולות ----------
  function leaderTaken(studentId) {
    return allTeams().some(function (t) { return t.leaderStudentId === studentId; });
  }

  function addTeam() {
    // ראשי צוות אפשריים: תלמידי י"ב וי"א שעדיין לא ראשי צוות ולא חברים בצוות אחר
    var candidates = (Store.get().students || []).filter(function (s) {
      return s.active !== false && (s.grade === 'יב' || s.grade === 'יא') && !isInAnyTeam(s.id);
    });
    // י"ב קודם, אחר כך י"א, ובתוך כל כיתה לפי א"ב
    candidates.sort(function (a, b) {
      if (a.grade !== b.grade) return a.grade === 'יב' ? -1 : 1;
      return a.name.localeCompare(b.name, 'he');
    });
    if (!candidates.length) {
      // אם אין י"ב/י"א פנויים, נאפשר כל תלמיד פנוי
      candidates = (Store.get().students || []).filter(function (s) { return s.active !== false && !isInAnyTeam(s.id); });
    }
    if (!candidates.length) { alert('אין תלמידים פנויים לשמש כראש צוות.'); return; }

    var sel = U.el('select', { style: 'width:100%;' }, candidates.map(function (s) {
      return U.el('option', { value: s.id }, s.name + (s.grade ? ' · ' + s.grade : ''));
    }));
    var body = U.el('div', null, [U.el('div', { class: 'field' }, [U.el('label', { text: 'בחר ראש צוות (תלמיד י"ב או י"א)' }), sel])]);

    Modal.open('צוות חדש', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'יצירה', onClick: function (close) {
        if (!sel.value) return;
        Store.upsert('teams', { leaderStudentId: sel.value, memberIds: [] });
        close(); App.render();
      } }
    ]);
  }

  function deleteTeam(team) {
    if (!confirm('למחוק את הצוות "' + teamLabel(team) + '"? (התלמידים עצמם לא יימחקו)')) return;
    Store.remove('teams', team.id);
    App.render();
  }

  // העברת תלמיד (חבר) מצוות לצוות בגרירה
  function moveStudentToTeam(studentId, targetTeam) {
    if (!studentId || !targetTeam) return;
    var teams = allTeams();
    // אי אפשר לגרור ראש צוות
    for (var i = 0; i < teams.length; i++) {
      if (teams[i].leaderStudentId === studentId) {
        alert('לא ניתן לגרור ראש צוות. כדי לשנות ראש צוות — צרו או מחקו צוות.');
        return;
      }
    }
    if (targetTeam.leaderStudentId === studentId) return;            // כבר ראש הצוות הזה
    if ((targetTeam.memberIds || []).indexOf(studentId) !== -1) return; // כבר חבר כאן
    // הסרה מכל צוות אחר
    teams.forEach(function (t) {
      if (t.memberIds && t.memberIds.indexOf(studentId) !== -1) {
        t.memberIds = t.memberIds.filter(function (id) { return id !== studentId; });
        Store.upsert('teams', t);
      }
    });
    targetTeam.memberIds = targetTeam.memberIds || [];
    targetTeam.memberIds.push(studentId);
    Store.upsert('teams', targetTeam);
    App.render();
  }

  // עריכת שם והערה לצוות
  function editTeam(team) {
    var nameInp = U.el('input', { type: 'text', value: team.name || '', placeholder: 'לדוגמה: צוות גינון', style: 'width:100%;' });
    var noteInp = U.el('textarea', { placeholder: 'הערה חופשית (לא חובה)', style: 'width:100%;min-height:72px;font-family:inherit;' });
    noteInp.value = team.note || '';
    var body = U.el('div', null, [
      U.el('div', { class: 'field' }, [U.el('label', { text: 'שם הצוות (לא חובה — אם ריק יוצג שם ראש הצוות)' }), nameInp]),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'הערה (לא חובה)' }), noteInp])
    ]);
    Modal.open('עריכת צוות — ' + teamLabel(team), body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        team.name = nameInp.value.trim();
        team.note = noteInp.value.trim();
        Store.upsert('teams', team);
        close(); App.render();
      } }
    ]);
  }

  function removeMember(team, studentId) {
    team.memberIds = (team.memberIds || []).filter(function (id) { return id !== studentId; });
    Store.upsert('teams', team);
    App.render();
  }

  function addMembers(team) {
    // מועמדים: תלמידים פעילים שאינם בצוות כלשהו (ושאינם ראש הצוות הזה)
    var current = {};
    (team.memberIds || []).forEach(function (id) { current[id] = true; });
    var students = (Store.get().students || []).filter(function (s) {
      return s.active !== false && s.id !== team.leaderStudentId &&
        (current[s.id] || !isInAnyTeam(s.id));
    });

    // הסימונים נשמרים במפה קבועה — כך חיפוש לא מאפס בחירות קודמות
    var selected = {};
    (team.memberIds || []).forEach(function (id) { selected[id] = true; });

    var search = U.el('input', { type: 'text', placeholder: 'חיפוש…', style: 'width:100%;margin-bottom:8px;' });
    var countEl = U.el('span', { class: 'tag', text: '' });
    var listBox = U.el('div', { style: 'max-height:340px;overflow:auto;' });

    function updateCount() {
      countEl.textContent = 'נבחרו: ' + Object.keys(selected).filter(function (k) { return selected[k]; }).length;
    }

    function build(filter) {
      U.clear(listBox);
      var shown = 0;
      U.GRADES.concat(['']).forEach(function (g) {
        var grp = students.filter(function (s) { return (s.grade || '') === g && (!filter || s.name.indexOf(filter) !== -1); });
        if (!grp.length) return;
        listBox.appendChild(U.el('div', { class: 'muted', style: 'margin:6px 0 2px;font-weight:600;', text: g ? 'כיתה ' + g : 'ללא כיתה' }));
        grp.forEach(function (s) {
          shown++;
          var cb = U.el('input', { type: 'checkbox', checked: !!selected[s.id] });
          cb.addEventListener('change', function () { selected[s.id] = cb.checked; updateCount(); });
          listBox.appendChild(U.el('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:400;color:var(--text);padding:2px 0;' }, [cb, s.name]));
        });
      });
      if (!shown) listBox.appendChild(U.el('div', { class: 'muted', text: 'אין תלמידים פנויים להוספה.' }));
    }
    search.addEventListener('input', function () { build(search.value.trim()); });
    build('');
    updateCount();

    var headRow = U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px;' }, [search, countEl]);
    Modal.open('הוספת חברים לצוות של ' + teamLabel(team), U.el('div', null, [headRow, listBox]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        team.memberIds = Object.keys(selected).filter(function (k) { return selected[k]; });
        Store.upsert('teams', team);
        close(); App.render();
      } }
    ]);
  }

  global.TeamsView = { render: render };
})(window);
