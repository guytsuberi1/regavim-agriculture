/* app.js — אתחול וניתוב בין טאבים */
(function (global) {
  'use strict';
  var U = global.U;

  var TABS = {
    daily: global.DailyView,
    weekly: global.WeeklyView,
    billing: global.BillingView,
    reports: global.ReportsView,
    teams: global.TeamsView,
    base: global.BaseView,
    settings: global.SettingsView
  };

  var current = 'daily';

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
      bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
      document.body.appendChild(bg);
      function close() { if (bg.parentNode) bg.parentNode.removeChild(bg); }
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
      // איחוד חד-פעמי של תכנון שבועי ↔ סידור יומי (ללא מחיקות)
      if (global.Sync) { Sync.mergeAll(); }
      render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  global.App = { setTab: setTab, render: render };
})(window);
