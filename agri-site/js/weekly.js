/* weekly.js — מסך תכנון שבועי (לוח עברי) */
(function (global) {
  'use strict';
  var U = global.U;
  var weekStart = U.startOfWeek(U.todayISO());
  // תצוגה: 'week' (ברירת מחדל) או 'month'
  var viewMode = (localStorage.getItem('agri_plan_viewmode') === 'month') ? 'month' : 'week';
  function monthStartOf(iso) { var d = U.fromISO(iso); return U.toISO(new Date(d.getFullYear(), d.getMonth(), 1)); }
  var monthAnchor = monthStartOf(U.todayISO());

  // ---------- מזג אוויר (Open-Meteo, חינמי, ללא מפתח) ----------
  var DEF_LOC = { name: 'שילה', lat: 32.0556, lon: 35.2897 };
  var wxData = null, wxKey = null, wxLoading = null;
  function getLoc() { try { var s = JSON.parse(localStorage.getItem('agri_weather_loc')); if (s && s.lat) return s; } catch (e) {} return DEF_LOC; }
  function setLoc(o) { localStorage.setItem('agri_weather_loc', JSON.stringify(o)); }
  function wxIcon(code) {
    if (code === 0) return ['☀️', 'בהיר'];
    if (code <= 2) return ['🌤️', 'מעונן חלקית'];
    if (code === 3) return ['☁️', 'מעונן'];
    if (code === 45 || code === 48) return ['🌫️', 'ערפל'];
    if (code >= 51 && code <= 57) return ['🌦️', 'טפטוף'];
    if (code >= 61 && code <= 67) return ['🌧️', 'גשם'];
    if (code >= 71 && code <= 77) return ['❄️', 'שלג'];
    if (code >= 80 && code <= 82) return ['🌦️', 'ממטרים'];
    if (code >= 95) return ['⛈️', 'סופות'];
    return ['🌡️', ''];
  }
  function ensureForecast() {
    var loc = getLoc(), key = loc.lat + ',' + loc.lon;
    if ((wxKey === key && wxData) || wxLoading === key) return;
    wxLoading = key;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FJerusalem&forecast_days=16&past_days=3';
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var map = {};
      if (j && j.daily && j.daily.time) j.daily.time.forEach(function (d, i) {
        map[d] = { code: j.daily.weather_code[i], tmax: j.daily.temperature_2m_max[i], tmin: j.daily.temperature_2m_min[i], pop: j.daily.precipitation_probability_max[i] };
      });
      wxData = map; wxKey = key; wxLoading = null;
      if (global.App && App.render) App.render();
    }).catch(function () { wxLoading = null; });
  }
  // יישובי אזור בנימין (תחזית אזורית — דיוק הקואורדינטות אינו קריטי)
  var PRESETS = [
    { name: 'שילה', lat: 32.0556, lon: 35.2897 },
    { name: 'עפרה', lat: 31.9558, lon: 35.2722 },
    { name: 'כוכב השחר', lat: 31.9636, lon: 35.3433 },
    { name: 'בית אל', lat: 31.9436, lon: 35.2206 },
    { name: 'שער בנימין', lat: 31.8639, lon: 35.2492 },
    { name: 'פסגות', lat: 31.8983, lon: 35.2289 },
    { name: 'ירושלים', lat: 31.7683, lon: 35.2137 }
  ];
  // מטמון גיאוקודינג: שם מקום -> {lat,lon} (מאותחל מ-PRESETS לשמות נפוצים)
  function geocodeCache() { try { return JSON.parse(localStorage.getItem('agri_geocode')) || {}; } catch (e) { return {}; } }
  function geocodeSave(m) { localStorage.setItem('agri_geocode', JSON.stringify(m)); }
  function seedGeocode() {
    var m = geocodeCache(), changed = false;
    PRESETS.forEach(function (p) { if (!m[p.name]) { m[p.name] = { lat: p.lat, lon: p.lon }; changed = true; } });
    if (changed) geocodeSave(m);
    return m;
  }
  function geocodeName(name) {
    var m = geocodeCache();
    if (m[name]) return Promise.resolve(m[name]);
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) + '&count=1&language=he&format=json';
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var res = j && j.results && j.results[0];
      if (!res) return null;
      var c = { lat: res.latitude, lon: res.longitude };
      m[name] = c; geocodeSave(m);
      return c;
    }).catch(function () { return null; });
  }
  // מיקומי האתרים המשובצים בתקופה המוצגת (שבוע/חודש) — לבורר מזג האוויר
  function scheduledLocations() {
    var plan = Store.get().weeklyPlan || {};
    var days = [];
    if (viewMode === 'month') {
      var fd = U.fromISO(monthAnchor);
      var n = new Date(fd.getFullYear(), fd.getMonth() + 1, 0).getDate();
      for (var i = 0; i < n; i++) days.push(U.addDays(monthAnchor, i));
    } else {
      for (var j = 0; j < 6; j++) days.push(U.addDays(weekStart, j));
    }
    var seen = {}, out = [];
    days.forEach(function (iso) {
      (plan[iso] || []).forEach(function (it) {
        var s = it.siteId ? Store.getById('sites', it.siteId) : null;
        var loc = s ? (s.location || '').trim() : '';
        if (loc && !seen[loc]) { seen[loc] = true; out.push(loc); }
      });
    });
    return out;
  }

  // בורר מיקום תחזית — שילה תמיד ראשונה, ואחריה רק מיקומים משובצים שיש להם קואורדינטות
  var autoLocTried = {}, geoTried = {};
  function switchLoc(name) {
    seedGeocode();
    geocodeName(name).then(function (c) {
      if (!c) { U.toast('לא נמצאו קואורדינטות עבור "' + name + '" — המיקום לא שונה.', 'error'); App.render(); return; }
      setLoc({ name: name, lat: c.lat, lon: c.lon });
      wxData = null; wxKey = null;
      App.render();
    });
  }
  function weatherSelect() {
    var cache = seedGeocode();
    var locs = [DEF_LOC.name]; // שילה — תמיד מוצגת ותמיד בראש הרשימה
    scheduledLocations().forEach(function (n) {
      if (n === DEF_LOC.name) return;
      if (cache[n]) { locs.push(n); return; }
      // מיקום ללא קואורדינטות — לא מוצג; מנסים גיאוקודינג ברקע ויתווסף אם יימצא
      if (!geoTried[n]) {
        geoTried[n] = true;
        geocodeName(n).then(function (c) { if (c) App.render(); });
      }
    });
    var cur = getLoc().name;
    var sel = U.el('select', { class: 'wx-sel no-print', title: 'מיקום תחזית מזג האוויר — שילה + האתרים המשובצים בתקופה' },
      locs.map(function (n) { return U.el('option', { value: n }, '🌤 ' + n); }));
    if (locs.indexOf(cur) !== -1) {
      sel.value = cur;
    } else {
      // המיקום השמור לא ברשימה — מעבר אוטומטי למשובץ הראשון, ואם אין — לשילה (פעם אחת)
      var target = locs.length > 1 ? locs[1] : locs[0];
      if (!autoLocTried[target]) { autoLocTried[target] = true; switchLoc(target); }
    }
    sel.addEventListener('change', function () { switchLoc(sel.value); });
    return sel;
  }

  // ---------- אירועי בית הספר (Google Calendar API · מפתח מוגבל לדומיין, קריאה בלבד) ----------
  var GCAL_ID = 'regbn2024@gmail.com';
  var GCAL_KEY = 'AIzaSyDPv5eBvcZHauq7S8si1ONUdzW9MQK6Bbs';
  var evMap = null, evWeek = null, evLoading = false, evAt = 0;
  function ensureEvents() {
    var wk = weekStart;
    if (evLoading) return;
    if (evWeek === wk && evMap && Date.now() - evAt < 300000) return; // רענון אוטומטי כל 5 דקות
    evLoading = true;
    var url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(GCAL_ID) + '/events' +
      '?key=' + GCAL_KEY + '&singleEvents=true&orderBy=startTime&maxResults=100' +
      '&timeMin=' + U.addDays(wk, -1) + 'T00:00:00Z&timeMax=' + U.addDays(wk, 8) + 'T00:00:00Z';
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var map = {};
      (j.items || []).forEach(function (ev) {
        if (ev.status === 'cancelled') return;
        var title = ev.summary || '(ללא כותרת)', st = ev.start || {};
        if (st.date) { // אירוע יום-שלם (יכול להימשך כמה ימים)
          var d = st.date, endEx = (ev.end && ev.end.date) || U.addDays(st.date, 1), guard = 0;
          while (d < endEx && guard++ < 60) { (map[d] = map[d] || []).push(title); d = U.addDays(d, 1); }
        } else if (st.dateTime) {
          var iso = st.dateTime.slice(0, 10), hm = st.dateTime.slice(11, 16);
          (map[iso] = map[iso] || []).push(hm + ' · ' + title);
        }
      });
      evMap = map; evWeek = wk; evAt = Date.now(); evLoading = false;
      if (global.App && App.render) App.render();
    }).catch(function () { evLoading = false; });
  }
  function eventsOn(iso) { return (evMap && evWeek === weekStart && evMap[iso]) ? evMap[iso] : []; }

  function render(root, mode) {
    if (mode === 'week' || mode === 'month') viewMode = mode; // נשלט מלשונית "תכנון"
    ensureForecast();
    if (viewMode === 'week') ensureEvents();

    var nav;
    if (viewMode === 'month') {
      nav = [
        U.el('button', { class: 'btn secondary ico', title: 'חודש קודם', onclick: function () { monthAnchor = monthStartOf(U.addDays(monthAnchor, -1)); App.render(); } }, '→'),
        U.dateChip(U.monthLabel(U.monthKey(monthAnchor)), null,
          { onClick: function () { monthAnchor = monthStartOf(U.todayISO()); App.render(); }, title: 'לחצו לחזרה לחודש הנוכחי' }),
        U.el('button', { class: 'btn secondary ico', title: 'חודש הבא', onclick: function () { monthAnchor = monthStartOf(U.addDays(monthAnchor, 32)); App.render(); } }, '←')
      ];
    } else {
      nav = [
        U.el('button', { class: 'btn secondary ico', title: 'שבוע קודם', onclick: function () { weekStart = U.addDays(weekStart, -7); App.render(); } }, '→'),
        U.dateChip(U.gregLabel(weekStart) + ' – ' + U.gregLabel(U.addDays(weekStart, 5)), null,
          { onClick: function () { weekStart = U.startOfWeek(U.todayISO()); App.render(); }, title: 'לחצו לחזרה לשבוע הנוכחי' }),
        U.el('button', { class: 'btn secondary ico', title: 'שבוע הבא', onclick: function () { weekStart = U.addDays(weekStart, 7); App.render(); } }, '←')
      ];
    }

    var head = U.el('div', { class: 'page-head' }, nav.concat([
      weatherSelect(),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary ico no-print', title: 'תורנים שבועיים' + countSuffix('weeklyDuty'), onclick: function () { editWeekList('weeklyDuty', 'תורנים שבועיים'); } }, '🧹'),
      U.el('button', { class: 'btn secondary ico no-print', title: 'חולים השבוע' + countSuffix('weeklySick'), onclick: function () { editWeekList('weeklySick', 'חולים השבוע'); } }, '🤒'),
      U.el('button', { class: 'btn secondary ico no-print', title: 'ייצוא תמונה', onclick: exportImage }, '📷')
    ]));
    root.appendChild(head);

    if (viewMode === 'month') { root.appendChild(buildMonth()); return; }

    // הערה: תורנים/חולים שבועיים יורדים אוטומטית ממאגר התלמידים בסידור היומי לכל השבוע
    var duty = (Store.get().weeklyDuty[weekStart] || []).map(function (id) { var s = Store.getById('students', id); return s ? s.name : null; }).filter(Boolean);
    var sick = (Store.get().weeklySick[weekStart] || []).map(function (id) { var s = Store.getById('students', id); return s ? s.name : null; }).filter(Boolean);
    if (duty.length || sick.length) {
      root.appendChild(U.el('div', { class: 'muted', style: 'margin-bottom:10px;font-size:13px;' },
        (duty.length ? '🧹 תורנים: ' + duty.join(', ') : '') + (duty.length && sick.length ? '  |  ' : '') + (sick.length ? '🤒 חולים: ' + sick.join(', ') : '')));
    }

    root.appendChild(U.el('div', { class: 'print-only', style: 'text-align:center;margin-bottom:8px;' },
      [U.el('h2', { text: 'תכנון שבועי — רגבים בנימין' })]));

    var grid = U.el('div', { class: 'week-grid' });
    var plan = Store.get().weeklyPlan;
    for (var i = 0; i < 6; i++) { // ראשון–שישי, ללא שבת
      var iso = U.addDays(weekStart, i);
      grid.appendChild(buildDay(iso, plan[iso] || []));
    }
    root.appendChild(grid);
  }

  // לוח חודשי (6 שבועות × 7 ימים), שימוש חוזר ב-buildDay לכל תא
  function buildMonth() {
    var plan = Store.get().weeklyPlan;
    var first = monthAnchor;
    var fd = U.fromISO(first);
    var offset = fd.getDay(); // יום ראשון של השבוע הראשון
    var daysInMonth = new Date(fd.getFullYear(), fd.getMonth() + 1, 0).getDate();
    var cells = Math.ceil((offset + daysInMonth) / 7) * 7; // רק השבועות הדרושים לכיסוי החודש (בלי שבוע שלם של חודש אחר)
    var gridStart = U.addDays(first, -offset); // אחורה ליום ראשון
    var curMonth = U.monthKey(first);
    var wrap = U.el('div', { class: 'month-grid' });
    U.WEEKDAYS.slice(0, 6).forEach(function (wd) { wrap.appendChild(U.el('div', { class: 'month-dow', text: wd })); });
    for (var i = 0; i < cells; i++) {
      var iso = U.addDays(gridStart, i);
      if (U.fromISO(iso).getDay() === 6) continue; // ללא שבת
      var cell = buildDay(iso, plan[iso] || []);
      if (U.monthKey(iso) !== curMonth) cell.classList.add('other-month');
      wrap.appendChild(cell);
    }
    return wrap;
  }

  function countSuffix(key) {
    var arr = Store.get()[key][weekStart];
    return (arr && arr.length) ? ' (' + arr.length + ')' : '';
  }
  function editWeekList(key, title) {
    var d = Store.get();
    if (!d[key][weekStart]) d[key][weekStart] = [];
    global.PickStudents(title + ' · שבוע ' + U.gregLabel(weekStart), d[key][weekStart], function (sel) {
      d[key][weekStart] = sel;
      if (!sel.length) delete d[key][weekStart];
      Store.save(); App.render();
    });
  }

  // גוון קבוע לאתר (לפס צבע מזהה בפריטי התכנון)
  function siteHue(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return h;
  }

  function buildDay(iso, items) {
    var cell = U.el('div', { class: 'week-day' + (iso === U.todayISO() ? ' today' : '') });
    var h4 = U.el('h4', { class: 'day-link', title: 'מעבר לסידור היומי של יום זה', text: U.weekdayName(iso) });
    h4.addEventListener('click', function () { if (global.PlanningNav) PlanningNav.openDaily(iso); });
    cell.appendChild(h4);
    cell.appendChild(U.el('div', { class: 'heb', text: U.hebrewDate(iso) + ' · ' + U.gregLabel(iso) }));

    // --- מעל התכנון: מזג אוויר ואירועי יומן (כמו בגוגל קלנדר) ---
    var w = wxData && wxData[iso];
    if (w) {
      var ic = wxIcon(w.code);
      // שורה אחת קבועה: אייקון + טמפרטורות + גשם (התיאור המלא ב-tooltip), כדי לשמור גובה אחיד
      cell.appendChild(U.el('div', { class: 'wx-line', title: ic[1] },
        ic[0] + ' ' + Math.round(w.tmax) + '°/' + Math.round(w.tmin) + '°' +
        (w.pop != null && w.pop > 0 ? ' 💧' + w.pop + '%' : '')));
    } else if (viewMode === 'week') {
      cell.appendChild(U.el('div', { class: 'wx-line wx-empty', text: '— אין תחזית' }));
    }
    // תיבת יומן בגודל קבוע — מוצגת בכל הימים (במצב שבועי) כשיש אירועים כלשהם בשבוע
    if (viewMode === 'week' && weekHasAnyEvents()) cell.appendChild(buildEventsBox(eventsOn(iso)));

    // סה"כ עובדים שתוכננו ליום זה
    var totWorkers = items.reduce(function (sum, it) { return sum + U.num(it.workers); }, 0);
    if (totWorkers > 0) {
      cell.appendChild(U.el('div', { class: 'day-total', text: 'סה"כ מתוכננים: ' + totWorkers }));
    }

    items.forEach(function (it, idx) {
      var site = it.siteId ? Store.getById('sites', it.siteId) : null;
      var label = (site ? site.name : '(אתר)') + (it.workers ? ' · ' + it.workers : '');
      var trans = it.transportId ? Store.getById('transports', it.transportId) : null;
      var item = U.el('div', { class: 'plan-item', style: (it.siteId ? 'border-inline-start:4px solid hsl(' + siteHue(it.siteId) + ',45%,45%);' : '') }, [
        it.group ? U.el('span', { class: 'grp', text: it.group + ' ' }) : null,
        U.el('span', { text: label }),
        trans ? U.el('div', { class: 'muted', style: 'font-size:11px;', text: '🚌 ' + trans.name }) : null,
        it.note ? U.el('div', { class: 'muted', style: 'font-size:11px;', text: it.note }) : null,
        U.el('span', { class: 'ed no-print', text: '✎', title: 'עריכה', onclick: function () { openItem(iso, it, idx); } }),
        U.el('span', { class: 'x no-print', text: '✕', title: 'מחיקה', onclick: function () { removeItem(iso, idx); } })
      ]);
      item.addEventListener('click', function (e) {
        if (e.target.closest && (e.target.closest('.x') || e.target.closest('.ed'))) return;
        openItem(iso, it, idx);
      });
      cell.appendChild(item);
    });

    cell.appendChild(U.el('button', { class: 'btn small secondary no-print', style: 'margin-top:auto;', onclick: function () { openItem(iso, null, -1); } }, '+ הוסף'));
    return cell;
  }

  // האם יש אירועים כלשהם בשבוע הנוכחי (כדי להציג תיבה אחידה בכל הימים)
  function weekHasAnyEvents() {
    if (!evMap || evWeek !== weekStart) return false;
    for (var i = 0; i < 6; i++) { if ((evMap[U.addDays(weekStart, i)] || []).length) return true; }
    return false;
  }

  // תיבת אירועי יומן ממוסגרת בגודל קבוע — כותרת + גוף נגלל
  function buildEventsBox(evs) {
    var times = [];
    var rows = evs.map(function (t) {
      var m = /^(\d{2}:\d{2}) · ([\s\S]*)$/.exec(t);
      if (m) { times.push(m[1]); return U.el('div', { class: 'ev-item' }, [U.el('span', { class: 'ev-time', text: m[1] }), U.el('span', { text: m[2] })]); }
      return U.el('div', { class: 'ev-item allday' }, [U.el('span', { class: 'ev-time', text: 'כל היום' }), U.el('span', { text: t })]);
    });
    var body = U.el('div', { class: 'ev-box-body' }, rows.length ? rows : [U.el('div', { class: 'ev-empty', text: 'אין אירועים' })]);
    return U.el('div', { class: 'ev-box' }, [body]);
  }

  function rangeDates(from, to) {
    if (from > to) { var t = from; from = to; to = t; }
    var out = [], d = from, guard = 0;
    while (d <= to && guard < 400) { out.push(d); d = U.addDays(d, 1); guard++; }
    return out;
  }

  function openItem(iso, existing, idx) {
    var model = existing ? Object.assign({}, existing) : { siteId: '', workers: '', group: '', transportId: '', note: '' };

    var siteSel = optSelect('sites', model.siteId, 'בחר אתר…');
    var workersInp = U.el('input', { type: 'number', value: model.workers || '', placeholder: 'כמות עובדים', style: 'width:100%;' });
    var transSel = optSelect('transports', model.transportId, '(ללא הסעה)');
    var noteInp = U.el('input', { type: 'text', value: model.note || '', placeholder: 'הערה (בגרות / חג / וכו\')', style: 'width:100%;' });

    var bodyChildren = [
      field('אתר', siteSel), field('כמות עובדים', workersInp),
      field('הסעה', transSel), field('הערה', noteInp)
    ];

    // בחירת תאריכי יעד — רק בהוספה חדשה
    var datesMode = null, rangeFrom = null, rangeTo = null, multiBox = null;
    if (!existing) {
      datesMode = U.el('select', { style: 'width:100%;' }, [
        U.el('option', { value: 'single' }, 'יום זה בלבד'),
        U.el('option', { value: 'range' }, 'טווח תאריכים'),
        U.el('option', { value: 'multi' }, 'ימים נבחרים')
      ]);
      rangeFrom = U.el('input', { type: 'date', value: iso, style: 'width:100%;' });
      rangeTo = U.el('input', { type: 'date', value: iso, style: 'width:100%;' });
      var rangeRow = field('מ- / עד', U.el('div', { style: 'display:flex;gap:6px;' }, [rangeFrom, rangeTo]));
      rangeRow.style.display = 'none';
      multiBox = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;' });
      var wkStart = U.startOfWeek(iso);
      for (var i = 0; i < 6; i++) { // ראשון–שישי
        var di = U.addDays(wkStart, i);
        var cb = U.el('input', { type: 'checkbox', value: di });
        if (di === iso) cb.checked = true;
        multiBox.appendChild(U.el('label', { style: 'display:inline-flex;gap:3px;align-items:center;font-size:13px;font-weight:400;' }, [cb, U.weekdayName(di) + ' ' + U.gregLabel(di)]));
      }
      var multiRow = field('ימים', multiBox);
      multiRow.style.display = 'none';
      datesMode.addEventListener('change', function () {
        rangeRow.style.display = datesMode.value === 'range' ? '' : 'none';
        multiRow.style.display = datesMode.value === 'multi' ? '' : 'none';
      });
      bodyChildren.push(field('החל על', datesMode), rangeRow, multiRow);
    }

    var body = U.el('div', null, bodyChildren);

    var buttons = [{ label: 'ביטול', class: 'secondary' }];
    if (existing) buttons.push({ label: 'מחיקה', class: 'danger', onClick: function (close) { removeItem(iso, idx); close(); } });
    buttons.push({ label: 'שמירה', onClick: function (close) {
      var out = { siteId: siteSel.value || '', workers: workersInp.value === '' ? '' : U.num(workersInp.value), group: model.group || '', transportId: transSel.value || '', note: noteInp.value };
      var data = Store.get();
      var targets = [iso];
      if (!existing && datesMode) {
        if (datesMode.value === 'range') targets = rangeDates(rangeFrom.value || iso, rangeTo.value || iso);
        else if (datesMode.value === 'multi') {
          targets = Array.prototype.slice.call(multiBox.querySelectorAll('input:checked')).map(function (c) { return c.value; });
          if (!targets.length) targets = [iso];
        }
      }
      targets.forEach(function (d) {
        if (!data.weeklyPlan[d]) data.weeklyPlan[d] = [];
        if (existing && idx >= 0 && d === iso) data.weeklyPlan[d][idx] = out;
        else data.weeklyPlan[d].push(out);
        Sync.planChanged(d); // עדכון הסידור היומי בהתאם
      });
      Store.save(); close(); App.render();
    } });

    Modal.open((existing ? 'עריכת תכנון ל' : 'תכנון ל') + U.weekdayName(iso) + ' ' + U.hebrewDate(iso), body, buttons);
  }

  function removeItem(iso, idx) {
    var data = Store.get();
    if (!data.weeklyPlan[iso]) return;
    data.weeklyPlan[iso].splice(idx, 1);
    Sync.planChanged(iso); // הסרת הכרטיס מהסידור היומי (אם אין בו תלמידים)
    if (data.weeklyPlan[iso] && !data.weeklyPlan[iso].length) delete data.weeklyPlan[iso];
    Store.save(); App.render();
  }

  function optSelect(coll, selected, placeholder) {
    var items = (Store.get()[coll] || []).filter(function (x) { return x.active !== false; });
    var sel = U.el('select', { style: 'width:100%;' }, [U.el('option', { value: '' }, placeholder)].concat(
      items.map(function (it) { return U.el('option', { value: it.id }, it.name); })));
    sel.value = selected || '';
    return sel;
  }

  function field(label, input) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), input]); }

  // ---------- ייצוא תמונה של התכנון השבועי (ימים, תאריכים, אתרים + דרך הגעה; ללא הערות) ----------
  function exportImage() {
    if (typeof global.html2canvas === 'undefined') { U.toast('רכיב הייצוא עדיין נטען — נסו שוב בעוד רגע.', 'info'); return; }
    var plan = Store.get().weeklyPlan;
    var temp = U.el('div', { style: 'position:fixed;top:0;right:-12000px;width:1100px;box-sizing:border-box;background:#fff;padding:20px;direction:rtl;font-family:Arial,sans-serif;' });
    temp.appendChild(U.el('div', { style: 'text-align:center;font-weight:700;font-size:20px;color:#1b5e20;margin-bottom:4px;', text: 'תכנון שבועי — רגבים בנימין' }));
    temp.appendChild(U.el('div', { style: 'text-align:center;font-size:15px;margin-bottom:12px;', text: U.gregLabel(weekStart) + ' – ' + U.gregLabel(U.addDays(weekStart, 5)) }));
    var board = U.el('div', { style: 'display:grid;grid-template-columns:repeat(6,1fr);gap:6px;align-items:start;direction:rtl;' });
    for (var i = 0; i < 6; i++) {
      var iso = U.addDays(weekStart, i);
      var items = plan[iso] || [];
      var cell = U.el('div', { style: 'border:1px solid #cdd6cf;border-radius:8px;overflow:hidden;' });
      cell.appendChild(U.el('div', { style: 'background:#e8f5e9;color:#1b5e20;font-weight:700;font-size:13px;text-align:center;padding:5px 4px;', text: U.weekdayName(iso) }));
      cell.appendChild(U.el('div', { style: 'text-align:center;font-size:11px;color:#555;padding:2px 4px 6px;', text: U.hebrewDate(iso) + ' · ' + U.gregLabel(iso) }));
      if (!items.length) {
        cell.appendChild(U.el('div', { style: 'text-align:center;color:#aaa;font-size:11px;padding:4px 0 8px;', text: '—' }));
      } else {
        items.forEach(function (it) {
          var site = it.siteId ? Store.getById('sites', it.siteId) : null;
          cell.appendChild(U.el('div', { style: 'border-top:1px solid #eef0ee;padding:5px 6px;' }, [
            U.el('div', { style: 'font-size:12px;font-weight:600;color:#1c2733;', text: (it.group ? it.group + ' · ' : '') + (site ? site.name : '(אתר)') + (it.workers ? ' · ' + it.workers : '') })
          ]));
        });
      }
      board.appendChild(cell);
    }
    temp.appendChild(board);
    document.body.appendChild(temp);

    global.html2canvas(temp, { scale: 2, backgroundColor: '#ffffff' }).then(function (canvas) {
      document.body.removeChild(temp);
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'תכנון-שבועי-' + weekStart + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }).catch(function (e) {
      if (temp.parentNode) document.body.removeChild(temp);
      U.toast('שגיאה בייצוא התמונה: ' + e.message, 'error');
    });
  }

  global.WeeklyView = { render: render };
})(window);
