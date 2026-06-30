/* dashboard.js — דשבורד מנהלים: מבט על · סיכום יומי · הערות מהשטח · נתונים כספיים */
(function (global) {
  'use strict';
  var U = global.U;

  var sub = 'overview';      // overview | daily | notes | finance
  var period = 'month';      // week | month | year (לשונית "מבט על")

  function money(n) { return '₪' + Math.round(U.num(n)).toLocaleString('he-IL'); }
  function inRange(iso, r) { return iso >= r.start && iso <= r.end; }

  // ---------- טווחי תקופה ----------
  function rangeOf(p, offset) {
    var today = U.todayISO();
    if (p === 'week') {
      var s = U.addDays(U.startOfWeek(today), offset * 7);
      return { start: s, end: U.addDays(s, 6), kind: 'week' };
    }
    if (p === 'year') {
      var y = U.fromISO(today).getFullYear() + offset;
      return { start: y + '-01-01', end: y + '-12-31', kind: 'year' };
    }
    var d = U.fromISO(today);
    var first = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    var last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return { start: U.toISO(first), end: U.toISO(last), kind: 'month' };
  }
  function periodShortLabel(p, offset) {
    var r = rangeOf(p, offset);
    if (p === 'week') return U.gregLabel(r.start);
    if (p === 'year') return r.start.slice(0, 4);
    return U.monthLabel(U.monthKey(r.start)).split(' ')[0].slice(0, 4);
  }
  function periodWord() { return period === 'week' ? 'השבוע' : (period === 'year' ? 'השנה' : 'החודש'); }
  function prevWord() { return period === 'week' ? 'שבוע קודם' : (period === 'year' ? 'שנה קודמת' : 'חודש קודם'); }

  // ---------- חישוב מדדים לטווח תאריכים ----------
  function computeRange(r) {
    var days = Store.get().days || {};
    var manDays = 0, workDays = 0, absUnap = 0, hours = 0, rSum = 0, rCnt = 0, income = 0;
    Object.keys(days).forEach(function (iso) {
      if (!inRange(iso, r)) return;
      var cards = days[iso].cards || [];
      if (cards.some(function (c) { return c.siteId || (c.students && c.students.length); })) workDays++;
      var went = global.ReportsUtil ? ReportsUtil.wentOn(iso) : {};
      manDays += Object.keys(went).length;
      if (global.ReportsUtil) {
        ReportsUtil.nonAttendanceOn(iso).forEach(function (x) {
          if (!ReportsUtil.getAbs(iso, x.studentId).approved) absUnap++;
        });
      }
      cards.forEach(function (c) {
        var site = c.siteId ? Store.getById('sites', c.siteId) : null;
        var rate = site ? U.num(site.hourlyRate) : 0, travelPay = site ? U.num(site.travelPay) : 0;
        var w = 0;
        (c.students || []).forEach(function (s) {
          if (s.wentToWork) { w++; hours += U.num(c.hours); if (s.rating) { rSum += U.num(s.rating); rCnt++; } }
        });
        income += w * U.num(c.hours) * rate + (w > 0 ? travelPay : 0);
      });
    });
    var attTotal = manDays + absUnap;
    return {
      workDays: workDays, manDays: manDays, hours: hours, income: income,
      attPct: attTotal ? (manDays / attTotal * 100) : null,
      ratingAvg: rCnt ? (rSum / rCnt) : null,
      collected: (Store.get().debtEntries || []).filter(function (e) {
        return e.kind === 'payment' && e.date >= r.start && e.date <= r.end;
      }).reduce(function (a, e) { return a + U.num(e.amount); }, 0)
    };
  }

  function fieldNotes() {
    var days = Store.get().days || {};
    var out = [];
    Object.keys(days).forEach(function (iso) {
      (days[iso].cards || []).forEach(function (c) {
        if (c.fieldNote && String(c.fieldNote).trim()) {
          var site = c.siteId ? ((Store.getById('sites', c.siteId) || {}).name || '(אתר)') : '(אתר)';
          out.push({ date: iso, site: site, note: c.fieldNote, by: c.fieldNoteBy || '' });
        }
      });
    });
    out.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    return out;
  }

  // ---------- רכיבי UI ----------
  function deltaBadge(cur, prev) {
    if (cur == null || prev == null) return null;
    if (prev === 0) return cur > 0 ? { txt: 'חדש', cls: 'up' } : null;
    var pct = (cur - prev) / Math.abs(prev) * 100;
    if (Math.abs(pct) < 0.5) return { txt: '≈', cls: 'flat' };
    return { txt: (pct > 0 ? '+' : '') + Math.round(pct) + '%', cls: pct > 0 ? 'up' : 'down' };
  }
  function kpi(icon, value, label, tone, sub, badge) {
    return U.el('div', { class: 'kpi kpi-' + (tone || 'neutral') }, [
      U.el('div', { class: 'kpi-ic', text: icon }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-row' }, [
          U.el('div', { class: 'kpi-val', text: String(value) }),
          badge ? U.el('span', { class: 'kpi-badge ' + badge.cls, text: badge.txt }) : null
        ]),
        U.el('div', { class: 'kpi-lbl', text: label }),
        sub ? U.el('div', { class: 'kpi-sub', text: sub }) : null
      ])
    ]);
  }
  function metricKpi(icon, label, cur, prev, fmt, tone) {
    return kpi(icon, cur == null ? '—' : fmt(cur), label, tone, prev == null ? null : ('היה ' + (prev == null ? '—' : fmt(prev)) + ' ' + prevWord()), deltaBadge(cur, prev));
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
  function trendChart(values, fmt) {
    var max = Math.max(1, Math.max.apply(null, values.map(function (v) { return v.val || 0; })));
    return U.el('div', { class: 'trend' }, values.map(function (v, i) {
      var h = Math.max(2, (v.val || 0) / max * 100);
      return U.el('div', { class: 'trend-col' }, [
        U.el('div', { class: 'trend-val', text: fmt(v.val || 0) }),
        U.el('div', { class: 'trend-bar' + (i === values.length - 1 ? ' cur' : ''), style: 'height:' + h.toFixed(0) + '%;' }),
        U.el('div', { class: 'trend-lbl', text: v.label })
      ]);
    }));
  }

  // ---------- רינדור ראשי ----------
  function render(root) {
    if (!Store.isAdmin()) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין הרשאה.')); return; }

    root.appendChild(U.el('div', { class: 'page-head dash-head' }, [
      U.el('div', null, [
        U.el('h2', { text: '📊 דשבורד מנהלים' }),
        U.el('div', { class: 'muted', style: 'font-size:13px;', text: U.weekdayName(U.todayISO()) + ' · ' + U.gregLabel(U.todayISO()) })
      ])
    ]));

    root.appendChild(U.el('div', { class: 'subtabs' }, [
      ['overview', '🔭 מבט על'], ['daily', '🗓️ סיכום יומי'], ['notes', '📝 הערות מהשטח'], ['finance', '💰 נתונים כספיים']
    ].map(function (p) {
      return U.el('button', { class: sub === p[0] ? 'active' : '', onclick: function () { sub = p[0]; App.render(); } }, p[1]);
    })));

    if (sub === 'overview') renderOverview(root);
    else if (sub === 'daily') renderDaily(root);
    else if (sub === 'notes') renderNotes(root);
    else renderFinance(root);
  }

  // ---------- מבט על ----------
  function renderOverview(root) {
    var seg = U.el('div', { class: 'period-sel' }, [
      ['week', 'שבוע'], ['month', 'חודש'], ['year', 'שנה']
    ].map(function (p) {
      return U.el('button', { class: 'btn small ' + (period === p[0] ? 'accent' : 'secondary'), onclick: function () { period = p[0]; App.render(); } }, p[1]);
    }));
    root.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;' }, [
      U.el('span', { class: 'muted', text: 'תצוגה לפי:' }), seg,
      U.el('span', { class: 'tag', text: rangeOf(period, 0).start + ' — ' + rangeOf(period, 0).end })
    ]));

    var cur = computeRange(rangeOf(period, 0));
    var prev = computeRange(rangeOf(period, -1));
    var totalDebt = global.DebtUtil ? DebtUtil.totalOutstanding() : 0;
    var attTone = cur.attPct == null ? 'neutral' : (cur.attPct >= 75 ? 'good' : (cur.attPct >= 50 ? 'warn' : 'bad'));

    root.appendChild(U.el('div', { class: 'kpi-grid' }, [
      metricKpi('🚜', 'אחוז יציאה לעבודה', cur.attPct, prev.attPct, function (v) { return Math.round(v) + '%'; }, attTone),
      metricKpi('👷', 'יציאות לעבודה (ימי-עובד)', cur.manDays, prev.manDays, function (v) { return Math.round(v).toLocaleString('he-IL'); }, 'info'),
      metricKpi('🗓️', 'ימי עבודה', cur.workDays, prev.workDays, function (v) { return String(v); }, 'neutral'),
      metricKpi('⏱️', 'שעות עבודה', cur.hours, prev.hours, function (v) { return Math.round(v).toLocaleString('he-IL'); }, 'neutral'),
      metricKpi('⭐', 'ציון ממוצע', cur.ratingAvg, prev.ratingAvg, function (v) { return v.toFixed(1); }, 'purple'),
      metricKpi('💵', 'הכנסות (' + periodWord() + ')', cur.income, prev.income, money, 'good'),
      metricKpi('✅', 'נגבה (' + periodWord() + ')', cur.collected, prev.collected, money, 'info'),
      kpi('💰', money(totalDebt), 'חובות פתוחים (נכון להיום)', totalDebt > 0 ? 'bad' : 'good')
    ]));

    // מגמות — 6 התקופות האחרונות
    var offs = [-5, -4, -3, -2, -1, 0];
    var series = offs.map(function (o) { return { label: periodShortLabel(period, o), r: rangeOf(period, o) }; });
    series.forEach(function (s) { s.m = computeRange(s.r); });
    root.appendChild(U.el('div', { class: 'dash-cols' }, [
      panel('📈 מגמת יציאות לעבודה', trendChart(series.map(function (s) { return { label: s.label, val: s.m.manDays }; }), function (v) { return Math.round(v); }), 'col-half'),
      panel('📈 מגמת הכנסות', trendChart(series.map(function (s) { return { label: s.label, val: s.m.income }; }), function (v) { return '₪' + Math.round(v / 1000) + 'k'; }), 'col-half')
    ]));

    root.appendChild(U.el('p', { class: 'muted', style: 'font-size:12px;', text: 'הכנסות מחושבות לפי שעות×תעריף + נסיעות לכל יום (אומדן ניהולי; הנתון המדויק לחיוב נמצא ב"דרישת תשלום").' }));
  }

  // ---------- סיכום יומי ----------
  function renderDaily(root) {
    var box = global.ReportsUtil ? ReportsUtil.renderDailySummary() : U.el('div', { class: 'dash-empty', text: 'הסיכום היומי אינו זמין.' });
    root.appendChild(U.el('div', { class: 'card' }, [box]));
  }

  // ---------- הערות מהשטח ----------
  function renderNotes(root) {
    var notes = fieldNotes();
    var box = U.el('div', { class: 'fieldnotes' });
    if (!notes.length) box.appendChild(U.el('div', { class: 'dash-empty', text: 'אין הערות מהשטח עדיין.' }));
    else notes.forEach(function (n) {
      box.appendChild(U.el('div', { class: 'fieldnote' }, [
        U.el('div', { class: 'fn-top' }, [
          U.el('span', { class: 'fn-site', text: n.site + (n.by ? ' · ' + n.by : '') }),
          U.el('span', { class: 'fn-date', text: U.gregLabel(n.date) })
        ]),
        U.el('div', { class: 'fn-text', text: n.note })
      ]));
    });
    root.appendChild(panel('📝 הערות מהשטח (' + notes.length + ')', box));
  }

  // ---------- נתונים כספיים ----------
  function renderFinance(root) {
    var billed = global.BillingUtil ? BillingUtil.billedBySite() : {};
    var totalIncome = Object.keys(billed).reduce(function (a, k) { return a + U.num(billed[k].total); }, 0);
    var totalDebt = global.DebtUtil ? DebtUtil.totalOutstanding() : 0;
    var collected = global.DebtUtil ? DebtUtil.totalCollected() : 0;

    root.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi('💵', money(totalIncome), 'סה"כ הכנסות (חיוב, מצטבר)', 'good'),
      kpi('✅', money(collected), 'סה"כ נגבה', 'info'),
      kpi('💰', money(totalDebt), 'סה"כ חובות פתוחים', totalDebt > 0 ? 'bad' : 'good'),
      kpi('🧮', money(totalIncome - collected), 'יתרת גבייה צפויה', 'warn')
    ]));

    var sitesIncome = Object.keys(billed).map(function (id) {
      return { name: (Store.getById('sites', id) || {}).name || '(אתר)', total: billed[id].total };
    }).filter(function (r) { return r.total > 0; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 8);

    var agg = global.DebtUtil ? DebtUtil.farmerAgg() : {};
    var debtors = Object.keys(agg).map(function (id) {
      return { name: (Store.getById('sites', id) || {}).name || '(אתר)', bal: agg[id].balance };
    }).filter(function (r) { return r.bal > 0.005; }).sort(function (a, b) { return b.bal - a.bal; }).slice(0, 8);

    root.appendChild(U.el('div', { class: 'dash-cols' }, [
      panel('🏆 אתרים מובילים בהכנסות', miniTable(['אתר', 'סה"כ חיוב'],
        sitesIncome.map(function (r) { return [r.name, money(r.total)]; }), 'אין נתוני חיוב.'), 'col-half'),
      panel('⚠️ חובות פתוחים מובילים', miniTable(['חקלאי', 'יתרה'],
        debtors.map(function (r) { return [r.name, money(r.bal)]; }), 'אין חובות פתוחים.'), 'col-half')
    ]));
  }

  global.DashboardView = { render: render };
})(window);
