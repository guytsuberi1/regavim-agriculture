/* kitchen.js — מסך "תורני מטבח" למנהל המטבח: מילוי weeklyDuty לשבוע (ללא מצב שטח) */
(function (global) {
  'use strict';
  var U = global.U;
  var kWeek = U.startOfWeek(U.todayISO());

  // שנת הלימודים (משרד החינוך): 1.9 עד 31.8 — יחסית לשבוע המוצג
  function schoolYearRange(wk) {
    var d0 = U.fromISO(wk);
    var y = d0.getFullYear() - (d0.getMonth() < 8 ? 1 : 0);
    return { s: y + '-09-01', e: (y + 1) + '-08-31' };
  }

  // תורנות חלקית (חג/היעדרות) — נספרת חצי; { wk: [studentIds] }
  function partialSet(wk) { return ((Store.get().dutyPartial || {})[wk]) || []; }
  function isPartial(wk, id) { return partialSet(wk).indexOf(id) !== -1; }
  function togglePartial(wk, id) {
    var d = Store.get();
    if (!d.dutyPartial) d.dutyPartial = {};
    var arr = d.dutyPartial[wk] || [];
    var i = arr.indexOf(id);
    if (i === -1) arr.push(id); else arr.splice(i, 1);
    if (arr.length) d.dutyPartial[wk] = arr; else delete d.dutyPartial[wk];
    Store.save(); App.render();
  }

  // ספירת תורנויות לכל תלמיד — רק בשנת הלימודים הנוכחית; שבוע חלקי = 0.5
  function dutyCounts(excludeWk) {
    var wd = Store.get().weeklyDuty || {}, m = {};
    var yr = schoolYearRange(kWeek);
    Object.keys(wd).forEach(function (wk) {
      if (wk === excludeWk) return;
      if (wk < yr.s || wk > yr.e) return; // מחוץ לשנת הלימודים — לא נספר
      (wd[wk] || []).forEach(function (id) { m[id] = (m[id] || 0) + (isPartial(wk, id) ? 0.5 : 1); });
    });
    return m;
  }

  function studentLabel(s) {
    return s.name + (s.className || s.grade ? ' (' + (s.className || s.grade) + ')' : '');
  }

  // ---------- שיבוץ אוטומטי לפי הקריטריונים של מנהל המטבח ----------
  // עדיפות 1: מי שעוד לא עשה תורנות · עדיפות 2: אחד מ-ט, אחד מ-י, אחד מ-יא/יב · עדיפות 3: כיסוי דירוגים 1-3
  function gradeSlot(s) {
    if (s.grade === 'ט') return 0;
    if (s.grade === 'י') return 1;
    if (s.grade === 'יא' || s.grade === 'יב') return 2;
    return -1;
  }
  function kRating(s) { var r = U.num(s.kitchenRating); return (r >= 1 && r <= 3) ? r : 0; }

  function autoAssignDuty() {
    var d = Store.get();
    if (!d.weeklyDuty) d.weeklyDuty = {};

    function run() {
      var counts = dutyCounts(kWeek);
      var groups = [[], [], []]; // ט / י / יא-יב
      (d.students || []).forEach(function (s) {
        if (s.active === false) return;
        var g = gradeSlot(s);
        if (g >= 0) groups[g].push(s);
      });
      var slotNames = ['ט', 'י', 'יא/יב'];
      var missing = slotNames.filter(function (nm, i) { return !groups[i].length; });
      if (missing.length === 3) { U.toast('אין תלמידים פעילים עם שכבה — עדכנו כיתות בנתוני הבסיס.', 'error'); return; }

      // בכל שכבה: קודם מי שעשה הכי מעט תורנויות (0 = ראשונים)
      groups.forEach(function (arr) {
        arr.sort(function (a, b) {
          var ca = counts[a.id] || 0, cb = counts[b.id] || 0;
          if (ca !== cb) return ca - cb;
          return (a.name || '').localeCompare(b.name || '', 'he');
        });
      });

      // בחינת כל הצירופים מתוך המובילים בכל שכבה, לפי סדר העדיפויות:
      // (1) כמה מהנבחרים כבר עשו תורנות — מינימום · (2) סך תורנויות — מינימום · (3) כיסוי דירוגים שונים — מקסימום
      var K = 8;
      var pool = groups.map(function (arr) { return arr.slice(0, K); });
      var opts = pool.map(function (arr) { return arr.length ? arr : [null]; });
      var best = null;
      function score(trio) {
        var did = 0, sum = 0, cover = {};
        trio.forEach(function (s) {
          var c = counts[s.id] || 0;
          if (c > 0) did++;
          sum += c;
          var r = kRating(s);
          if (r) cover[r] = 1;
        });
        return [did, sum, -Object.keys(cover).length];
      }
      function better(a, b) {
        for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i]; }
        return false;
      }
      opts[0].forEach(function (a) {
        opts[1].forEach(function (b) {
          opts[2].forEach(function (c) {
            var trio = [a, b, c].filter(Boolean);
            if (!trio.length) return;
            var sc = score(trio);
            if (!best || better(sc, best.sc)) best = { sc: sc, trio: trio };
          });
        });
      });
      if (!best) { U.toast('לא נמצאו מועמדים לשיבוץ.', 'info'); return; }

      d.weeklyDuty[kWeek] = best.trio.map(function (s) { return s.id; });
      Store.save(); App.render();

      var names = best.trio.map(function (s) { return s.name; }).join(', ');
      var notes = [];
      if (missing.length) notes.push('⚠ אין תלמידים בשכבת ' + missing.join(' ו-'));
      var covered = -best.sc[2];
      var ratedAll = (d.students || []).some(function (s) { return kRating(s) > 0; });
      if (ratedAll && covered < Math.min(3, best.trio.length)) notes.push('לא נמצא כיסוי מלא של דירוגים 1-3');
      U.toast('שובצו לתורנות: ' + names + (notes.length ? ' · ' + notes.join(' · ') : ''), notes.length ? 'info' : 'success');
    }

    // אם כבר יש תורנים לשבוע — מאשרים החלפה
    var cur = d.weeklyDuty[kWeek] || [];
    if (cur.length) {
      Modal.confirm({ title: 'שיבוץ אוטומטי', text: 'כבר משובצים ' + cur.length + ' תורנים לשבוע זה.\nלהחליף אותם בשיבוץ האוטומטי?', okLabel: 'החלף' }, run);
    } else run();
  }

  // ---------- שליחת השיבוץ: שלב 1 אישור מחנכים → שלב 2 שליחה לתורנים ----------
  function waNum(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.indexOf('972') === 0) return d;
    if (d.charAt(0) === '0') return '972' + d.slice(1);
    if (d.length === 9) return '972' + d;
    return d;
  }
  function smsNum(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.indexOf('972') === 0) d = '0' + d.slice(3);
    if (d.length === 9 && d.charAt(0) !== '0') d = '0' + d;
    return d.length >= 9 ? d : null;
  }
  function waBtn(phone, text, title) {
    var n = waNum(phone);
    return U.el('a', {
      class: 'btn small ico no-print', target: '_blank', rel: 'noopener',
      style: 'background:#25D366;color:#fff;border:0;',
      title: title + (n ? '' : ' (אין מספר — בחרו נמען ידנית)'),
      href: (n ? 'https://wa.me/' + n : 'https://wa.me/') + '?text=' + encodeURIComponent(text),
      html: U.WA_SVG
    });
  }
  function smsAllBtn(label, people, msgFn) {
    var b = U.el('button', { class: 'btn small secondary' }, label);
    b.addEventListener('click', function () {
      var messages = [], missing = [];
      people.forEach(function (p) {
        var ph = smsNum(p.phone);
        if (ph) messages.push({ phone: ph, text: msgFn(p) }); else missing.push(p.name);
      });
      if (!messages.length) { U.toast('לאף נמען אין מספר טלפון.', 'error'); return; }
      b.disabled = true;
      Store.sendSms(messages).then(function (res) {
        b.disabled = false;
        var n = res.sent != null ? res.sent : messages.length;
        U.toast('נשלחו ' + n + ' הודעות SMS' + (missing.length ? ' · ללא טלפון: ' + missing.join(', ') : ''), missing.length ? 'info' : 'success');
      }).catch(function (e) {
        b.disabled = false;
        U.toast('שגיאה בשליחה: ' + ((e && e.message) ? e.message : e), 'error');
      });
    });
    return b;
  }

  function openSendDuty() {
    var d = Store.get();
    var ids = (d.weeklyDuty && d.weeklyDuty[kWeek]) || [];
    var duty = ids.map(function (id) { return Store.getById('students', id); }).filter(Boolean);
    if (!duty.length) { U.toast('אין תורנים משובצים לשבוע המוצג — שבצו קודם.', 'info'); return; }
    var range = U.gregLabel(kWeek) + ' – ' + U.gregLabel(U.addDays(kWeek, 5));

    // שלב 1 — המחנכים: קיבוץ התורנים לפי כיתה ומציאת המחנך של כל כיתה
    var byClass = {};
    duty.forEach(function (s) {
      var c = String(s.className || s.grade || '').trim() || 'ללא כיתה';
      (byClass[c] = byClass[c] || []).push(s);
    });
    var staff = (d.staff || []).filter(function (p) { return p.active !== false; });
    var teachers = [], missingTeachers = [];
    var rowsA = Object.keys(byClass).sort().map(function (cls) {
      var names = byClass[cls].map(function (s) { return s.name; }).join(', ');
      var t = staff.filter(function (p) { return String(p.homeroomClass || '').trim() === cls; })[0] || null;
      if (t) teachers.push({ name: t.name, phone: t.phone, cls: cls, names: names });
      else missingTeachers.push(cls);
      var msg = 'שלום ' + (t ? t.name : '') + ', תורני המטבח מכיתה ' + cls + ' לשבוע ' + range + ': ' + names +
        '.\nנא לאשר שאין מניעה לשבצם. תודה, מטבח רגבים בנימין';
      return U.el('div', { class: 'send-row' }, [
        U.el('span', { style: 'flex:1;' }, [
          U.el('b', { text: 'כיתה ' + cls + ': ' }),
          U.el('span', { text: names }),
          U.el('span', { class: 'muted', style: 'font-size:12px;', text: t ? ' · מחנך: ' + t.name : '' })
        ]),
        t ? waBtn(t.phone, msg, 'וואטסאפ למחנך ' + t.name)
          : U.el('span', { class: 'sc-warn', text: '⚠ לא הוגדר מחנך לכיתה (נתוני בסיס ← אנשי צוות ← כיתת מחנך)' })
      ]);
    });
    function teacherMsg(t) {
      return 'שלום ' + t.name + ', תורני המטבח מכיתה ' + t.cls + ' לשבוע ' + range + ': ' + t.names +
        '.\nנא לאשר שאין מניעה לשבצם. תודה, מטבח רגבים בנימין';
    }

    // שלב 2 — התורנים עצמם
    function studentMsg(s) {
      return 'שלום ' + s.name + ', שובצת לתורנות מטבח בשבוע ' + range + '. תודה, רגבים בנימין';
    }
    var rowsB = duty.map(function (s) {
      return U.el('div', { class: 'send-row' }, [
        U.el('span', { style: 'flex:1;', text: s.name + (s.className || s.grade ? ' (' + (s.className || s.grade) + ')' : '') }),
        waBtn(s.phone, studentMsg(s), 'וואטסאפ ל' + s.name)
      ]);
    });

    var body = U.el('div', null, [
      U.el('h3', { class: 'send-step', text: '1️⃣ אישור המחנכים' }),
      U.el('p', { class: 'muted', style: 'font-size:12.5px;margin:0 0 6px;', text: 'שלחו את הרשימה למחנכים, המתינו לאישורם — ורק אז עברו לשלב 2.' }),
      U.el('div', null, rowsA),
      teachers.length ? U.el('div', { style: 'margin-top:6px;' }, [smsAllBtn('📩 SMS לכל המחנכים', teachers, teacherMsg)]) : null,
      U.el('hr', { style: 'margin:14px 0;border:0;border-top:1px solid var(--border);' }),
      U.el('h3', { class: 'send-step', text: '2️⃣ שליחה לתורנים (אחרי אישור המחנכים)' }),
      U.el('div', null, rowsB),
      U.el('div', { style: 'margin-top:6px;' }, [smsAllBtn('📩 SMS לכל התורנים', duty, studentMsg)])
    ]);
    Modal.open('📤 שליחת שיבוץ תורנות · ' + range, body, [{ label: 'סגור', class: 'secondary' }]);
  }

  function render(root) {
    var d = Store.get();
    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '🍳 תורני מטבח' }),
      U.el('button', { class: 'btn secondary ico', title: 'שבוע קודם', onclick: function () { kWeek = U.addDays(kWeek, -7); App.render(); } }, '→'),
      U.dateChip(U.gregLabel(kWeek) + ' – ' + U.gregLabel(U.addDays(kWeek, 5)), null,
        { onClick: function () { kWeek = U.startOfWeek(U.todayISO()); App.render(); }, title: 'לחצו לחזרה לשבוע הנוכחי' }),
      U.el('button', { class: 'btn secondary ico', title: 'שבוע הבא', onclick: function () { kWeek = U.addDays(kWeek, 7); App.render(); } }, '←'),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn accent', title: 'שיבוץ אוטומטי: מי שטרם עשה תורנות · אחד מכל שכבה (ט/י/יא-יב) · כיסוי דירוגים 1-3', onclick: autoAssignDuty }, '🤖 שיבוץ אוטומטי'),
      U.el('button', { class: 'btn', title: 'שלב 1: אישור המחנכים · שלב 2: הודעה לתורנים (SMS/וואטסאפ)', onclick: openSendDuty }, '📤 שליחת השיבוץ')
    ]));

    var ids = (d.weeklyDuty && d.weeklyDuty[kWeek]) || [];
    var duty = ids.map(function (id) { return Store.getById('students', id); }).filter(Boolean);

    // תורנים כצ'יפים עם תג כיתה (כמו במאגר התלמידים בסידור)
    var chipsEl;
    if (duty.length) {
      chipsEl = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;' }, duty.map(function (s) {
        var gi = U.GRADES.indexOf(s.grade || '');
        var isP = isPartial(kWeek, s.id);
        var half = U.el('button', {
          class: 'chip-half' + (isP ? ' on' : ''),
          title: isP ? 'מסומן כתורנות חלקית (נספרת חצי) — לחצו לביטול' : 'סימון תורנות חלקית — חג / לא היה שבוע מלא (תיספר חצי)',
          onclick: function () { togglePartial(kWeek, s.id); }
        }, '½');
        return U.el('span', { class: 'chip' + (isP ? ' partial' : ''), style: 'cursor:default;' }, [
          (s.grade || s.className) ? U.el('span', { class: 'grade-badge gb' + (gi < 0 ? 'x' : gi), text: s.className || s.grade }) : null,
          U.el('span', { text: s.name }),
          kRating(s) ? U.el('span', { class: 'tag', title: 'דירוג מטבח (3 = גבוה)', text: '⭐'.repeat(kRating(s)) }) : null,
          isP ? U.el('span', { class: 'tag', style: 'background:#fef3c7;color:#92400e;', text: 'שבוע חלקי' }) : null,
          half
        ]);
      }));
    } else {
      chipsEl = U.el('div', { class: 'muted', style: 'margin:10px 0;', text: 'עדיין לא הוגדרו תורנים לשבוע זה.' });
    }

    root.appendChild(U.el('div', { class: 'card' }, [
      U.el('p', { class: 'muted', text: 'בחרו את תורני המטבח לשבוע זה. הם יורדים אוטומטית ממאגר העבודה החקלאית לכל השבוע.' }),
      duty.length ? U.el('div', { style: 'font-weight:600;', text: 'תורנים (' + duty.length + '):' }) : null,
      chipsEl,
      U.el('button', { class: 'btn', onclick: edit }, '✏️ עריכת תורני מטבח'),
      U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;', text: '🤖 השיבוץ האוטומטי בוחר לפי: 1) מי שטרם עשה תורנות · 2) אחד מכל שכבה (ט / י / יא-יב) · 3) אחד מכל דירוג (⭐ נמוך עד ⭐⭐⭐ גבוה, נקבע בחלון העריכה)' })
    ]));

    // ---- היסטוריית תורנויות (#22) ----
    var wd = d.weeklyDuty || {};
    var weeks = Object.keys(wd).filter(function (wk) { return (wd[wk] || []).length; }).sort().reverse().slice(0, 8);
    if (weeks.length) {
      var rows = weeks.map(function (wk) {
        var nm = (wd[wk] || []).map(function (id) {
          var s = Store.getById('students', id);
          return s ? s.name + (isPartial(wk, id) ? ' (½ שבוע חלקי)' : '') : null;
        }).filter(Boolean);
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
        // דירוג מטבח 1-3 (3 כוכבים = גבוה) — נערך כאן ומשמש את השיבוץ האוטומטי (אחד מכל דרגה)
        var rSel = U.el('select', { title: 'דירוג מטבח — 3 כוכבים = גבוה, כוכב אחד = נמוך', style: 'width:78px;padding:3px 4px;font-size:12.5px;' },
          [U.el('option', { value: '' }, '—')].concat([1, 2, 3].map(function (n) { return U.el('option', { value: String(n) }, '⭐'.repeat(n)); })));
        rSel.value = kRating(s) ? String(kRating(s)) : '';
        rSel.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
        rSel.addEventListener('change', function () {
          s.kitchenRating = rSel.value === '' ? '' : U.num(rSel.value);
          Store.save();
        });
        listBox.appendChild(U.el('label', { style: 'display:flex;gap:8px;align-items:center;font-weight:400;color:var(--text);padding:4px 0;' }, [
          cb,
          U.el('span', { style: 'flex:1;', text: studentLabel(s) }),
          rSel,
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
