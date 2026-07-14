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
  function hebrewDate(iso) {
    try {
      if (!hebFmt) {
        hebFmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long' });
      }
      return hebFmt.format(fromISO(iso));
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

  global.U = {
    el: el, clear: clear, $: $, $all: $all,
    todayISO: todayISO, toISO: toISO, fromISO: fromISO, addDays: addDays,
    weekdayName: weekdayName, startOfWeek: startOfWeek,
    hebrewDate: hebrewDate, gregLabel: gregLabel,
    monthKey: monthKey, monthLabel: monthLabel,
    GRADES: GRADES, WEEKDAYS: WEEKDAYS, num: num, escapeCsv: escapeCsv
  };
})(window);
