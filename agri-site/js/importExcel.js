/* importExcel.js — ייבוא נתונים מקבצי אקסל (SheetJS) */
(function (global) {
  'use strict';
  var U = global.U;

  // ---------- זיהוי כיתה מתוך שם ----------
  // מחזיר { name, grade } כאשר grade ∈ U.GRADES או ''.
  function parseNameGrade(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    // ניקוי תווי פתיחה כמו "(" או "-"
    s = s.replace(/^[\-\(\)\s]+/, '').trim();
    var grade = '';
    // דפוסים: "שם - י"א", "שם יא", "שם - ט'", "שם ט", וכו'.
    // חובה מפריד (רווח/מקף) לפני הציון — כדי לא לחתוך שם שמסתיים באות ציון (כמו "גרינהוט").
    var m = s.match(/[\s\-–]+(י["'״]?[אב]|ט|י)\s*[׳'"]?\s*$/);
    if (m) {
      var g = m[1].replace(/["'״׳]/g, '');
      if (g === 'יא' || g === 'יב' || g === 'ט' || g === 'י') {
        grade = g;
        s = s.slice(0, m.index).trim();
        s = s.replace(/[\-–\s]+$/, '').trim();
      }
    }
    if (!s) return null;
    return { name: s, grade: grade };
  }

  function openDialog(targetColl) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
          showImportUI(wb, targetColl);
        } catch (e) {
          alert('שגיאה בקריאת הקובץ: ' + e.message);
        }
      };
      reader.readAsArrayBuffer(file);
    });
    input.click();
  }

  function collLabel(c) {
    return { students: 'תלמידים', sites: 'אתרים/לקוחות', staff: 'אנשי צוות', transports: 'הסעות' }[c];
  }

  function showImportUI(wb, coll) {
    var body = U.el('div');
    var modeWrap = U.el('div', { class: 'field' });
    var modeText = U.el('label', { text: 'שיטת ייבוא' });
    var modeSel = U.el('select', null, [
      U.el('option', { value: 'free' }, 'איסוף שמות מכל הגיליון (מומלץ לרשימות "מבולגנות")'),
      U.el('option', { value: 'table' }, 'טבלה עם כותרות עמודות')
    ]);
    modeWrap.appendChild(modeText); modeWrap.appendChild(modeSel);

    var sheetWrap = U.el('div', { class: 'field' });
    var sheetSel = U.el('select', null, wb.SheetNames.map(function (n) {
      return U.el('option', { value: n }, n);
    }));
    sheetWrap.appendChild(U.el('label', { text: 'גיליון' }));
    sheetWrap.appendChild(sheetSel);

    var content = U.el('div');

    body.appendChild(U.el('p', { class: 'muted', text: 'ייבוא אל: ' + collLabel(coll) }));
    body.appendChild(modeWrap);
    body.appendChild(sheetWrap);
    body.appendChild(content);

    function refresh() {
      U.clear(content);
      var ws = wb.Sheets[sheetSel.value];
      if (modeSel.value === 'free') buildFreeMode(content, ws, coll);
      else buildTableMode(content, ws, coll);
    }
    modeSel.addEventListener('change', function () {
      // free עובד על כל הגיליונות; table — על אחד
      refresh();
    });
    sheetSel.addEventListener('change', refresh);
    refresh();

    Modal.open('ייבוא מאקסל', body, [{ label: 'סגירה', class: 'secondary' }]);
  }

  // ---------- מצב "איסוף שמות חופשי" ----------
  function buildFreeMode(content, ws, coll) {
    // אוסף את כל תאי הטקסט מהגיליון הנבחר
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    var seen = {};
    var items = [];
    rows.forEach(function (r) {
      (r || []).forEach(function (cell) {
        var s = String(cell == null ? '' : cell).trim();
        if (!s || s.length < 2) return;
        if (/^\d+([.,]\d+)?$/.test(s)) return; // מספרים בלבד
        if (isHeaderWord(s)) return;
        var parsed = (coll === 'students') ? parseNameGrade(s) : { name: s, grade: '' };
        if (!parsed) return;
        var key = parsed.name + '|' + parsed.grade;
        if (seen[key]) return;
        seen[key] = true;
        items.push(parsed);
      });
    });

    if (!items.length) {
      content.appendChild(U.el('p', { class: 'muted', text: 'לא נמצאו ערכים בגיליון זה.' }));
      return;
    }

    content.appendChild(U.el('p', { class: 'muted',
      text: 'נמצאו ' + items.length + ' ערכים. סמנו את אלו לייבוא (כפילויות עם הקיים יסוננו):' }));

    var listBox = U.el('div', { style: 'max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px;' });
    var checks = [];
    items.forEach(function (it, i) {
      var cb = U.el('input', { type: 'checkbox', checked: true });
      checks.push({ cb: cb, item: it });
      var gradeSel = null;
      var line = [cb, ' ', U.el('span', { text: it.name })];
      if (coll === 'students') {
        gradeSel = U.el('select', { style: 'margin-inline-start:8px;padding:2px 6px;' },
          [''].concat(U.GRADES).map(function (g) {
            return U.el('option', { value: g }, g || '(ללא כיתה)');
          }));
        gradeSel.value = it.grade || '';
        checks[checks.length - 1].gradeSel = gradeSel;
        line.push(gradeSel);
      }
      listBox.appendChild(U.el('div', { style: 'padding:3px 0;display:flex;align-items:center;' }, line));
    });
    content.appendChild(listBox);

    var bar = U.el('div', { class: 'row', style: 'margin-top:10px;' }, [
      U.el('button', { class: 'btn secondary small', onclick: function () { checks.forEach(function (c) { c.cb.checked = true; }); } }, 'סמן הכל'),
      U.el('button', { class: 'btn secondary small', onclick: function () { checks.forEach(function (c) { c.cb.checked = false; }); } }, 'נקה הכל'),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn', onclick: function () { doImportFree(checks, coll); } }, '✓ ייבא מסומנים')
    ]);
    content.appendChild(bar);
  }

  function doImportFree(checks, coll) {
    var data = Store.get();
    var existing = {};
    (data[coll] || []).forEach(function (x) { existing[normName(x.name)] = true; });
    var added = 0;
    checks.forEach(function (c) {
      if (!c.cb.checked) return;
      var name = c.item.name;
      if (existing[normName(name)]) return;
      existing[normName(name)] = true;
      var rec = { name: name, active: true };
      if (coll === 'students') rec.grade = c.gradeSel ? c.gradeSel.value : '';
      if (coll === 'staff') rec.role = 'staff';
      Store.upsert(coll, rec);
      added++;
    });
    alert('יובאו ' + added + ' רשומות חדשות.');
    App.render();
    // סגירת המודאל
    var bg = U.$('.modal-bg'); if (bg) bg.parentNode.removeChild(bg);
  }

  // ---------- מצב "טבלה עם כותרות" ----------
  function buildTableMode(content, ws, coll) {
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    if (!rows.length) { content.appendChild(U.el('p', { class: 'muted', text: 'הגיליון ריק.' })); return; }

    // בחירת שורת כותרות
    var headerRowWrap = U.el('div', { class: 'field' });
    var headerSel = U.el('select', null, rows.slice(0, Math.min(rows.length, 15)).map(function (r, i) {
      return U.el('option', { value: i }, 'שורה ' + (i + 1) + ': ' + (r || []).slice(0, 4).join(' | '));
    }));
    headerRowWrap.appendChild(U.el('label', { text: 'שורת הכותרות' }));
    headerRowWrap.appendChild(headerSel);
    content.appendChild(headerRowWrap);

    var mapWrap = U.el('div');
    content.appendChild(mapWrap);

    function targetFields() {
      if (coll === 'students') return [['name', 'שם *'], ['grade', 'כיתה'], ['phone', 'טלפון'], ['notes', 'הערות']];
      if (coll === 'sites') return [['name', 'שם העסק *'], ['location', 'מיקום'], ['contactName', 'איש קשר'], ['phone', 'טלפון'], ['email', 'אימייל'], ['hourlyRate', 'תשלום שעתי'], ['travelPay', 'תשלום נסיעות']];
      if (coll === 'staff') return [['name', 'שם *'], ['phone', 'טלפון']];
      return [['name', 'שם *'], ['capacity', 'קיבולת']];
    }

    function rebuildMap() {
      U.clear(mapWrap);
      var hr = parseInt(headerSel.value, 10);
      var headers = rows[hr] || [];
      var selects = {};
      targetFields().forEach(function (tf) {
        var opts = [U.el('option', { value: '' }, '(דלג)')].concat(headers.map(function (h, i) {
          return U.el('option', { value: i }, (h == null || h === '' ? 'עמודה ' + (i + 1) : h));
        }));
        var sel = U.el('select', null, opts);
        // ניסיון התאמה אוטומטית לפי שם הכותרת
        headers.forEach(function (h, i) {
          if (autoMatch(tf[0], String(h || ''))) sel.value = i;
        });
        selects[tf[0]] = sel;
        mapWrap.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: tf[1] }), sel]));
      });

      var updChk = U.el('input', { type: 'checkbox', checked: true });
      mapWrap.appendChild(U.el('label', { class: 'field', style: 'display:flex;align-items:center;gap:6px;' },
        [updChk, U.el('span', { text: 'עדכן רשומות קיימות (התאמה לפי שם) — נדרש להוספת טלפונים לתלמידים קיימים' })]));
      var btn = U.el('button', { class: 'btn', onclick: function () {
        doImportTable(rows, hr, selects, coll, updChk.checked);
      } }, '✓ ייבא טבלה');
      mapWrap.appendChild(btn);
    }
    headerSel.addEventListener('change', rebuildMap);
    rebuildMap();
  }

  // נרמול שכבה לערכים הנתמכים (ט1/ט2 → ט וכו')
  function baseGrade(v) {
    v = String(v == null ? '' : v).trim();
    if (v.indexOf('יא') === 0) return 'יא';
    if (v.indexOf('יב') === 0) return 'יב';
    if (v.charAt(0) === 'ט') return 'ט';
    if (v.charAt(0) === 'י') return 'י';
    return v;
  }
  function doImportTable(rows, headerRow, selects, coll, updateExisting) {
    var data = Store.get();
    var byName = {};
    (data[coll] || []).forEach(function (x) { byName[normName(x.name)] = x; });
    var added = 0, updated = 0;
    for (var r = headerRow + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var nameIdx = selects.name.value;
      if (nameIdx === '') continue;
      var name = String(row[parseInt(nameIdx, 10)] == null ? '' : row[parseInt(nameIdx, 10)]).trim();
      if (!name) continue;
      var existRec = byName[normName(name)];
      if (existRec && !updateExisting) continue;
      var rec = existRec ? Object.assign({}, existRec) : { name: name, active: true };
      rec.name = name;
      for (var key in selects) {
        if (key === 'name') continue;
        var idx = selects[key].value;
        if (idx === '') continue;
        var val = row[parseInt(idx, 10)];
        if (val == null || val === '') continue;
        if (key === 'hourlyRate' || key === 'travelPay' || key === 'capacity') val = U.num(val);
        else if (key === 'grade' && coll === 'students') val = baseGrade(val);
        else if (key === 'phone') val = String(val).trim();
        rec[key] = val;
      }
      if (coll === 'staff' && !rec.role) rec.role = 'staff';
      Store.upsert(coll, rec);
      if (existRec) { updated++; } else { byName[normName(name)] = rec; added++; }
    }
    alert('יובאו ' + added + ' חדשים · עודכנו ' + updated + ' קיימים.');
    App.render();
    var bg = U.$('.modal-bg'); if (bg) bg.parentNode.removeChild(bg);
  }

  // ---------- עזרים ----------
  function normName(s) { return String(s || '').replace(/[\s"'״׳.\-]/g, '').trim(); }

  var HEADER_WORDS = ['עבודה', 'מיקום', 'איש קשר', 'דרך הגעה', 'איש צוות', 'ראש צוות',
    'תורנים', 'תלמידים', 'סה"כ הגיעו', 'סה"כ יצאו לעבודה', 'תאריך', 'סידור עבודה',
    'שם עסקי', 'טלפון', 'שעות עבודה', 'תשלום שעתי', 'תשלום עבודה', 'תשלום נסיעות',
    'סה"כ לתשלום', 'פירוט', 'כמות עובדים', 'מס\' שעות', 'סה"כ שעות עבודה', 'נסיעות', 'שם'];
  function isHeaderWord(s) {
    var t = s.replace(/[:\s]+$/, '').trim();
    return HEADER_WORDS.indexOf(t) !== -1;
  }

  function autoMatch(field, header) {
    header = header.toLowerCase();
    var map = {
      name: ['שם', 'תלמיד', 'עסק'],
      grade: ['כיתה'],
      location: ['מיקום'],
      contactName: ['איש קשר', 'קשר'],
      phone: ['טלפון', 'נייד'],
      email: ['מייל', 'אימייל', 'mail'],
      hourlyRate: ['שעתי', 'תעריף'],
      travelPay: ['נסיע'],
      capacity: ['קיבול', 'מקומות'],
      notes: ['הער']
    };
    var keys = map[field] || [];
    return keys.some(function (k) { return header.indexOf(k.toLowerCase()) !== -1; });
  }

  global.ImportExcel = { openDialog: openDialog, parseNameGrade: parseNameGrade };
})(window);
