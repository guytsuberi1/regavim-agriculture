/* base.js — מסך נתוני בסיס: תלמידים / אתרים-לקוחות / אנשי צוות / הסעות */
(function (global) {
  'use strict';
  var U = global.U;
  var sub = 'students';
  var showArchive = false; // הצגת רשומות בארכיון (active=false) במקום הפעילות
  var sortKey = null, sortDir = 1; // מיון הטבלה
  var searchTerm = ''; // חיפוש חופשי בטבלה

  // תג כיתה ברור (כמו בסידור היומי)
  function gradeBadge(g) {
    var i = U.GRADES.indexOf(g);
    return U.el('span', { class: 'grade-badge gb' + (i < 0 ? 'x' : i), title: 'כיתה ' + g, text: g });
  }
  function cmpVal(a, b, def) {
    var va = a[def.key], vb = b[def.key];
    if (def.key === 'grade') {
      var ga = U.GRADES.indexOf(va), gb = U.GRADES.indexOf(vb);
      return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb);
    }
    if (def.type === 'number') return U.num(va) - U.num(vb);
    if (def.type === 'bool') return (va === false ? 0 : 1) - (vb === false ? 0 : 1);
    return String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), 'he');
  }

  // גזירת שכבה (ט/י/יא/יב) מתוך כיתה (ט1 → ט). מחזיר '' אם אין התאמה.
  function deriveGrade(className) {
    var letters = String(className || '').replace(/[0-9\s\-'"׳״.]/g, '');
    return U.GRADES.indexOf(letters) !== -1 ? letters : '';
  }

  // הגדרת השדות לכל אוסף
  function fieldDefs(coll) {
    if (coll === 'students') return [
      { key: 'name', label: 'שם התלמיד', type: 'text', required: true, col: true },
      { key: 'className', label: 'כיתה', type: 'text', col: true, hint: 'לדוגמה: ט1 (השכבה נגזרת אוטומטית)' },
      { key: 'phone', label: 'טלפון', type: 'text', required: true, col: true },
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
      { key: 'phone', label: 'טלפון', type: 'text', required: true, col: true },
      { key: 'email', label: 'אימייל להתחברות', type: 'text', required: true, col: true },
      { key: 'homeroomClass', label: 'כיתת מחנך', type: 'text', col: true, hint: 'מלאו כיתה (ט1) רק אם הוא מחנך; ריק = אינו מחנך' },
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
    var headBtns = [U.el('h2', { text: 'נתוני בסיס' }), U.el('div', { class: 'spacer' })];
    if (!isTeams) {
      headBtns.push(U.el('button', { class: 'btn secondary ico', title: showArchive ? 'חזרה לפעילים' : 'ארכיון', onclick: function () { showArchive = !showArchive; App.render(); } }, showArchive ? '↩' : '📦'));
      if (!showArchive) {
        if (sub === 'students') headBtns.push(U.el('button', { class: 'btn secondary ico', title: 'איחוד כפילויות', onclick: mergeDuplicateStudents }, '🧹'));
        if (sub === 'students') headBtns.push(U.el('button', { class: 'btn secondary ico', title: 'מילוי כיתה לפי שכבה (ט→ט1)', onclick: fillClassFromGrade }, '🏷️'));
        headBtns.push(U.el('button', { class: 'btn secondary ico', title: 'אקסל לדוגמה', onclick: function () { if (global.ImportExcel) global.ImportExcel.downloadTemplate(sub); } }, '📄'));
        headBtns.push(U.el('button', { class: 'btn secondary ico', title: 'ייבוא מאקסל', onclick: openImport }, '📥'));
        headBtns.push(U.el('button', { class: 'btn', onclick: function () { openForm(null); } }, '+ הוספה'));
      }
    }
    var head = U.el('div', { class: 'page-head' }, headBtns);

    var tabs = U.el('div', { class: 'subtabs' },
      ['students', 'sites', 'staff', 'transports', 'teams'].map(function (c) {
        var count = c === 'teams' ? (data.teams ? data.teams.length : 0) : ((data[c] || []).filter(function (x) { return x.active !== false; }).length);
        return U.el('button', {
          class: sub === c ? 'active' : '',
          onclick: function () { sub = c; sortKey = null; searchTerm = ''; App.render(); }
        }, collTitle(c) + ' (' + count + ')');
      })
    );

    root.appendChild(head);
    root.appendChild(tabs);
    if (isTeams) {
      if (global.TeamsView && global.TeamsView.render) global.TeamsView.render(root);
      else root.appendChild(U.el('div', { class: 'card empty' }, 'מסך הצוותים אינו זמין.'));
    } else {
      var searchInp = U.el('input', { type: 'search', class: 'no-print', placeholder: '🔍 חיפוש...', value: searchTerm, style: 'margin:10px 0;max-width:300px;width:100%;' });
      searchInp.addEventListener('input', function () {
        searchTerm = searchInp.value; App.render();
        var el = U.$('input[type=search]'); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
      });
      root.appendChild(searchInp);
      root.appendChild(buildTable());
    }
  }

  function buildTable() {
    var data = Store.get();
    var defs = fieldDefs(sub).filter(function (d) { return d.col && d.key !== 'active'; });
    var allRows = (data[sub] || []).filter(function (it) { return showArchive ? it.active === false : it.active !== false; });
    var rows = allRows;
    if (searchTerm) {
      var q = searchTerm.toLowerCase();
      rows = allRows.filter(function (it) {
        return defs.some(function (d) { return String(it[d.key] == null ? '' : it[d.key]).toLowerCase().indexOf(q) !== -1; });
      });
    }
    var countNote = searchTerm
      ? U.el('div', { class: 'muted', style: 'font-size:12.5px;margin:-4px 0 8px;', text: 'נמצאו ' + rows.length + ' מתוך ' + allRows.length })
      : null;

    if (!rows.length) {
      return U.el('div', null, [
        countNote,
        U.el('div', { class: 'card empty' },
          searchTerm ? 'לא נמצאו תוצאות לחיפוש.' : (showArchive ? 'הארכיון ריק.' : 'אין עדיין רשומות. לחצו "הוספה" או "ייבוא מאקסל".'))
      ]);
    }

    var sdef = sortKey ? defs.filter(function (d) { return d.key === sortKey; })[0] : null;
    if (sdef) rows = rows.slice().sort(function (a, b) { return cmpVal(a, b, sdef) * sortDir; });

    var thead = U.el('tr', null,
      defs.map(function (d) {
        var arrow = sortKey === d.key ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
        var th = U.el('th', { class: 'sortable', title: 'מיון לפי ' + d.label, text: d.label + arrow });
        th.addEventListener('click', function () {
          if (sortKey === d.key) sortDir = -sortDir; else { sortKey = d.key; sortDir = 1; }
          App.render();
        });
        return th;
      }).concat([U.el('th', { text: '' })]));

    var tbody = rows.map(function (item) {
      var tds = defs.map(function (d) {
        if (d.key === 'grade' && item.grade) return U.el('td', null, [gradeBadge(item.grade)]);
        if (sub === 'students' && d.key === 'name') {
          return U.el('td', null, [U.el('button', { class: 'btn small secondary', style: 'font-weight:600;', title: 'כרטיס תלמיד', onclick: function () { openStudentCard(item); } }, item.name)]);
        }
        return U.el('td', { text: displayVal(d, item) });
      });
      tds.push(U.el('td', { class: 'actions' }, [
        U.el('button', { class: 'btn small secondary', title: 'עריכה', onclick: function () { openForm(item); } }, '✏️'),
        showArchive
          ? U.el('button', { class: 'btn small', title: 'שחזור מהארכיון', onclick: function () { restore(item); } }, '♻')
          : U.el('button', { class: 'btn small secondary', title: 'העברה לארכיון', onclick: function () { archive(item); } }, '📦')
      ]));
      return U.el('tr', null, tds);
    });

    return U.el('div', null, [countNote, U.el('table', { class: 'grid' }, [U.el('thead', null, [thead]), U.el('tbody', null, tbody)])]);
  }

  // העברה לארכיון / שחזור — שומר את כל המידע ההיסטורי (לא מוחק)
  function archive(item) {
    Modal.confirm({ title: 'העברה לארכיון', text: 'להעביר את "' + item.name + '" לארכיון?\nהמידע יישמר וניתן לשחזר בכל רגע.', okLabel: 'העבר לארכיון' }, function () {
      item.active = false; Store.save(); App.render();
      U.toast('"' + item.name + '" הועבר לארכיון');
    });
  }
  function restore(item) { item.active = true; Store.save(); App.render(); U.toast('"' + item.name + '" שוחזר מהארכיון'); }

  // מילוי חד-פעמי של "כיתה" לתלמידים קיימים לפי השכבה שלהם (ט→ט1). ממלא רק כיתות ריקות.
  function fillClassFromGrade() {
    var students = (Store.get().students || []);
    var targets = students.filter(function (s) {
      return s.active !== false && s.grade && !(s.className && String(s.className).trim());
    });
    if (!targets.length) { U.toast('אין תלמידים למילוי — לכולם כבר יש כיתה, או שאין להם שכבה.', 'info'); return; }
    Modal.confirm({ title: 'מילוי כיתה לפי שכבה', text: 'למלא כיתה ל-' + targets.length + ' תלמידים לפי השכבה שלהם?\n(ט→ט1, י→י1, יא→יא1, יב→יב1)\nניתן לשנות ידנית אחר כך (ט2 וכו\').', okLabel: 'מלא' }, function () {
      targets.forEach(function (s) { s.className = s.grade + '1'; });
      Store.save(); App.render();
      U.toast('מולאו ' + targets.length + ' כיתות — עדכנו ידנית את מי שבכיתה אחרת');
    });
  }

  // ---------- כרטיס תלמיד מהיר (#19) ----------
  function studentStats(id) {
    var days = Store.get().days || {}, work = 0, rSum = 0, rCnt = 0, lastSite = null, lastDate = null;
    Object.keys(days).sort().forEach(function (iso) {
      (days[iso].cards || []).forEach(function (c) {
        (c.students || []).forEach(function (s) {
          if (s.studentId === id && s.wentToWork) {
            work++; if (s.rating) { rSum += s.rating; rCnt++; }
            lastDate = iso; lastSite = c.siteId ? ((Store.getById('sites', c.siteId) || {}).name || '') : '';
          }
        });
      });
    });
    return { work: work, ratingAvg: rCnt ? (rSum / rCnt) : null, lastDate: lastDate, lastSite: lastSite };
  }
  function openStudentCard(stu) {
    var st = studentStats(stu.id);
    var team = global.TeamUtil ? global.TeamUtil.teamOfStudent(stu.id) : null;
    function row(label, val) {
      return U.el('div', { style: 'display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border);' },
        [U.el('span', { class: 'muted', text: label }), U.el('span', { style: 'font-weight:600;', text: val })]);
    }
    var body = U.el('div', null, [
      row('כיתה', stu.className || stu.grade || '—'),
      row('צוות', team ? global.TeamUtil.teamLabel(team) : 'ללא צוות'),
      row('טלפון', stu.phone || '—'),
      row('ימי עבודה (סה"כ)', String(st.work)),
      row('ציון ממוצע', st.ratingAvg == null ? '—' : st.ratingAvg.toFixed(1)),
      row('עבד לאחרונה', st.lastDate ? (U.gregLabel(st.lastDate) + (st.lastSite ? ' · ' + st.lastSite : '')) : '—')
    ]);
    Modal.open('כרטיס תלמיד — ' + stu.name, body, [
      { label: 'עריכה', class: 'secondary', onClick: function (close) { close(); openForm(stu); } },
      { label: 'סגור' }
    ]);
  }

  function openForm(item) {
    var defs = fieldDefs(sub);
    var editing = !!item;
    var model = {};
    defs.forEach(function (d) {
      model[d.key] = item ? item[d.key] : (d.def !== undefined ? d.def : (d.type === 'bool' ? true : ''));
    });
    if (editing) model.id = item.id;

    var inputs = {}, errEls = {};
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
      var err = null;
      if (d.required) {
        err = U.el('div', { class: 'field-err' });
        errEls[d.key] = err;
        // ולידציה חיה — הסימון האדום נעלם ברגע שממלאים
        input.addEventListener('input', function () {
          if (String(input.value || '').trim() !== '') { input.classList.remove('invalid'); err.textContent = ''; }
        });
      }
      return U.el('div', { class: 'field' }, [
        U.el('label', { text: d.label + (d.required ? ' *' : '') }), input,
        d.hint ? U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;', text: d.hint }) : null,
        err
      ]);
    }));

    Modal.open((editing ? 'עריכת' : 'הוספת') + ' ' + collTitle(sub), body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', class: '', onClick: function (close) {
        // בעריכה — שומרים על שדות קיימים שאינם בטופס (כמו defaultTransportId) כדי לא לאבד אותם
        var out = {};
        if (editing) { for (var key in item) { if (Object.prototype.hasOwnProperty.call(item, key)) out[key] = item[key]; } out.id = model.id; }
        var firstBad = null;
        defs.forEach(function (d) {
          var inp = inputs[d.key];
          var v = d.type === 'bool' ? inp.checked : inp.value;
          if (d.type === 'number') v = v === '' ? '' : U.num(v);
          var bad = d.required && (v === '' || v == null || String(v).trim() === '');
          if (d.required && errEls[d.key]) {
            inp.classList.toggle('invalid', bad);
            errEls[d.key].textContent = bad ? 'שדה חובה' : '';
          }
          if (bad && !firstBad) firstBad = inp;
          out[d.key] = v;
        });
        if (firstBad) { firstBad.focus(); return; }
        // גזירת שכבה מהכיתה (רק אם הוזנה כיתה) — כדי לתחזק שדה אחד בלבד
        if (sub === 'students') {
          var g = deriveGrade(out.className);
          if (g) out.grade = g;
        }
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
