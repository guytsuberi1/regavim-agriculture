/* field.js — מצב שטח: מסך ידידותי לנייד לאיש הצוות לסימון יצא + ציון */
(function (global) {
  'use strict';
  var U = global.U;
  var fieldDate = U.todayISO();
  var fieldCardId = null;

  function dayOf() {
    var d = Store.get();
    if (!d.days[fieldDate]) d.days[fieldDate] = { cards: [] };
    return d.days[fieldDate];
  }

  function render(root) {
    if (global.Sync) Sync.mergeDate(fieldDate);
    var day = dayOf();

    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '📋 מצב שטח' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { fieldDate = U.addDays(fieldDate, -1); fieldCardId = null; App.render(); } }, '→ אתמול'),
      U.el('button', { class: 'btn secondary small', onclick: function () { fieldDate = U.todayISO(); fieldCardId = null; App.render(); } }, 'היום'),
      U.el('button', { class: 'btn secondary small', onclick: function () { fieldDate = U.addDays(fieldDate, 1); fieldCardId = null; App.render(); } }, 'מחר ←'),
      U.el('span', { class: 'tag', text: U.weekdayName(fieldDate) + ' · ' + U.gregLabel(fieldDate) })
    ]));

    var card = fieldCardId ? day.cards.filter(function (c) { return c.id === fieldCardId; })[0] : null;
    if (card) renderSite(root, card);
    else renderSiteList(root, day);
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
    var staff = card.staffId ? Store.getById('staff', card.staffId) : null;
    var trans = card.transportId ? Store.getById('transports', card.transportId) : null;

    root.appendChild(U.el('button', { class: 'btn secondary', style: 'margin-bottom:10px;', onclick: function () { fieldCardId = null; App.render(); } }, '→ חזרה לרשימת האתרים'));

    var metaParts = [];
    if (site && site.location) metaParts.push('📍 ' + site.location);
    if (trans) metaParts.push('🚌 ' + trans.name);
    if (staff) metaParts.push('👤 ' + staff.name);

    root.appendChild(U.el('div', { class: 'field-site-head' }, [
      U.el('div', { class: 'fsh-name', text: site ? site.name : '(אתר)' }),
      metaParts.length ? U.el('div', { class: 'fsh-meta', text: metaParts.join('  ·  ') }) : null
    ]));

    var ordered = (card.students || []).slice().sort(function (a, b) { return (b.teamLeader ? 1 : 0) - (a.teamLeader ? 1 : 0); });
    if (!ordered.length) {
      root.appendChild(U.el('div', { class: 'card empty' }, 'אין תלמידים משובצים באתר זה.'));
      return;
    }

    var list = U.el('div', { class: 'field-students' });
    ordered.forEach(function (st) { list.appendChild(buildStudentRow(st)); });
    root.appendChild(list);
  }

  function buildStudentRow(st) {
    var stu = Store.getById('students', st.studentId);
    var name = stu ? stu.name + (stu.grade ? ' (' + stu.grade + ')' : '') : '⚠ נמחק';

    // כפתור יצא לעבודה
    var wentBtn = U.el('button', { class: 'fbtn went' + (st.wentToWork ? ' on' : '') },
      st.wentToWork ? '✓ יצא' : 'יצא?');
    wentBtn.addEventListener('click', function () { st.wentToWork = !st.wentToWork; Store.save(); App.render(); });

    // ציון 1-5
    var rateWrap = U.el('div', { class: 'frate' }, [1, 2, 3, 4, 5].map(function (n) {
      var b = U.el('button', { class: 'frbtn' + (st.rating === n ? ' on' : '') }, String(n));
      b.addEventListener('click', function () { st.rating = (st.rating === n ? null : n); Store.save(); App.render(); });
      return b;
    }));

    // שדה הערה
    var noteInp = U.el('input', { type: 'text', class: 'fstu-note', value: st.note || '', placeholder: '📝 הערה (לא חובה)' });
    noteInp.addEventListener('change', function () { st.note = noteInp.value; Store.save(); });

    return U.el('div', { class: 'field-student' + (st.wentToWork ? ' done' : '') }, [
      U.el('div', { class: 'fstu-name', text: (st.teamLeader ? '⭐ ' : '') + name }),
      U.el('div', { class: 'fstu-controls' }, [wentBtn, U.el('div', { class: 'frate-wrap' }, [U.el('span', { class: 'muted', text: 'ציון' }), rateWrap])]),
      noteInp
    ]);
  }

  global.FieldView = { render: render };
})(window);
