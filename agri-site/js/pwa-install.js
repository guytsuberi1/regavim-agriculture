/* pwa-install.js — התקנת האפליקציה (PWA):
   - חושף window.PwaInstall לשימוש מתפריט המשתמש (כפתור "התקנת אפליקציה").
   - באנר צף חד-פעמי (ניתן לסגירה ל-14 יום) לנוחות בכניסה הראשונה.
   אנדרואיד/כרום: מפעיל את בקשת ההתקנה המקורית. אייפון/אחר: מציג רמז ידני. */
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
  function hideBanner() { var el = document.getElementById('pwaInstall'); if (el && el.parentNode) el.parentNode.removeChild(el); }

  function buildBanner(mode) { // 'prompt' | 'ios' | 'manual'
    if (document.getElementById('pwaInstall') || standalone()) return;
    var txt = mode === 'ios' ? 'להתקנה: הקישו על <b>שיתוף</b> ואז <b>"הוספה למסך הבית"</b>'
      : mode === 'manual' ? 'להתקנה: פתחו את תפריט הדפדפן ובחרו <b>"התקנת אפליקציה"</b>'
      : 'התקינו את האפליקציה למסך הבית';
    var bar = document.createElement('div');
    bar.id = 'pwaInstall';
    bar.className = 'pwa-install no-print';
    bar.innerHTML =
      '<span class="pwa-ic">📲</span>' +
      '<span class="pwa-txt">' + txt + '</span>' +
      (mode === 'ios' ? '<span class="pwa-ios">⬆️</span>' : '') +
      (mode === 'prompt' ? '<button id="pwaBtn" class="btn small" type="button">התקנה</button>' : '') +
      '<button id="pwaX" class="pwa-x" type="button" aria-label="סגירה">✕</button>';
    document.body.appendChild(bar);
    var x = document.getElementById('pwaX');
    if (x) x.onclick = function () { hideBanner(); try { localStorage.setItem(KEY, Date.now()); } catch (e) {} };
    var b = document.getElementById('pwaBtn');
    if (b) b.onclick = trigger;
  }

  function trigger() {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; hideBanner(); });
    } else {
      hideBanner();
      buildBanner(isiOS() ? 'ios' : 'manual');
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (!standalone() && !dismissedRecently()) buildBanner('prompt');
  });
  window.addEventListener('appinstalled', function () {
    hideBanner(); deferred = null; try { localStorage.removeItem(KEY); } catch (e) {}
  });
  // אייפון — אין אירוע התקנה; רמז חד-פעמי אחרי הטעינה
  if (isiOS() && !standalone() && !dismissedRecently()) {
    window.addEventListener('load', function () { setTimeout(function () { if (!standalone()) buildBanner('ios'); }, 1500); });
  }

  // API לתפריט המשתמש
  window.PwaInstall = {
    installed: standalone,
    trigger: trigger
  };
})();
