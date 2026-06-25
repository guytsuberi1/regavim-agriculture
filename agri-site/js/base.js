/* base.js — מסך נתוני בסיס: תלמידים / אתרים-לקוחות / אנשי צוות / הסעות */
(function (global) {
  'use strict';
  var U = global.U;
  var sub = 'students';

  // הגדרת השדות לכל אוסף
  function fieldDefs(coll) {
    if (coll === 'students') return [
      { key: 'name', label: 'שם התלמיד', type: 'text', required: true, col: true },
      { key: 'grade', label: 'כיתה', type: 'select', options: U.GRADES, col: true },
      { key: 'phone', label: 'טלפון', type: 'text', col: true },
      { key: 'active', label: 'פעיל', type: 'bool', col: true, def: true },
      { key: 'notes', label: 'הערות', type: 'text' }
    ];
    if (coll === 'sites') return [
      { key: 'name', label: 'שם העסק/אתר', type: 'text', required: true, col: true },
      { key: 'location', label: 'מיקום', type: 'text', col: true },
      { key: 'contactName', label: 'איש קשר', type: 'text', col: true },
      { key: 'phone', label: 'טלפון', type: 'text', col: true },
      { key: 'email', label: 'אימייל', type: 'text' },
      { key: 'hourlyRate', label: 'תשלום שעתי (₪)', type: 'number', col: true },
      { key: 'travelPay', label: 'תשלום נסיעות (₪)', type: 'number', col: true },
      { key: 'defaultHours', label: 'שעות ברירת מחדל', type: 'number', def: 8 },
      { key: 'access', label: 'דרך הגעה', type: 'text' },
      { key: 'active', label: 'פעיל', type: 'bool', def: true },
      { key: 'notes', label: 'הערות', type: 'text' }
    ];
    if (coll === 'staff') return [
      { key: 'name', label: 'שם', type: 'text', required: true, col: true },
      { key: 'role', label: 'תפקיד', type: 'select', options: ['איש צוות', 'ראש צוות'],
        values: ['staff', 'leader'], col: true, def: 'staff' },
      { key: 'phone', label: 'טלפון', type: 'text', col: true },
      { key: 'homeroom', label: 'מחנך', type: 'bool', col: true, def: false },
      { key: 'active', label: 'פעיל', type: 'bool', col: true, def: true }
    ];
    if (coll === 'transports') return [
      { key: 'name', label: 'שם הסעה', type: 'text', required: true, col: true },
      { key: 'capacity', label: 'קיבולת', type: 'number', col: true },
      { key: 'active', label: 'פעיל', type: 'bool', col: true, def: true }
    ];
    return [];
  }

  function collTitle(c) {
    return { students: 'תלמידים', sites: 'אתרים / לקוחות', staff: 'אנשי צוות', transports: 'הסעות', teams: 'צוותים' }[c];
  }

  function displayVal(def, item) {
    var v = item[def.key];
    if (def.type === 'bool') return v === false ? 'לא' : 'כן';
    if (def.key === 'role') {
      return v === 'leader' ? 'ראש צוות' : 'איש צוות';
    }
    if (def.type === 'number') return (v == null || v === '') ? '' : v;
    return v == null ? '' : v;
  }

  function render(root) {
    var data = Store.get();

    var isTeams = sub === 'teams';
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'נתוני בסיס' }),
      U.el('div', { class: 'spacer' }),
      (!isTeams && sub === 'students') ? U.el('button', { class: 'btn secondary', onclick: mergeDuplicateStudents }, '🧹 איחוד כפילויות') : null,
      isTeams ? null : U.el('button', { class: 'btn accent', onclick: openImport }, '⬆ ייבוא מאקסל'),
      isTeams ? null : U.el('button', { class: 'btn', onclick: function () { openForm(null); } }, '+ הוספה')
    ]);

    var tabs = U.el('div', { class: 'subtabs' },
      ['students', 'sites', 'staff', 'transports', 'teams'].map(function (c) {
        var count = c === 'teams' ? (data.teams ? data.teams.length : 0) : (data[c] ? data[c].length : 0);
        return U.el('button', {
          class: sub === c ? 'active' : '',
          onclick: function () { sub = c; App.render(); }
        }, collTitle(c) + ' (' + count + ')');
      })
    );

    root.appendChild(head);
    root.appendChild(tabs);
    if (isTeams) {
      if (global.TeamsView && global.TeamsView.render) global.TeamsView.render(root);
      else root.appendChild(U.el('div', { class: 'card empty' }, 'מסך הצוותים אינו זמין.'));
    } else {
      root.appendChild(buildTable());
    }
  }

  function buildTable() {
    var data = Store.get();
    var defs = fieldDefs(sub).filter(function (d) { return d.col; });
    var rows = data[sub] || [];

    if (!rows.length) {
      return U.el('div', { class: 'card empty' },
        'אין עדיין רשומות. לחצו "הוספה" או "ייבוא מאקסל".');
    }

    var thead = U.el('tr', null,
      defs.map(function (d) { return U.el('th', { text: d.label }); })
        .concat([U.el('th', { text: '' })]));

    var tbody = rows.map(function (item) {
      var tds = defs.map(function (d) {
        return U.el('td', { text: displayVal(d, item) });
      });
      tds.push(U.el('td', { class: 'actions' }, [
        U.el('button', { class: 'btn small secondary', onclick: function () { openForm(item); } }, 'עריכה'),
        U.el('button', { class: 'btn small danger', onclick: function () { del(item); } }, 'מחיקה')
      ]));
      return U.el('tr', null, tds);
    });

    return U.el('table', { class: 'grid' }, [U.el('thead', null, [thead]), U.el('tbody', null, tbody)]);
  }

  function del(item) {
    if (!confirm('למחוק את "' + item.name + '"?')) return;
    Store.remove(sub, item.id);
    App.render();
  }

  function openForm(item) {
    var defs = fieldDefs(sub);
    var editing = !!item;
    var model = {};
    defs.forEach(function (d) {
      model[d.key] = item ? item[d.key] : (d.def !== undefined ? d.def : (d.type === 'bool' ? true : ''));
    });
    if (editing) model.id = item.id;

    var inputs = {};
    var body = U.el('div', null, defs.map(function (d) {
      var input;
      if (d.type === 'select') {
        var opts = d.options.map(function (o, i) {
          var val = d.values ? d.values[i] : o;
          return U.el('option', { value: val }, o);
        });
        input = U.el('select', null, opts);
        input.value = model[d.key] || (d.values ? d.values[0] : d.options[0]);
      } else if (d.type === 'bool') {
        input = U.el('input', { type: 'checkbox', checked: model[d.key] !== false });
      } else {
        input = U.el('input', { type: d.type === 'number' ? 'number' : 'text', value: model[d.key] == null ? '' : model[d.key] });
      }
      inputs[d.key] = input;
      return U.el('div', { class: 'field' }, [U.el('label', { text: d.label + (d.required ? ' *' : '') }), input]);
    }));

    Modal.open((editing ? 'עריכת' : 'הוספת') + ' ' + collTitle(sub), body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', class: '', onClick: function (close) {
        // בעריכה — שומרים על שדות קיימים שאינם בטופס (כמו defaultTransportId) כדי לא לאבד אותם
        var out = {};
        if (editing) { for (var key in item) { if (Object.prototype.hasOwnProperty.call(item, key)) out[key] = item[key]; } out.id = model.id; }
        var ok = true;
        defs.forEach(function (d) {
          var inp = inputs[d.key];
          var v = d.type === 'bool' ? inp.checked : inp.value;
          if (d.type === 'number') v = v === '' ? '' : U.num(v);
          if (d.required && (v === '' || v == null)) ok = false;
          out[d.key] = v;
        });
        if (!ok) { alert('נא למלא את שדות החובה'); return; }
        Store.upsert(sub, out);
        close();
        App.render();
      } }
    ]);
  }

  // ---------- ייבוא מאקסל ----------
  function openImport() {
    if (global.ImportExcel) global.ImportExcel.openDialog(sub);
  }

  // ---------- איחוד תלמידים כפולים (אחרי ייבוא שיצר כפילויות) ----------
  function mergeDuplicateStudents() {
    var data = Store.get();
    var students = data.students || [];
    // מי מוזכר בצוותים/בימים — אותו נשמר (כדי לא לשבור שיבוצים)
    var refed = {};
    (data.teams || []).forEach(function (t) {
      if (t.leaderStudentId) refed[t.leaderStudentId] = true;
      (t.memberIds || []).forEach(function (id) { refed[id] = true; });
    });
    Object.keys(data.days || {}).forEach(function (iso) {
      (data.days[iso].cards || []).forEach(function (c) {
        (c.students || []).forEach(function (s) { refed[s.studentId] = true; });
      });
    });
    // מפתח לפי קבוצת מילות השם (מתעלם מסדר שם פרטי/משפחה)
    function key(n) { return String(n || '').replace(/["'״׳.\-]/g, '').split(/\s+/).filter(Boolean).sort().join(' '); }
    var groups = {};
    students.forEach(function (st) { var k = key(st.name); if (k) (groups[k] = groups[k] || []).push(st); });
    var removeIds = {}, mergedGroups = 0;
    Object.keys(groups).forEach(function (k) {
      var grp = groups[k];
      if (grp.length < 2) return;
      var primary = null;
      grp.forEach(function (s) { if (!primary && refed[s.id]) primary = s; });
      if (!primary) primary = grp[0];
      grp.forEach(function (s) {
        if (s === primary) return;
        if (!primary.phone && s.phone) primary.phone = s.phone;
        if (!primary.grade && s.grade) primary.grade = s.grade;
        removeIds[s.id] = true;
      });
      mergedGroups++;
    });
    var n = Object.keys(removeIds).length;
    if (!n) { alert('לא נמצאו כפילויות לפי שם.'); return; }
    if (!confirm('נמצאו ' + mergedGroups + ' שמות עם כפילות (' + n + ' רשומות עודפות).\nלאחד — לשמור רשומה אחת לכל שם (כולל הטלפון) ולמחוק את העודפות?')) return;
    data.students = students.filter(function (s) { return !removeIds[s.id]; });
    Store.save();
    alert('בוצע: אוחדו ' + mergedGroups + ' שמות · הוסרו ' + n + ' כפילויות.');
    App.render();
  }

  global.BaseView = { render: render };
})(window);
