/* planning.js — לשונית "תכנון": מאחדת סידור יומי + תכנון שבועי תחת תתי-לשוניות */
(function (global) {
  'use strict';
  var U = global.U;
  var sub = 'daily'; // daily | weekly

  function render(root) {
    root.appendChild(U.el('div', { class: 'subtabs no-print' }, [
      ['daily', '🗓️ סידור יומי'], ['weekly', '📅 תכנון שבועי']
    ].map(function (p) {
      return U.el('button', { class: sub === p[0] ? 'active' : '', onclick: function () { sub = p[0]; App.render(); } }, p[1]);
    })));

    if (sub === 'weekly' && global.WeeklyView) global.WeeklyView.render(root);
    else if (global.DailyView) global.DailyView.render(root);
    else root.appendChild(U.el('div', { class: 'card empty' }, 'המסך אינו זמין.'));
  }

  global.PlanningView = { render: render };
})(window);
