/* app.js — אתחול וניתוב בין טאבים */
(function (global) {
  'use strict';
  var U = global.U;

  var TABS = {
    dashboard: global.DashboardView,
    daily: global.DailyView,
    field: global.FieldView,
    weekly: global.WeeklyView,
    billing: global.BillingView,
    debts: global.DebtsView,
    reports: global.ReportsView,
    teams: global.TeamsView,
    base: global.BaseView,
    users: global.UsersView,
    kitchen: global.KitchenView,
    settings: global.SettingsView
  };

  var current = 'dashboard';

  // הרשאות: אדמין רואה הכל חוץ מ"תורני מטבח"; מנהל מטבח רואה רק "תורני מטבח"; כל השאר רק "מצב שטח"
  function applyRole() {
    var admin = Store.isAdmin();
    var kitchen = !admin && Store.isKitchen();
    U.$all('#tabs button').forEach(function (b) {
      var t = b.getAttribute('data-tab');
      var vis = admin ? (t !== 'kitchen') : (kitchen ? t === 'kitchen' : t === 'field');
      b.style.display = vis ? '' : 'none';
    });
    if (kitchen) current = 'kitchen';
    else if (!admin) current = 'field';
  }

  function render() {
    var view = U.$('#view');
    U.clear(view);
    var mod = TABS[current];
    if (mod && mod.render) {
      mod.render(view);
    } else {
      view.appendChild(U.el('div', { class: 'empty' }, 'המסך בבנייה...'));
    }
  }

  function setTab(tab) {
    if (!Store.isAdmin()) { // הגנה: לא-מנהל מוגבל למסך היחיד שלו
      var allowed = Store.isKitchen() ? 'kitchen' : 'field';
      if (tab !== allowed) tab = allowed;
    }
    current = tab;
    U.$all('#tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    render();
  }

  // ---------- מודאל גנרי ----------
  global.Modal = {
    open: function (title, bodyNode, buttons) {
      var bg = U.el('div', { class: 'modal-bg' });
      var closeBtn = U.el('button', { class: 'x', text: '×', onclick: close });
      var head = U.el('div', { class: 'modal-head' }, [U.el('h3', { text: title }), closeBtn]);
      var body = U.el('div', { class: 'modal-body' }, [bodyNode]);
      var footChildren = (buttons || []).map(function (b) {
        return U.el('button', {
          class: 'btn ' + (b.class || ''),
          onclick: function () { if (b.onClick) b.onClick(close); else close(); }
        }, b.label);
      });
      var foot = U.el('div', { class: 'modal-foot' }, footChildren);
      var modal = U.el('div', { class: 'modal' }, [head, body, foot]);
      bg.appendChild(modal);
      // סגירה בלחיצה על הרקע — רק אם גם הלחיצה *התחילה* על הרקע.
      // מונע סגירה בטעות כשבוחרים טקסט בשדה ומשחררים מחוץ לו, או בגלילה/מגע (נייד) —
      // מה שגרם ל"יוצא לי מהעריכה" באמצע עריכה.
      var downOnBg = false;
      var downEvt = ('onpointerdown' in window) ? 'pointerdown' : 'mousedown';
      bg.addEventListener(downEvt, function (e) { downOnBg = (e.target === bg); });
      bg.addEventListener('click', function (e) { if (e.target === bg && downOnBg) close(); downOnBg = false; });
      document.body.appendChild(bg);
      function close() {
        if (bg.parentNode) bg.parentNode.removeChild(bg);
        if (global.Store && Store.flushPendingRemote) Store.flushPendingRemote();
      }
      return close;
    }
  };

  function init() {
    Store.load();
    U.$all('#tabs button').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
    });
    // אתחול שמירה/טעינה אוטומטית (שרת → OneDrive, או נתונים מוטמעים ב-file://)
    Store.initPersistence(function () {
      applyRole(); // קביעת טאבים לפי הרשאה (מנהל / מצב-שטח בלבד)
      // איחוד חד-פעמי של תכנון שבועי ↔ סידור יומי (ללא מחיקות)
      if (global.Sync) { Sync.mergeAll(); }
      // הדגשת הטאב הפעיל הנכון
      U.$all('#tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === current); });
      render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  global.App = { setTab: setTab, render: render };
})(window);
