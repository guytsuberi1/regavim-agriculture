/* dashboard.js — דשבורד מנהלים: מבט על · סיכום יומי · הערות מהשטח · נתונים כספיים */
(function (global) {
  'use strict';
  var U = global.U;

  var sub = 'overview';      // overview | daily | notes | finance
  var period = 'month';      // week | month | year (לשונית "מבט על")
  var dashDate = U.todayISO(); // תאריך לסיכום היומי

  function money(n) { return '₪' + Math.round(U.num(n)).toLocaleString('he-IL'); }
  function inRange(iso, r) { return iso >= r.start && iso <= r.end; }

  // אתר "דווח" = יש בו תלמידים וכולם סומנו (יצא / לא יצא)
  function cardReported(card) {
    var s = card.students || [];
    return s.length > 0 && s.every(function (x) { return x.wentToWork || x.absent; });
  }

  // ---------- סיכום יומי לוואטסאפ (הטעונים טיפול) ----------
  function dailyAttentionMessage() {
    var day = (Store.get().days || {})[dashDate], cards = (day && day.cards) || [];
    var parts = ['*סיכום יומי — ' + U.weekdayName(dashDate) + ' (' + U.gregLabel(dashDate) + ')*', ''];
    var any = false;
    cards.forEach(function (c) {
      var site = c.siteId ? ((Store.getById('sites', c.siteId) || {}).name || '(אתר)') : '(אתר)';
      var flagged = (c.students || []).filter(function (s) { return !s.wentToWork || s.rating === 1 || s.rating === 5; });
      if (!flagged.length) return;
      any = true;
      parts.push('📍 *' + site + '*');
      flagged.forEach(function (s) {
        var stu = Store.getById('students', s.studentId) || { name: '?' };
        var cls = stu.className || stu.grade || '';
        var status = s.wentToWork ? ('ציון ' + s.rating) : (s.absent ? 'לא יצא' : 'לא סומן');
        parts.push('· ' + stu.name + (cls ? ' (' + cls + ')' : '') + ' — ' + status);
      });
      parts.push('');
    });
    var gen = ((Store.get().dailyAbsent || {})[dashDate] || []);
    if (gen.length) {
      parts.push('🚫 *נעדרים כלליים:*');
      gen.forEach(function (id) { var stu = Store.getById('students', id); if (stu) parts.push('· ' + stu.name); });
      any = true;
    }
    if (!any) parts.push('✓ אין תלמידים הטעונים טיפול היום.');
    return parts.join('\n');
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
          out.push({ date: iso, site: site, note: c.fieldNote, by: c.fieldNoteBy || '', card: c, handled: !!c.fieldNoteHandled });
        }
      });
    });
    // לא-מטופלות תחילה, ובתוך כל קבוצה החדשות למעלה
    out.sort(function (a, b) {
      if (a.handled !== b.handled) return a.handled ? 1 : -1;
      return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    });
    return out;
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
    if (!teachers.length) { alert('לא הוגדרו מחנכים. סמנו "מחנך" לאיש צוות תחת "נתוני בסיס".'); return; }
    var text = 'תזכורת: נא למלא את רשימת הנעדרים של היום.\nכניסה למערכת: https://chaklaut.rgvb.org.il\n("מצב שטח" ← "נעדרים היום")';
    var messages = [], noPhone = [];
    teachers.forEach(function (t) {
      var ph = smsPhone(t.phone);
      if (ph) messages.push({ phone: ph, text: text });
      else noPhone.push(t.name);
    });
    if (!messages.length) { alert('אין למחנכים מספרי טלפון תקינים.'); return; }
    if (!confirm('לשלוח תזכורת SMS ל-' + messages.length + ' מחנכים?' +
      (noPhone.length ? '\n(' + noPhone.length + ' ללא טלפון יידלגו)' : '') +
      '\n\n⚠️ שליחת SMS עולה כסף בחשבון 019.')) return;
    Store.sendSms(messages).then(function (res) {
      if (res.failed) U.toast('נשלחו ' + (res.sent || 0) + ' · נכשלו ' + res.failed + ((res.errors && res.errors.length) ? ' — ' + res.errors[0] : ''), 'error');
      else U.toast('נשלחו ' + (res.sent || 0) + ' תזכורות למחנכים');
    }).catch(function (e) {
      U.toast('שגיאה בשליחה: ' + ((e && e.message) ? e.message : e), 'error');
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
  // אנימציית "ספירה" קצרה לערך מספרי (מכבדת prefers-reduced-motion)
  function animateVal(el, val, fmt) {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !val) { el.textContent = fmt(val); return; }
    var dur = 650, t0 = null;
    function frame(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3); // ease-out
      el.textContent = fmt(val * e);
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = fmt(val);
    }
    requestAnimationFrame(frame);
  }

  function kpi(icon, value, label, tone, sub, badge, anim) {
    var valEl = U.el('div', { class: 'kpi-val', text: String(value) });
    if (anim && typeof anim.val === 'number' && isFinite(anim.val)) animateVal(valEl, anim.val, anim.fmt);
    return U.el('div', { class: 'kpi kpi-' + (tone || 'neutral') }, [
      U.el('div', { class: 'kpi-ic', text: icon }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-row' }, [
          valEl,
          badge ? U.el('span', { class: 'kpi-badge ' + badge.cls, text: badge.txt }) : null
        ]),
        U.el('div', { class: 'kpi-lbl', text: label }),
        sub ? U.el('div', { class: 'kpi-sub', text: sub }) : null
      ])
    ]);
  }
  function metricKpi(icon, label, cur, prev, fmt, tone, invert) {
    var badge = deltaBadge(cur, prev);
    // invert: מדד ש"פחות = טוב" (למשל היעדרויות) — עלייה תסומן באדום ולא בירוק
    if (invert && badge && (badge.cls === 'up' || badge.cls === 'down')) badge.cls = (badge.cls === 'up' ? 'down' : 'up');
    // אין תקופה קודמת (null או 0 נתונים) — בלי כיתוב "היה..." ובלי באדג'
    var sub = (prev == null || prev === 0) ? null : ('היה ' + fmt(prev) + ' ' + prevWord());
    var anim = (typeof cur === 'number' && isFinite(cur)) ? { val: cur, fmt: fmt } : null;
    return kpi(icon, cur == null ? '—' : fmt(cur), label, tone, sub, badge, anim);
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
    root.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;' }, [
      U.el('span', { class: 'muted', text: 'תצוגה לפי:' }), seg,
      U.el('span', { class: 'tag', text: rangeOf(period, 0).start + ' — ' + rangeOf(period, 0).end })
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
      metricKpi('🚜', 'אחוז יציאה לעבודה', cur.attPct, prev.attPct, function (v) { return Math.round(v) + '%'; }, 'info'),
      metricKpi('🚫', 'היעדרויות ללא אישור', cur.absUnap, prev.absUnap, num, 'info', true)
    ]);
    section('היקף פעילות', [
      metricKpi('🗓️', 'ימי עבודה', cur.workDays, prev.workDays, function (v) { return String(v); }, 'neutral'),
      metricKpi('🧑‍🌾', 'תלמידים פעילים', cur.activeStudents, prev.activeStudents, function (v) { return String(v); }, 'neutral'),
      metricKpi('👷', 'ממוצע תלמידים ליום עבודה', curAvg, prevAvg, one, 'neutral'),
      metricKpi('⏱️', 'שעות עבודה', cur.hours, prev.hours, num, 'neutral'),
      metricKpi('🕐', 'ממוצע שעות ליום עבודה', curHoursAvg, prevHoursAvg, one, 'neutral')
    ]);
    section('איכות', [
      metricKpi('⭐', 'ציון ממוצע', cur.ratingAvg, prev.ratingAvg, one, 'purple')
    ]);
    section('כספים', [
      metricKpi('💵', 'הכנסות (' + periodWord() + ')', cur.income, prev.income, money, 'good'),
      metricKpi('💸', 'הכנסה ממוצעת ליום עבודה', curIncAvg, prevIncAvg, money, 'good')
    ]);

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

  // ---------- סיכום יומי (תכנון מול ביצוע, לפי אתרים) ----------
  function renderDaily(root) {
    var dInp = U.el('input', { type: 'date', value: dashDate });
    dInp.addEventListener('change', function () { if (dInp.value) { dashDate = dInp.value; App.render(); } });
    root.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;' }, [
      U.el('button', { class: 'btn secondary small', onclick: function () { dashDate = U.addDays(dashDate, -1); App.render(); } }, '→ אתמול'),
      dInp,
      U.el('button', { class: 'btn secondary small', onclick: function () { dashDate = U.addDays(dashDate, 1); App.render(); } }, 'מחר ←'),
      U.el('button', { class: 'btn secondary small', onclick: function () { dashDate = U.todayISO(); App.render(); } }, 'היום'),
      U.el('span', { class: 'tag', text: U.weekdayName(dashDate) + ' · ' + U.gregLabel(dashDate) }),
      U.el('div', { class: 'spacer' }),
      U.el('a', { class: 'btn small', href: 'https://wa.me/?text=' + encodeURIComponent(dailyAttentionMessage()), target: '_blank', rel: 'noopener', style: 'background:#25D366;color:#fff;border:0;', title: 'שליחת סיכום היום בוואטסאפ' }, '💬 סיכום לוואטסאפ'),
      U.el('button', { class: 'btn small', title: 'שליחת SMS למחנכים למילוי הנעדרים היומיים', onclick: sendHomeroomReminder }, '📩 תזכורת למחנכים')
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
    var open = notes.filter(function (n) { return !n.handled; }).length;
    var box = U.el('div', { class: 'fieldnotes' });
    if (!notes.length) box.appendChild(U.el('div', { class: 'dash-empty', text: 'אין הערות מהשטח עדיין.' }));
    else notes.forEach(function (n) {
      var toggle = U.el('button', {
        class: 'btn small ' + (n.handled ? 'secondary' : ''),
        onclick: function () { n.card.fieldNoteHandled = !n.card.fieldNoteHandled; Store.save(); App.render(); }
      }, n.handled ? '↩ החזר לטיפול' : '✓ טופל');
      box.appendChild(U.el('div', { class: 'fieldnote' + (n.handled ? ' fn-handled' : '') }, [
        U.el('div', { class: 'fn-top' }, [
          U.el('span', { class: 'fn-site', text: n.site + (n.by ? ' · ' + n.by : '') }),
          U.el('span', { class: 'fn-date', text: U.gregLabel(n.date) })
        ]),
        U.el('div', { class: 'fn-text', text: n.note }),
        U.el('div', { style: 'margin-top:6px;text-align:left;' }, [toggle])
      ]));
    });
    root.appendChild(panel('📝 הערות מהשטח (' + open + ' פתוחות)', box));
  }

  // ---------- נתונים כספיים ----------
  function renderFinance(root) {
    var billed = global.BillingUtil ? BillingUtil.billedBySite() : {};
    var totalIncome = Object.keys(billed).reduce(function (a, k) { return a + U.num(billed[k].total); }, 0);
    var totalDebt = global.DebtUtil ? DebtUtil.totalOutstanding() : 0;
    var collected = global.DebtUtil ? DebtUtil.totalCollected() : 0;

    root.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi('💵', money(totalIncome), 'סה"כ הכנסות (חיוב, מצטבר)', 'good', null, null, { val: totalIncome, fmt: money }),
      kpi('✅', money(collected), 'סה"כ נגבה', 'info', null, null, { val: collected, fmt: money }),
      kpi('🧮', money(totalDebt), 'יתרת גבייה צפויה (חובות פתוחים)', totalDebt > 0 ? 'warn' : 'good', null, null, { val: totalDebt, fmt: money })
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
