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
    var l = team.leaderStudentId ? Store.getById('students', team.leaderStudentId) : null;
    return l ? l.name : '(ללא ראש צוות)';
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
      'כל צוות מורכב מראש צוות (תלמיד י"ב) וחברי הצוות שלו. בסידור היומי אפשר לגרור צוות שלם לאתר.' }));

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
    var memberLis = (team.memberIds || []).map(function (id) {
      var s = Store.getById('students', id);
      return U.el('li', { style: 'display:flex;align-items:center;gap:6px;padding:3px 0;' }, [
        U.el('span', { style: 'flex:1;', text: s ? s.name + (s.grade ? ' · ' + s.grade : '') : '⚠ נמחק' }),
        U.el('button', { class: 'btn small danger', onclick: function () { removeMember(team, id); } }, '✕')
      ]);
    });

    return U.el('div', { class: 'card', style: 'width:300px;border-top:4px solid var(--accent);' }, [
      U.el('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
        U.el('h3', { style: 'margin:0;flex:1;color:var(--green-dark);', text: '⭐ ' + (leader ? leader.name : '(ללא ראש צוות)') }),
        U.el('button', { class: 'btn small danger', title: 'מחק צוות', onclick: function () { deleteTeam(team); } }, '🗑')
      ]),
      U.el('div', { class: 'muted', style: 'font-size:12px;margin:2px 0 8px;', text: 'ראש צוות' + (leader && leader.grade ? ' · כיתה ' + leader.grade : '') + ' · ' + (team.memberIds || []).length + ' חברים' }),
      U.el('ul', { style: 'list-style:none;margin:0 0 8px;padding:0;' }, memberLis.length ? memberLis : [U.el('li', { class: 'muted', text: 'אין חברים עדיין' })]),
      U.el('button', { class: 'btn small secondary', onclick: function () { addMembers(team); } }, '+ הוסף חברים')
    ]);
  }

  // ---------- פעולות ----------
  function leaderTaken(studentId) {
    return allTeams().some(function (t) { return t.leaderStudentId === studentId; });
  }

  function addTeam() {
    // ראשי צוות אפשריים: תלמידי י"ב שעדיין לא ראשי צוות ולא חברים בצוות אחר
    var candidates = (Store.get().students || []).filter(function (s) {
      return s.active !== false && s.grade === 'יב' && !isInAnyTeam(s.id);
    });
    if (!candidates.length) {
      // אם אין י"ב פנויים, נאפשר כל תלמיד פנוי
      candidates = (Store.get().students || []).filter(function (s) { return s.active !== false && !isInAnyTeam(s.id); });
    }
    if (!candidates.length) { alert('אין תלמידים פנויים לשמש כראש צוות.'); return; }

    var sel = U.el('select', { style: 'width:100%;' }, candidates.map(function (s) {
      return U.el('option', { value: s.id }, s.name + (s.grade ? ' · ' + s.grade : ''));
    }));
    var body = U.el('div', null, [U.el('div', { class: 'field' }, [U.el('label', { text: 'בחר ראש צוות (תלמיד י"ב)' }), sel])]);

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
    if (!confirm('למחוק את הצוות של "' + teamLabel(team) + '"? (התלמידים עצמם לא יימחקו)')) return;
    Store.remove('teams', team.id);
    App.render();
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

    var search = U.el('input', { type: 'text', placeholder: 'חיפוש…', style: 'width:100%;margin-bottom:8px;' });
    var listBox = U.el('div', { style: 'max-height:340px;overflow:auto;' });
    var checks = [];

    function build(filter) {
      U.clear(listBox); checks = [];
      U.GRADES.concat(['']).forEach(function (g) {
        var grp = students.filter(function (s) { return (s.grade || '') === g && (!filter || s.name.indexOf(filter) !== -1); });
        if (!grp.length) return;
        listBox.appendChild(U.el('div', { class: 'muted', style: 'margin:6px 0 2px;font-weight:600;', text: g ? 'כיתה ' + g : 'ללא כיתה' }));
        grp.forEach(function (s) {
          var cb = U.el('input', { type: 'checkbox', checked: !!current[s.id] });
          checks.push({ cb: cb, id: s.id });
          listBox.appendChild(U.el('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:400;color:var(--text);padding:2px 0;' }, [cb, s.name]));
        });
      });
      if (!checks.length) listBox.appendChild(U.el('div', { class: 'muted', text: 'אין תלמידים פנויים להוספה.' }));
    }
    search.addEventListener('input', function () { build(search.value.trim()); });
    build('');

    Modal.open('הוספת חברים לצוות של ' + teamLabel(team), U.el('div', null, [search, listBox]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var selected = [];
        checks.forEach(function (c) { if (c.cb.checked) selected.push(c.id); });
        team.memberIds = selected;
        Store.upsert('teams', team);
        close(); App.render();
      } }
    ]);
  }

  global.TeamsView = { render: render };
})(window);
