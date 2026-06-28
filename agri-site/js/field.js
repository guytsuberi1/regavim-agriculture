/* field.js — מצב שטח: מסך ידידותי לנייד לאיש הצוות לסימון יצא + ציון */
(function (global) {
  'use strict';
  var U = global.U;
  var fieldDate = U.todayISO();
  var fieldCardId = null;
  var lastAutoKey = null; // מונע פתיחה-אוטומטית חוזרת לאחר חזרה לרשימה

  function dayOf() {
    var d = Store.get();
    if (!d.days[fieldDate]) d.days[fieldDate] = { cards: [] };
    return d.days[fieldDate];
  }

  // ---------- זהות איש הצוות ----------
  // זיהוי אוטומטי בלבד: המשתמש המחובר (אימייל ההתחברות) -> רשומת איש הצוות עם אותו אימייל.
  function loggedInStaffId() {
    var em = (global.Store && Store.currentEmail) ? Store.currentEmail() : null;
    if (!em) return null;
    var m = (Store.get().staff || []).filter(function (s) { return (s.email || '').toLowerCase() === em && s.active !== false; })[0];
    return m ? m.id : null;
  }
  function myStaffId() { return loggedInStaffId(); }

  function myCards(day) {
    var id = myStaffId();
    if (!id) return [];
    return day.cards.filter(function (c) {
      var ids = (c.staffIds && c.staffIds.length) ? c.staffIds : (c.staffId ? [c.staffId] : []);
      return ids.indexOf(id) !== -1;
    });
  }

  function render(root) {
    if (global.Sync) Sync.mergeDate(fieldDate);
    var day = dayOf();
    var absN = ((Store.get().dailyAbsent || {})[fieldDate] || []).length;
    var id = myStaffId();
    var isMgr = !id && Store.isAdmin(); // רכז/מנהל ללא קישור לאיש צוות — רואה את כל האתרים

    // פתיחה אוטומטית של האתר המשובץ לאיש הצוות — פעם אחת לכל (זהות+תאריך)
    var autoKey = (id || (isMgr ? 'mgr' : '-')) + '|' + fieldDate;
    if (!fieldCardId && id && lastAutoKey !== autoKey) {
      lastAutoKey = autoKey;
      var mine = myCards(day);
      if (mine.length === 1) fieldCardId = mine[0].id;
    }

    var who = id ? (Store.getById('staff', id) || {}).name : (isMgr ? 'רכז' : null);
    var identityChip = who ? U.el('span', { class: 'tag', style: 'margin-inline-start:auto;', text: '👤 ' + who }) : null;
    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '📋 מצב שטח' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { fieldDate = U.addDays(fieldDate, -1); fieldCardId = null; App.render(); } }, '→ אתמול'),
      U.el('button', { class: 'btn secondary small', onclick: function () { fieldDate = U.todayISO(); fieldCardId = null; App.render(); } }, 'היום'),
      U.el('button', { class: 'btn secondary small', onclick: function () { fieldDate = U.addDays(fieldDate, 1); fieldCardId = null; App.render(); } }, 'מחר ←'),
      U.el('span', { class: 'tag', text: U.weekdayName(fieldDate) + ' · ' + U.gregLabel(fieldDate) }),
      U.el('button', { class: 'btn', onclick: openAbsentField }, '🚫 נעדרים היום' + (absN ? ' (' + absN + ')' : '')),
      identityChip
    ]));

    // ללא קישור לאיש צוות (ואינו מנהל) — אין זהות אוטומטית
    if (!id && !isMgr) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'החשבון שלך אינו מקושר לאיש צוות. פנו לרכז כדי לקשר את האימייל שלכם תחת "אנשי צוות".'));
      return;
    }

    var card = fieldCardId ? day.cards.filter(function (c) { return c.id === fieldCardId; })[0] : null;
    if (card) renderSite(root, card);
    else renderSiteList(root, day);
  }

  // נעדרים יומיים — הצוות/המחנך מסמן מי לא הגיע (אותה רשימה שהרכז רואה בסידור)
  function openAbsentField() {
    var d = Store.get();
    if (!d.dailyAbsent) d.dailyAbsent = {};
    if (!global.PickStudents) { alert('בורר התלמידים אינו זמין'); return; }
    global.PickStudents('נעדרים ליום ' + U.gregLabel(fieldDate), d.dailyAbsent[fieldDate] || [], function (sel) {
      if (sel.length) d.dailyAbsent[fieldDate] = sel; else delete d.dailyAbsent[fieldDate];
      Store.save(); App.render();
    });
  }

  function renderSiteList(root, day) {
    root.appendChild(U.el('p', { class: 'muted', text: 'בחרו את האתר שלכם:' }));
    if (!day.cards.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין אתרים מתוכננים ליום זה.'));
      return;
    }
    var grid = U.el('div', { class: 'field-list' });
    day.cards.forEach(function (c) {
      var site = c.siteId ? Store.getById('sites', c.siteId) : null;
      var n = (c.students || []).length;
      var went = (c.students || []).filter(function (s) { return s.wentToWork; }).length;
      grid.appendChild(U.el('button', { class: 'field-site-btn', onclick: function () { fieldCardId = c.id; App.render(); } }, [
        U.el('div', { class: 'fs-name', text: site ? site.name : '(אתר)' }),
        U.el('div', { class: 'fs-sub', text: (site && site.location ? site.location + ' · ' : '') + n + ' תלמידים · ' + went + ' יצאו' })
      ]));
    });
    root.appendChild(grid);
  }

  function renderSite(root, card) {
    var site = card.siteId ? Store.getById('sites', card.siteId) : null;
    var staffIds = (card.staffIds && card.staffIds.length) ? card.staffIds : (card.staffId ? [card.staffId] : []);
    var trans = card.transportId ? Store.getById('transports', card.transportId) : null;

    root.appendChild(U.el('button', { class: 'btn secondary', style: 'margin-bottom:10px;', onclick: function () { fieldCardId = null; App.render(); } }, '→ חזרה לרשימת האתרים'));

    var metaParts = [];
    if (site && site.location) metaParts.push('📍 ' + site.location);
    if (trans) metaParts.push('🚌 ' + trans.name);
    if (staffIds.length) metaParts.push('👤 ' + staffIds.map(function (id) { var p = Store.getById('staff', id); return p ? p.name : ''; }).filter(Boolean).join(', '));

    root.appendChild(U.el('div', { class: 'field-site-head' }, [
      U.el('div', { class: 'fsh-name', text: site ? site.name : '(אתר)' }),
      metaParts.length ? U.el('div', { class: 'fsh-meta', text: metaParts.join('  ·  ') }) : null
    ]));

    var ordered = (card.students || []).slice().sort(function (a, b) { return (b.teamLeader ? 1 : 0) - (a.teamLeader ? 1 : 0); });

    root.appendChild(U.el('div', { class: 'frate-legend muted', text: 'ציון לכל תלמיד: 5 = גבוה · 1 = נמוך' }));

    var list = U.el('div', { class: 'field-students' });
    ordered.forEach(function (st) { list.appendChild(buildStudentRow(st)); });
    if (!ordered.length) {
      list.appendChild(U.el('div', { class: 'card empty field-empty-ph', style: 'margin:0;' }, 'אין תלמידים משובצים — אפשר להוסיף תלמיד שעבד למטה.'));
    }
    root.appendChild(list);

    root.appendChild(U.el('button', { class: 'btn fadd-btn', onclick: function () { openAddWorked(card, list); } }, '➕ הוסף תלמיד שעבד באתר'));

    // הערה כללית לרכז החקלאות (לכל האתר/היום)
    var noteBox = U.el('textarea', { class: 'ffield-note', rows: '2', placeholder: '📝 הערה כללית לרכז החקלאות (לא חובה)…' });
    noteBox.value = card.fieldNote || '';
    noteBox.addEventListener('change', function () {
      card.fieldNote = noteBox.value;
      var meId = myStaffId();
      var meName = meId ? ((Store.getById('staff', meId) || {}).name || '') : (Store.isAdmin && Store.isAdmin() ? 'רכז' : (Store.currentEmail ? (Store.currentEmail() || '') : ''));
      card.fieldNoteBy = noteBox.value.trim() ? meName : '';
      Store.save();
    });
    root.appendChild(U.el('div', { class: 'ffield-note-wrap' }, [
      U.el('label', { class: 'muted', text: 'הערה לרכז החקלאות' }),
      noteBox
    ]));
  }

  // הוספת תלמיד שעבד באתר אך לא תוכנן ע"י רכז החקלאות
  function openAddWorked(card, listEl) {
    var existing = {};
    (card.students || []).forEach(function (s) { existing[s.studentId] = true; });
    var all = (Store.get().students || []).filter(function (s) { return s.active !== false; })
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });

    // מיפוי: תלמיד -> שם אתר אחר שבו שובץ היום (חיווי שמדובר בהעברה)
    var elsewhere = {};
    dayOf().cards.forEach(function (c) {
      if (c.id === card.id) return;
      var sn = c.siteId ? ((Store.getById('sites', c.siteId) || {}).name || 'אתר אחר') : 'אתר אחר';
      (c.students || []).forEach(function (x) { elsewhere[x.studentId] = sn; });
    });

    var listBox = U.el('div', { class: 'fadd-list' });
    var search = U.el('input', { type: 'text', class: 'fadd-search', placeholder: '🔎 חיפוש תלמיד...' });

    function build() {
      U.clear(listBox);
      var ql = (search.value || '').trim().toLowerCase();
      var shown = all.filter(function (s) { return !existing[s.id] && (!ql || (s.name || '').toLowerCase().indexOf(ql) >= 0); });
      if (!shown.length) { listBox.appendChild(U.el('div', { class: 'muted', style: 'padding:10px;', text: ql ? 'לא נמצאו תלמידים' : 'כל התלמידים כבר באתר' })); return; }
      shown.forEach(function (s) {
        var b = U.el('button', { class: 'fadd-item' }, [
          U.el('span', null, [
            U.el('span', { text: s.name + (s.grade ? ' (' + s.grade + ')' : '') }),
            elsewhere[s.id] ? U.el('span', { class: 'fadd-note', text: ' · משובץ ב' + elsewhere[s.id] }) : null
          ]),
          U.el('span', { class: 'fadd-plus', text: '➕' })
        ]);
        b.addEventListener('click', function () {
          existing[s.id] = true;
          // תלמיד = אתר אחד ביום: הסר מכל אתר אחר באותו יום
          dayOf().cards.forEach(function (c) {
            if (c.id !== card.id) c.students = (c.students || []).filter(function (x) { return x.studentId !== s.id; });
          });
          var entry = { studentId: s.id, wentToWork: true, sick: false, rating: null };
          card.students.push(entry);
          Store.save();
          var ph = listEl.querySelector('.field-empty-ph'); if (ph) ph.parentNode.removeChild(ph);
          listEl.appendChild(buildStudentRow(entry));
          build();
        });
        listBox.appendChild(b);
      });
    }
    search.addEventListener('input', build);
    build();

    Modal.open('הוספת תלמיד שעבד באתר', U.el('div', null, [
      U.el('p', { class: 'muted', style: 'margin:0 0 8px;', text: 'תלמידים שעבדו ולא תוכננו ע״י הרכז — נוספים מסומנים כ"יצא":' }),
      search, listBox
    ]), [{ label: 'סגור', class: 'secondary' }]);
  }

  function buildStudentRow(st) {
    var stu = Store.getById('students', st.studentId);
    var name = stu ? stu.name + (stu.grade ? ' (' + stu.grade + ')' : '') : '⚠ נמחק';

    var row = U.el('div', { class: 'field-student' });

    // כפתורי יצא / לא יצא — עדכון במקום (בלי רינדור מחדש, כדי שהדף לא יקפוץ למעלה)
    var wentBtn = U.el('button', { class: 'fbtn went' }, '✓ יצא');
    var absentBtn = U.el('button', { class: 'fbtn absent' }, '✕ לא יצא');
    function syncWent() {
      wentBtn.classList.toggle('on', !!st.wentToWork);
      absentBtn.classList.toggle('on', !!st.absent);
      row.classList.toggle('done', !!st.wentToWork);
      row.classList.toggle('absent', !!st.absent);
    }
    wentBtn.addEventListener('click', function () {
      st.wentToWork = !st.wentToWork;
      if (st.wentToWork) st.absent = false;
      syncWent(); Store.save();
    });
    absentBtn.addEventListener('click', function () {
      st.absent = !st.absent;
      if (st.absent) st.wentToWork = false;
      syncWent(); Store.save();
    });
    var wentGrp = U.el('div', { class: 'fwent-grp' }, [wentBtn, absentBtn]);

    // ציון 1-5 — עדכון במקום
    var rbtns = [1, 2, 3, 4, 5].map(function (n) {
      var b = U.el('button', { class: 'frbtn' }, String(n));
      b.addEventListener('click', function () {
        st.rating = (st.rating === n ? null : n);
        rbtns.forEach(function (x, i) { x.classList.toggle('on', st.rating === i + 1); });
        Store.save();
      });
      return b;
    });
    var rateWrap = U.el('div', { class: 'frate' }, rbtns);

    // שדה הערה
    var noteInp = U.el('input', { type: 'text', class: 'fstu-note', value: st.note || '', placeholder: '📝 הערה (לא חובה)' });
    noteInp.addEventListener('change', function () { st.note = noteInp.value; Store.save(); });

    row.appendChild(U.el('div', { class: 'fstu-name', text: (st.teamLeader ? '⭐ ' : '') + name }));
    row.appendChild(U.el('div', { class: 'fstu-controls' }, [wentGrp, U.el('div', { class: 'frate-wrap' }, [U.el('span', { class: 'muted', text: 'ציון' }), rateWrap])]));
    row.appendChild(noteInp);
    rbtns.forEach(function (x, i) { x.classList.toggle('on', st.rating === i + 1); });
    syncWent();
    return row;
  }

  global.FieldView = { render: render };
})(window);
