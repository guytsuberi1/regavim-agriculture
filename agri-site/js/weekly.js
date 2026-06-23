/* weekly.js — מסך תכנון שבועי (לוח עברי) */
(function (global) {
  'use strict';
  var U = global.U;
  var weekStart = U.startOfWeek(U.todayISO());

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
  function chooseLocation() {
    var sel = U.el('select', { style: 'width:100%;' }, PRESETS.map(function (p) { return U.el('option', { value: p.name }, p.name); }));
    sel.value = getLoc().name;
    Modal.open('מיקום לתחזית מזג האוויר', U.el('div', { class: 'field' }, [U.el('label', { text: 'בחרו יישוב באזור:' }), sel]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var p = PRESETS.filter(function (x) { return x.name === sel.value; })[0];
        if (p) { setLoc({ name: p.name, lat: p.lat, lon: p.lon }); wxData = null; wxKey = null; }
        close(); App.render();
      } }
    ]);
  }

  function render(root) {
    ensureForecast();
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'תכנון שבועי' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { weekStart = U.addDays(weekStart, -7); App.render(); } }, '→ שבוע קודם'),
      U.el('button', { class: 'btn secondary small', onclick: function () { weekStart = U.startOfWeek(U.todayISO()); App.render(); } }, 'השבוע'),
      U.el('button', { class: 'btn secondary small', onclick: function () { weekStart = U.addDays(weekStart, 7); App.render(); } }, 'שבוע הבא ←'),
      U.el('span', { class: 'tag', text: U.gregLabel(weekStart) + ' – ' + U.gregLabel(U.addDays(weekStart, 6)) }),
      U.el('button', { class: 'btn secondary small', title: 'שינוי מיקום לתחזית מזג האוויר', onclick: chooseLocation }, '📍 ' + getLoc().name),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', onclick: function () { editWeekList('weeklyDuty', 'תורנים שבועיים'); } }, '🧹 תורנים' + countSuffix('weeklyDuty')),
      U.el('button', { class: 'btn secondary', onclick: function () { editWeekList('weeklySick', 'חולים השבוע'); } }, '🤒 חולים' + countSuffix('weeklySick')),
      U.el('button', { class: 'btn accent', onclick: exportImage }, '🖼 ייצוא תמונה'),
      U.el('button', { class: 'btn accent', onclick: exportExcel }, '⬇ ייצוא אקסל')
    ]);
    root.appendChild(head);

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
    for (var i = 0; i < 7; i++) {
      var iso = U.addDays(weekStart, i);
      grid.appendChild(buildDay(iso, plan[iso] || []));
    }
    root.appendChild(grid);
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

  function buildDay(iso, items) {
    var cell = U.el('div', { class: 'week-day' });
    cell.appendChild(U.el('h4', { text: U.weekdayName(iso) }));
    cell.appendChild(U.el('div', { class: 'heb', text: U.hebrewDate(iso) + ' · ' + U.gregLabel(iso) }));

    // סה"כ עובדים שתוכננו ליום זה
    var totWorkers = items.reduce(function (sum, it) { return sum + U.num(it.workers); }, 0);
    if (totWorkers > 0) {
      cell.appendChild(U.el('div', { class: 'day-total', text: 'סה"כ מתוכננים: ' + totWorkers }));
    }

    items.forEach(function (it, idx) {
      var site = it.siteId ? Store.getById('sites', it.siteId) : null;
      var label = (site ? site.name : '(אתר)') + (it.workers ? ' · ' + it.workers : '');
      var trans = it.transportId ? Store.getById('transports', it.transportId) : null;
      var item = U.el('div', { class: 'plan-item' }, [
        it.group ? U.el('span', { class: 'grp', text: it.group + ' ' }) : null,
        U.el('span', { text: label }),
        trans ? U.el('div', { class: 'muted', style: 'font-size:11px;', text: '🚌 ' + trans.name }) : null,
        it.note ? U.el('div', { class: 'muted', style: 'font-size:11px;', text: it.note }) : null,
        U.el('span', { class: 'x no-print', text: '✕', onclick: function () { removeItem(iso, idx); } })
      ]);
      item.addEventListener('click', function (e) { if (e.target.className.indexOf('x') === -1) openItem(iso, it, idx); });
      cell.appendChild(item);
    });

    cell.appendChild(U.el('button', { class: 'btn small secondary no-print', style: 'margin-top:auto;', onclick: function () { openItem(iso, null, -1); } }, '+ הוסף'));

    // מזג אוויר ליום זה (אם בטווח התחזית)
    var w = wxData && wxData[iso];
    if (w) {
      var ic = wxIcon(w.code);
      cell.appendChild(U.el('div', { class: 'wx-line' },
        ic[0] + ' ' + ic[1] + ' · ' + Math.round(w.tmax) + '°/' + Math.round(w.tmin) + '°' +
        (w.pop != null && w.pop > 0 ? ' · 💧' + w.pop + '%' : '')));
    }
    return cell;
  }

  function openItem(iso, existing, idx) {
    var model = existing ? Object.assign({}, existing) : { siteId: '', workers: '', group: '', transportId: '', note: '' };

    var siteSel = optSelect('sites', model.siteId, 'בחר אתר…');
    var workersInp = U.el('input', { type: 'number', value: model.workers || '', placeholder: 'כמות עובדים', style: 'width:100%;' });
    var groupSel = U.el('select', { style: 'width:100%;' }, ['', 'A', 'B', 'C'].map(function (g) { return U.el('option', { value: g }, g || '(ללא קבוצה)'); }));
    groupSel.value = model.group || '';
    var transSel = optSelect('transports', model.transportId, '(ללא הסעה)');
    var noteInp = U.el('input', { type: 'text', value: model.note || '', placeholder: 'הערה (בגרות / חג / וכו\')', style: 'width:100%;' });

    var body = U.el('div', null, [
      field('אתר', siteSel), field('כמות עובדים', workersInp), field('קבוצה', groupSel),
      field('הסעה', transSel), field('הערה', noteInp)
    ]);

    var buttons = [{ label: 'ביטול', class: 'secondary' }];
    if (existing) buttons.push({ label: 'מחיקה', class: 'danger', onClick: function (close) { removeItem(iso, idx); close(); } });
    buttons.push({ label: 'שמירה', onClick: function (close) {
      var out = { siteId: siteSel.value || '', workers: workersInp.value === '' ? '' : U.num(workersInp.value), group: groupSel.value, transportId: transSel.value || '', note: noteInp.value };
      var data = Store.get();
      if (!data.weeklyPlan[iso]) data.weeklyPlan[iso] = [];
      if (idx >= 0) data.weeklyPlan[iso][idx] = out; else data.weeklyPlan[iso].push(out);
      Sync.planChanged(iso); // עדכון הסידור היומי בהתאם
      Store.save(); close(); App.render();
    } });

    Modal.open('תכנון ל' + U.weekdayName(iso) + ' ' + U.hebrewDate(iso), body, buttons);
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

  function exportExcel() {
    var plan = Store.get().weeklyPlan;
    var aoa = [['תכנון שבועי — רגבים בנימין'], [], ['תאריך', 'יום', 'תאריך עברי', 'אתר', 'כמות', 'קבוצה', 'הסעה', 'הערה']];
    for (var i = 0; i < 7; i++) {
      var iso = U.addDays(weekStart, i);
      var items = plan[iso] || [];
      if (!items.length) { aoa.push([U.gregLabel(iso), U.weekdayName(iso), U.hebrewDate(iso), '', '', '', '', '']); continue; }
      items.forEach(function (it) {
        var site = it.siteId ? Store.getById('sites', it.siteId) : null;
        var trans = it.transportId ? Store.getById('transports', it.transportId) : null;
        aoa.push([U.gregLabel(iso), U.weekdayName(iso), U.hebrewDate(iso), site ? site.name : '', it.workers, it.group, trans ? trans.name : '', it.note]);
      });
    }
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'תכנון');
    XLSX.writeFile(wb, 'תכנון-שבועי-' + weekStart + '.xlsx');
  }

  // ---------- ייצוא תמונה של התכנון השבועי (ימים, תאריכים, אתרים + דרך הגעה; ללא הערות) ----------
  function exportImage() {
    if (typeof global.html2canvas === 'undefined') { alert('רכיב הייצוא עדיין נטען — נסו שוב בעוד רגע.'); return; }
    var plan = Store.get().weeklyPlan;
    var temp = U.el('div', { style: 'position:fixed;top:0;right:-12000px;width:1100px;box-sizing:border-box;background:#fff;padding:20px;direction:rtl;font-family:Arial,sans-serif;' });
    temp.appendChild(U.el('div', { style: 'text-align:center;font-weight:700;font-size:20px;color:#1b5e20;margin-bottom:4px;', text: 'תכנון שבועי — רגבים בנימין' }));
    temp.appendChild(U.el('div', { style: 'text-align:center;font-size:15px;margin-bottom:12px;', text: U.gregLabel(weekStart) + ' – ' + U.gregLabel(U.addDays(weekStart, 6)) }));
    var board = U.el('div', { style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:start;direction:rtl;' });
    for (var i = 0; i < 7; i++) {
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
      alert('שגיאה בייצוא התמונה: ' + e.message);
    });
  }

  global.WeeklyView = { render: render };
})(window);
