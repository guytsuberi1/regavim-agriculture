/* settings.js — הגדרות וגיבוי (מוגן בסיסמה אופציונלית) */
(function (global) {
  'use strict';
  var U = global.U;
  var unlocked = false; // נפתח פעם אחת לכל טעינת דף

  function settingsPassword() {
    var d = Store.get();
    return (d.settings && d.settings.settingsPassword) ? String(d.settings.settingsPassword) : '';
  }

  function render(root) {
    var pwd = settingsPassword();
    if (pwd && !unlocked) { renderLock(root); return; }
    renderSettings(root);
  }

  // ---------- מסך נעילה ----------
  function renderLock(root) {
    root.appendChild(U.el('div', { class: 'page-head' }, [U.el('h2', { text: '⚙️ הגדרות וגיבוי' })]));
    var inp = U.el('input', { type: 'password', placeholder: 'סיסמה', autocomplete: 'off', style: 'width:100%;' });
    var err = U.el('div', { class: 'login-err', style: 'min-height:18px;' });
    function tryUnlock() {
      if (inp.value === settingsPassword()) { unlocked = true; App.render(); }
      else { err.textContent = 'סיסמה שגויה'; inp.value = ''; inp.focus(); }
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryUnlock(); });
    root.appendChild(U.el('div', { class: 'card', style: 'max-width:360px;margin-top:10px;' }, [
      U.el('h3', { style: 'margin-top:0;', text: '🔒 הגדרות מוגנות בסיסמה' }),
      U.el('p', { class: 'muted', text: 'הזינו את סיסמת ההגדרות כדי להמשיך.' }),
      U.el('div', { class: 'field' }, [inp]),
      err,
      U.el('button', { class: 'btn', style: 'width:100%;justify-content:center;', onclick: tryUnlock }, 'כניסה')
    ]));
    setTimeout(function () { inp.focus(); }, 50);
  }

  // ---------- תוכן ההגדרות ----------
  function renderSettings(root) {
    var data = Store.get();
    root.appendChild(U.el('div', { class: 'page-head' }, [U.el('h2', { text: '⚙️ הגדרות וגיבוי' })]));

    // ---- ניהול משתמשים (אדמין) ----
    if (global.UsersView && Store.isAdmin()) {
      var umBox = U.el('div', { class: 'card', style: 'margin-bottom:16px;' });
      global.UsersView.render(umBox);
      root.appendChild(umBox);
    }

    // ---- הגדרות כלליות ----
    var nameInp = U.el('input', { type: 'text', value: data.settings.schoolName || '', style: 'width:100%;' });
    nameInp.addEventListener('change', function () { data.settings.schoolName = nameInp.value; Store.save(); });
    var hoursInp = U.el('input', { type: 'number', step: '0.5', value: data.settings.defaultHours || 8, style: 'width:100%;' });
    hoursInp.addEventListener('change', function () { data.settings.defaultHours = U.num(hoursInp.value, 8); Store.save(); });

    // ---- לוגו מותאם (מחליף את ה-🌱 בסרגל הצד, מסונכרן לכל המשתמשים) ----
    var curLogo = data.settings.logoDataUrl || '';
    var logoPrev = U.el('span', { class: 'logo-prev' }, curLogo ? [U.el('img', { src: curLogo, alt: 'לוגו' })] : '🌱');
    var logoFile = U.el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });
    logoFile.addEventListener('change', function () {
      var f = logoFile.files[0]; if (!f) return;
      readLogoFile(f, function (url) {
        if (!url) { U.toast('לא ניתן לקרוא את קובץ התמונה', 'error'); return; }
        data.settings.logoDataUrl = url;
        Store.save(); App.render();
        U.toast('הלוגו עודכן');
      });
    });
    var logoRow = U.el('div', { class: 'field' }, [
      U.el('label', { text: 'סמל / לוגו' }),
      U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
        logoPrev,
        U.el('button', { class: 'btn small secondary', onclick: function () { logoFile.click(); } }, '🖼 העלאת תמונה'),
        curLogo ? U.el('button', { class: 'btn small secondary', title: 'חזרה לסמל המקורי 🌱', onclick: function () {
          delete data.settings.logoDataUrl;
          Store.save(); App.render();
          U.toast('חזרנו לסמל המקורי');
        } }, '✕ הסרה') : null,
        logoFile
      ]),
      U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;', text: 'התמונה מוקטנת אוטומטית ומוצגת במקום ה-🌱 בסרגל הצד, אצל כל המשתמשים.' })
    ]);

    root.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:16px;max-width:520px;' }, [
      U.el('h3', { style: 'margin-top:0;', text: 'הגדרות כלליות' }),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'שם המוסד' }), nameInp]),
      logoRow,
      U.el('div', { class: 'field' }, [
        U.el('label', { text: 'שעות ברירת מחדל ליום עבודה' }), hoursInp,
        U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;', text: 'ערך כללי לכל האתרים. אתר שהוגדרו לו "שעות ברירת מחדל" משלו בנתוני הבסיס — הערך שלו גובר.' })
      ])
    ]));

    // ---- סיסמת כניסה להגדרות ----
    root.appendChild(buildPasswordCard(data));

    // ---- גיבוי ---- (הנתונים מסונכרנים אוטומטית בענן; זהו גיבוי-מצנח ידני)
    var backup = U.el('div', { class: 'card', style: 'margin-bottom:16px;max-width:520px;' });
    backup.appendChild(U.el('h3', { style: 'margin-top:0;', text: 'גיבוי' }));
    backup.appendChild(U.el('p', { class: 'muted', style: 'font-size:13px;', text: 'הנתונים נשמרים ומסונכרנים אוטומטית בענן. כאן אפשר להוריד גיבוי נקודתי לקובץ ולשמור אצלך, ולשחזר ממנו בעת הצורך.' }));
    var fileInput = U.el('input', { type: 'file', accept: '.json', style: 'display:none;' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0]; if (!f) return;
      Modal.confirm({ title: 'שחזור מגיבוי', text: 'שחזור מגיבוי יחליף את כל הנתונים הקיימים. להמשיך?', okLabel: 'שחזר', danger: true }, function () {
        Store.importJSONFile(f, function (err) {
          if (err) U.toast('שגיאה בטעינה: ' + err.message, 'error');
          else { U.toast('הנתונים נטענו בהצלחה'); App.render(); }
        });
      });
    });
    backup.appendChild(U.el('div', { class: 'row' }, [
      U.el('button', { class: 'btn', onclick: function () { Store.exportJSON(); } }, '⬇ הורד גיבוי'),
      U.el('button', { class: 'btn secondary small', onclick: function () { fileInput.click(); } }, '⬆ שחזור מקובץ')
    ]));
    backup.appendChild(fileInput);

    // ---- גיבוי אוטומטי תקופתי (#26) — snapshots במכשיר ----
    maybeAutoSnapshot();
    var autoChk = U.el('input', { type: 'checkbox', checked: data.settings.autoBackup !== false });
    autoChk.addEventListener('change', function () { data.settings.autoBackup = autoChk.checked; Store.save(); App.render(); });
    var daysInp = U.el('input', { type: 'number', min: '1', value: U.num(data.settings.autoBackupDays, 7) || 7, style: 'width:64px;' });
    daysInp.addEventListener('change', function () { data.settings.autoBackupDays = Math.max(1, U.num(daysInp.value, 7)); Store.save(); });
    backup.appendChild(U.el('hr', { style: 'margin:12px 0;border:0;border-top:1px solid var(--border);' }));
    backup.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
      U.el('label', { style: 'display:inline-flex;gap:6px;align-items:center;cursor:pointer;font-weight:600;' }, [autoChk, U.el('span', { text: 'גיבוי אוטומטי' })]),
      U.el('span', { class: 'muted', text: 'כל' }), daysInp, U.el('span', { class: 'muted', text: 'ימים (4 האחרונים נשמרים במכשיר)' })
    ]));
    var snaps = getSnapshots();
    if (snaps.length) {
      var listWrap = U.el('div');
      snaps.slice().reverse().forEach(function (sn) {
        listWrap.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;' }, [
          U.el('span', { style: 'flex:1;font-size:13px;', text: '📅 ' + U.gregLabel(sn.date) + ' · ' + Math.round((sn.size || 0) / 1024) + 'KB' }),
          U.el('button', { class: 'btn small secondary', onclick: function () { restoreSnapshot(sn); } }, 'שחזר'),
          U.el('button', { class: 'btn small secondary', title: 'הורדה לקובץ', onclick: function () { downloadSnapshot(sn); } }, '⬇')
        ]));
      });
      backup.appendChild(U.el('div', { style: 'margin-top:6px;' }, [U.el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:2px;', text: 'גיבויים אוטומטיים שמורים:' }), listWrap]));
    }
    root.appendChild(backup);

    // ---- אזור סכנה ----
    var danger = U.el('div', { class: 'card danger-zone', style: 'max-width:520px;' });
    danger.appendChild(U.el('h3', { style: 'margin-top:0;color:var(--danger);', text: '⚠ אזור מסוכן' }));
    danger.appendChild(U.el('p', { class: 'muted', text: 'מחיקת כל הנתונים (תלמידים, אתרים, סידורים והכל). פעולה בלתי הפיכה — קובץ גיבוי מלא יורד אוטומטית לפני המחיקה.' }));
    danger.appendChild(U.el('button', { class: 'btn danger', onclick: function () {
      Modal.confirm({ title: '⚠ מחיקת כל הנתונים', text: 'כל הנתונים יימחקו — תלמידים, אתרים, סידורים, חובות והכל.\nבטוחים?', okLabel: 'המשך', danger: true }, function () {
        Modal.confirm({ title: '⚠ אזהרה אחרונה', text: 'הפעולה בלתי הפיכה.\nקובץ גיבוי מלא יירד אוטומטית לפני המחיקה — שמרו אותו במקום בטוח.\nלמחוק את הכל?', okLabel: 'מחק את הכל', danger: true }, function () {
          // גיבוי-מצנח אוטומטי לפני המחיקה
          try { Store.exportJSON(); } catch (e) {}
          var fresh = Store.defaultData();
          var d = Store.get();
          Object.keys(fresh).forEach(function (k) { d[k] = fresh[k]; });
          Store.save(); App.render();
          U.toast('כל הנתונים נמחקו', 'info');
        });
      });
    } }, 'מחק את כל הנתונים'));
    root.appendChild(danger);
  }

  function buildPasswordCard(data) {
    var cur = (data.settings.settingsPassword || '');
    var box = U.el('div', { class: 'card', style: 'margin-bottom:16px;max-width:520px;' });
    box.appendChild(U.el('h3', { style: 'margin-top:0;', text: '🔒 סיסמת כניסה להגדרות' }));
    box.appendChild(U.el('p', { class: 'muted', text: cur
      ? 'מוגדרת סיסמה — כל כניסה למסך ההגדרות תדרוש אותה. השאירו ריק ושמרו כדי לבטל.'
      : 'לא מוגדרת סיסמה. הגדירו סיסמה כדי לחסום כניסה למסך ההגדרות (וניהול המשתמשים).' }));
    var inp = U.el('input', { type: 'text', value: cur, placeholder: 'סיסמה (ריק = ללא סיסמה)', style: 'width:100%;' });
    box.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: 'סיסמה' }), inp]));
    box.appendChild(U.el('button', { class: 'btn', onclick: function () {
      data.settings.settingsPassword = (inp.value || '').trim();
      Store.save();
      U.toast(data.settings.settingsPassword ? 'הסיסמה נשמרה' : 'הסיסמה הוסרה');
    } }, 'שמור סיסמה'));
    return box;
  }

  // ---------- קריאת קובץ לוגו: הקטנה ל-128px ושמירה כ-Data URL (קטן מספיק לסנכרון ענן) ----------
  function readLogoFile(f, cb) {
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var max = 128, sc = Math.min(1, max / Math.max(img.width, img.height));
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * sc));
          cv.height = Math.max(1, Math.round(img.height * sc));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          cb(cv.toDataURL('image/png'));
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = rd.result;
    };
    rd.onerror = function () { cb(null); };
    rd.readAsDataURL(f);
  }

  // ---------- גיבוי אוטומטי: snapshots ב-localStorage ----------
  function getSnapshots() { try { return JSON.parse(localStorage.getItem('agri_snapshots')) || []; } catch (e) { return []; } }
  function saveSnapshots(a) { try { localStorage.setItem('agri_snapshots', JSON.stringify(a)); } catch (e) { /* מכסה מלאה */ } }
  function maybeAutoSnapshot() {
    var d = (global.Store && Store.get) ? Store.get() : null;
    if (!d || !d.settings || d.settings.autoBackup === false) return;
    var days = U.num(d.settings.autoBackupDays, 7) || 7;
    var snaps = getSnapshots();
    var today = U.todayISO();
    if (snaps.length) {
      var last = snaps[snaps.length - 1];
      var diff = (U.fromISO(today) - U.fromISO(last.date)) / 86400000;
      if (diff < days) return;
    }
    var json;
    try { json = JSON.stringify(d); } catch (e) { return; }
    snaps.push({ date: today, size: json.length, json: json });
    while (snaps.length > 4) snaps.shift();
    saveSnapshots(snaps);
  }
  function restoreSnapshot(sn) {
    Modal.confirm({ title: 'שחזור גיבוי', text: 'לשחזר גיבוי מתאריך ' + U.gregLabel(sn.date) + '?\nכל הנתונים הנוכחיים יוחלפו.', okLabel: 'שחזר', danger: true }, function () {
      try {
        var obj = JSON.parse(sn.json);
        Store.replaceAll(obj); Store.save();
        U.toast('הגיבוי שוחזר בהצלחה'); App.render();
      } catch (e) { U.toast('שגיאה בשחזור: ' + (e.message || e), 'error'); }
    });
  }
  function downloadSnapshot(sn) {
    var blob = new Blob([sn.json], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'גיבוי-' + sn.date + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.SettingsView = { render: render, autoSnapshot: maybeAutoSnapshot };
})(window);
