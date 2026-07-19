/* dashboard.js — דשבורד מנהלים: מבט על · סיכום יומי · הערות מהשטח · נתונים כספיים */
(function (global) {
  'use strict';
  var U = global.U;

  var sub = 'overview';      // overview | daily | notes | finance
  var period = 'month';      // week | month | year (לשונית "מבט על")
  var dashDate = U.todayISO(); // תאריך לסיכום היומי
  var trendMetric = 'income'; // המדד המוצג בגרף המגמה (נבחר בלחיצה על כרטיס)
  var sparkData = {};        // key -> מערך ערכי 6 התקופות האחרונות (לספארקליין בכרטיס)

  // ברכה לפי שעת היום
  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return 'לילה טוב';
    if (h < 12) return 'בוקר טוב';
    if (h < 18) return 'צהריים טובים';
    if (h < 22) return 'ערב טוב';
    return 'לילה טוב';
  }
  function escXml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // רינדור מחדש בלי לקפוץ בעמוד (עדכון משימה בטבלה)
  function renderKeepScroll() {
    var y = window.scrollY;
    App.render();
    window.scrollTo(0, y);
    requestAnimationFrame(function () { window.scrollTo(0, y); });
  }
  // רינדור מחדש + גלילה חלקה אל גרף המגמה (לחיצה על כרטיס KPI ב"מבט על")
  function renderToTrend() {
    App.render();
    requestAnimationFrame(function () {
      var g = document.getElementById('dashTrendPanel');
      if (g) g.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  // משימות מהשטח — סינון ומיון של הטבלה
  var taskFilter = { status: '', site: '', q: '' }; // status '' = הכל חוץ מטופל; 'done' = ארכיון
  var taskSort = { key: 'smart', dir: 1 };          // 'smart' = תקוע→פתוח→בטיפול, חדש למעלה

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
      // שנת פעילות (שנת לימודים): 1.9 עד 31.8
      var d0 = U.fromISO(today);
      var sy = d0.getFullYear() - (d0.getMonth() < 8 ? 1 : 0) + offset; // לפני ספטמבר — עדיין בשנה שהתחילה אשתקד
      return { start: sy + '-09-01', end: (sy + 1) + '-08-31', kind: 'year' };
    }
    var d = U.fromISO(today);
    var first = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    var last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return { start: U.toISO(first), end: U.toISO(last), kind: 'month' };
  }
  function periodShortLabel(p, offset) {
    var r = rangeOf(p, offset);
    if (p === 'week') return U.gregLabel(r.start);
    if (p === 'year') return r.start.slice(0, 4) + '/' + r.end.slice(2, 4); // למשל 2025/26
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

  // כל המשימות: הערות שטח (על כרטיסי הימים) + משימות ידניות (data.tasks) — במבנה אחיד
  function allTasks() {
    var d = Store.get();
    var out = [];
    Object.keys(d.days || {}).forEach(function (iso) {
      (d.days[iso].cards || []).forEach(function (c) {
        if (c.fieldNote && String(c.fieldNote).trim()) {
          var site = c.siteId ? ((Store.getById('sites', c.siteId) || {}).name || '(אתר)') : '(אתר)';
          out.push({ kind: 'card', ref: c, date: iso, siteName: site, text: c.fieldNote, by: c.fieldNoteBy || '',
            status: noteStatus(c), reply: c.fieldNoteReply || '', assigneeId: c.fieldNoteAssignee || '', due: c.fieldNoteDue || '' });
        }
      });
    });
    (d.tasks || []).forEach(function (t) {
      var site = t.siteId ? ((Store.getById('sites', t.siteId) || {}).name || '(אתר)') : (t.site || '—');
      out.push({ kind: 'task', ref: t, date: t.date, siteName: site, text: t.text, by: t.by || '',
        status: t.status || 'open', reply: t.reply || '', assigneeId: t.assigneeId || '', due: t.due || '' });
    });
    return out;
  }
  // כתיבת שדה למשימה — לפי המקור (הערת שטח על כרטיס / משימה ידנית)
  function setTaskField(t, field, value) {
    if (t.kind === 'card') {
      var map = { status: 'fieldNoteStatus', reply: 'fieldNoteReply', assigneeId: 'fieldNoteAssignee', due: 'fieldNoteDue' };
      t.ref[map[field]] = value;
      if (field === 'status') delete t.ref.fieldNoteHandled;
    } else {
      t.ref[field] = value;
    }
    Store.save();
  }
  function staffName(id) { var s = id ? Store.getById('staff', id) : null; return s ? s.name : ''; }

  // כפתור וואטסאפ לאחראי משימה — שולח לו את כל המשימות הפתוחות שלו
  function assigneeWaBtn(t) {
    if (!t.assigneeId) return null;
    var s = Store.getById('staff', t.assigneeId);
    if (!s) return null;
    var wn = waN(s.phone);
    var mine = allTasks().filter(function (x) { return x.assigneeId === t.assigneeId && x.status !== 'done'; });
    var multi = mine.length > 1;
    var lines = ['שלום ' + s.name + ',', multi ? 'המשימות שלך מרגבים בנימין:' : 'משימה עבורך מרגבים בנימין:'];
    mine.forEach(function (x, i) {
      var site = (x.siteName && x.siteName !== '—') ? '[' + x.siteName + '] ' : '';
      var meta = [];
      if (x.due) meta.push('יעד ' + U.gregLabel(x.due));
      if (x.status === 'stuck') meta.push('תקוע');
      lines.push((multi ? (i + 1) + '. ' : '') + site + x.text + (meta.length ? ' (' + meta.join(' · ') + ')' : ''));
    });
    lines.push('תודה 🌱 רגבים בנימין');
    return U.el('a', {
      class: 'btn small ico no-print', target: '_blank', rel: 'noopener',
      href: (wn ? 'https://wa.me/' + wn : 'https://wa.me/') + '?text=' + encodeURIComponent(lines.join('\n')),
      style: 'background:#25D366;color:#fff;border:0;',
      title: wn ? 'שליחת ' + (multi ? mine.length + ' המשימות של ' : 'המשימה ל') + s.name + ' בוואטסאפ' : 'אין מספר טלפון ל' + s.name,
      html: U.WA_SVG
    });
  }
  function ageDays(iso) { try { return Math.round((U.fromISO(U.todayISO()) - U.fromISO(iso)) / 86400000); } catch (e) { return 0; } }
  function ageLabel(n) { return n <= 0 ? 'היום' : (n === 1 ? 'אתמול' : 'לפני ' + n + ' ימים'); }

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
  function kpi(icon, value, label, tone, sub, badge, spark) {
    var main = U.el('div', { class: 'kpi-main' }, [
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
    return U.el('div', { class: 'kpi kpi-' + (tone || 'neutral') }, [main, spark || null]);
  }
  function metricKpi(icon, label, cur, prev, fmt, tone, invert, key) {
    var badge = deltaBadge(cur, prev);
    // invert: מדד ש"פחות = טוב" (למשל היעדרויות) — עלייה תסומן באדום ולא בירוק
    if (invert && badge && (badge.cls === 'up' || badge.cls === 'down')) badge.cls = (badge.cls === 'up' ? 'down' : 'up');
    // אין תקופה קודמת (null או 0 נתונים) — בלי כיתוב "היה..." ובלי באדג'
    var sub = (prev == null || prev === 0) ? null : ('היה ' + fmt(prev) + ' ' + prevWord());
    var spark = (key && sparkData[key]) ? miniSpark(sparkData[key]) : null;
    var card = kpi(icon, cur == null ? '—' : fmt(cur), label, tone, sub, badge, spark);
    // לחיצה על כרטיס מציגה את מגמת הנתון בגרף
    if (key) {
      card.classList.add('kpi-click');
      if (trendMetric === key) card.classList.add('sel');
      card.title = 'לחצו להצגת המגמה של: ' + label;
      card.addEventListener('click', function () { trendMetric = key; renderToTrend(); });
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
  // ספארקליין זעיר בתוך כרטיס KPI (6 תקופות; החדש ביותר בצד שמאל, לפי RTL)
  function miniSpark(values) {
    var vals = (values || []).map(function (v) { return +v || 0; });
    if (vals.length < 2) return null;
    var rev = vals.slice().reverse();          // [חדש..ישן] → החדש בשמאל
    var n = rev.length, W = 68, H = 30, pad = 3;
    var max = Math.max.apply(null, rev), min = Math.min.apply(null, rev);
    var rng = (max - min) || 1;
    var X = function (i) { return pad + i * (W - 2 * pad) / (n - 1); };
    var Y = function (v) { return H - pad - (v - min) / rng * (H - 2 * pad); };
    var line = 'M' + X(0).toFixed(1) + ',' + Y(rev[0]).toFixed(1);
    for (var i = 1; i < n; i++) {
      var cx = (X(i - 1) + X(i)) / 2;
      line += ' C' + cx.toFixed(1) + ',' + Y(rev[i - 1]).toFixed(1) + ' ' + cx.toFixed(1) + ',' + Y(rev[i]).toFixed(1) + ' ' + X(i).toFixed(1) + ',' + Y(rev[i]).toFixed(1);
    }
    var area = line + ' L' + X(n - 1).toFixed(1) + ',' + (H - pad) + ' L' + X(0).toFixed(1) + ',' + (H - pad) + ' Z';
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
      + '<path d="' + area + '" fill="currentColor" fill-opacity="0.13" stroke="none"/>'
      + '<path d="' + line + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<circle cx="' + X(0).toFixed(1) + '" cy="' + Y(rev[0]).toFixed(1) + '" r="2.3" fill="currentColor"/></svg>';
    return U.el('div', { class: 'kpi-spark', html: svg });
  }
  // גרף מגמה כ-Area עם גרדיאנט וקו חלק (מחליף את גרף הפסים)
  function areaChart(values, fmt) {
    var data = values.slice().reverse();       // [חדש..ישן] → החדש בשמאל, בהתאמה ל-RTL
    var n = data.length;
    if (!n) return U.el('div', { class: 'dash-empty', text: 'אין נתונים.' });
    var vals = data.map(function (d) { return d.val || 0; });
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    var rng = (max - min) || 1;
    var W = 640, H = 190, padX = 42, padT = 30, padB = 34;
    var innerW = W - 2 * padX, innerH = H - padT - padB;
    var X = function (i) { return padX + (n === 1 ? innerW / 2 : i * innerW / (n - 1)); };
    var Y = function (v) { return padT + (1 - (v - min) / rng) * innerH; };
    var pts = vals.map(function (v, i) { return { x: X(i), y: Y(v) }; });
    var line = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
    for (var i = 1; i < n; i++) {
      var cx = (pts[i - 1].x + pts[i].x) / 2;
      line += ' C' + cx.toFixed(1) + ',' + pts[i - 1].y.toFixed(1) + ' ' + cx.toFixed(1) + ',' + pts[i].y.toFixed(1) + ' ' + pts[i].x.toFixed(1) + ',' + pts[i].y.toFixed(1);
    }
    var base = (padT + innerH).toFixed(1);
    var area = line + ' L' + pts[n - 1].x.toFixed(1) + ',' + base + ' L' + pts[0].x.toFixed(1) + ',' + base + ' Z';
    var s = '<defs><linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="currentColor" stop-opacity="0.30"/>'
      + '<stop offset="1" stop-color="currentColor" stop-opacity="0.02"/></linearGradient></defs>';
    s += '<line x1="' + padX + '" y1="' + base + '" x2="' + (W - padX) + '" y2="' + base + '" stroke="var(--border)" stroke-width="1"/>';
    s += '<path d="' + area + '" fill="url(#acGrad)"/>';
    s += '<path d="' + line + '" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
    pts.forEach(function (p, idx) {
      var cur = idx === 0;
      s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (cur ? 4.4 : 3) + '" fill="var(--card)" stroke="currentColor" stroke-width="' + (cur ? 3 : 2) + '"/>';
      s += '<text x="' + p.x.toFixed(1) + '" y="' + (p.y - 10).toFixed(1) + '" text-anchor="middle" class="ac-val' + (cur ? ' cur' : '') + '">' + escXml(fmt(vals[idx])) + '</text>';
      s += '<text x="' + p.x.toFixed(1) + '" y="' + (padT + innerH + 20).toFixed(1) + '" text-anchor="middle" class="ac-lbl' + (cur ? ' cur' : '') + '">' + escXml(data[idx].label) + '</text>';
    });
    return U.el('div', { class: 'trend-area', html: '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img">' + s + '</svg>' });
  }

  // ---------- רינדור ראשי ----------
  function render(root) {
    if (!Store.canManage()) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין הרשאה.')); return; }

    // אזור פתיחה אישי — ברכה לפי שעה + תאריך עברי
    var first = (Store.myFirstName && Store.myFirstName()) || '';
    root.appendChild(U.el('div', { class: 'dash-hero' }, [
      U.el('div', { class: 'dash-hero-l' }, [
        U.el('div', { class: 'dash-hero-hi', text: greeting() + (first ? ', ' + first : '') + ' 👋' }),
        U.el('div', { class: 'dash-hero-sub', text: '📊 דשבורד מנהלים · ' + U.weekdayName(U.todayISO()) + ' · ' + U.gregLabel(U.todayISO()) })
      ])
    ]));

    root.appendChild(U.el('div', { class: 'subtabs' }, [
      ['overview', '🔭 מבט על'], ['daily', '🗓️ סיכום יומי'], ['notes', '📝 משימות מהשטח'], ['finance', '💰 נתונים כספיים']
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

    // מדדים + סדרת 6 התקופות האחרונות — מחושבים לפני הכרטיסים כדי להזין ספארקליין בכל כרטיס
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
    var offs = [-5, -4, -3, -2, -1, 0];
    var series = offs.map(function (o) { return { label: periodShortLabel(period, o), r: rangeOf(period, o) }; });
    series.forEach(function (s) { s.m = computeRange(s.r); });
    sparkData = {};
    Object.keys(METRICS).forEach(function (k) {
      sparkData[k] = series.map(function (s) { return METRICS[k].get(s.m) || 0; });
    });

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
    var mm = METRICS[trendMetric] || METRICS.income;
    var trendPanel = panel('📈 מגמה: ' + mm.label,
      areaChart(series.map(function (s) { return { label: s.label, val: mm.get(s.m) || 0 }; }), mm.fmt));
    trendPanel.id = 'dashTrendPanel';
    root.appendChild(trendPanel);
    root.appendChild(U.el('p', { class: 'muted', style: 'font-size:12px;margin-top:4px;', text: 'לחצו על כל כרטיס נתון כדי להציג את המגמה שלו בגרף.' }));

    root.appendChild(U.el('p', { class: 'muted', style: 'font-size:12px;', text: 'הכנסות מחושבות לפי שעות×תעריף + נסיעות לכל יום (אומדן ניהולי; הנתון המדויק לחיוב נמצא ב"דרישת תשלום").' }));
  }

  // ---------- סיכום יומי (תכנון מול ביצוע, לפי אתרים) ----------
  function renderDaily(root) {
    // ניווט אחיד: חצים · צ'יפ=חזרה להיום · 📅 קפיצה לתאריך
    var dInp = U.el('input', { type: 'date', value: dashDate });
    dInp.addEventListener('change', function () { if (dInp.value) { dashDate = dInp.value; App.render(); } });
    dInp.classList.add('chip-date-input');
    var pickBtn = U.el('button', { class: 'btn secondary ico no-print', title: 'קפיצה לתאריך…' }, ['📅', dInp]);
    pickBtn.addEventListener('click', function () {
      try { if (dInp.showPicker) { dInp.showPicker(); return; } } catch (e) {}
      dInp.click();
    });
    root.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;' }, [
      U.el('button', { class: 'btn secondary ico', title: 'יום קודם', onclick: function () { dashDate = U.addDays(dashDate, -1); App.render(); } }, '→'),
      U.dateChip(U.weekdayName(dashDate) + ' · ' + U.gregLabel(dashDate) + ' · ' + dashDate.slice(0, 4), null,
        { onClick: function () { dashDate = U.todayISO(); App.render(); }, title: 'לחצו לחזרה להיום' }),
      U.el('button', { class: 'btn secondary ico', title: 'יום הבא', onclick: function () { dashDate = U.addDays(dashDate, 1); App.render(); } }, '←'),
      pickBtn,
      U.el('div', { class: 'spacer' }),
      U.actionMenu([
        { icon: '📩', label: 'תזכורת SMS למחנכים', title: 'מילוי נעדרים יומיים', onClick: sendHomeroomReminder },
        { html: U.WA_SVG, label: 'תזכורת וואטסאפ לצוות', title: 'לאנשי צוות שלא השלימו דיווח שטח', onClick: staffWaReminder }
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

  // ---------- משימות מהשטח — טבלת ניהול משימות ----------
  function meName() {
    var em = (global.Store && Store.currentEmail) ? Store.currentEmail() : null;
    var m = em ? (Store.get().staff || []).filter(function (s) { return (s.email || '').toLowerCase() === em; })[0] : null;
    return m ? m.name : 'רכז';
  }
  function visibleTasks() {
    var f = taskFilter;
    var t = allTasks().filter(function (x) {
      if (f.status) { if (x.status !== f.status) return false; }
      else if (x.status === 'done') return false; // ברירת מחדל: טופלו מוסתרים (הארכיון = סינון "טופל")
      if (f.site && x.siteName !== f.site) return false;
      if (f.q) {
        var hay = (x.text + ' ' + x.siteName + ' ' + x.by + ' ' + x.reply + ' ' + staffName(x.assigneeId)).toLowerCase();
        if (hay.indexOf(f.q.toLowerCase()) === -1) return false;
      }
      return true;
    });
    var rank = { stuck: 0, open: 1, progress: 2, done: 3 };
    var k = taskSort.key, dir = taskSort.dir;
    t.sort(function (a, b) {
      if (k === 'smart') {
        if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
      }
      var va, vb;
      if (k === 'status') { va = rank[a.status]; vb = rank[b.status]; }
      else if (k === 'assignee') { va = staffName(a.assigneeId); vb = staffName(b.assigneeId); }
      else if (k === 'site') { va = a.siteName; vb = b.siteName; }
      else { va = a[k] || ''; vb = b[k] || ''; }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
    return t;
  }
  function openAddTask() {
    var d = Store.get();
    var sites = (d.sites || []).filter(function (s) { return s.active !== false; });
    var staff = (d.staff || []).filter(function (s) { return s.active !== false; });
    var txt = U.el('textarea', { rows: '3', style: 'width:100%;', placeholder: 'מה צריך לעשות?' });
    var siteSel = U.el('select', { style: 'width:100%;' }, [U.el('option', { value: '' }, '— ללא אתר —')].concat(
      sites.map(function (s) { return U.el('option', { value: s.id }, s.name); })));
    var asgSel = U.el('select', { style: 'width:100%;' }, [U.el('option', { value: '' }, '— ללא אחראי —')].concat(
      staff.map(function (s) { return U.el('option', { value: s.id }, s.name); })));
    var dueInp = U.el('input', { type: 'date', style: 'width:100%;' });
    var err = U.el('div', { class: 'login-err', style: 'min-height:16px;' });
    Modal.open('➕ משימה חדשה', U.el('div', null, [
      U.el('div', { class: 'field' }, [U.el('label', { text: 'משימה *' }), txt, err]),
      U.el('div', { class: 'row' }, [
        U.el('div', { class: 'field' }, [U.el('label', { text: 'אתר (לא חובה)' }), siteSel]),
        U.el('div', { class: 'field' }, [U.el('label', { text: 'אחראי' }), asgSel]),
        U.el('div', { class: 'field' }, [U.el('label', { text: 'תאריך יעד' }), dueInp])
      ])
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'הוספה', onClick: function (close) {
        if (!String(txt.value || '').trim()) { err.textContent = 'כתבו את המשימה'; txt.focus(); return; }
        if (!d.tasks) d.tasks = [];
        d.tasks.push({ id: Store.uid(), date: U.todayISO(), siteId: siteSel.value || '', text: txt.value.trim(),
          by: meName(), status: 'open', reply: '', assigneeId: asgSel.value || '', due: dueInp.value || '' });
        Store.save(); close(); App.render();
        U.toast('המשימה נוספה');
      } }
    ]);
    setTimeout(function () { txt.focus(); }, 50);
  }
  function tasksWaLink() {
    var open = allTasks().filter(function (t) { return t.status !== 'done'; });
    var lines = ['📝 משימות פתוחות מהשטח (' + open.length + '):'];
    var rank = { stuck: 0, open: 1, progress: 2 };
    open.sort(function (a, b) { return (rank[a.status] || 0) - (rank[b.status] || 0); });
    open.forEach(function (t, i) {
      var bits = [noteStatusDef(t.status).label];
      if (t.assigneeId) bits.push('אחראי: ' + staffName(t.assigneeId));
      if (t.due) bits.push('יעד: ' + U.gregLabel(t.due));
      lines.push((i + 1) + '. [' + t.siteName + '] ' + t.text + ' (' + bits.join(' · ') + ')');
    });
    return 'https://wa.me/?text=' + encodeURIComponent(lines.join('\n'));
  }
  function renderNotes(root) {
    var all = allTasks();
    var counts = { open: 0, progress: 0, stuck: 0, done: 0 };
    all.forEach(function (t) { counts[t.status] = (counts[t.status] || 0) + 1; });
    var box = U.el('div');

    // צ'יפים מסכמים — לחיצה מסננת ("טופל" = הארכיון)
    box.appendChild(U.el('div', { class: 'task-chips' }, NOTE_STATUSES.map(function (st) {
      var on = taskFilter.status === st.v;
      var b = U.el('button', {
        class: 'task-chip' + (on ? ' on' : ''),
        style: on ? ('background:' + st.color + ';border-color:' + st.color + ';') : ('color:' + st.color + ';'),
        title: on ? 'ביטול הסינון' : 'הצגת "' + st.label + '" בלבד'
      }, (st.v === 'done' ? '📦 ' : '') + st.label + ' · ' + (counts[st.v] || 0));
      b.addEventListener('click', function () { taskFilter.status = on ? '' : st.v; App.render(); });
      return b;
    })));

    // שורת פקדים: חיפוש, סינון אתר, וואטסאפ, משימה חדשה
    var search = U.el('input', { type: 'search', class: 'task-q', placeholder: '🔍 חיפוש במשימות…', value: taskFilter.q });
    search.addEventListener('input', function () {
      taskFilter.q = search.value; App.render();
      var el = U.$('input.task-q'); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
    });
    var siteNames = {};
    all.forEach(function (t) { siteNames[t.siteName] = true; });
    var siteSel = U.el('select', null, [U.el('option', { value: '' }, 'כל האתרים')].concat(
      Object.keys(siteNames).sort().map(function (n) { return U.el('option', { value: n }, n); })));
    siteSel.value = taskFilter.site;
    siteSel.addEventListener('change', function () { taskFilter.site = siteSel.value; App.render(); });
    box.appendChild(U.el('div', { class: 'task-ctrl' }, [
      search, siteSel,
      U.el('div', { class: 'spacer' }),
      U.el('a', { class: 'btn small ico', target: '_blank', rel: 'noopener', href: tasksWaLink(),
        style: 'background:#25D366;color:#fff;border:0;', title: 'שליחת המשימות הפתוחות בוואטסאפ', html: U.WA_SVG }),
      U.el('button', { class: 'btn small', onclick: openAddTask }, '+ משימה')
    ]));

    var shown = visibleTasks();
    if (!shown.length) {
      box.appendChild(U.el('div', { class: 'dash-empty', text: (taskFilter.q || taskFilter.site || taskFilter.status) ? 'אין משימות מתאימות לסינון.' : 'אין משימות פתוחות 🎉' }));
    } else {
      var COLS = [['date', 'תאריך'], ['site', 'אתר'], ['text', 'משימה'], ['assignee', 'אחראי'], ['due', 'יעד'], ['status', 'סטטוס'], ['reply', 'הערת רכז'], ['', '']];
      var thead = U.el('tr', null, COLS.map(function (c) {
        if (!c[0]) return U.el('th', { text: '' });
        var arrow = taskSort.key === c[0] ? (taskSort.dir === 1 ? ' ▲' : ' ▼') : '';
        var th = U.el('th', { class: 'sortable', title: 'מיון לפי ' + c[1], text: c[1] + arrow });
        th.addEventListener('click', function () {
          if (taskSort.key === c[0]) taskSort.dir = -taskSort.dir; else { taskSort.key = c[0]; taskSort.dir = 1; }
          App.render();
        });
        return th;
      }));
      var today = U.todayISO();
      var staff = (Store.get().staff || []).filter(function (s) { return s.active !== false; });
      var rows = shown.map(function (t) {
        var def = noteStatusDef(t.status);
        var age = ageDays(t.date);
        var old = t.status !== 'done' && age > 7;
        // אחראי
        var asg = U.el('select', { class: 't-asg' }, [U.el('option', { value: '' }, '—')].concat(
          staff.map(function (s) { return U.el('option', { value: s.id }, s.name); })));
        asg.value = t.assigneeId && Store.getById('staff', t.assigneeId) ? t.assigneeId : '';
        asg.addEventListener('change', function () { setTaskField(t, 'assigneeId', asg.value); renderKeepScroll(); });
        var asgWa = assigneeWaBtn(t);
        // תאריך יעד — אדום כשעבר והמשימה לא טופלה
        var overdue = t.due && t.due < today && t.status !== 'done';
        var due = U.el('input', { type: 'date', class: 't-due' + (overdue ? ' overdue' : ''), value: t.due, title: overdue ? 'תאריך היעד עבר!' : 'תאריך יעד' });
        due.addEventListener('change', function () { setTaskField(t, 'due', due.value); renderKeepScroll(); });
        // סטטוס צבוע
        var ssel = U.el('select', { class: 'fn-status', style: 'color:' + def.color + ';border-color:' + def.color + ';' },
          NOTE_STATUSES.map(function (st) { return U.el('option', { value: st.v }, st.label); }));
        ssel.value = t.status;
        ssel.addEventListener('change', function () {
          setTaskField(t, 'status', ssel.value);
          renderKeepScroll();
          if (ssel.value === 'done') U.toast('המשימה הועברה לארכיון (סינון "טופל")');
        });
        // הערת רכז
        var reply = U.el('input', { type: 'text', class: 'fn-reply', style: 'width:100%;min-width:140px;', value: t.reply, placeholder: 'מה נעשה / למי הועבר…' });
        reply.addEventListener('change', function () { setTaskField(t, 'reply', reply.value); });
        // מחיקה — רק למשימות ידניות (דיווחי שטח נשארים כתיעוד; "טופל" מעביר לארכיון)
        var del = t.kind === 'task' ? U.el('button', { class: 'btn small secondary', title: 'מחיקת המשימה', onclick: function () {
          Modal.confirm({ title: 'מחיקת משימה', text: 'למחוק את המשימה?\n"' + t.text + '"', okLabel: 'מחק', danger: true }, function () {
            var d = Store.get();
            d.tasks = (d.tasks || []).filter(function (x) { return x.id !== t.ref.id; });
            Store.save(); App.render();
          });
        } }, '🗑') : null;
        return U.el('tr', { style: 'border-inline-start:4px solid ' + def.color + ';' }, [
          U.el('td', { class: (old ? 't-old' : '') }, [
            U.el('div', { text: U.gregLabel(t.date) }),
            U.el('div', { class: 't-age', text: ageLabel(age) })
          ]),
          U.el('td', { text: t.siteName }),
          U.el('td', null, [
            U.el('div', { text: t.text }),
            t.by ? U.el('div', { class: 'task-text-by', text: 'דיווח: ' + t.by }) : null
          ]),
          U.el('td', null, [U.el('div', { style: 'display:flex;gap:5px;align-items:center;' }, [asg, asgWa])]),
          U.el('td', null, [due]),
          U.el('td', null, [ssel]),
          U.el('td', null, [reply]),
          U.el('td', { class: 'actions' }, del ? [del] : [])
        ]);
      });
      box.appendChild(U.el('table', { class: 'grid task-tbl' }, [U.el('thead', null, [thead]), U.el('tbody', null, rows)]));
    }
    var openCount = counts.open + counts.progress + counts.stuck;
    root.appendChild(panel('📝 משימות מהשטח (' + openCount + ' פתוחות)', box));
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
