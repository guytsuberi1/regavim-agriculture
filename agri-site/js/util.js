/* util.js — עזרי DOM, תאריכים ועברית */
(function (global) {
  'use strict';

  // יצירת אלמנט: el('div', {class:'x', onclick:fn}, [children|text])
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!attrs.hasOwnProperty(k)) continue;
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'value') node.value = v;
        else if (k === 'checked') node.checked = !!v;
        else node.setAttribute(k, v);
      }
    }
    if (children != null) {
      if (!Array.isArray(children)) children = [children];
      children.forEach(function (c) {
        if (c == null || c === false) return;
        if (typeof c === 'string' || typeof c === 'number') {
          node.appendChild(document.createTextNode(String(c)));
        } else {
          node.appendChild(c);
        }
      });
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ---------- תאריכים ----------
  function todayISO() { return toISO(new Date()); }

  function toISO(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function fromISO(iso) {
    var p = iso.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  function addDays(iso, n) {
    var d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  var WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  function weekdayName(iso) { return WEEKDAYS[fromISO(iso).getDay()]; }

  // ראשון של השבוע (יום ראשון) עבור תאריך נתון
  function startOfWeek(iso) {
    var d = fromISO(iso);
    return addDays(iso, -d.getDay());
  }

  var hebFmt = null;
  // המרת יום בחודש (1-30) לגימטריה עברית עם גרש/גרשיים (ט"ו/ט"ז כמקובל)
  function hebGematriaDay(n) {
    if (n === 15) return 'ט"ו';
    if (n === 16) return 'ט"ז';
    var ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    var tens = ['', 'י', 'כ', 'ל'];
    var s = (tens[Math.floor(n / 10)] || '') + (ones[n % 10] || '');
    if (s.length <= 1) return s + '׳';
    return s.slice(0, -1) + '"' + s.slice(-1);
  }
  function hebrewDate(iso) {
    try {
      if (!hebFmt) {
        hebFmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long' });
      }
      return hebFmt.formatToParts(fromISO(iso)).map(function (p) {
        return p.type === 'day' ? hebGematriaDay(parseInt(p.value, 10)) : p.value;
      }).join('');
    } catch (e) { return ''; }
  }

  function gregLabel(iso) {
    var d = fromISO(iso);
    return d.getDate() + '/' + (d.getMonth() + 1);
  }

  // 'YYYY-MM' של חודש
  function monthKey(iso) { return iso.slice(0, 7); }
  function monthLabel(mk) {
    var p = mk.split('-');
    var months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    return months[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  // ---------- כיתות ----------
  var GRADES = ['ט', 'י', 'יא', 'יב'];

  function num(v, def) {
    var n = parseFloat(v);
    return isNaN(n) ? (def || 0) : n;
  }

  function escapeCsv(s) { return String(s == null ? '' : s); }

  // לוגו וואטסאפ רשמי (SVG · fill=currentColor כך שמקבל את צבע הכפתור)
  var WA_SVG = '<svg class="wa-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.628-.95zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01a1.1 1.1 0 0 0-.792.372c-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>';

  // ---------- טוסטים (הודעות קצרות במקום alert) ----------
  // type: 'success' (ברירת מחדל) | 'error' | 'info'. משך ארוך יותר להודעות ארוכות.
  var toastWrap = null;
  function toast(msg, type) {
    if (!toastWrap) {
      toastWrap = el('div', { class: 'toast-wrap' });
      document.body.appendChild(toastWrap);
    }
    var icons = { success: '✓', error: '✕', info: 'ℹ' };
    var t = el('div', { class: 'toast toast-' + (type || 'success') }, [
      el('span', { class: 'toast-ic', text: icons[type || 'success'] || '✓' }),
      el('span', { text: String(msg) })
    ]);
    toastWrap.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    var life = Math.min(7000, Math.max(2600, String(msg).length * 60));
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, life);
  }

  // ---------- צ'יפ תאריך אחיד (📅) ----------
  // text — הטקסט להצגה; input (אופציונלי) — שדה date/month נסתר: לחיצה פותחת את הבורר שלו;
  // opts.onClick (אופציונלי, במקום input) — פעולה מותאמת בלחיצה (למשל: חזרה להיום); opts.title — טקסט ריחוף.
  function dateChip(text, input, opts) {
    opts = opts || {};
    var clickable = !!(input || opts.onClick);
    var kids = [el('span', { class: 'rc-ic', text: '📅' }), el('span', { text: text })];
    if (input) {
      input.classList.add('chip-date-input');
      kids.push(input);
    }
    var chip = el('span', {
      class: 'range-chip', style: clickable ? 'cursor:pointer;' : '',
      title: opts.title || (input ? 'לחצו לבחירת תאריך' : '')
    }, kids);
    if (input) {
      chip.addEventListener('click', function () {
        try { if (input.showPicker) { input.showPicker(); return; } } catch (e) {}
        input.click();
      });
    } else if (opts.onClick) {
      chip.addEventListener('click', opts.onClick);
    }
    return chip;
  }

  global.U = {
    el: el, clear: clear, $: $, $all: $all,
    todayISO: todayISO, toISO: toISO, fromISO: fromISO, addDays: addDays,
    weekdayName: weekdayName, startOfWeek: startOfWeek,
    hebrewDate: hebrewDate, gregLabel: gregLabel,
    monthKey: monthKey, monthLabel: monthLabel,
    GRADES: GRADES, WEEKDAYS: WEEKDAYS, num: num, escapeCsv: escapeCsv,
    WA_SVG: WA_SVG, toast: toast, dateChip: dateChip
  };
})(window);
