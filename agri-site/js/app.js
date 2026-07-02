/* app.js — אתחול וניתוב בין טאבים */
(function (global) {
  'use strict';
  var U = global.U;

  var TABS = {
    dashboard: global.DashboardView,
    planning: global.PlanningView,
    daily: global.DailyView,
    field: global.FieldView,
    weekly: global.WeeklyView,
    billing: global.BillingView,
    debts: global.DebtsView,
    reports: global.ReportsView,
    teams: global.TeamsView,
    base: global.BaseView,
    kitchen: global.KitchenView,
    settings: global.SettingsView
  };

  var current = 'dashboard';

  // הרשאות → אילו טאבים גלויים
  // admin=רכז חקלאות (הכל) · manager=מנהל (הכל למעט נתוני בסיס, מטבח והגדרות) · kitchen=מנהל מטבח · field=מצב שטח
  var ROLE_TABS = {
    admin: ['dashboard', 'planning', 'billing', 'debts', 'reports', 'base', 'kitchen', 'field', 'settings'],
    manager: ['dashboard', 'planning', 'billing', 'debts', 'reports', 'field'],
    kitchen: ['kitchen'],
    field: ['field']
  };
  function roleKey() {
    return Store.currentRole ? Store.currentRole() : (Store.isAdmin() ? 'admin' : (Store.isKitchen() ? 'kitchen' : 'field'));
  }
  function applyRole() {
    var role = roleKey();
    var allowed = ROLE_TABS[role] || ROLE_TABS.field;
    U.$all('#tabs button').forEach(function (b) {
      var t = b.getAttribute('data-tab');
      b.style.display = allowed.indexOf(t) !== -1 ? '' : 'none';
    });
    // כותרות הנושאים בסרגל — רק למי שרואה כמה טאבים (רכז/מנהל)
    U.$all('#tabs .nav-sec').forEach(function (d) { d.style.display = (role === 'admin' || role === 'manager') ? '' : 'none'; });
    if (allowed.indexOf(current) === -1) current = allowed[0];
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
    // עטיפת טבלאות רחבות בגולל אופקי — כדי שלא ייחתכו בנייד
    Array.prototype.forEach.call(view.querySelectorAll('table.grid'), function (t) {
      var p = t.parentNode;
      if (!p || (p.classList && p.classList.contains('tbl-scroll'))) return;
      var wrap = U.el('div', { class: 'tbl-scroll' });
      p.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }

  function setTab(tab) {
    var allowed = ROLE_TABS[roleKey()] || ROLE_TABS.field;
    if (allowed.indexOf(tab) === -1) tab = allowed[0]; // הגנה: מסך לא-מורשה → לטאב הראשון המותר
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
      // Escape סוגר את המודאל (העליון בלבד)
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
      document.addEventListener('keydown', onKey);
      document.body.appendChild(bg);
      function close() {
        document.removeEventListener('keydown', onKey);
        if (bg.parentNode) bg.parentNode.removeChild(bg);
        if (global.Store && Store.flushPendingRemote) Store.flushPendingRemote();
      }
      return close;
    },

    // דיאלוג אישור מעוצב במקום confirm() של הדפדפן.
    // Modal.confirm({ title, text, okLabel, danger }, onOk)
    confirm: function (opts, onOk) {
      opts = opts || {};
      var body = U.el('div', null, [
        U.el('div', { style: 'font-size:15px;line-height:1.6;white-space:pre-line;', text: opts.text || '' })
      ]);
      global.Modal.open(opts.title || 'אישור פעולה', body, [
        { label: opts.cancelLabel || 'ביטול', class: 'secondary' },
        { label: opts.okLabel || 'אישור', class: (opts.danger ? 'danger' : ''), onClick: function (close) { close(); onOk && onOk(); } }
      ]);
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
      // גיבוי אוטומטי תקופתי (אם עבר מספיק זמן מהגיבוי האחרון)
      if (global.SettingsView && SettingsView.autoSnapshot) { try { SettingsView.autoSnapshot(); } catch (e) {} }
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
