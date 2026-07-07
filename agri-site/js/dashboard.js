/* dashboard.js — דשבורד מנהלים: מבט על · סיכום יומי · הערות מהשטח · נתונים כספיים */
(function (global) {
  'use strict';
  var U = global.U;

  var sub = 'overview';      // overview | daily | notes | finance
  var period = 'month';      // week | month | year (לשונית "מבט על")
  var dashDate = U.todayISO(); // תאריך לסיכום היומי
  var trendMetric = 'income'; // המדד המוצג בגרף המגמה (נבחר בלחיצה על כרטיס)
  var notesArchive = false;   // הערות מהשטח: תצוגת ארכיון (טופלו)

  function money(n) { return Math.round(U.num(n)).toLocaleString('he-IL') + ' ₪'; }
  function inRange(iso, r) { return iso >= r.start && iso <= r.end; }

  // אתר "דווח" = יש בו תלמידים וכולם סומנו (יצא / לא יצא)
  function cardReported(card) {
    var s = card.students || [];
    return s.length > 0 && s.every(function (x) { return x.wentToWork || x.absent; });
  }

  // ---------- תזכורת וואטסאפ לאנשי צוות שלא השלימו דיווח שטח ----------
  function waN(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.indexOf('972') === 0) return d;
    if (d.charAt(0) === '0') return '972' + d.slice(1);
    if (d.length === 9) return '972' + d;
    return d;
  }
  function staffWaReminder() {
    var day = (Store.get().days || {})[dashDate], cards = (day && day.cards) || [];
    var pending = [];
    cards.forEach(function (c) {
      var students = c.students || [];
      if (!students.length || cardReported(c)) return; // אין תלמידים / דווח במלואו
      var siteName = c.siteId ? ((Store.getById('sites', c.siteId) || {}).name || '(אתר)') : '(אתר)';
      var left = students.filter(function (s) { return !(s.wentToWork || s.absent); }).length;
      var ids = (c.staffIds && c.staffIds.length) ? c.staffIds : (c.staffId ? [c.staffId] : []);
      if (!ids.length) { pending.push({ name: null, phone: null, site: siteName, left: left }); return; }
      ids.forEach(function (id) {
        var p = Store.getById('staff', id);
        if (p) pending.push({ name: p.name, phone: p.phone, site: siteName, left: left });
      });
    });
    if (!pending.length) { U.toast('כל האתרים דווחו במלואם ✓'); return; }

    var body = U.el('div', null, [
      U.el('p', { class: 'muted', style: 'margin:0 0 10px;', text: 'אתרים שהדיווח בהם לא הושלם היום — לחצו לשליחת תזכורת אישית בוואטסאפ:' })
    ]);
    pending.forEach(function (p) {
      var msg = 'שלום ' + (p.name || '') + ',\nתזכורת: נא להשלים את דיווח מצב השטח של היום באתר "' + p.site + '" — נותרו ' + p.left + ' תלמידים לסימון.\nתודה 🌱 רגבים בנימין';
      var wn = waN(p.phone);
      body.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);' }, [
        U.el('span', { style: 'flex:1;font-size:14px;', text: (p.name || '⚠ ללא איש צוות') + ' · ' + p.site + ' · נותרו ' + p.left + (p.name && !wn ? ' · (אין מספר)' : '') }),
        p.name ? U.el('a', {
          class: 'btn small ico', target: '_blank', rel: 'noopener',
          href: (wn ? 'https://wa.me/' + wn : 'https://wa.me/') + '?text=' + encodeURIComponent(msg),
          style: 'background:#25D366;color:#fff;border:0;', title: 'שלח תזכורת בוואטסאפ', html: U.WA_SVG
        }) : null
      ]));
    });
    Modal.open('תזכורת דיווח שטח — ' + U.weekdayName(dashDate) + ' ' + U.gregLabel(dashDate), body, [{ label: 'סגור', class: 'secondary' }]);
  }

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
    var activeSet = {};
    Object.keys(days).forEach(function (iso) {
      if (!inRange(iso, r)) return;
      var cards = days[iso].cards || [];
      if (cards.some(function (c) { return c.siteId || (c.students && c.students.length); })) workDays++;
      var went = global.ReportsUtil ? ReportsUtil.wentOn(iso) : {};
      manDays += Object.keys(went).length;
      Object.keys(went).forEach(function (id) { activeSet[id] = true; });
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
      absUnap: absUnap, activeStudents: Object.keys(activeSet).length,
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
          out.push({ date: iso, site: site, note: c.fieldNote, by: c.fieldNoteBy || '', card: c, status: noteStatus(c) });
        }
      });
    });
    // תקוע תחילה (דחוף), אחר כך פתוח, ואז בטיפול; בתוך כל קבוצה — החדשות למעלה
    var rank = { stuck: 0, open: 1, progress: 2, done: 3 };
    out.sort(function (a, b) {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    });
    return out;
  }

  // סטטוס הערת שטח (תאימות לאחור: fieldNoteHandled הישן = טופל)
  var NOTE_STATUSES = [
    { v: 'open', label: 'פתוח', color: '#2563eb' },
    { v: 'progress', label: 'בטיפול', color: '#d97706' },
    { v: 'stuck', label: 'תקוע', color: '#dc2626' },
    { v: 'done', label: 'טופל', color: '#16a34a' }
  ];
  function noteStatus(c) { return c.fieldNoteStatus || (c.fieldNoteHandled ? 'done' : 'open'); }
  function noteStatusDef(v) {
    for (var i = 0; i < NOTE_STATUSES.length; i++) if (NOTE_STATUSES[i].v === v) return NOTE_STATUSES[i];
    return NOTE_STATUSES[0];
  }

  // ---------- תזכורת SMS למחנכים למילוי נעדרים (הועבר מהתכנון השבועי) ----------
  function smsPhone(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.indexOf('972') === 0) d = '0' + d.slice(3);
    if (d.length === 9 && d.charAt(0) !== '0') d = '0' + d;
    return d.length >= 9 ? d : null;
  }
  function sendHomeroomReminder() {
    var teachers = (Store.get().staff || []).filter(function (s) { return s.homeroomClass && String(s.homeroomClass).trim() && s.active !== false; });
    if (!teachers.length) { U.toast('לא הוגדרו מחנכים — מלאו "כיתת מחנך" לאיש צוות בנתוני בסיס.', 'info'); return; }
    var text = 'תזכורת: נא למלא את רשימת הנעדרים של היום.\nכניסה למערכת: https://chaklaut.rgvb.org.il\n("מצב שטח" ← "נעדרים היום")';
    var messages = [], noPhone = [];
    teachers.forEach(function (t) {
      var ph = smsPhone(t.phone);
      if (ph) messages.push({ phone: ph, text: text });
      else noPhone.push(t.name);
    });
    if (!messages.length) { U.toast('אין למחנכים מספרי טלפון תקינים.', 'error'); return; }
    Modal.confirm({
      title: 'תזכורת למחנכים',
      text: 'לשלוח תזכורת SMS ל-' + messages.length + ' מחנכים?' +
        (noPhone.length ? '\n(' + noPhone.length + ' ללא טלפון יידלגו)' : '') +
        '\n⚠️ שליחת SMS עולה כסף בחשבון 019.',
      okLabel: 'שלח'
    }, function () {
      Store.sendSms(messages).then(function (res) {
        if (res.failed) U.toast('נשלחו ' + (res.sent || 0) + ' · נכשלו ' + res.failed + ((res.errors && res.errors.length) ? ' — ' + res.errors[0] : ''), 'error');
        else U.toast('נשלחו ' + (res.sent || 0) + ' תזכורות למחנכים');
      }).catch(function (e) {
        U.toast('שגיאה בשליחה: ' + ((e && e.message) ? e.message : e), 'error');
      });
    });
  }

  // ---------- רכיבי UI ----------
  function deltaBadge(cur, prev) {
    if (cur == null || prev == null) return null;
    if (prev === 0) return null; // אין נתוני תקופה קודמת — בלי באדג' "חדש"
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
  function metricKpi(icon, label, cur, prev, fmt, tone, invert, key) {
    var badge = deltaBadge(cur, prev);
    // invert: מדד ש"פחות = טוב" (למשל היעדרויות) — עלייה תסומן באדום ולא בירוק
    if (invert && badge && (badge.cls === 'up' || badge.cls === 'down')) badge.cls = (badge.cls === 'up' ? 'down' : 'up');
    // אין תקופה קודמת (null או 0 נתונים) — בלי כיתוב "היה..." ובלי באדג'
    var sub = (prev == null || prev === 0) ? null : ('היה ' + fmt(prev) + ' ' + prevWord());
    var card = kpi(icon, cur == null ? '—' : fmt(cur), label, tone, sub, badge);
    // לחיצה על כרטיס מציגה את מגמת הנתון בגרף
    if (key) {
      card.classList.add('kpi-click');
      if (trendMetric === key) card.classList.add('sel');
      card.title = 'לחצו להצגת המגמה של: ' + label;
      card.addEventListener('click', function () { trendMetric = key; App.render(); });
    }
    return card;
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
      var isCur = i === values.length - 1;
      return U.el('div', { class: 'trend-col', title: v.label + ': ' + fmt(v.val || 0) }, [
        U.el('div', { class: 'trend-val' + (isCur ? ' cur' : ''), text: fmt(v.val || 0) }),
        U.el('div', { class: 'trend-bar' + (isCur ? ' cur' : ''), style: 'height:' + h.toFixed(0) + '%;' }),
        U.el('div', { class: 'trend-lbl' + (isCur ? ' cur' : ''), text: v.label })
      ]);
    }));
  }

  // ---------- רינדור ראשי ----------
  function render(root) {
    if (!Store.canManage()) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין הרשאה.')); return; }

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
    var r0 = rangeOf(period, 0);
    root.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;' }, [
      U.el('span', { class: 'muted', text: 'תצוגה לפי:' }), seg,
      U.el('span', { class: 'range-chip', title: r0.start + ' עד ' + r0.end }, [
        U.el('span', { class: 'rc-ic', text: '📅' }),
        U.el('span', { style: 'direction:rtl;', text: U.gregLabel(r0.start) + ' – ' + U.gregLabel(r0.end) + ' · ' + r0.start.slice(0, 4) })
      ])
    ]));

    var cur = computeRange(rangeOf(period, 0));
    var prev = computeRange(rangeOf(period, -1));
    var curAvg = cur.workDays ? cur.manDays / cur.workDays : null;
    var prevAvg = prev.workDays ? prev.manDays / prev.workDays : null;
    var curHoursAvg = cur.workDays ? cur.hours / cur.workDays : null;
    var prevHoursAvg = prev.workDays ? prev.hours / prev.workDays : null;
    var curIncAvg = cur.workDays ? cur.income / cur.workDays : null;
    var prevIncAvg = prev.workDays ? prev.income / prev.workDays : null;
    var num = function (v) { return Math.round(v).toLocaleString('he-IL'); };
    var one = function (v) { return v.toFixed(1); };

    // מקובצים לנושאים, וצבע הפס בכל כרטיס = צבע הקטגוריה (כדי שהצבע יהיה בעל משמעות)
    function section(title, cards) {
      root.appendChild(U.el('div', { class: 'dash-sec', text: title }));
      root.appendChild(U.el('div', { class: 'kpi-grid' }, cards));
    }

    section('נוכחות ומשמעת', [
      metricKpi('🚜', 'אחוז יציאה לעבודה', cur.attPct, prev.attPct, function (v) { return Math.round(v) + '%'; }, 'info', false, 'attPct'),
      metricKpi('🚫', 'היעדרויות ללא אישור', cur.absUnap, prev.absUnap, num, 'info', true, 'absUnap')
    ]);
    section('היקף פעילות', [
      metricKpi('🗓️', 'ימי עבודה', cur.workDays, prev.workDays, function (v) { return String(v); }, 'neutral', false, 'workDays'),
      metricKpi('🧑‍🌾', 'תלמידים פעילים', cur.activeStudents, prev.activeStudents, function (v) { return String(v); }, 'neutral', false, 'activeStudents'),
      metricKpi('👷', 'ממוצע תלמידים ליום עבודה', curAvg, prevAvg, one, 'neutral', false, 'avgStudents'),
      metricKpi('⏱️', 'שעות עבודה', cur.hours, prev.hours, num, 'neutral', false, 'hours'),
      metricKpi('🕐', 'ממוצע שעות ליום עבודה', curHoursAvg, prevHoursAvg, one, 'neutral', false, 'hoursAvg')
    ]);
    section('איכות', [
      metricKpi('⭐', 'ציון ממוצע', cur.ratingAvg, prev.ratingAvg, one, 'purple', false, 'ratingAvg')
    ]);
    section('כספים', [
      metricKpi('💵', 'הכנסות (' + periodWord() + ')', cur.income, prev.income, money, 'good', false, 'income'),
      metricKpi('💸', 'הכנסה ממוצעת ליום עבודה', curIncAvg, prevIncAvg, money, 'good', false, 'incomeAvg')
    ]);

    // גרף מגמה אחד — הנתון הנבחר (לחיצה על כרטיס מחליפה מדד), 6 התקופות האחרונות
    var moneyShort = function (v) { return v >= 9500 ? Math.round(v / 1000) + 'k ₪' : Math.round(v) + ' ₪'; };
    var METRICS = {
      attPct:         { label: 'אחוז יציאה לעבודה', get: function (m) { return m.attPct || 0; }, fmt: function (v) { return Math.round(v) + '%'; } },
      absUnap:        { label: 'היעדרויות ללא אישור', get: function (m) { return m.absUnap; }, fmt: function (v) { return String(Math.round(v)); } },
      workDays:       { label: 'ימי עבודה', get: function (m) { return m.workDays; }, fmt: function (v) { return String(Math.round(v)); } },
      activeStudents: { label: 'תלמידים פעילים', get: function (m) { return m.activeStudents; }, fmt: function (v) { return String(Math.round(v)); } },
      avgStudents:    { label: 'ממוצע תלמידים ליום עבודה', get: function (m) { return m.workDays ? m.manDays / m.workDays : 0; }, fmt: function (v) { return v.toFixed(1); } },
      hours:          { label: 'שעות עבודה', get: function (m) { return m.hours; }, fmt: function (v) { return String(Math.round(v)); } },
      hoursAvg:       { label: 'ממוצע שעות ליום עבודה', get: function (m) { return m.workDays ? m.hours / m.workDays : 0; }, fmt: function (v) { return v.toFixed(1); } },
      ratingAvg:      { label: 'ציון ממוצע', get: function (m) { return m.ratingAvg || 0; }, fmt: function (v) { return v.toFixed(1); } },
      income:         { label: 'הכנסות', get: function (m) { return m.income; }, fmt: moneyShort },
      incomeAvg:      { label: 'הכנסה ממוצעת ליום עבודה', get: function (m) { return m.workDays ? m.income / m.workDays : 0; }, fmt: moneyShort }
    };
    var mm = METRICS[trendMetric] || METRICS.income;
    var offs = [-5, -4, -3, -2, -1, 0];
    var series = offs.map(function (o) { return { label: periodShortLabel(period, o), r: rangeOf(period, o) }; });
    series.forEach(function (s) { s.m = computeRange(s.r); });
    root.appendChild(panel('📈 מגמה: ' + mm.label,
      trendChart(series.map(function (s) { return { label: s.label, val: mm.get(s.m) || 0 }; }), mm.fmt)));
    root.appendChild(U.el('p', { class: 'muted', style: 'font-size:12px;margin-top:4px;', text: 'לחצו על כל כרטיס נתון כדי להציג את המגמה שלו בגרף.' }));

    root.appendChild(U.el('p', { class: 'muted', style: 'font-size:12px;', text: 'הכנסות מחושבות לפי שעות×תעריף + נסיעות לכל יום (אומדן ניהולי; הנתון המדויק לחיוב נמצא ב"דרישת תשלום").' }));
  }

  // ---------- סיכום יומי (תכנון מול ביצוע, לפי אתרים) ----------
  function renderDaily(root) {
    // צ'יפ תאריך יחיד — לחיצה פותחת את בורר התאריך
    var dInp = U.el('input', { type: 'date', value: dashDate });
    dInp.addEventListener('change', function () { if (dInp.value) { dashDate = dInp.value; App.render(); } });
    var dateChip = U.dateChip(U.weekdayName(dashDate) + ' · ' + U.gregLabel(dashDate) + ' · ' + dashDate.slice(0, 4), dInp);
    root.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;' }, [
      U.el('button', { class: 'btn secondary small', onclick: function () { dashDate = U.addDays(dashDate, -1); App.render(); } }, '→ אתמול'),
      dateChip,
      U.el('button', { class: 'btn secondary small', onclick: function () { dashDate = U.addDays(dashDate, 1); App.render(); } }, 'מחר ←'),
      U.el('button', { class: 'btn secondary small', onclick: function () { dashDate = U.todayISO(); App.render(); } }, 'היום'),
      U.el('div', { class: 'spacer' }),
      U.el('div', { class: 'remind-group no-print' }, [
        U.el('div', { class: 'rg-title', text: 'תזכורת' }),
        U.el('div', { class: 'rg-btns' }, [
          U.el('button', { class: 'btn small ico secondary', title: 'תזכורת SMS למחנכים — מילוי נעדרים יומיים', onclick: sendHomeroomReminder }, '📩'),
          U.el('button', { class: 'btn small ico', style: 'background:#25D366;color:#fff;border:0;', title: 'תזכורת וואטסאפ לאנשי צוות שלא השלימו דיווח שטח', onclick: staffWaReminder, html: U.WA_SVG })
        ])
      ])
    ]));
    root.appendChild(U.el('div', { class: 'muted', style: 'font-size:12.5px;margin-bottom:10px;', text: 'מוצגים רק תלמידים הטעונים תשומת לב: לא יצאו · לא סומנו · ציון 1 או 5.' }));

    var day = (Store.get().days || {})[dashDate];
    var cards = (day && day.cards) ? day.cards : [];

    var planned = 0, went = 0, sites = 0;
    cards.forEach(function (c) {
      var w = (c.students || []).filter(function (s) { return s.wentToWork; }).length;
      if (c.targetWorkers !== '' && c.targetWorkers != null) planned += U.num(c.targetWorkers);
      went += w;
      if (c.siteId || (c.students || []).length) sites++;
    });
    var absUnap = 0;
    if (global.ReportsUtil) ReportsUtil.nonAttendanceOn(dashDate).forEach(function (x) { if (!ReportsUtil.getAbs(dashDate, x.studentId).approved) absUnap++; });
    var attTotal = went + absUnap, attPct = attTotal ? Math.round(went / attTotal * 100) : null;

    function tot(n, label) { return U.el('div', { class: 't' }, [U.el('b', { text: String(n) }), U.el('span', { text: label })]); }
    root.appendChild(U.el('div', { class: 'totbar' }, [
      tot(sites, 'אתרים'),
      tot(planned || '—', 'מתוכננים'),
      tot(went, 'יצאו לעבודה'),
      tot(attPct == null ? '—' : attPct + '%', 'אחוז יציאה')
    ]));

    if (!cards.length) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין שיבוץ ליום זה.')); }
    else cards.forEach(function (c) { root.appendChild(siteSection(c)); });

    var genAbsent = ((Store.get().dailyAbsent || {})[dashDate] || []);
    if (genAbsent.length) root.appendChild(generalAbsentSection(genAbsent));
  }

  function siteSection(card) {
    var site = card.siteId ? Store.getById('sites', card.siteId) : null;
    // סידור לפי כיתות: שכבה (ט→יב), אחר כך כיתה (ט1/ט2) ואז שם
    var students = (card.students || []).slice().sort(function (a, b) {
      var sa = Store.getById('students', a.studentId) || {}, sb = Store.getById('students', b.studentId) || {};
      var ga = U.GRADES.indexOf(sa.grade), gb = U.GRADES.indexOf(sb.grade);
      if (ga !== gb) return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb);
      var ca = sa.className || '', cb = sb.className || '';
      if (ca !== cb) return ca.localeCompare(cb, 'he');
      return (sa.name || '').localeCompare(sb.name || '', 'he');
    });
    var went = students.filter(function (s) { return s.wentToWork; }).length;
    var hasPlan = card.targetWorkers !== '' && card.targetWorkers != null;
    var planned = U.num(card.targetWorkers);
    var cls = hasPlan ? (went < planned ? 'under' : (went > planned ? 'over' : 'ok')) : '';
    var staff = (card.staffIds && card.staffIds.length ? card.staffIds : (card.staffId ? [card.staffId] : []))
      .map(function (id) { var p = Store.getById('staff', id); return p ? p.name : ''; }).filter(Boolean).join(', ');

    var head = U.el('div', { class: 'ds-site-head' }, [
      U.el('div', { class: 'ds-site-name', text: site ? site.name : '(אתר)' }),
      U.el('div', { class: 'ds-site-meta' }, [
        U.el('span', { class: 'tw-counter ' + cls, text: hasPlan ? ('ביצוע ' + went + ' / תכנון ' + planned) : ('יצאו ' + went + ' / ' + students.length) }),
        students.length ? U.el('span', { class: 'ds-report ' + (cardReported(card) ? 'done' : 'wait'), text: cardReported(card) ? '✓ דווח' : '⏳ בהמתנה לדיווח' }) : null,
        staff ? U.el('span', { class: 'muted', style: 'font-size:12px;', text: '👤 ' + staff }) : null
      ])
    ]);

    // מציגים רק תלמידים הטעונים טיפול: לא יצאו / לא סומנו / ציון קיצוני (1 או 5)
    var flagged = students.filter(function (s) { return !s.wentToWork || s.rating === 1 || s.rating === 5; });
    var list;
    if (!students.length) list = U.el('div', { class: 'muted', style: 'padding:6px 2px;', text: 'אין תלמידים משובצים.' });
    else if (!flagged.length) list = U.el('div', { style: 'padding:6px 2px;color:#166534;font-size:13px;', text: '✓ כל התלמידים יצאו לעבודה — אין טעון טיפול.' });
    else list = studentTable(flagged);

    var kids = [head, list];
    if (card.fieldNote) kids.push(U.el('div', { class: 'fieldnote', style: 'margin-top:8px;' }, [U.el('div', { class: 'fn-text', text: '📝 ' + card.fieldNote })]));
    return U.el('div', { class: 'card ds-site' }, kids);
  }

  // טבלה מסודרת עם כותרות עמודות: תלמיד · סטטוס · ציון · אישור · סיבה/הערה
  function studentTable(sts) {
    return U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid ds-table' }, [
      U.el('thead', null, [U.el('tr', null,
        ['תלמיד', 'סטטוס', 'ציון', 'אישור', 'סיבה / הערה'].map(function (h) { return U.el('th', { text: h }); }))]),
      U.el('tbody', null, sts.map(studentTr))
    ])]);
  }

  function studentTr(st) {
    var stu = Store.getById('students', st.studentId) || { name: '⚠ נמחק', grade: '', className: '' };
    var cls = stu.className || stu.grade || '';
    var name = (st.teamLeader ? '⭐ ' : '') + stu.name + (cls ? ' (' + cls + ')' : '');
    var went = st.wentToWork, absent = st.absent;
    var statusCls = went ? 'went' : (absent ? 'absent' : 'none');
    var statusTxt = went ? '✓ יצא' : (absent ? '✕ לא יצא' : '— לא סומן');

    var apprTd = U.el('td', { class: 'center' }), reasonTd = U.el('td');
    if (!went) {
      var info = (global.ReportsUtil && ReportsUtil.getAbs) ? ReportsUtil.getAbs(dashDate, st.studentId) : { approved: false, reason: '' };
      var sel = U.el('select', { class: 'ds-appr' }, [U.el('option', { value: '0' }, 'לא באישור'), U.el('option', { value: '1' }, 'באישור')]);
      sel.value = info.approved ? '1' : '0';
      var note = U.el('input', { type: 'text', class: 'ds-reason', value: info.reason || '', placeholder: 'סיבה / הערה' });
      function persist() { if (global.ReportsUtil && ReportsUtil.setAbs) ReportsUtil.setAbs(dashDate, st.studentId, { approved: sel.value === '1', reason: note.value }); }
      sel.addEventListener('change', persist); note.addEventListener('change', persist);
      apprTd.appendChild(sel); reasonTd.appendChild(note);
    }
    return U.el('tr', null, [
      U.el('td', { text: name }),
      U.el('td', { class: 'center' }, [U.el('span', { class: 'ds-status ' + statusCls, text: statusTxt })]),
      U.el('td', { class: 'center', text: (went && st.rating) ? ('⭐ ' + st.rating) : '' }),
      apprTd,
      reasonTd
    ]);
  }

  function generalAbsentSection(ids) {
    var sts = ids.map(function (id) { return { studentId: id, wentToWork: false, absent: true }; });
    return U.el('div', { class: 'card ds-site' }, [
      U.el('div', { class: 'ds-site-head' }, [U.el('div', { class: 'ds-site-name', text: '🚫 נעדרים כלליים (היום)' })]),
      studentTable(sts)
    ]);
  }

  // ---------- הערות מהשטח ----------
  function renderNotes(root) {
    var notes = fieldNotes();
    var openNotes = notes.filter(function (n) { return n.status !== 'done'; });
    var archived = notes.filter(function (n) { return n.status === 'done'; });
    var shown = notesArchive ? archived : openNotes;

    var box = U.el('div', { class: 'fieldnotes' });
    // מתג ארכיון
    box.appendChild(U.el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:8px;' }, [
      U.el('button', { class: 'btn small secondary', onclick: function () { notesArchive = !notesArchive; App.render(); } },
        notesArchive ? '↩ חזרה להערות פתוחות' : '📦 ארכיון (' + archived.length + ')')
    ]));

    if (!shown.length) {
      box.appendChild(U.el('div', { class: 'dash-empty', text: notesArchive ? 'הארכיון ריק.' : 'אין הערות פתוחות מהשטח 🎉' }));
    } else shown.forEach(function (n) {
      var def = noteStatusDef(n.status);
      // בורר סטטוס — צבוע לפי המצב הנבחר
      var ssel = U.el('select', { class: 'fn-status', style: 'color:' + def.color + ';border-color:' + def.color + ';' },
        NOTE_STATUSES.map(function (st) { return U.el('option', { value: st.v }, st.label); }));
      ssel.value = n.status;
      ssel.addEventListener('change', function () {
        n.card.fieldNoteStatus = ssel.value;
        delete n.card.fieldNoteHandled;
        Store.save(); App.render();
        if (ssel.value === 'done') U.toast('ההערה הועברה לארכיון');
      });
      // הערת רכז
      var reply = U.el('input', { type: 'text', class: 'fn-reply', value: n.card.fieldNoteReply || '', placeholder: '📝 הערת רכז (מה נעשה / למי הועבר)…' });
      reply.addEventListener('change', function () { n.card.fieldNoteReply = reply.value; Store.save(); });

      box.appendChild(U.el('div', { class: 'fieldnote', style: 'border-inline-start:4px solid ' + def.color + ';' }, [
        U.el('div', { class: 'fn-top' }, [
          U.el('span', { class: 'fn-site', text: n.site + (n.by ? ' · ' + n.by : '') }),
          U.el('span', { class: 'fn-date', text: U.gregLabel(n.date) })
        ]),
        U.el('div', { class: 'fn-text', text: n.note }),
        U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;' }, [ssel, reply])
      ]));
    });
    root.appendChild(panel('📝 הערות מהשטח (' + openNotes.length + ' פתוחות)', box));
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
      kpi('🧮', money(totalDebt), 'יתרת גבייה צפויה (חובות פתוחים)', totalDebt > 0 ? 'warn' : 'good')
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
