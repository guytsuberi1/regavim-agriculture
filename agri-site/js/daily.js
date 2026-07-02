/* daily.js — מסך סידור יומי */
(function (global) {
  'use strict';
  var U = global.U;
  var curDate = U.todayISO();
  var boardScroll = 0; // שמירת מיקום הגלילה האופקית של לוח האתרים בין רינדורים

  function getDay(iso) {
    var data = Store.get();
    if (!data.days[iso]) data.days[iso] = { cards: [] };
    return data.days[iso];
  }

  function activeList(coll) {
    return (Store.get()[coll] || []).filter(function (x) { return x.active !== false; });
  }

  // תג כיתה ברור וממותג
  function gradeBadge(g) {
    var i = U.GRADES.indexOf(g);
    return U.el('span', { class: 'grade-badge gb' + (i < 0 ? 'x' : i), title: 'כיתה ' + g, text: g });
  }
  // השוואת שני תלמידים לפי כיתה (ט→יב) ואז שם
  function gradeStudentCmp(idA, idB) {
    var a = Store.getById('students', idA) || {}, b = Store.getById('students', idB) || {};
    var ga = U.GRADES.indexOf(a.grade), gb = U.GRADES.indexOf(b.grade);
    if (ga !== gb) return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb);
    return (a.name || '').localeCompare(b.name || '', 'he');
  }

  function assignedStudentIds(day, exceptCardId) {
    var set = {};
    day.cards.forEach(function (c) {
      if (c.id === exceptCardId) return;
      (c.students || []).forEach(function (s) { set[s.studentId] = true; });
    });
    return set;
  }

  // אנשי צוות שכבר משובצים באתרים אחרים של אותו יום (לחסימת שיבוץ כפול)
  function assignedStaffIds(day, exceptCardId) {
    var set = {};
    day.cards.forEach(function (c) {
      if (c.id === exceptCardId) return;
      cardStaffIds(c).forEach(function (id) { if (id) set[id] = true; });
    });
    return set;
  }

  function render(root) {
    bindAutoScroll();
    Sync.mergeDate(curDate); // ודא שאתרים מהתכנון השבועי מופיעים ביום זה
    var day = getDay(curDate);

    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'סידור יומי' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { curDate = U.addDays(curDate, -1); App.render(); } }, '→ יום קודם'),
      dateInput(),
      U.el('button', { class: 'btn secondary small', onclick: function () { curDate = U.addDays(curDate, 1); App.render(); } }, 'יום הבא ←'),
      U.el('span', { class: 'tag', text: U.weekdayName(curDate) + ' · ' + U.hebrewDate(curDate) }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', title: 'נעדרים היום', onclick: openAbsentDialog }, '🚫' + (Store.get().dailyAbsent[curDate] && Store.get().dailyAbsent[curDate].length ? ' (' + Store.get().dailyAbsent[curDate].length + ')' : '')),
      U.el('button', { class: 'btn secondary ico', title: 'ייצוא תמונה', onclick: exportImage }, '📷'),
      U.el('button', { class: 'btn secondary ico', title: 'שליחה בוואטסאפ', style: 'color:#25D366;', onclick: openWhatsApp, html: U.WA_SVG }),
      U.el('button', { class: 'btn secondary ico', title: 'שליחת SMS לכולם', onclick: sendAllSms }, '📩'),
      U.el('button', { class: 'btn secondary', title: 'שיבוץ צוותים אוטומטי לפי היסטוריה', onclick: autoAssign }, '🤖 שבץ אוטומטית'),
      U.el('button', { class: 'btn', onclick: addCard }, '+ הוסף אתר')
    ]);
    root.appendChild(head);

    root.appendChild(U.el('div', { class: 'print-only', style: 'text-align:center;margin-bottom:8px;' }, [
      U.el('h2', { text: 'סידור עבודה — רגבים בנימין' }),
      U.el('div', { text: U.weekdayName(curDate) + ' · ' + U.hebrewDate(curDate) + ' · ' + U.gregLabel(curDate) })
    ]));

    root.appendChild(buildTotals(day));

    if (!day.cards.length) {
      root.appendChild(U.el('div', { class: 'card empty no-print' }, 'אין אתרים ליום זה. לחצו "הוסף אתר".'));
    } else {
      var board = U.el('div', { class: 'day-board' });
      day.cards.forEach(function (card) { board.appendChild(buildCard(day, card)); });
      board.addEventListener('scroll', function () { boardScroll = board.scrollLeft; });
      root.appendChild(board);
      // שחזור מיקום הגלילה האופקית אחרי רינדור מחדש (מונע "קפיצה" ימינה אחרי גרירה)
      board.scrollLeft = boardScroll;
      requestAnimationFrame(function () { board.scrollLeft = boardScroll; });
    }

    // מאגר התלמידים — מגירה תחתונה קבועה; גוררים את הקצה העליון כדי להגדיל אותה מעל האתרים
    var poolEl = buildPool(day);
    root.appendChild(poolEl);
    // ריווח תחתון כך שהאתרים התחתונים לא יוסתרו כשהמגירה קטנה (כשמגדילים — היא מכסה את האתרים)
    var gw = poolEl.querySelector('.pool-groups');
    var chrome = poolEl.offsetHeight - (gw ? gw.offsetHeight : 0);
    root.style.paddingBottom = (chrome + Math.min(getPoolHeight(), 280) + 14) + 'px';
  }

  function dateInput() {
    var inp = U.el('input', { type: 'date', value: curDate });
    inp.addEventListener('change', function () { if (inp.value) { curDate = inp.value; App.render(); } });
    return inp;
  }

  function buildTotals(day) {
    var total = 0, target = 0;
    day.cards.forEach(function (c) {
      target += U.num(c.targetWorkers);
      total += (c.students || []).length;
    });
    var items = [tot(day.cards.length, 'אתרים')];
    // ריבוע אחד: משובצים מול מתוכננים, צבוע לפי הכמות
    if (target > 0) {
      var cls = total < target ? 'under' : (total > target ? 'over' : 'ok');
      items.push(U.el('div', { class: 't tw-tot ' + cls }, [
        U.el('b', { text: total + ' / ' + target }),
        U.el('span', { text: 'משובצים / מתוכננים' })
      ]));
    } else {
      items.push(tot(total, 'משובצים'));
    }
    return U.el('div', { class: 'totbar' }, items);
  }
  function tot(n, label) { return U.el('div', { class: 't' }, [U.el('b', { text: n }), U.el('span', { text: label })]); }

  function buildCard(day, card) {
    var site = card.siteId ? Store.getById('sites', card.siteId) : null;
    var node = U.el('div', { class: 'site-card' });

    // ---- ראש כרטיס ----
    var siteSel = selectFrom('sites', card.siteId, 'בחר אתר…', true);
    siteSel.addEventListener('change', function () {
      card.siteId = siteSel.value || null;
      var s = card.siteId ? Store.getById('sites', card.siteId) : null;
      if (s && (card.hours == null || card.hours === '')) card.hours = s.defaultHours || Store.get().settings.defaultHours;
      if (s && !card.transportId && s.defaultTransportId) card.transportId = s.defaultTransportId;
      Sync.dayChanged(curDate);
      Store.save(); App.render();
    });

    var meta = U.el('div', { class: 'sc-meta' });
    if (site) {
      if (site.location) meta.appendChild(U.el('div', { text: '📍 ' + site.location }));
      if (site.contactName || site.phone) meta.appendChild(U.el('div', { text: '☎ ' + [site.contactName, site.phone].filter(Boolean).join(' · ') }));
      if (site.access) meta.appendChild(U.el('div', { text: '🚗 ' + site.access }));
    }

    // מונה: משובצים מול הרצוי (אם הוזן בתכנון השבועי), אחרת רק סה"כ המשובצים
    var assignedN = (card.students || []).length;
    var counter;
    if (card.targetWorkers !== '' && card.targetWorkers != null) {
      var targetN = U.num(card.targetWorkers);
      var cls = assignedN < targetN ? 'under' : (assignedN > targetN ? 'over' : 'ok');
      counter = U.el('div', { class: 'tw-counter ' + cls, text: 'משובצים ' + assignedN + ' / רצוי ' + targetN });
    } else {
      counter = U.el('div', { class: 'tw-counter', text: 'משובצים: ' + assignedN });
    }

    // חיווי חוסרים — אתר משובץ בלי איש צוות או בלי הסעה
    var warns = [];
    if (site && !cardStaffIds(card).length) warns.push('חסר איש צוות');
    if (site && !card.transportId) warns.push('חסרה הסעה');
    var warnEl = warns.length ? U.el('div', { class: 'sc-warn no-print', text: '⚠ ' + warns.join(' · ') }) : null;

    var head = U.el('div', { class: 'sc-head' }, [
      U.el('div', { style: 'display:flex;gap:4px;align-items:center;' }, [
        siteSel,
        U.el('button', { class: 'sc-del no-print', title: 'הסר אתר', onclick: function () { removeCard(day, card); } }, '×')
      ]),
      meta,
      counter,
      warnEl
    ]);

    // ---- גוף ----
    var body = U.el('div', { class: 'sc-body' });

    // הסעה / איש צוות / ראש צוות
    body.appendChild(labeledSelect('הסעה', 'transports', card, 'transportId'));
    body.appendChild(staffMultiControl(day, card));

    // שעות + נסיעות
    var hoursInp = U.el('input', { type: 'number', value: card.hours == null ? '' : card.hours, style: 'width:70px;', step: '0.5' });
    hoursInp.addEventListener('change', function () { card.hours = hoursInp.value === '' ? '' : U.num(hoursInp.value); Store.save(); });
    var targetInp = U.el('input', { type: 'number', value: (card.targetWorkers === '' || card.targetWorkers == null) ? '' : card.targetWorkers, style: 'width:70px;', min: '0', title: 'כמות עובדים רצויה (מהתכנון השבועי)' });
    targetInp.addEventListener('change', function () {
      card.targetWorkers = targetInp.value === '' ? '' : U.num(targetInp.value);
      Sync.dayChanged(curDate); // עדכון התכנון השבועי בהתאם
      Store.save(); App.render();
    });
    body.appendChild(U.el('div', { class: 'row', style: 'margin:6px 0;' }, [
      U.el('div', null, [U.el('label', { text: 'שעות' }), hoursInp]),
      U.el('div', null, [U.el('label', { text: 'רצוי' }), targetInp])
    ]));

    // בניית שורת תלמיד בודד
    function buildStudentLi(st) {
      var stu = Store.getById('students', st.studentId);
      var name = stu ? stu.name : '⚠ נמחק';
      var nameCell = U.el('div', { style: 'flex:1;display:flex;align-items:center;gap:7px;' }, [
        (stu && stu.grade) ? gradeBadge(stu.grade) : null,
        U.el('div', null, [
          U.el('div', { text: (st.teamLeader ? '⭐ ' : '') + name }),
          st.note ? U.el('div', { class: 'muted', style: 'font-size:11px;', text: '📝 ' + st.note }) : null
        ])
      ]);
      var li = U.el('li', { class: (st.teamLeader ? 'leader ' : ''), draggable: 'true' }, [
        nameCell,
        U.el('button', { class: 'sc-del no-print', title: 'הסר תלמיד', onclick: function () { removeStudent(card, st.studentId); } }, '×')
      ]);
      li.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'student:' + st.studentId); e.dataTransfer.effectAllowed = 'move'; });
      return li;
    }
    // מיון: ראש צוות ראשון, ואז לפי כיתה (ט→יב) ואז שם
    function sortLeadersFirst(arr) {
      return arr.slice().sort(function (a, b) {
        var la = a.teamLeader ? 0 : 1, lb = b.teamLeader ? 0 : 1;
        if (la !== lb) return la - lb;
        return gradeStudentCmp(a.studentId, b.studentId);
      });
    }

    // תלמידים — מקובצים לפי מצב המאגר: "לפי כיתות" → קיבוץ לפי כיתה; אחרת לפי צוות.
    // כל קבוצה ניתנת לגרירה בנפרד (לאתר אחר או חזרה למאגר).
    if (getPoolGroupMode() === 'grades') {
      var byGrade = {};
      (card.students || []).forEach(function (st) {
        var stu = Store.getById('students', st.studentId);
        var g = (stu && stu.grade) ? stu.grade : '';
        (byGrade[g] = byGrade[g] || []).push(st);
      });
      U.GRADES.concat(['']).forEach(function (g) {
        var items = byGrade[g];
        if (!items || !items.length) return;
        var ghChildren = [];
        if (g) {
          var ggrip = U.el('span', { class: 'grip no-print', draggable: 'true', title: 'גרירת הכיתה חזרה למאגר או לאתר אחר', text: '⠿' });
          ggrip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'grade:' + g); e.dataTransfer.effectAllowed = 'move'; });
          ghChildren.push(ggrip);
        }
        ghChildren.push(U.el('span', { class: 'sc-team-title' + (g ? '' : ' muted'), text: g ? 'כיתה ' + g : 'ללא כיתה' }));
        ghChildren.push(U.el('span', { class: 'muted', style: 'font-size:11px;', text: '(' + items.length + ')' }));
        var ulG = U.el('ul', { class: 'sc-students' });
        sortLeadersFirst(items).forEach(function (st) { ulG.appendChild(buildStudentLi(st)); });
        body.appendChild(U.el('div', { class: 'sc-team' }, [U.el('div', { class: 'sc-team-head' }, ghChildren), ulG]));
      });
    } else {
      var byTeam = {}, teamOrder = [], looseItems = [];
      (card.students || []).forEach(function (st) {
        var t = global.TeamUtil.teamOfStudent(st.studentId);
        if (t) {
          if (!byTeam[t.id]) { byTeam[t.id] = { team: t, items: [] }; teamOrder.push(t.id); }
          byTeam[t.id].items.push(st);
        } else { looseItems.push(st); }
      });

      teamOrder.forEach(function (tid) {
        var g = byTeam[tid];
        var grip = U.el('span', { class: 'grip no-print', draggable: 'true', title: 'גרירת הצוות לאתר אחר או חזרה למאגר', text: '⠿' });
        grip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'team:' + g.team.id); e.dataTransfer.effectAllowed = 'move'; });
        var gh = U.el('div', { class: 'sc-team-head' }, [
          grip,
          U.el('span', { class: 'sc-team-title', text: global.TeamUtil.teamLabel(g.team) }),
          U.el('span', { class: 'muted', style: 'font-size:11px;', text: '(' + g.items.length + ')' })
        ]);
        var ulT = U.el('ul', { class: 'sc-students' });
        sortLeadersFirst(g.items).forEach(function (st) { ulT.appendChild(buildStudentLi(st)); });
        body.appendChild(U.el('div', { class: 'sc-team is-team' }, [gh, ulT]));
      });

      if (looseItems.length) {
        var ulL = U.el('ul', { class: 'sc-students' });
        sortLeadersFirst(looseItems).forEach(function (st) { ulL.appendChild(buildStudentLi(st)); });
        body.appendChild(U.el('div', { class: 'sc-team loose' }, [
          U.el('div', { class: 'sc-team-head' }, [U.el('span', { class: 'sc-team-title muted', text: 'ללא צוות' })]),
          ulL
        ]));
      }
    }

    body.appendChild(U.el('div', { class: 'no-print', style: 'display:flex;gap:6px;flex-wrap:wrap;' }, [
      U.el('button', { class: 'btn small secondary', onclick: function () { openAddStudents(day, card); } }, '+ הוסף תלמידים'),
      (card.students || []).length ? U.el('button', { class: 'btn small danger', title: 'החזרת כל התלמידים המשובצים באתר זה למאגר', onclick: function () { clearCardStudents(day, card); } }, '↩ בטל שיבוץ') : null
    ]));

    // הערות
    var notesInp = U.el('input', { type: 'text', value: card.notes || '', placeholder: 'הערות…', style: 'width:100%;margin-top:6px;' });
    notesInp.addEventListener('change', function () { card.notes = notesInp.value; Store.save(); });
    body.appendChild(notesInp);

    // הערה שהשאיר איש הצוות בשטח (לקריאת הרכז)
    if (card.fieldNote) {
      body.appendChild(U.el('div', { class: 'card-fieldnote', style: 'margin-top:6px;background:#fff7e6;border:1px solid #f0d090;border-radius:6px;padding:6px 8px;font-size:13px;' }, [
        U.el('span', { style: 'font-weight:600;', text: '📝 מהשטח' + (card.fieldNoteBy ? ' (' + card.fieldNoteBy + ')' : '') + ': ' }),
        U.el('span', { text: card.fieldNote })
      ]));
    }

    node.appendChild(head);
    node.appendChild(body);

    // אזור גרירה — קבלת תלמיד בודד או צוות שלם
    node.addEventListener('dragover', function (e) { e.preventDefault(); node.classList.add('drag-over'); });
    node.addEventListener('dragleave', function () { node.classList.remove('drag-over'); });
    node.addEventListener('drop', function (e) {
      e.preventDefault();
      node.classList.remove('drag-over');
      handleDrop(day, card, e.dataTransfer.getData('text/plain'));
    });

    return node;
  }

  function labeledSelect(label, coll, card, prop, roleFilter) {
    var sel = selectFrom(coll, card[prop], '—', false, roleFilter);
    sel.addEventListener('change', function () { card[prop] = sel.value || null; Store.save(); });
    return U.el('div', { class: 'field', style: 'margin:6px 0;' }, [U.el('label', { text: label }), sel]);
  }

  function selectFrom(coll, selectedId, placeholder, isSite, roleFilter) {
    var items = activeList(coll);
    if (roleFilter) items = items.filter(function (x) { return (x.role || 'staff') === roleFilter; });
    var opts = [U.el('option', { value: '' }, placeholder)];
    items.forEach(function (it) {
      var label = it.name;
      var o = U.el('option', { value: it.id }, label);
      opts.push(o);
    });
    var sel = U.el('select', { style: isSite ? 'flex:1;font-weight:600;' : 'width:100%;' }, opts);
    sel.value = selectedId || '';
    return sel;
  }

  // ---------- אנשי צוות מרובים בכרטיס ----------
  function cardStaffIds(card) {
    if (card.staffIds && card.staffIds.length) return card.staffIds;
    return card.staffId ? [card.staffId] : [];
  }
  function cardStaffNames(card) {
    return cardStaffIds(card).map(function (id) { var p = Store.getById('staff', id); return p ? p.name : ''; }).filter(Boolean).join(', ');
  }
  function staffMultiControl(day, card) {
    if (!card.staffIds) card.staffIds = card.staffId ? [card.staffId] : [];
    var wrap = U.el('div', { class: 'field', style: 'margin:6px 0;' });
    wrap.appendChild(U.el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;' }, [
      U.el('label', { text: 'אנשי צוות', style: 'margin:0;' }),
      U.el('button', { class: 'btn small secondary no-print', title: 'בחירת אנשי צוות', onclick: function () { openAddStaff(day, card); } }, '+ הוסף')
    ]));
    if (card.staffIds.length) {
      var ul = U.el('ul', { class: 'sc-students staff-list' });
      card.staffIds.forEach(function (id) { ul.appendChild(buildStaffLi(day, card, id)); });
      wrap.appendChild(ul);
    } else {
      wrap.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;', text: 'לא שובצו' }));
    }
    return wrap;
  }

  // פריט איש-צוות בכרטיס — באותו פורמט כמו תלמיד: תיוג + שם + גרירה בין אתרים
  function buildStaffLi(day, card, id) {
    var p = Store.getById('staff', id);
    var badge = U.el('span', { class: 'staff-badge', text: 'צוות' });
    var li = U.el('li', { class: 'staff-li', draggable: 'true' }, [
      U.el('div', { style: 'flex:1;display:flex;align-items:center;gap:7px;' }, [badge, U.el('span', { text: p ? p.name : '(נמחק)' })]),
      U.el('button', { class: 'sc-del no-print', title: 'הסר', onclick: function () {
        card.staffIds = card.staffIds.filter(function (x) { return x !== id; });
        card.staffId = card.staffIds[0] || null;
        Store.save(); App.render();
      } }, '×')
    ]);
    li.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'staff:' + id); e.dataTransfer.effectAllowed = 'move'; });
    return li;
  }

  // העברת איש צוות לאתר (איש צוות = אתר אחד ביום): מסירים מכל אתר אחר ומוסיפים כאן
  function placeStaff(day, card, staffId) {
    day.cards.forEach(function (c) {
      if (c.staffIds) c.staffIds = c.staffIds.filter(function (x) { return x !== staffId; });
      if (c.staffId === staffId) c.staffId = (c.staffIds && c.staffIds[0]) || null;
    });
    if (!card.staffIds) card.staffIds = card.staffId ? [card.staffId] : [];
    if (card.staffIds.indexOf(staffId) === -1) card.staffIds.push(staffId);
    card.staffId = card.staffIds[0] || null;
  }

  // בחירת אנשי צוות מרובים — רשימה עם תיבות סימון (כמו הוספת חברים לצוות)
  function openAddStaff(day, card) {
    if (!card.staffIds) card.staffIds = card.staffId ? [card.staffId] : [];
    var takenElsewhere = assignedStaffIds(day, card.id);
    var staff = activeList('staff').sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });
    var selectedMap = {}; card.staffIds.forEach(function (id) { selectedMap[id] = true; });
    var search = U.el('input', { type: 'text', placeholder: 'חיפוש…', style: 'width:100%;margin-bottom:8px;' });
    var countEl = U.el('span', { class: 'tag' });
    var listBox = U.el('div', { style: 'max-height:340px;overflow:auto;' });
    function updateCount() { countEl.textContent = 'נבחרו: ' + Object.keys(selectedMap).filter(function (k) { return selectedMap[k]; }).length; }
    function build(filter) {
      U.clear(listBox);
      var shown = staff.filter(function (s) { return !filter || (s.name || '').indexOf(filter) !== -1; });
      if (!shown.length) { listBox.appendChild(U.el('div', { class: 'muted', style: 'padding:8px;', text: 'לא נמצאו' })); return; }
      shown.forEach(function (s) {
        var elsewhere = takenElsewhere[s.id] && !selectedMap[s.id];
        var cb = U.el('input', { type: 'checkbox', checked: !!selectedMap[s.id] });
        cb.disabled = !!elsewhere;
        cb.addEventListener('change', function () { selectedMap[s.id] = cb.checked; updateCount(); });
        listBox.appendChild(U.el('label', { style: 'display:flex;gap:7px;align-items:center;font-weight:400;color:var(--text);padding:3px 0;' + (elsewhere ? 'opacity:.5;' : '') },
          [cb, s.name + (s.role === 'leader' ? ' · ראש צוות' : '') + (elsewhere ? ' · (משובץ באתר אחר)' : '')]));
      });
    }
    search.addEventListener('input', function () { build(search.value.trim()); });
    build(''); updateCount();
    Modal.open('אנשי צוות — ' + (card.siteId ? (Store.getById('sites', card.siteId) || {}).name : 'אתר'),
      U.el('div', null, [U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px;' }, [search, countEl]), listBox]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        card.staffIds = Object.keys(selectedMap).filter(function (k) { return selectedMap[k]; });
        card.staffId = card.staffIds[0] || null;
        Store.save(); close(); App.render();
      } }
    ]);
  }

  // ---------- פעולות ----------
  function addCard() {
    var day = getDay(curDate);
    day.cards.push({ id: Store.uid(), siteId: null, transportId: null, staffId: null, leaderId: null, hours: Store.get().settings.defaultHours, travel: true, notes: '', students: [] });
    Store.save(); App.render();
  }

  function removeCard(day, card) {
    if ((card.students || []).length && !confirm('להסיר את האתר וכל השיבוצים בו?')) return;
    day.cards = day.cards.filter(function (c) { return c.id !== card.id; });
    Sync.dayChanged(curDate);
    Store.save(); App.render();
  }

  function removeStudent(card, studentId) {
    card.students = card.students.filter(function (s) { return s.studentId !== studentId; });
    Store.save(); App.render();
  }

  // ביטול שיבוץ — החזרת כל התלמידים של האתר למאגר
  function clearCardStudents(day, card) {
    var n = (card.students || []).length;
    if (!n) return;
    if (!confirm('להחזיר את כל ' + n + ' התלמידים המשובצים באתר זה למאגר?')) return;
    card.students = [];
    Store.save(); App.render();
  }

  // שיבוץ תלמיד לכרטיס ללא שמירה/רינדור (לשימוש פנימי)
  function placeStudent(day, card, studentId, teamLeader) {
    day.cards.forEach(function (c) {
      c.students = (c.students || []).filter(function (s) { return s.studentId !== studentId; });
    });
    card.students.push({ studentId: studentId, wentToWork: false, sick: false, rating: null, teamLeader: !!teamLeader });
  }

  function addStudentToCard(day, card, studentId) {
    placeStudent(day, card, studentId, false);
    Store.save(); App.render();
  }

  // שיבוץ צוות שלם לאתר — ראש הצוות מסומן כראש צוות
  function assignTeamToCard(day, card, teamId) {
    var team = Store.getById('teams', teamId);
    if (!team) return;
    var ids = global.TeamUtil.orderedStudentIds(team);
    ids.forEach(function (id) { placeStudent(day, card, id, id === team.leaderStudentId); });
    Store.save(); App.render();
  }

  // הסרת תלמיד מכל האתרים של היום (גרירה חזרה למאגר)
  function unassignStudent(day, studentId) {
    day.cards.forEach(function (c) {
      c.students = (c.students || []).filter(function (s) { return s.studentId !== studentId; });
    });
    Store.save(); App.render();
  }

  function unassignTeam(day, teamId) {
    var team = Store.getById('teams', teamId);
    if (!team) return;
    var ids = global.TeamUtil.orderedStudentIds(team);
    var set = {}; ids.forEach(function (id) { set[id] = true; });
    day.cards.forEach(function (c) {
      c.students = (c.students || []).filter(function (s) { return !set[s.studentId]; });
    });
    Store.save(); App.render();
  }

  // ---------- שיבוץ/הסרה של כיתה שלמה (תצוגת "לפי כיתות") ----------
  function gradeStudentIds(grade) {
    var ex = excludedSet();
    return (Store.get().students || []).filter(function (s) {
      return s.active !== false && (s.grade || '') === grade && !ex[s.id];
    }).map(function (s) { return s.id; });
  }
  function assignGradeToCard(day, card, grade) {
    gradeStudentIds(grade).forEach(function (id) { placeStudent(day, card, id, false); });
    Store.save(); App.render();
  }
  function unassignGrade(day, grade) {
    day.cards.forEach(function (c) {
      c.students = (c.students || []).filter(function (s) {
        var stu = Store.getById('students', s.studentId);
        return !(stu && (stu.grade || '') === grade);
      });
    });
    Store.save(); App.render();
  }

  // טיפול בגרירה לתוך כרטיס אתר
  function handleDrop(day, card, payload) {
    if (!payload) return;
    if (payload.indexOf('team:') === 0) {
      var teamId = payload.slice(5);
      // אם כל חברי הצוות כבר באתר הזה — מדובר בגרירה פנימית; לא לעשות כלום (מנע קפיצה לסוף הרשימה)
      var team = Store.getById('teams', teamId);
      if (team) {
        var ids = global.TeamUtil.orderedStudentIds(team);
        var allHere = ids.length && ids.every(function (id) { return card.students.some(function (s) { return s.studentId === id; }); });
        if (allHere) return;
      }
      assignTeamToCard(day, card, teamId);
    }
    else if (payload.indexOf('grade:') === 0) assignGradeToCard(day, card, payload.slice(6));
    else if (payload.indexOf('student:') === 0) { placeStudent(day, card, payload.slice(8), false); Store.save(); App.render(); }
    else if (payload.indexOf('staff:') === 0) { placeStaff(day, card, payload.slice(6)); Store.save(); App.render(); }
  }

  // ---------- מאגר התלמידים בתחתית (מחולק לצוותים) ----------
  function assignedSet(day) {
    var set = {};
    day.cards.forEach(function (c) { (c.students || []).forEach(function (s) { set[s.studentId] = true; }); });
    return set;
  }

  function getPoolHeight() {
    var h = parseInt(localStorage.getItem('agri_pool_height'), 10);
    return (isNaN(h) ? 240 : Math.max(60, Math.min(2000, h)));
  }
  function setPoolHeight(h) { localStorage.setItem('agri_pool_height', Math.max(60, Math.min(2000, Math.round(h)))); }

  function getHiddenGrades() {
    try { return JSON.parse(localStorage.getItem('agri_pool_grades') || '{}'); } catch (e) { return {}; }
  }
  function setGradeHidden(g, hide) {
    var h = getHiddenGrades();
    if (hide) h[g] = true; else delete h[g];
    localStorage.setItem('agri_pool_grades', JSON.stringify(h));
  }

  // תלמידים שיורדים מהמאגר היום (תורנים/חולים שבועיים + נעדרים יומיים) → { studentId: 'סיבה' }
  function excludedSet() {
    var d = Store.get();
    var wk = U.startOfWeek(curDate);
    var set = {};
    (d.weeklyDuty[wk] || []).forEach(function (id) { set[id] = 'תורן שבועי'; });
    (d.weeklySick[wk] || []).forEach(function (id) { set[id] = 'חולה השבוע'; });
    (d.dailyAbsent[curDate] || []).forEach(function (id) { set[id] = 'נעדר היום'; });
    return set;
  }

  // ניהול נעדרים ליום הנוכחי
  function openAbsentDialog() {
    var d = Store.get();
    if (!d.dailyAbsent[curDate]) d.dailyAbsent[curDate] = [];
    pickStudents('נעדרים ליום ' + U.gregLabel(curDate), d.dailyAbsent[curDate], function (sel) {
      d.dailyAbsent[curDate] = sel;
      if (!sel.length) delete d.dailyAbsent[curDate];
      // נעדר יורד גם משיבוץ קיים (גם אם סומן אחרי שכבר שובץ)
      var absSet = {}; sel.forEach(function (id) { absSet[id] = true; });
      getDay(curDate).cards.forEach(function (c) { c.students = (c.students || []).filter(function (s) { return !absSet[s.studentId]; }); });
      Store.save(); App.render();
    });
  }

  // בורר תלמידים גנרי (שומר סימונים תוך כדי חיפוש) — לשימוש בנעדרים/תורנים/חולים
  function pickStudents(title, preselectedIds, onSave, opts) {
    var students = activeList('students');
    if (opts && typeof opts.filter === 'function') students = students.filter(opts.filter);
    var selected = {};
    (preselectedIds || []).forEach(function (id) { selected[id] = true; });
    var search = U.el('input', { type: 'text', placeholder: 'חיפוש…', style: 'width:100%;margin-bottom:8px;' });
    var countEl = U.el('span', { class: 'tag' });
    var listBox = U.el('div', { style: 'max-height:340px;overflow:auto;' });
    function updateCount() { countEl.textContent = 'נבחרו: ' + Object.keys(selected).filter(function (k) { return selected[k]; }).length; }
    function build(filter) {
      U.clear(listBox);
      if (!students.length) { listBox.appendChild(U.el('div', { class: 'muted', style: 'padding:10px;', text: 'אין תלמידים להצגה.' })); return; }
      U.GRADES.concat(['']).forEach(function (g) {
        var grp = students.filter(function (s) { return (s.grade || '') === g && (!filter || s.name.indexOf(filter) !== -1); });
        if (!grp.length) return;
        listBox.appendChild(U.el('div', { class: 'muted', style: 'margin:6px 0 2px;font-weight:600;', text: g ? 'כיתה ' + g : 'ללא כיתה' }));
        grp.forEach(function (s) {
          var cb = U.el('input', { type: 'checkbox', checked: !!selected[s.id] });
          cb.addEventListener('change', function () { selected[s.id] = cb.checked; updateCount(); });
          listBox.appendChild(U.el('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:400;color:var(--text);padding:2px 0;' }, [cb, s.name]));
        });
      });
    }
    search.addEventListener('input', function () { build(search.value.trim()); });
    build(''); updateCount();
    Modal.open(title, U.el('div', null, [U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px;' }, [search, countEl]), listBox]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        onSave(Object.keys(selected).filter(function (k) { return selected[k]; }));
        close();
      } }
    ]);
  }
  global.PickStudents = pickStudents; // לשימוש גם במסך התכנון השבועי

  var poolSearchTerm = ''; // נשמר בין רינדורים כל עוד נשארים במסך הסידור

  function buildPool(day) {
    var assigned = assignedSet(day);
    var pool = U.el('div', { class: 'pool no-print' });

    // ידית גרירה לשינוי גובה המאגר — גררו מעלה כדי להגדיל (אפילו מעל האתרים), מטה כדי להקטין
    var resizer = U.el('div', { class: 'pool-resizer', title: 'גררו מעלה כדי להגדיל את המאגר (מעל האתרים) · מטה כדי להקטין' });
    pool.appendChild(resizer);

    var groupMode = getPoolGroupMode();
    var modeToggle = U.el('div', { class: 'pool-mode', style: 'display:inline-flex;gap:4px;' }, [
      U.el('button', { class: 'btn small ' + (groupMode === 'teams' ? 'accent' : 'secondary'), onclick: function () { setPoolGroupMode('teams'); App.render(); } }, 'לפי צוותים'),
      U.el('button', { class: 'btn small ' + (groupMode === 'grades' ? 'accent' : 'secondary'), onclick: function () { setPoolGroupMode('grades'); App.render(); } }, 'לפי כיתות')
    ]);
    var dragHelp = groupMode === 'grades'
      ? 'גררו תלמיד בודד, או כיתה שלמה מהכותרת ⠿, לאתר. גרירה לכאן מבטלת שיבוץ.'
      : 'גררו תלמיד בודד, או צוות שלם מהכותרת ⠿, לאתר. גרירה לכאן מבטלת שיבוץ.';
    var head = U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
      U.el('h3', { style: 'margin:0;color:var(--green-dark);', text: '👥 מאגר תלמידים' }),
      modeToggle,
      U.el('span', { class: 'muted', text: dragHelp })
    ]);
    pool.appendChild(head);

    // אזור שחרור לביטול שיבוץ
    pool.addEventListener('dragover', function (e) { e.preventDefault(); pool.classList.add('drag-over'); });
    pool.addEventListener('dragleave', function () { pool.classList.remove('drag-over'); });
    pool.addEventListener('drop', function (e) {
      e.preventDefault(); pool.classList.remove('drag-over');
      var p = e.dataTransfer.getData('text/plain');
      if (p.indexOf('team:') === 0) unassignTeam(day, p.slice(5));
      else if (p.indexOf('grade:') === 0) unassignGrade(day, p.slice(6));
      else if (p.indexOf('student:') === 0) unassignStudent(day, p.slice(8));
    });

    // סינון לפי כיתה — ביטול סימון מסתיר את כל תלמידי הכיתה מהמאגר
    var hidden = getHiddenGrades();
    function gradeVisible(g) { return !hidden[g || '']; }
    var searchInp = U.el('input', { type: 'search', class: 'pool-search', placeholder: '🔍 חיפוש שם תלמיד…', value: poolSearchTerm });
    searchInp.addEventListener('input', function () { poolSearchTerm = searchInp.value; applyNameFilter(poolSearchTerm); });
    var filterRow = U.el('div', { class: 'pool-filter' },
      [searchInp, U.el('span', { class: 'muted', text: 'הצג כיתות:' })].concat(
        U.GRADES.map(function (g) {
          var cb = U.el('input', { type: 'checkbox', checked: !hidden[g] });
          cb.addEventListener('change', function () { setGradeHidden(g, !cb.checked); App.render(); });
          return U.el('label', { class: 'gf' }, [cb, ' ' + g]);
        })
      ));
    pool.appendChild(filterRow);

    var groupsWrap = U.el('div', { class: 'pool-groups' });
    groupsWrap.style.height = getPoolHeight() + 'px';

    // לוגיקת גרירת הידית לשינוי גובה
    resizer.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var startY = e.clientY;
      var startH = groupsWrap.getBoundingClientRect().height;
      document.body.style.userSelect = 'none';
      function onMove(ev) {
        var nh = startH + (startY - ev.clientY); // גרירה מעלה = גדל
        nh = Math.max(60, Math.min(Math.round(window.innerHeight * 0.8), nh));
        groupsWrap.style.height = nh + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        setPoolHeight(parseInt(groupsWrap.style.height, 10));
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // תלמידים שיורדים מהמאגר היום: תורנים/חולים שבועיים + נעדרים יומיים
    var excluded = excludedSet();
    function show(id, g) { return gradeVisible(g) && !excluded[id]; }

    if (groupMode === 'grades') {
      // תצוגה לפי כיתות
      var visibleStudents = (Store.get().students || []).filter(function (s) { return s.active !== false && show(s.id, s.grade); })
        .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });
      var anyGrade = false;
      U.GRADES.concat(['']).forEach(function (g) {
        var grp = visibleStudents.filter(function (s) { return (s.grade || '') === g; });
        if (grp.length) { groupsWrap.appendChild(buildGradeGroup(g, grp, assigned)); anyGrade = true; }
      });
      if (!anyGrade) {
        groupsWrap.appendChild(U.el('div', { class: 'muted', text: 'אין תלמידים. הוסיפו תלמידים ב"נתוני בסיס".' }));
      }
    } else {
      var groups = global.TeamUtil.allTeams().map(function (t) {
        var ids = global.TeamUtil.orderedStudentIds(t).filter(function (id) {
          var s = Store.getById('students', id); return s && show(id, s.grade);
        });
        return { type: 'team', team: t, ids: ids };
      }).filter(function (e) { return e.ids.length; });

      // תלמידים ללא צוות — משתתפים באותו מיון כמו הצוותים (לא נתקעים בסוף)
      var noTeam = (Store.get().students || []).filter(function (s) {
        return s.active !== false && show(s.id, s.grade) && !global.TeamUtil.teamOfStudent(s.id);
      });
      if (noTeam.length) groups.push({ type: 'loose', students: noTeam, ids: noTeam.map(function (s) { return s.id; }) });

      // קבוצות שכל חבריהן כבר משובצים יורדות לתחתית — כולל "ללא צוות"
      groups.sort(function (a, b) {
        var aa = a.ids.every(function (id) { return assigned[id]; }) ? 1 : 0;
        var bb = b.ids.every(function (id) { return assigned[id]; }) ? 1 : 0;
        return aa - bb;
      });
      groups.forEach(function (e) {
        if (e.type === 'team') groupsWrap.appendChild(buildTeamGroup(day, e.team, e.ids, assigned));
        else groupsWrap.appendChild(buildLooseGroup(e.students, assigned));
      });

      if (!groups.length) {
        groupsWrap.appendChild(U.el('div', { class: 'muted', text: 'אין תלמידים. הוסיפו תלמידים ב"נתוני בסיס" וצוותים ב"צוותים".' }));
      }
    }

    pool.appendChild(groupsWrap);

    // חיפוש לפי שם — מסתיר תלמידים שאינם תואמים ומקפל צוותים שנשארים ריקים
    function applyNameFilter(term) {
      term = (term || '').trim();
      var groups = groupsWrap.querySelectorAll('.pool-group');
      Array.prototype.forEach.call(groups, function (g) {
        var chips = g.querySelectorAll('.chip');
        if (!chips.length) return;
        var anyVisible = false;
        Array.prototype.forEach.call(chips, function (c) {
          var match = !term || c.textContent.indexOf(term) !== -1;
          c.style.display = match ? '' : 'none';
          if (match) anyVisible = true;
        });
        g.style.display = anyVisible ? '' : 'none';
      });
    }
    applyNameFilter(poolSearchTerm);

    return pool;
  }

  var chipGradeColors = { 'ט': '#fff3cd', 'י': '#d1ecf1', 'יא': '#d4edda', 'יב': '#f8d7da' };

  function studentChip(id, assigned) {
    var s = Store.getById('students', id);
    if (!s) return null;
    var chip = U.el('div', { class: 'chip' + (assigned[id] ? ' assigned' : ''), draggable: 'true' }, [
      s.grade ? gradeBadge(s.grade) : null,
      U.el('span', { text: s.name })
    ]);
    chip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'student:' + id); e.dataTransfer.effectAllowed = 'move'; });
    return chip;
  }

  function buildTeamGroup(day, team, ids, assigned) {
    var grip = U.el('span', { class: 'grip', draggable: 'true', title: 'גרור צוות שלם', text: '⠿' });
    grip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'team:' + team.id); e.dataTransfer.effectAllowed = 'move'; });

    var allAssigned = ids.every(function (id) { return assigned[id]; });
    var header = U.el('div', { class: 'pg-head' + (allAssigned ? ' all-assigned' : '') }, [
      grip,
      U.el('span', { class: 'pg-title', text: '⭐ ' + global.TeamUtil.teamLabel(team) }),
      U.el('span', { class: 'muted', style: 'font-size:11px;', text: '(' + ids.length + ')' })
    ]);

    var chips = U.el('div', { class: 'pg-chips' });
    ids.forEach(function (id) { var c = studentChip(id, assigned); if (c) chips.appendChild(c); });

    return U.el('div', { class: 'pool-group' }, [header, chips]);
  }

  function buildLooseGroup(students, assigned) {
    var header = U.el('div', { class: 'pg-head' }, [U.el('span', { class: 'pg-title', text: 'ללא צוות' }),
      U.el('span', { class: 'muted', style: 'font-size:11px;', text: '(' + students.length + ')' })]);
    var chips = U.el('div', { class: 'pg-chips' });
    students.forEach(function (s) { var c = studentChip(s.id, assigned); if (c) chips.appendChild(c); });
    return U.el('div', { class: 'pool-group loose' }, [header, chips]);
  }

  // קבוצת מאגר לפי כיתה (מצב "לפי כיתות")
  function buildGradeGroup(grade, students, assigned) {
    var headChildren = [];
    if (grade) {
      var grip = U.el('span', { class: 'grip', draggable: 'true', title: 'גרור כיתה שלמה', text: '⠿' });
      grip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'grade:' + grade); e.dataTransfer.effectAllowed = 'move'; });
      headChildren.push(grip);
    }
    headChildren.push(U.el('span', { class: 'pg-title', text: grade ? 'כיתה ' + grade : 'ללא כיתה' }));
    headChildren.push(U.el('span', { class: 'muted', style: 'font-size:11px;', text: '(' + students.length + ')' }));
    var allAssigned = students.every(function (s) { return assigned[s.id]; });
    var header = U.el('div', { class: 'pg-head' + (allAssigned ? ' all-assigned' : '') }, headChildren);
    var chips = U.el('div', { class: 'pg-chips' });
    students.forEach(function (s) { var c = studentChip(s.id, assigned); if (c) chips.appendChild(c); });
    return U.el('div', { class: 'pool-group' }, [header, chips]);
  }

  // מצב תצוגת המאגר: 'teams' (ברירת מחדל) או 'grades'
  function getPoolGroupMode() { return localStorage.getItem('agri_pool_groupmode') === 'grades' ? 'grades' : 'teams'; }
  function setPoolGroupMode(m) { localStorage.setItem('agri_pool_groupmode', m === 'grades' ? 'grades' : 'teams'); }

  function openAddStudents(day, card) {
    var assigned = assignedStudentIds(day, card.id);
    var students = activeList('students');

    // הסימונים נשמרים במפה קבועה — כך חיפוש לא מאפס בחירות קודמות
    var selectedMap = {};
    (card.students || []).forEach(function (x) { selectedMap[x.studentId] = true; });

    var search = U.el('input', { type: 'text', placeholder: 'חיפוש…', style: 'width:100%;margin-bottom:8px;' });
    var countEl = U.el('span', { class: 'tag', text: '' });
    var listBox = U.el('div', { style: 'max-height:320px;overflow:auto;' });

    function updateCount() {
      countEl.textContent = 'נבחרו: ' + Object.keys(selectedMap).filter(function (k) { return selectedMap[k]; }).length;
    }

    function build(filter) {
      U.clear(listBox);
      U.GRADES.concat(['']).forEach(function (g) {
        var grp = students.filter(function (s) {
          return (s.grade || '') === g &&
            (!filter || s.name.indexOf(filter) !== -1);
        });
        if (!grp.length) return;
        listBox.appendChild(U.el('div', { class: 'muted', style: 'margin:6px 0 2px;font-weight:600;', text: g ? 'כיתה ' + g : 'ללא כיתה' }));
        grp.forEach(function (s) {
          var already = assigned[s.id] || !!selectedMap[s.id];
          var cb = U.el('input', { type: 'checkbox', checked: !!selectedMap[s.id] });
          cb.addEventListener('change', function () { selectedMap[s.id] = cb.checked; updateCount(); });
          var lbl = U.el('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:400;color:var(--text);' + (assigned[s.id] && !selectedMap[s.id] ? 'opacity:.5;' : '') },
            [cb, s.name + (assigned[s.id] && !selectedMap[s.id] ? ' (משובץ באתר אחר)' : '')]);
          listBox.appendChild(lbl);
        });
      });
    }
    search.addEventListener('input', function () { build(search.value.trim()); });
    build('');
    updateCount();

    var headRow = U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px;' }, [search, countEl]);
    Modal.open('הוספת תלמידים — ' + (card.siteId ? (Store.getById('sites', card.siteId) || {}).name : 'אתר'),
      U.el('div', null, [headRow, listBox]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var selected = {};
        Object.keys(selectedMap).forEach(function (k) { if (selectedMap[k]) selected[k] = true; });
        // הסר מהאתר את מי שבוטל
        card.students = (card.students || []).filter(function (s) { return selected[s.studentId]; });
        // הוסף חדשים (תוך הסרה מאתרים אחרים)
        Object.keys(selected).forEach(function (id) {
          if (!card.students.some(function (s) { return s.studentId === id; })) {
            day.cards.forEach(function (c) { if (c.id !== card.id) c.students = (c.students || []).filter(function (s) { return s.studentId !== id; }); });
            card.students.push({ studentId: id, wentToWork: false, sick: false, rating: null });
          }
        });
        Store.save(); close(); App.render();
      } }
    ]);
  }

  function dupPrev() {
    var day = getDay(curDate);
    if (day.cards.length && !confirm('היום הנוכחי כבר מכיל אתרים. להחליף בשכפול מיום קודם?')) return;
    // מצא את היום הקודם עם נתונים (עד 14 ימים אחורה)
    var src = null, probe = curDate;
    for (var i = 0; i < 14; i++) {
      probe = U.addDays(probe, -1);
      var d = Store.get().days[probe];
      if (d && d.cards && d.cards.length) { src = d; break; }
    }
    if (!src) { alert('לא נמצא יום קודם עם נתונים.'); return; }
    day.cards = src.cards.map(function (c) {
      return {
        id: Store.uid(), siteId: c.siteId, transportId: c.transportId,
        staffId: c.staffId, staffIds: (c.staffIds || []).slice(), leaderId: c.leaderId, hours: c.hours, travel: c.travel, notes: c.notes,
        targetWorkers: c.targetWorkers, group: c.group || '',
        students: (c.students || []).map(function (s) { return { studentId: s.studentId, wentToWork: false, sick: false, rating: null, teamLeader: s.teamLeader }; })
      };
    });
    Sync.dayChanged(curDate);
    Store.save(); App.render();
  }

  function loadFromWeekly() {
    var plan = Store.get().weeklyPlan[curDate];
    if (!plan || !plan.length) { alert('אין תכנון שבועי לתאריך זה.'); return; }
    var day = getDay(curDate);
    if (day.cards.length && !confirm('להוסיף את אתרי התכנון לסידור הקיים?')) return;
    plan.forEach(function (p) {
      var s = p.siteId ? Store.getById('sites', p.siteId) : null;
      day.cards.push({
        id: Store.uid(), siteId: p.siteId || null, transportId: p.transportId || (s ? s.defaultTransportId : null),
        staffId: null, leaderId: null, hours: s ? (s.defaultHours || Store.get().settings.defaultHours) : Store.get().settings.defaultHours,
        travel: true, notes: p.note || '', students: []
      });
    });
    Store.save(); App.render();
  }

  // ---------- ייצוא אקסל ----------
  function exportExcel() {
    var day = getDay(curDate);
    var aoa = [['סידור עבודה — רגבים בנימין'], [U.weekdayName(curDate) + ' · ' + U.hebrewDate(curDate) + ' · ' + U.gregLabel(curDate)], []];
    day.cards.forEach(function (c) {
      var site = c.siteId ? Store.getById('sites', c.siteId) : null;
      var staffNames = cardStaffNames(c);
      var leader = c.leaderId ? Store.getById('staff', c.leaderId) : null;
      var trans = c.transportId ? Store.getById('transports', c.transportId) : null;
      aoa.push(['אתר:', site ? site.name : '']);
      if (site && site.location) aoa.push(['מיקום:', site.location]);
      if (site && (site.contactName || site.phone)) aoa.push(['איש קשר:', [site.contactName, site.phone].filter(Boolean).join(' ')]);
      aoa.push(['הסעה:', trans ? trans.name : '', 'אנשי צוות:', staffNames, 'ראש צוות:', leader ? leader.name : '']);
      aoa.push(['שעות:', c.hours, 'נסיעות:', c.travel !== false ? 'כן' : 'לא']);
      aoa.push(['תלמיד', 'כיתה', 'יצא לעבודה', 'חולה', 'ציון']);
      (c.students || []).forEach(function (s) {
        var stu = Store.getById('students', s.studentId);
        aoa.push([stu ? stu.name : '', stu ? stu.grade : '', s.wentToWork ? 'כן' : '', s.sick ? 'כן' : '', s.rating || '']);
      });
      var went = (c.students || []).filter(function (s) { return s.wentToWork; }).length;
      var sickN = (c.students || []).filter(function (s) { return s.sick; }).length;
      aoa.push(['סה"כ יצאו:', went, 'חולים:', sickN]);
      aoa.push([]);
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'סידור');
    XLSX.writeFile(wb, 'סידור-' + curDate + '.xlsx');
  }

  // ---------- ייצוא תמונה מסודרת של הסידור היומי (לתלמידים) ----------
  // מציג: שם חקלאי, מיקום, איש קשר, הסעה, איש צוות, ורשימת תלמידים בלבד.
  function buildExportCard(card) {
    var site = card.siteId ? Store.getById('sites', card.siteId) : null;
    var staffNames = cardStaffNames(card);
    var trans = card.transportId ? Store.getById('transports', card.transportId) : null;

    var lines = [];
    if (site && site.location) lines.push('📍 ' + site.location);
    if (site && (site.contactName || site.phone)) lines.push('☎ ' + [site.contactName, site.phone].filter(Boolean).join(' · '));
    if (trans) lines.push('🚌 ' + trans.name);
    if (staffNames) lines.push('👤 אנשי צוות: ' + staffNames);

    var metaNodes = lines.map(function (t) { return U.el('div', { style: 'font-size:12px;color:#5b4636;line-height:1.7;', text: t }); });

    // קיבוץ התלמידים לפי צוות (כמו בתצוגת המסך), עם כותרת לכל צוות
    function studentLi(st) {
      var stu = Store.getById('students', st.studentId);
      var nm = stu ? stu.name + (stu.grade ? ' (' + stu.grade + ')' : '') : '⚠';
      var bg = (stu && chipGradeColors[stu.grade]) ? chipGradeColors[stu.grade] : '#fff';
      return U.el('li', { style: 'padding:3px 9px;font-size:12.5px;background:' + bg + ';border:1px solid rgba(80,60,30,.12);border-radius:6px;margin:3px 0;color:#3a2e22;', text: (st.teamLeader ? '⭐ ' : '') + nm });
    }
    var byTeam = {}, order = [], loose = [];
    (card.students || []).forEach(function (st) {
      var t = global.TeamUtil ? global.TeamUtil.teamOfStudent(st.studentId) : null;
      if (t) { if (!byTeam[t.id]) { byTeam[t.id] = { team: t, items: [] }; order.push(t.id); } byTeam[t.id].items.push(st); }
      else loose.push(st);
    });
    var groups = [];
    order.forEach(function (tid) {
      var g = byTeam[tid];
      groups.push(U.el('div', { style: 'margin:6px 0;' }, [
        U.el('div', { style: 'font-size:12px;font-weight:700;color:#1f5130;background:#eef3e6;padding:3px 9px;border-radius:6px;', text: '⭐ ' + global.TeamUtil.teamLabel(g.team) }),
        U.el('ul', { style: 'list-style:none;margin:0;padding:3px 2px 0;' }, g.items.map(studentLi))
      ]));
    });
    if (loose.length) {
      groups.push(U.el('div', { style: 'margin:6px 0;' }, [
        U.el('div', { style: 'font-size:11px;font-weight:600;color:#8a7a63;padding:3px 9px;', text: 'ללא צוות' }),
        U.el('ul', { style: 'list-style:none;margin:0;padding:3px 2px 0;' }, loose.map(studentLi))
      ]));
    }
    if (!groups.length) groups.push(U.el('div', { style: 'font-size:12px;color:#a99;padding:6px;', text: 'אין תלמידים' }));

    return U.el('div', { style: 'border:1.5px solid #cdbf9e;border-radius:12px;background:#fffdf8;overflow:hidden;break-inside:avoid;box-shadow:0 2px 5px rgba(80,60,30,.13);' }, [
      U.el('div', { style: 'background:linear-gradient(135deg,#2f6b3d,#1f5130);color:#fff;padding:8px 11px;' }, [
        U.el('div', { style: 'font-weight:800;font-size:16px;', text: '🌿 ' + (site ? site.name : '(אתר)') })
      ]),
      metaNodes.length ? U.el('div', { style: 'padding:7px 11px 0;' }, metaNodes) : null,
      U.el('div', { style: 'padding:5px 9px 9px;' }, groups)
    ]);
  }

  function exportImage() {
    var day = getDay(curDate);
    if (!day.cards.length) { alert('אין אתרים להצגה ביום זה.'); return; }
    if (typeof global.html2canvas === 'undefined') { alert('רכיב הייצוא עדיין נטען — נסו שוב בעוד רגע.'); return; }

    // רוחב A4 לאורך (794px @96dpi) — בסגנון פלייר רגבים בנימין
    var temp = U.el('div', { style: 'position:fixed;top:0;right:-12000px;width:794px;box-sizing:border-box;background:#f4ecdd;padding:20px;direction:rtl;font-family:"Segoe UI",Arial,sans-serif;' });
    var frame = U.el('div', { style: 'border:2px solid #cdbf9e;border-radius:16px;background:#f8f1e4;padding:18px 18px 14px;' });
    // מיתוג
    frame.appendChild(U.el('div', { style: 'text-align:center;margin-bottom:4px;' }, [
      U.el('div', { style: 'font-size:40px;line-height:1;', text: '🌱' }),
      U.el('div', { style: 'font-weight:800;font-size:30px;color:#5b4636;margin-top:2px;', text: 'רגבים בנימין' }),
      U.el('div', { style: 'font-size:13.5px;color:#2f6b3d;font-weight:600;', text: 'עמל, תורה וחלוציות בנחלת אבות' })
    ]));
    frame.appendChild(U.el('div', { style: 'text-align:center;margin:9px 0;color:#2f6b3d;font-weight:700;font-size:15px;letter-spacing:1px;', text: '✦  סידור עבודה יומי  ✦' }));
    // פס תאריך ירוק
    frame.appendChild(U.el('div', { style: 'background:linear-gradient(135deg,#2f6b3d,#1f5130);color:#fff;border-radius:12px;padding:11px 16px;margin-bottom:14px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.18);' }, [
      U.el('div', { style: 'font-weight:800;font-size:20px;', text: '📅 יום ' + U.weekdayName(curDate) }),
      U.el('div', { style: 'font-size:14px;opacity:.95;margin-top:2px;', text: U.hebrewDate(curDate) + ' · ' + U.gregLabel(curDate) })
    ]));
    var board = U.el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:11px;align-items:start;direction:rtl;' });
    day.cards.forEach(function (c) { board.appendChild(buildExportCard(c)); });
    frame.appendChild(board);
    frame.appendChild(U.el('div', { style: 'text-align:center;margin-top:16px;color:#2f6b3d;font-weight:700;font-size:16px;', text: 'בהצלחה לכולם!  🌿  רגבים בנימין' }));
    temp.appendChild(frame);
    document.body.appendChild(temp);

    global.html2canvas(temp, { scale: 2, backgroundColor: '#f4ecdd' }).then(function (canvas) {
      document.body.removeChild(temp);
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'סידור-' + curDate + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }).catch(function (e) {
      if (temp.parentNode) document.body.removeChild(temp);
      alert('שגיאה בייצוא התמונה: ' + e.message);
    });
  }

  // ---------- שליחת שיבוצים בוואטסאפ (בלחיצה, חינם) ----------
  function waNumber(phone) {
    if (!phone) return null;
    var d = ('' + phone).replace(/\D/g, '');
    if (!d) return null;
    if (d.indexOf('972') === 0) return d;
    if (d.charAt(0) === '0') return '972' + d.slice(1);
    if (d.length === 9) return '972' + d;
    return d;
  }
  function cardMessage(card, name) {
    var site = card.siteId ? Store.getById('sites', card.siteId) : null;
    var trans = card.transportId ? Store.getById('transports', card.transportId) : null;
    var lines = ['שלום ' + name + ',',
      'סידור עבודה ל' + U.weekdayName(curDate) + ' (' + U.gregLabel(curDate) + '):',
      '📍 *אתר:* ' + (site ? site.name : '(אתר)') + (site && site.location ? ' · ' + site.location : '')];
    if (trans) lines.push('🚌 *הסעה:* ' + trans.name);
    lines.push('*נא לא לשכוח להביא כובע*');
    return lines.join('\n');
  }
  function dayGroupMessage() {
    var day = getDay(curDate);
    var parts = ['*סידור עבודה — ' + U.weekdayName(curDate) + ' (' + U.gregLabel(curDate) + ')*', ''];
    day.cards.forEach(function (card) {
      var site = card.siteId ? Store.getById('sites', card.siteId) : null;
      if (!site && !(card.students || []).length) return;
      var trans = card.transportId ? Store.getById('transports', card.transportId) : null;
      var staffNames = cardStaffNames(card);
      parts.push('📍 *' + (site ? site.name : '(אתר)') + '*' + (site && site.location ? ' · ' + site.location : ''));
      var sub = [];
      if (trans) sub.push('🚌 ' + trans.name);
      if (card.hours) sub.push('🕐 ' + card.hours + ' שעות');
      if (sub.length) parts.push(sub.join(' · '));
      if (staffNames) parts.push('👤 ' + staffNames);
      var studentNames = (card.students || []).map(function (s) { var st = Store.getById('students', s.studentId); return st ? (s.teamLeader ? '⭐' : '') + st.name : null; }).filter(Boolean);
      if (studentNames.length) parts.push('תלמידים: ' + studentNames.join(', '));
      parts.push('');
    });
    parts.push('*נא לא לשכוח להביא כובע*');
    return parts.join('\n');
  }
  function openWhatsApp() {
    var day = getDay(curDate);
    if (!day.cards.length) { alert('אין שיבוצים ליום זה.'); return; }
    var body = U.el('div', { style: 'max-height:62vh;overflow:auto;' });
    body.appendChild(U.el('div', { style: 'margin:0 0 10px;padding:10px;background:var(--green-light);border-radius:8px;' }, [
      U.el('div', { style: 'font-weight:700;color:var(--green-dark);margin-bottom:4px;', text: '📤 שליחה אחת לקבוצה' }),
      U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:8px;', text: 'סיכום מלא של היום — לחיצה תפתח וואטסאפ, בחרו קבוצה ושלחו.' }),
      U.el('a', { class: 'btn small', href: 'https://wa.me/?text=' + encodeURIComponent(dayGroupMessage()), target: '_blank', rel: 'noopener', style: 'background:#25D366;color:#fff;border:0;', html: U.WA_SVG }, ' שלח סיכום לקבוצה')
    ]));
    body.appendChild(U.el('p', { class: 'muted', style: 'margin:0 0 8px;', text: 'או — שליחה אישית לכל אדם:' }));
    var any = false;
    day.cards.forEach(function (card) {
      var site = card.siteId ? Store.getById('sites', card.siteId) : null;
      var people = [];
      cardStaffIds(card).forEach(function (id) { var p = Store.getById('staff', id); if (p) people.push({ name: p.name, phone: p.phone, role: 'צוות' }); });
      (card.students || []).forEach(function (s) { var st = Store.getById('students', s.studentId); if (st) people.push({ name: st.name, phone: st.phone, role: 'תלמיד' }); });
      if (!people.length) return;
      any = true;
      body.appendChild(U.el('div', { style: 'font-weight:700;color:var(--green-dark);margin:10px 0 2px;' }, site ? site.name : '(אתר)'));
      people.forEach(function (pp) {
        var wn = waNumber(pp.phone);
        var link = (wn ? 'https://wa.me/' + wn : 'https://wa.me/') + '?text=' + encodeURIComponent(cardMessage(card, pp.name));
        body.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);' }, [
          U.el('span', { style: 'flex:1;font-size:14px;', text: pp.name + ' · ' + pp.role + (wn ? '' : ' · (אין מספר)') }),
          U.el('a', { class: 'btn small ico', href: link, target: '_blank', rel: 'noopener', title: 'שלח בוואטסאפ', style: 'background:#25D366;color:#fff;border:0;', html: U.WA_SVG })
        ]));
      });
    });
    if (!any) { alert('אין משובצים ליום זה.'); return; }
    Modal.open('שליחת שיבוצים בוואטסאפ — ' + U.weekdayName(curDate) + ' ' + U.gregLabel(curDate), body, [{ label: 'סגור', class: 'secondary' }]);
  }

  // ---------- שליחת SMS אישי לכולם (דרך 019) ----------
  function smsPhone(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.indexOf('972') === 0) d = '0' + d.slice(3);
    if (d.length === 9 && d.charAt(0) !== '0') d = '0' + d;
    return d.length >= 9 ? d : null;
  }
  function cardSmsMessage(card, name, teamLabel) {
    var site = card.siteId ? Store.getById('sites', card.siteId) : null;
    var trans = card.transportId ? Store.getById('transports', card.transportId) : null;
    var lines = ['שלום ' + name + ',',
      'סידור עבודה ל' + U.weekdayName(curDate) + ' (' + U.gregLabel(curDate) + '):',
      'אתר: ' + (site ? site.name : '') + (site && site.location ? ' - ' + site.location : '')];
    if (teamLabel) lines.push('צוות: ' + teamLabel);
    if (trans) lines.push('הסעה: ' + trans.name);
    lines.push('נא לא לשכוח להביא כובע');
    return lines.join('\n');
  }
  function sendAllSms() {
    var day = getDay(curDate);
    var messages = [], noPhone = [], nStu = 0, nStaff = 0;
    day.cards.forEach(function (card) {
      var people = [];
      cardStaffIds(card).forEach(function (id) { var p = Store.getById('staff', id); if (p) people.push({ name: p.name, phone: p.phone, team: '', role: 'צוות' }); });
      (card.students || []).forEach(function (s) {
        var st = Store.getById('students', s.studentId);
        if (st) { var tm = global.TeamUtil ? global.TeamUtil.teamOfStudent(st.id) : null; people.push({ name: st.name, phone: st.phone, team: tm ? global.TeamUtil.teamLabel(tm) : '', role: 'תלמיד' }); }
      });
      people.forEach(function (p) {
        var ph = smsPhone(p.phone);
        if (ph) { messages.push({ phone: ph, text: cardSmsMessage(card, p.name, p.team) }); if (p.role === 'צוות') nStaff++; else nStu++; }
        else noPhone.push(p.name + ' (' + p.role + ')');
      });
    });
    if (!messages.length) { alert('אין נמענים עם מספר טלפון ליום זה.'); return; }
    if (!confirm('לשלוח SMS ל-' + messages.length + ' נמענים (' + nStu + ' תלמידים · ' + nStaff + ' אנשי צוות)?' +
      (noPhone.length ? '\n\n' + noPhone.length + ' ללא מספר טלפון יידלגו:\n' + noPhone.slice(0, 12).join(', ') + (noPhone.length > 12 ? '…' : '') : '') +
      '\n\n⚠️ שליחת SMS עולה כסף בחשבון 019.')) return;
    Store.sendSms(messages).then(function (res) {
      alert('✓ נשלחו: ' + (res.sent || 0) + ' · נכשלו: ' + (res.failed || 0) +
        ((res.errors && res.errors.length) ? '\n\nשגיאה לדוגמה:\n' + res.errors[0] : ''));
    }).catch(function (e) {
      alert('✗ שגיאה בשליחה: ' + ((e && e.message) ? e.message : e));
    });
  }

  // ---------- גלילה אוטומטית בזמן גרירה (כשהיעד רחוק) ----------
  var autoScrollBound = false;
  function bindAutoScroll() {
    if (autoScrollBound) return; autoScrollBound = true;
    document.addEventListener('dragover', function (e) {
      var edge = 70, step = 28;
      if (e.clientY < edge) window.scrollBy(0, -step);
      else if (window.innerHeight - e.clientY < edge) window.scrollBy(0, step);
      var board = document.querySelector('.day-board');
      if (board) {
        var r = board.getBoundingClientRect();
        if (e.clientY > r.top && e.clientY < r.bottom) {
          if (e.clientX - r.left < edge) board.scrollLeft -= step;
          else if (r.right - e.clientX < edge) board.scrollLeft += step;
        }
      }
    });
  }

  // ---------- שיבוץ אוטומטי צוותי לפי היסטוריה (#8) ----------
  // בונה מפות היסטוריה: כמה עבד כל תלמיד בכל אתר, עומס החודש, וממוצע ציון לפי אתר.
  // מחריג את היום הנוכחי מהספירה (הוא בתהליך תכנון).
  function historyCounts() {
    var days = Store.get().days || {};
    var perSite = {}, monthLoad = {}, ratingSum = {}, ratingCnt = {};
    var mk = U.monthKey(curDate);
    Object.keys(days).forEach(function (iso) {
      if (iso === curDate) return;
      var inMonth = U.monthKey(iso) === mk;
      (days[iso].cards || []).forEach(function (c) {
        if (!c.siteId) return;
        (c.students || []).forEach(function (s) {
          if (!s.wentToWork) return;
          (perSite[s.studentId] = perSite[s.studentId] || {});
          perSite[s.studentId][c.siteId] = (perSite[s.studentId][c.siteId] || 0) + 1;
          if (inMonth) monthLoad[s.studentId] = (monthLoad[s.studentId] || 0) + 1;
          if (s.rating) {
            var k = s.studentId + '|' + c.siteId;
            ratingSum[k] = (ratingSum[k] || 0) + U.num(s.rating);
            ratingCnt[k] = (ratingCnt[k] || 0) + 1;
          }
        });
      });
    });
    return { perSite: perSite, monthLoad: monthLoad, ratingSum: ratingSum, ratingCnt: ratingCnt };
  }

  function autoAssign() {
    var day = getDay(curDate);
    var TU = global.TeamUtil;
    if (!TU) { alert('מודול הצוותים אינו זמין.'); return; }
    var excluded = excludedSet();
    var already = assignedSet(day);

    // אתרים עם "רצוי" ומקום פנוי
    var siteSlots = day.cards.filter(function (c) {
      return c.siteId && c.targetWorkers !== '' && c.targetWorkers != null && U.num(c.targetWorkers) > 0;
    }).map(function (c) {
      return { card: c, remaining: U.num(c.targetWorkers) - (c.students || []).length };
    }).filter(function (x) { return x.remaining > 0; });
    if (!siteSlots.length) { alert('אין אתרים עם "רצוי" ומקום פנוי. הגדירו "רצוי" לאתרים בסידור.'); return; }

    // צוותים פנויים: אף חבר לא משובץ ידנית, ויש לפחות חבר אחד לא-מוחרג
    var teams = TU.allTeams().map(function (t) {
      var members = TU.orderedStudentIds(t).filter(function (id) { var s = Store.getById('students', id); return s && s.active !== false; });
      var avail = members.filter(function (id) { return !excluded[id] && !already[id]; });
      var anyAssigned = members.some(function (id) { return already[id]; });
      return { team: t, members: avail, skip: anyAssigned || !avail.length };
    }).filter(function (e) { return !e.skip; });
    if (!teams.length) { alert('אין צוותים פנויים לשיבוץ (כולם כבר משובצים או מוחרגים).'); return; }

    var H = historyCounts();
    function affinity(m, siteId) { return m.reduce(function (a, id) { return a + ((H.perSite[id] || {})[siteId] || 0); }, 0); }
    function load(m) { return m.reduce(function (a, id) { return a + (H.monthLoad[id] || 0); }, 0); }
    function ratingAt(m, siteId) {
      var sum = 0, cnt = 0;
      m.forEach(function (id) { var k = id + '|' + siteId; sum += H.ratingSum[k] || 0; cnt += H.ratingCnt[k] || 0; });
      return cnt ? sum / cnt : 0;
    }

    var pairs = [];
    teams.forEach(function (te, ti) {
      siteSlots.forEach(function (sl) {
        pairs.push({ ti: ti, sl: sl, aff: affinity(te.members, sl.card.siteId), load: load(te.members), rate: ratingAt(te.members, sl.card.siteId) });
      });
    });
    // מיון: קרבה↓, עומס↑, ציון↓
    pairs.sort(function (a, b) {
      if (a.aff !== b.aff) return b.aff - a.aff;
      if (a.load !== b.load) return a.load - b.load;
      return b.rate - a.rate;
    });

    var teamDone = {}, proposals = [];
    pairs.forEach(function (p) {
      if (teamDone[p.ti] || p.sl.remaining <= 0) return;
      var te = teams[p.ti];
      teamDone[p.ti] = true;
      p.sl.remaining -= te.members.length; // ייתכן שלילי (צוות אטומי — חריגה מותרת)
      proposals.push({ team: te.team, members: te.members, card: p.sl.card, aff: p.aff, load: p.load, rate: p.rate });
    });
    if (!proposals.length) { alert('לא נמצאו שיבוצים מתאימים.'); return; }

    // שיבוץ ישיר (ללא תצוגה מקדימה)
    proposals.forEach(function (p) {
      p.members.forEach(function (id) { placeStudent(day, p.card, id, id === p.team.leaderStudentId); });
    });
    Store.save(); App.render();
    var unfilled = siteSlots.filter(function (sl) { return sl.remaining > 0; }).length;
    var unassigned = teams.length - proposals.length;
    alert('שובצו ' + proposals.length + ' צוותים אוטומטית.' +
      (unfilled ? '\n⚠ ' + unfilled + ' אתרים עדיין חסרים עובדים.' : '') +
      (unassigned > 0 ? '\n' + unassigned + ' צוותים לא שובצו (אין מספיק מקום).' : ''));
  }

  global.DailyView = { render: render };
})(window);
