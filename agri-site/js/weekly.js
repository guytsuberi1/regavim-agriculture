/* weekly.js — מסך תכנון שבועי (לוח עברי) */
(function (global) {
  'use strict';
  var U = global.U;
  var weekStart = U.startOfWeek(U.todayISO());

  function render(root) {
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'תכנון שבועי' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { weekStart = U.addDays(weekStart, -7); App.render(); } }, '→ שבוע קודם'),
      U.el('button', { class: 'btn secondary small', onclick: function () { weekStart = U.startOfWeek(U.todayISO()); App.render(); } }, 'השבוע'),
      U.el('button', { class: 'btn secondary small', onclick: function () { weekStart = U.addDays(weekStart, 7); App.render(); } }, 'שבוע הבא ←'),
      U.el('span', { class: 'tag', text: U.gregLabel(weekStart) + ' – ' + U.gregLabel(U.addDays(weekStart, 6)) }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', onclick: function () { editWeekList('weeklyDuty', 'תורנים שבועיים'); } }, '🧹 תורנים' + countSuffix('weeklyDuty')),
      U.el('button', { class: 'btn secondary', onclick: function () { editWeekList('weeklySick', 'חולים השבוע'); } }, '🤒 חולים' + countSuffix('weeklySick')),
      U.el('button', { class: 'btn secondary', onclick: function () { window.print(); } }, '🖨 הדפסה'),
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

  global.WeeklyView = { render: render };
})(window);
