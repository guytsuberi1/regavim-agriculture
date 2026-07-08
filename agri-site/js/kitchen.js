/* kitchen.js — מסך "תורני מטבח" למנהל המטבח: מילוי weeklyDuty לשבוע (ללא מצב שטח) */
(function (global) {
  'use strict';
  var U = global.U;
  var kWeek = U.startOfWeek(U.todayISO());

  // ספירת תורנויות לכל תלמיד על פני כל השבועות (אופציונלי: להחריג שבוע מסוים)
  function dutyCounts(excludeWk) {
    var wd = Store.get().weeklyDuty || {}, m = {};
    Object.keys(wd).forEach(function (wk) {
      if (wk === excludeWk) return;
      (wd[wk] || []).forEach(function (id) { m[id] = (m[id] || 0) + 1; });
    });
    return m;
  }

  function studentLabel(s) {
    return s.name + (s.className || s.grade ? ' (' + (s.className || s.grade) + ')' : '');
  }

  function render(root) {
    var d = Store.get();
    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '🍳 תורני מטבח' }),
      U.el('button', { class: 'btn secondary ico', title: 'שבוע קודם', onclick: function () { kWeek = U.addDays(kWeek, -7); App.render(); } }, '→'),
      U.dateChip(U.gregLabel(kWeek) + ' – ' + U.gregLabel(U.addDays(kWeek, 5)), null,
        { onClick: function () { kWeek = U.startOfWeek(U.todayISO()); App.render(); }, title: 'לחצו לחזרה לשבוע הנוכחי' }),
      U.el('button', { class: 'btn secondary ico', title: 'שבוע הבא', onclick: function () { kWeek = U.addDays(kWeek, 7); App.render(); } }, '←')
    ]));

    var ids = (d.weeklyDuty && d.weeklyDuty[kWeek]) || [];
    var duty = ids.map(function (id) { return Store.getById('students', id); }).filter(Boolean);

    // תורנים כצ'יפים עם תג כיתה (כמו במאגר התלמידים בסידור)
    var chipsEl;
    if (duty.length) {
      chipsEl = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;' }, duty.map(function (s) {
        var gi = U.GRADES.indexOf(s.grade || '');
        return U.el('span', { class: 'chip', style: 'cursor:default;' }, [
          (s.grade || s.className) ? U.el('span', { class: 'grade-badge gb' + (gi < 0 ? 'x' : gi), text: s.className || s.grade }) : null,
          U.el('span', { text: s.name })
        ]);
      }));
    } else {
      chipsEl = U.el('div', { class: 'muted', style: 'margin:10px 0;', text: 'עדיין לא הוגדרו תורנים לשבוע זה.' });
    }

    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('p', { class: 'muted', text: 'בחרו את תורני המטבח לשבוע זה. הם יורדים אוטומטית ממאגר העבודה החקלאית לכל השבוע.' }),
      duty.length ? U.el('div', { style: 'font-weight:600;', text: 'תורנים (' + duty.length + '):' }) : null,
      chipsEl,
      U.el('button', { class: 'btn', onclick: edit }, '✏️ עריכת תורני מטבח')
    ]));

    // ---- היסטוריית תורנויות (#22) ----
    var wd = d.weeklyDuty || {};
    var weeks = Object.keys(wd).filter(function (wk) { return (wd[wk] || []).length; }).sort().reverse().slice(0, 8);
    if (weeks.length) {
      var rows = weeks.map(function (wk) {
        var nm = (wd[wk] || []).map(function (id) { var s = Store.getById('students', id); return s ? s.name : null; }).filter(Boolean);
        return U.el('tr', { style: (wk === kWeek ? 'background:var(--green-light);' : '') }, [
          U.el('td', { text: U.gregLabel(wk) + ' – ' + U.gregLabel(U.addDays(wk, 6)) }),
          U.el('td', { class: 'center', text: String(nm.length) }),
          U.el('td', { text: nm.join(', ') })
        ]);
      });
      root.appendChild(U.el('h3', { style: 'color:var(--green-dark);margin:18px 0 6px;', text: 'היסטוריית תורנויות אחרונות' }));
      root.appendChild(U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
        U.el('thead', null, [U.el('tr', null, ['שבוע', 'מס\'', 'תורנים'].map(function (h) { return U.el('th', { text: h }); }))]),
        U.el('tbody', null, rows)
      ])]));
    }
  }

  // בורר תורנים עם רוטציה הוגנת (#21): מציג כמה תורנויות לכל תלמיד וממיין מהפחות למרובה
  function edit() {
    var d = Store.get();
    if (!d.weeklyDuty) d.weeklyDuty = {};
    var counts = dutyCounts(kWeek);
    var selected = {}, pinned = {};
    (d.weeklyDuty[kWeek] || []).forEach(function (id) { selected[id] = true; pinned[id] = true; });
    var students = (d.students || []).filter(function (s) { return s.active !== false; });
    students.sort(function (a, b) {
      var pa = pinned[a.id] ? 0 : 1, pb = pinned[b.id] ? 0 : 1;
      if (pa !== pb) return pa - pb; // הנבחרים לשבוע זה — למעלה
      var ca = counts[a.id] || 0, cb = counts[b.id] || 0;
      if (ca !== cb) return ca - cb; // הכי מעט תורנויות — למעלה
      return (a.name || '').localeCompare(b.name || '', 'he');
    });

    var search = U.el('input', { type: 'text', placeholder: 'חיפוש…', style: 'width:100%;margin-bottom:8px;' });
    var countEl = U.el('span', { class: 'tag' });
    var listBox = U.el('div', { style: 'max-height:360px;overflow:auto;' });
    function updateCount() { countEl.textContent = 'נבחרו: ' + Object.keys(selected).filter(function (k) { return selected[k]; }).length; }
    function build(filter) {
      U.clear(listBox);
      var shown = students.filter(function (s) { return !filter || (s.name || '').indexOf(filter) !== -1; });
      if (!shown.length) { listBox.appendChild(U.el('div', { class: 'muted', style: 'padding:8px;', text: 'לא נמצאו' })); return; }
      shown.forEach(function (s) {
        var cnt = counts[s.id] || 0;
        var cb = U.el('input', { type: 'checkbox', checked: !!selected[s.id] });
        cb.addEventListener('change', function () { selected[s.id] = cb.checked; updateCount(); });
        listBox.appendChild(U.el('label', { style: 'display:flex;gap:8px;align-items:center;font-weight:400;color:var(--text);padding:4px 0;' }, [
          cb,
          U.el('span', { style: 'flex:1;', text: studentLabel(s) }),
          U.el('span', { class: 'tag', style: cnt === 0 ? 'background:#dcfce7;color:#166534;' : '', text: cnt + ' תורנויות' })
        ]));
      });
    }
    search.addEventListener('input', function () { build(search.value.trim()); });
    build(''); updateCount();

    Modal.open('תורני מטבח · שבוע ' + U.gregLabel(kWeek) + ' (ממוין מהפחות למרובה)',
      U.el('div', null, [U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px;' }, [search, countEl]), listBox]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var sel = Object.keys(selected).filter(function (k) { return selected[k]; });
        if (sel.length) d.weeklyDuty[kWeek] = sel; else delete d.weeklyDuty[kWeek];
        Store.save(); close(); App.render();
      } }
    ]);
  }

  global.KitchenView = { render: render };
})(window);
