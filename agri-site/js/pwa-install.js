/* pwa-install.js — באנר התקנה משלנו (אמין יותר מהפופ-אפ האוטומטי של הדפדפן).
   אנדרואיד/כרום: כפתור "התקנה" שמפעיל את הבקשה המקורית. אייפון: רמז ידני. נעלם אם כבר מותקנת. */
(function () {
  'use strict';
  var KEY = 'agri_pwa_dismissed';
  var deferred = null;

  function standalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function dismissedRecently() {
    try { return Date.now() - (+localStorage.getItem(KEY) || 0) < 14 * 864e5; } catch (e) { return false; }
  }
  function isiOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; }
  function hide() { var el = document.getElementById('pwaInstall'); if (el && el.parentNode) el.parentNode.removeChild(el); }

  function build(mode) { // 'prompt' = אנדרואיד/כרום · 'ios' = אייפון
    if (document.getElementById('pwaInstall') || standalone()) return;
    var bar = document.createElement('div');
    bar.id = 'pwaInstall';
    bar.className = 'pwa-install no-print';
    bar.innerHTML =
      '<span class="pwa-ic">📲</span>' +
      '<span class="pwa-txt">' +
        (mode === 'ios' ? 'להתקנה: הקישו על <b>שיתוף</b> ואז <b>"הוספה למסך הבית"</b>'
                        : 'התקינו את האפליקציה למסך הבית') +
      '</span>' +
      (mode === 'ios' ? '<span class="pwa-ios">⬆️</span>'
                      : '<button id="pwaBtn" class="btn small" type="button">התקנה</button>') +
      '<button id="pwaX" class="pwa-x" type="button" aria-label="סגירה">✕</button>';
    document.body.appendChild(bar);

    var x = document.getElementById('pwaX');
    if (x) x.onclick = function () { hide(); try { localStorage.setItem(KEY, Date.now()); } catch (e) {} };
    var b = document.getElementById('pwaBtn');
    if (b) b.onclick = function () {
      if (!deferred) { hide(); return; }
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; hide(); });
    };
  }

  if (standalone()) return; // כבר מותקנת — אין באנר

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (!dismissedRecently()) build('prompt');
  });
  window.addEventListener('appinstalled', function () {
    hide(); deferred = null; try { localStorage.removeItem(KEY); } catch (e) {}
  });

  // אייפון — אין אירוע התקנה; מציגים רמז ידני קצר אחרי הטעינה
  if (isiOS() && !dismissedRecently()) {
    window.addEventListener('load', function () { setTimeout(function () { if (!standalone()) build('ios'); }, 1500); });
  }

  // חשיפה גלובלית — כדי שאפשר יהיה לפתוח את הבאנר מכפתור בתוך האפליקציה (למשל בהגדרות)
  window.PwaInstall = {
    available: function () { return !!deferred || (isiOS() && !standalone()); },
    show: function () { build(deferred ? 'prompt' : (isiOS() ? 'ios' : 'prompt')); }
  };
})();
