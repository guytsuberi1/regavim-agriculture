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
    root.appendChild(U.el('div', { class: 'page-head' }, [U.el('h2', { text: 'הגדרות וגיבוי' })]));
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
    root.appendChild(U.el('div', { class: 'page-head' }, [U.el('h2', { text: 'הגדרות וגיבוי' })]));

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

    root.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:16px;max-width:520px;' }, [
      U.el('h3', { style: 'margin-top:0;', text: 'הגדרות כלליות' }),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'שם המוסד' }), nameInp]),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'שעות ברירת מחדל ליום עבודה' }), hoursInp])
    ]));

    // ---- סיסמת כניסה להגדרות ----
    root.appendChild(buildPasswordCard(data));

    // ---- גיבוי ל-OneDrive ----
    var fsBox = U.el('div', { class: 'card', style: 'margin-bottom:16px;max-width:520px;' });
    fsBox.appendChild(U.el('h3', { style: 'margin-top:0;', text: 'גיבוי וסנכרון ל-OneDrive' }));
    fsBox.appendChild(U.el('p', { class: 'muted', html:
      'הנתונים נשמרים אוטומטית בדפדפן זה. כדי לסנכרן בין מחשבים — שמרו את הקובץ ' +
      '<b>data.json</b> בתיקיית OneDrive המשותפת.' }));

    if (Store.fsSupported()) {
      fsBox.appendChild(U.el('p', { class: 'muted', text: 'דפדפן זה תומך בחיבור אוטומטי: בחרו פעם אחת קובץ data.json ב-OneDrive, ומאז כל שינוי יישמר אליו אוטומטית.' }));
      fsBox.appendChild(U.el('div', { class: 'row' }, [
        U.el('button', { class: 'btn', onclick: function () { Store.connectFile().then(function () { App.render(); }).catch(function () {}); } }, '🔗 חבר/צור קובץ data.json ב-OneDrive'),
        U.el('button', { class: 'btn secondary', onclick: function () { Store.openExistingFile().then(function () { alert('נטען בהצלחה.'); App.render(); }).catch(function (e) { if (e) alert('שגיאה: ' + (e.message || e)); }); } }, '📂 פתח קובץ קיים מ-OneDrive')
      ]));
    } else {
      fsBox.appendChild(U.el('p', { class: 'muted', text: 'דפדפן זה אינו תומך בחיבור אוטומטי לקובץ — השתמשו בגיבוי/טעינה ידניים למטה (מומלץ לשמור בתיקיית OneDrive).' }));
    }
    root.appendChild(fsBox);

    // ---- גיבוי/שחזור ידני ----
    var manual = U.el('div', { class: 'card', style: 'margin-bottom:16px;max-width:520px;' });
    manual.appendChild(U.el('h3', { style: 'margin-top:0;', text: 'גיבוי / שחזור ידני' }));
    var fileInput = U.el('input', { type: 'file', accept: '.json', style: 'display:none;' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0]; if (!f) return;
      if (!confirm('טעינת גיבוי תחליף את כל הנתונים הקיימים. להמשיך?')) return;
      Store.importJSONFile(f, function (err) {
        if (err) alert('שגיאה בטעינה: ' + err.message);
        else { alert('הנתונים נטענו בהצלחה.'); App.render(); }
      });
    });
    manual.appendChild(U.el('div', { class: 'row' }, [
      U.el('button', { class: 'btn', onclick: function () { Store.exportJSON(); } }, '⬇ הורד גיבוי (שמרו ב-OneDrive)'),
      U.el('button', { class: 'btn secondary', onclick: function () { fileInput.click(); } }, '⬆ טען גיבוי מקובץ')
    ]));
    manual.appendChild(fileInput);
    root.appendChild(manual);

    // ---- אזור סכנה ----
    var danger = U.el('div', { class: 'card', style: 'max-width:520px;border:1px solid var(--danger);' });
    danger.appendChild(U.el('h3', { style: 'margin-top:0;color:var(--danger);', text: 'איפוס' }));
    danger.appendChild(U.el('p', { class: 'muted', text: 'מחיקת כל הנתונים (תלמידים, אתרים, סידורים והכל). מומלץ להוריד גיבוי קודם.' }));
    danger.appendChild(U.el('button', { class: 'btn danger', onclick: function () {
      if (!confirm('בטוחים? כל הנתונים יימחקו.')) return;
      if (!confirm('אזהרה אחרונה — הפעולה בלתי הפיכה. למחוק?')) return;
      var fresh = Store.defaultData();
      var d = Store.get();
      Object.keys(fresh).forEach(function (k) { d[k] = fresh[k]; });
      Store.save(); App.render();
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
      alert(data.settings.settingsPassword ? 'הסיסמה נשמרה.' : 'הסיסמה הוסרה.');
    } }, 'שמור סיסמה'));
    return box;
  }

  global.SettingsView = { render: render };
})(window);
