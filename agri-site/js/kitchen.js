/* kitchen.js — מסך "תורני מטבח" למנהל המטבח: מילוי weeklyDuty לשבוע (ללא מצב שטח) */
(function (global) {
  'use strict';
  var U = global.U;
  var kWeek = U.startOfWeek(U.todayISO());

  function render(root) {
    var d = Store.get();
    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '🍳 תורני מטבח' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { kWeek = U.addDays(kWeek, -7); App.render(); } }, '→ שבוע קודם'),
      U.el('button', { class: 'btn secondary small', onclick: function () { kWeek = U.startOfWeek(U.todayISO()); App.render(); } }, 'השבוע'),
      U.el('button', { class: 'btn secondary small', onclick: function () { kWeek = U.addDays(kWeek, 7); App.render(); } }, 'שבוע הבא ←'),
      U.el('span', { class: 'tag', text: U.gregLabel(kWeek) + ' – ' + U.gregLabel(U.addDays(kWeek, 6)) })
    ]));

    var ids = (d.weeklyDuty && d.weeklyDuty[kWeek]) || [];
    var names = ids.map(function (id) { var s = Store.getById('students', id); return s ? s.name + (s.grade ? ' (' + s.grade + ')' : '') : null; }).filter(Boolean);

    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('p', { class: 'muted', text: 'בחרו את תורני המטבח לשבוע זה. הם יורדים אוטומטית ממאגר העבודה החקלאית לכל השבוע.' }),
      U.el('div', { style: 'margin:8px 0;font-weight:600;', text: names.length ? ('תורנים (' + names.length + '): ' + names.join(', ')) : 'עדיין לא הוגדרו תורנים לשבוע זה.' }),
      U.el('button', { class: 'btn', onclick: edit }, '✏️ עריכת תורני מטבח')
    ]));
  }

  function edit() {
    var d = Store.get();
    if (!d.weeklyDuty) d.weeklyDuty = {};
    if (!global.PickStudents) { alert('בורר התלמידים אינו זמין'); return; }
    global.PickStudents('תורני מטבח · שבוע ' + U.gregLabel(kWeek), d.weeklyDuty[kWeek] || [], function (sel) {
      if (sel.length) d.weeklyDuty[kWeek] = sel; else delete d.weeklyDuty[kWeek];
      Store.save(); App.render();
    });
  }

  global.KitchenView = { render: render };
})(window);
