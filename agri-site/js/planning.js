/* planning.js — לשונית "תכנון": כותרת אחת ובורר יומי/שבועי/חודשי */
(function (global) {
  'use strict';
  var U = global.U;
  var mode = localStorage.getItem('agri_plan_mode') || 'daily'; // daily | week | month
  function setMode(m) { mode = m; localStorage.setItem('agri_plan_mode', m); App.render(); }

  function render(root) {
    root.appendChild(U.el('div', { class: 'page-head', style: 'margin-bottom:4px;' }, [
      U.el('h2', { text: '📋 תכנון' })
    ]));
    root.appendChild(U.el('div', { class: 'subtabs no-print' }, [
      ['daily', '🗓️ יומי'], ['week', '📅 שבועי'], ['month', '📆 חודשי']
    ].map(function (p) {
      return U.el('button', { class: mode === p[0] ? 'active' : '', onclick: function () { setMode(p[0]); } }, p[1]);
    })));

    if (mode === 'daily') {
      if (global.DailyView) global.DailyView.render(root);
      else root.appendChild(U.el('div', { class: 'card empty' }, 'המסך אינו זמין.'));
    } else {
      if (global.WeeklyView) global.WeeklyView.render(root, mode); // 'week' | 'month'
      else root.appendChild(U.el('div', { class: 'card empty' }, 'המסך אינו זמין.'));
    }
  }

  // מעבר ללוח היומי של תאריך מסוים (לחיצה על יום בלוח השבועי/חודשי)
  function openDaily(iso) {
    if (global.DailyView && DailyView.setDate) DailyView.setDate(iso);
    setMode('daily');
  }

  global.PlanningView = { render: render };
  global.PlanningNav = { openDaily: openDaily };
})(window);
