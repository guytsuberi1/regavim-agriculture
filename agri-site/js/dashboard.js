/* dashboard.js — דשבורד מנהלים: סיכום מצרפי של כל המידע המשמעותי במערכת */
(function (global) {
  'use strict';
  var U = global.U;

  function money(n) { return '₪' + Math.round(U.num(n)).toLocaleString('he-IL'); }

  // ---------- חישוב מדדים ----------
  function computeKPIs() {
    var d = Store.get();
    var days = d.days || {};
    var manDays = 0, workDays = 0, absUnap = 0, absAp = 0, hoursSum = 0, ratingSum = 0, ratingCnt = 0;

    Object.keys(days).forEach(function (iso) {
      var cards = days[iso].cards || [];
      // יום עבודה = יום שבו שובצו אתר/תלמידים (יום ללא שיבוץ אינו נספר)
      var scheduled = cards.some(function (c) { return c.siteId || (c.students && c.students.length); });
      if (scheduled) workDays++;
      var went = (global.ReportsUtil ? ReportsUtil.wentOn(iso) : {});
      var wc = Object.keys(went).length;
      manDays += wc;
      if (global.ReportsUtil) {
        ReportsUtil.nonAttendanceOn(iso).forEach(function (r) {
          if (ReportsUtil.getAbs(iso, r.studentId).approved) absAp++; else absUnap++;
        });
      }
      (days[iso].cards || []).forEach(function (c) {
        (c.students || []).forEach(function (s) {
          if (s.wentToWork) {
            hoursSum += U.num(c.hours);
            if (s.rating) { ratingSum += U.num(s.rating); ratingCnt++; }
          }
        });
      });
    });

    var attTotal = manDays + absUnap;             // היעדרות באישור לא נספרת באחוז
    var attPct = attTotal ? Math.round(manDays / attTotal * 100) : null;

    var billed = (global.BillingUtil ? BillingUtil.billedBySite() : {});
    var totalIncome = Object.keys(billed).reduce(function (a, k) { return a + U.num(billed[k].total); }, 0);
    var totalDebt = (global.DebtUtil ? DebtUtil.totalOutstanding() : 0);
    var collected = (global.DebtUtil ? DebtUtil.totalCollected() : 0);

    return {
      attPct: attPct, manDays: manDays, workDays: workDays, absUnap: absUnap, absAp: absAp,
      hoursSum: hoursSum, ratingAvg: ratingCnt ? (ratingSum / ratingCnt) : null,
      totalIncome: totalIncome, totalDebt: totalDebt, collected: collected,
      billed: billed,
      activeStudents: (d.students || []).filter(function (s) { return s.active !== false; }).length,
      activeSites: (d.sites || []).filter(function (s) { return s.active !== false; }).length,
      activeStaff: (d.staff || []).filter(function (s) { return s.active !== false; }).length
    };
  }

  function fieldNotes() {
    var days = Store.get().days || {};
    var out = [];
    Object.keys(days).forEach(function (iso) {
      (days[iso].cards || []).forEach(function (c) {
        if (c.fieldNote && String(c.fieldNote).trim()) {
          var site = c.siteId ? ((Store.getById('sites', c.siteId) || {}).name || '(אתר)') : '(אתר)';
          out.push({ date: iso, site: site, note: c.fieldNote });
        }
      });
    });
    out.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    return out;
  }

  // ---------- רכיבי UI ----------
  function kpi(icon, value, label, tone, sub) {
    return U.el('div', { class: 'kpi kpi-' + (tone || 'neutral') }, [
      U.el('div', { class: 'kpi-ic', text: icon }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-val', text: String(value) }),
        U.el('div', { class: 'kpi-lbl', text: label }),
        sub ? U.el('div', { class: 'kpi-sub', text: sub }) : null
      ])
    ]);
  }

  function panel(title, bodyNode, extraClass) {
    return U.el('section', { class: 'dash-panel ' + (extraClass || '') }, [
      U.el('div', { class: 'dash-panel-head' }, [U.el('h3', { text: title })]),
      bodyNode
    ]);
  }

  function miniTable(headers, rows, emptyText) {
    if (!rows.length) return U.el('div', { class: 'dash-empty', text: emptyText || 'אין נתונים.' });
    return U.el('table', { class: 'grid dash-mini' }, [
      U.el('thead', null, [U.el('tr', null, headers.map(function (h) { return U.el('th', { text: h }); }))]),
      U.el('tbody', null, rows.map(function (r) {
        return U.el('tr', null, r.map(function (c, i) { return U.el('td', { class: i === 0 ? '' : 'center', text: c }); }));
      }))
    ]);
  }

  // ---------- רינדור ----------
  function render(root) {
    if (!Store.isAdmin()) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין הרשאה.')); return; }
    var k = computeKPIs();

    root.appendChild(U.el('div', { class: 'page-head dash-head' }, [
      U.el('div', null, [
        U.el('h2', { text: '📊 דשבורד מנהלים' }),
        U.el('div', { class: 'muted', style: 'font-size:13px;', text: 'מבט-על על כלל הפעילות · ' + U.gregLabel(U.todayISO()) })
      ])
    ]));

    // --- רשת מדדים ---
    var attTone = k.attPct == null ? 'neutral' : (k.attPct >= 75 ? 'good' : (k.attPct >= 50 ? 'warn' : 'bad'));
    var grid = U.el('div', { class: 'kpi-grid' }, [
      kpi('🚜', k.attPct == null ? '—' : k.attPct + '%', 'אחוז יציאה לעבודה', attTone,
        k.attPct == null ? null : (k.manDays + ' יצאו · ' + k.absUnap + ' ללא אישור')),
      kpi('🗓️', k.workDays.toLocaleString('he-IL'), 'סה"כ ימי עבודה', 'info'),
      kpi('⏱️', Math.round(k.hoursSum).toLocaleString('he-IL'), 'סה"כ שעות עבודה', 'neutral'),
      kpi('⭐', k.ratingAvg == null ? '—' : k.ratingAvg.toFixed(1), 'ציון ממוצע', 'purple', 'מתוך 5'),
      kpi('💵', money(k.totalIncome), 'סה"כ הכנסות (חיוב)', 'good'),
      kpi('✅', money(k.collected), 'סה"כ נגבה', 'info'),
      kpi('💰', money(k.totalDebt), 'סה"כ חובות פתוחים', k.totalDebt > 0 ? 'bad' : 'good'),
      kpi('👥', k.activeStudents, 'תלמידים פעילים', 'neutral', k.activeStaff + ' אנשי צוות'),
      kpi('🏠', k.activeSites, 'אתרים פעילים', 'neutral')
    ]);
    root.appendChild(grid);

    // --- שתי עמודות: הערות מהשטח + סיכום יומי ---
    var notes = fieldNotes();
    var notesBox = U.el('div', { class: 'fieldnotes' });
    if (!notes.length) {
      notesBox.appendChild(U.el('div', { class: 'dash-empty', text: 'אין הערות מהשטח עדיין.' }));
    } else {
      notes.slice(0, 30).forEach(function (n) {
        notesBox.appendChild(U.el('div', { class: 'fieldnote' }, [
          U.el('div', { class: 'fn-top' }, [
            U.el('span', { class: 'fn-site', text: n.site }),
            U.el('span', { class: 'fn-date', text: U.gregLabel(n.date) })
          ]),
          U.el('div', { class: 'fn-text', text: n.note })
        ]));
      });
    }

    var dailyBox = global.ReportsUtil ? ReportsUtil.renderDailySummary() : U.el('div', { class: 'dash-empty', text: 'הסיכום היומי אינו זמין.' });

    root.appendChild(U.el('div', { class: 'dash-cols' }, [
      panel('📝 הערות מהשטח', notesBox, 'col-notes'),
      panel('🗓️ סיכום יומי', dailyBox, 'col-daily')
    ]));

    // --- דירוגים: הכנסות וחובות מובילים ---
    var sitesIncome = Object.keys(k.billed).map(function (id) {
      return { name: (Store.getById('sites', id) || {}).name || '(אתר)', total: k.billed[id].total };
    }).filter(function (r) { return r.total > 0; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 6);

    var agg = global.DebtUtil ? DebtUtil.farmerAgg() : {};
    var debtors = Object.keys(agg).map(function (id) {
      return { name: (Store.getById('sites', id) || {}).name || '(אתר)', bal: agg[id].balance };
    }).filter(function (r) { return r.bal > 0.005; }).sort(function (a, b) { return b.bal - a.bal; }).slice(0, 6);

    root.appendChild(U.el('div', { class: 'dash-cols' }, [
      panel('🏆 אתרים מובילים בהכנסות', miniTable(['אתר', 'סה"כ חיוב'],
        sitesIncome.map(function (r) { return [r.name, money(r.total)]; }), 'אין נתוני חיוב.'), 'col-half'),
      panel('⚠️ חובות פתוחים מובילים', miniTable(['חקלאי', 'יתרה'],
        debtors.map(function (r) { return [r.name, money(r.bal)]; }), 'אין חובות פתוחים.'), 'col-half')
    ]));
  }

  global.DashboardView = { render: render };
})(window);
