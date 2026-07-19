/* store.js — מודל הנתונים, שמירה אוטומטית ל-localStorage, גיבוי/טעינה ל-OneDrive */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'regavim_agri_v1';
  var FILE_HANDLE_KEY = 'regavim_agri_filehandle';

  // ---------- מבנה ברירת מחדל ----------
  function defaultData() {
    return {
      meta: { version: 1, lastModified: new Date().toISOString() },
      settings: { schoolName: 'רגבים בנימין', defaultHours: 8 },
      students: [],     // { id, name, grade, className, phone, active, notes }
      sites: [],        // { id, name, location, contactName, phone, email, hourlyRate, travelPay, defaultHours, defaultTransportId, active, notes }
      staff: [],        // { id, name, role: 'staff'|'leader', phone, email, homeroom, homeroomClass, active }
      transports: [],   // { id, name, capacity, active }
      teams: [],        // { id, leaderStudentId, memberIds: [studentId,...] }  (ראש צוות = תלמיד י"ב)
      weeklyPlan: {},   // { 'YYYY-MM-DD': [ { siteId, workers, group, transportId, note } ] }
      days: {},         // { 'YYYY-MM-DD': { cards: [ {id, siteId, transportId, staffId, leaderId, hours, travel, notes, students:[{studentId,wentToWork,sick,rating,teamLeader}] } ] } }
      weeklyDuty: {},   // { 'weekStartISO': [studentId,...] }  תורנים שבועיים (יורדים מהמאגר כל השבוע)
      weeklySick: {},   // { 'weekStartISO': [studentId,...] }  חולים שבועיים
      dailyAbsent: {},  // { 'YYYY-MM-DD': [studentId,...] }     נעדרים ליום מסוים
      absenceInfo: {},  // { 'YYYY-MM-DD': { studentId: { approved:bool, reason:str } } }  סיבת/אישור היעדרות
      billingAdjustments: {}, // { 'YYYY-MM|siteId': { 'YYYY-MM-DD': { note, hoursOverride, workersOverride, travelOverride } } }
      debtRecords: [],  // { id, siteId, openingDebt, debtYear, status, handledBy, notes, includeBilling }  כרטיס חוב לכל חקלאי
      debtEntries: [],  // { id, siteId, date:'YYYY-MM-DD', kind:'payment'|'charge'|'credit', amount, method, note }  תנועות
      userRoles: {}     // { 'email@x.com': 'admin'|'kitchen'|'field' }  הרשאה לכל משתמש מחובר
    };
  }

  var data = null;
  var listeners = [];
  var fileHandle = null; // File System Access API handle (אם זמין)

  // ---------- מזהה ייחודי ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- טעינה/שמירה מקומית ----------
  var hadStoredData = false;
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      hadStoredData = !!raw;
      if (raw) {
        data = JSON.parse(raw);
        // השלמת שדות חסרים מגרסאות ישנות
        var def = defaultData();
        for (var k in def) { if (!(k in data)) data[k] = def[k]; }
      } else {
        data = defaultData();
      }
    } catch (e) {
      console.error('load failed', e);
      data = defaultData();
    }
    return data;
  }

  // מצב שרת: כשהאפליקציה מוגשת דרך http(s) (כלומר רצה דרך הפעלה.bat / שרת מקומי),
  // אפשר לשמור אוטומטית לקובץ data.json דרך השרת — בלי בחירת קובץ ידנית.
  var serverMode = (typeof location !== 'undefined' && /^https?:$/.test(location.protocol));

  // ---------- מצב ענן (Supabase) ----------
  var SB_URL = 'https://dcnndzrdimkogfjsvcku.supabase.co';
  var SB_KEY = 'sb_publishable_LoALeRJVUqiyBwWhCF_0qQ_RpLwS4ew';
  var ROW_ID = 'agri'; // רשומה נפרדת לאפליקציית החקלאות (התקציב משתמש ב-'main')
  var sb = (global.supabase && global.supabase.createClient) ? global.supabase.createClient(SB_URL, SB_KEY) : null;
  var cloudMode = !!sb;
  // כניסה דרך קישור "איפוס סיסמה" מהמייל — נזהה ונבקש סיסמה חדשה אחרי הטעינה
  var pendingRecovery = false;
  try { if (/type=recovery/.test(String(location.hash))) pendingRecovery = true; } catch (e) {}
  if (sb && sb.auth && sb.auth.onAuthStateChange) {
    sb.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') pendingRecovery = true; });
  }
  var applyingRemote = false;
  var pendingRemote = null; // עדכון מהענן שממתין כל עוד חלון עריכה (מודאל) פתוח

  // הרשאות: רק המיילים האלה רואים את כל הגיליונות; כל השאר רואים רק "מצב שטח"
  var ADMIN_EMAILS = ['guy@rgvb.org.il', 'misrad@rgvb.org.il', 'shlomohass34@gmail.com'];
  // מנהלי מטבח: רואים רק את מסך "תורני מטבח" (לא מצב שטח)
  var KITCHEN_EMAILS = ['elivne4@gmail.com'];
  var sessionUser = null;
  function setSessionUser(u) { sessionUser = u || null; }

  // הרשאות: admin=רכז חקלאות (הכל) · manager=מנהל (הכל למעט נתוני בסיס ומטבח) · kitchen=מנהל מטבח · field=מצב שטח
  // הרשאה אפקטיבית למייל: הגדרה מפורשת ב-userRoles גוברת; אחרת נופלים לרשימות הקשיחות; ברירת מחדל — שטח.
  function roleOf(email) {
    email = String(email || '').toLowerCase();
    if (!email) return 'field';
    var roles = (data && data.userRoles) || {};
    var r = roles[email];
    if (r === 'admin' || r === 'manager' || r === 'kitchen' || r === 'field') return r;
    if (ADMIN_EMAILS.indexOf(email) !== -1) return 'admin';
    if (KITCHEN_EMAILS.indexOf(email) !== -1) return 'kitchen';
    return 'field';
  }
  function currentRole() {
    if (!cloudMode) return 'admin'; // מצב מקומי (ללא ענן) — גישה מלאה
    return sessionUser ? roleOf(sessionUser.email) : 'field';
  }
  function isAdmin() { return currentRole() === 'admin'; }            // רכז חקלאות — גישה מלאה
  function canManage() { var r = currentRole(); return r === 'admin' || r === 'manager'; }
  function isKitchen() { return currentRole() === 'kitchen'; }
  // קביעת הרשאה למשתמש (לפי מייל). role: 'admin'|'kitchen'|'field'.
  function setUserRole(email, role) {
    email = String(email || '').toLowerCase();
    if (!email || !data) return;
    if (!data.userRoles) data.userRoles = {};
    if (role === 'field') delete data.userRoles[email]; // שטח = ברירת מחדל, אין צורך לאחסן
    else data.userRoles[email] = role;
    save();
  }

  var saveTimer = null;
  var CLIENT_ID = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function save() {
    if (!data) return;
    data.meta.lastModified = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('save failed', e);
      if (global.U && U.toast) U.toast('שגיאה בשמירה מקומית: ' + e.message, 'error');
    }
    // שמירה אוטומטית: ענן > קובץ OneDrive מקומי
    if (cloudMode && !applyingRemote) {
      setStatus('שומר…');
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(cloudSave, 500);
    } else if (fileHandle) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(writeToFileHandle, 800);
    } else if (serverMode) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(serverSave, 700);
    }
    notify();
  }

  // ---------- ענן: שמירה/טעינה/זמן-אמת ----------
  function cloudSave() {
    if (!sb) return;
    if (data && data.meta) data.meta.savedBy = CLIENT_ID;
    sb.from('app_state').upsert({ id: ROW_ID, data: data, updated_at: new Date().toISOString() })
      .then(function (res) {
        if (res.error) { console.error('cloudSave', res.error); setStatus('שגיאת שמירה לענן'); }
        else setStatus('נשמר בענן ' + new Date().toLocaleTimeString('he-IL'));
      });
  }
  function cloudLoad() {
    return sb.from('app_state').select('data').eq('id', ROW_ID).maybeSingle()
      .then(function (res) {
        if (res.error) { console.error('cloudLoad', res.error); return null; }
        return res.data ? res.data.data : null;
      }).catch(function (e) { console.error(e); return null; });
  }
  function subscribeRealtime() {
    if (!sb) return;
    sb.channel('agri_state_rt').on('postgres_changes',
      { event: '*', schema: 'public', table: 'app_state', filter: 'id=eq.' + ROW_ID },
      function (payload) {
        var incoming = payload.new && payload.new.data;
        if (!incoming) return;
        // דלג על כל הד שמקורו בלקוח הזה (מזוהה לפי CLIENT_ID, ללא תלות בתזמון/סדר) —
        // מונע גם את "הסימון שנעלם" וגם את הקפיצה למעלה אחרי כל שמירה.
        if (incoming.meta && incoming.meta.savedBy === CLIENT_ID) return;
        if (JSON.stringify(incoming) === JSON.stringify(data)) return;
        // אל תחיל עדכון מרחוק בזמן שהמשתמש עורך בטופס — שמור והחל עם סגירת החלון.
        // מונע מצב שבו שמירה של משתמש אחר מאפסת את טופס העריכה הפתוח ("יוצא מהעריכה").
        if (typeof document !== 'undefined' && document.querySelector('.modal-bg')) {
          pendingRemote = incoming;
          return;
        }
        applyRemote(incoming);
      }).subscribe();
  }

  // החלת מצב מהענן על המסך — מבלי לדרוס עריכה מקומית חדשה יותר
  function applyRemote(incoming) {
    var inT = (incoming.meta && Date.parse(incoming.meta.lastModified)) || 0;
    var locT = (data && data.meta && Date.parse(data.meta.lastModified)) || 0;
    if (inT && locT && inT < locT) return; // המידע המקומי חדש יותר — לא מאבדים אותו
    applyingRemote = true;
    var _sy = (global.scrollY || 0);
    replaceAll(incoming);
    if (global.App && App.render) App.render();
    global.scrollTo(0, _sy);
    applyingRemote = false;
    setStatus('עודכן בזמן אמת ' + new Date().toLocaleTimeString('he-IL'));
  }

  // נקרא עם סגירת מודאל — מחיל עדכון מהענן שהמתין בזמן העריכה
  function flushPendingRemote() {
    if (!pendingRemote) return;
    if (typeof document !== 'undefined' && document.querySelector('.modal-bg')) return;
    var inc = pendingRemote; pendingRemote = null;
    applyRemote(inc);
  }

  // POST של כל הנתונים לשרת, שכותב אותם ל-data.json בתיקיית OneDrive
  function serverSave() {
    if (!serverMode) return;
    fetch('save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      if (r.ok) setStatus('נשמר ל-OneDrive ' + new Date().toLocaleTimeString('he-IL'));
      else setStatus('שמירה מקומית בלבד');
    }).catch(function () { setStatus('שמירה מקומית בלבד'); });
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { console.error(e); }
    }
  }

  function onChange(fn) { listeners.push(fn); }

  // ---------- גישה לנתונים ----------
  function get() { return data; }

  function getById(collection, id) {
    var arr = data[collection] || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function upsert(collection, item) {
    if (!data[collection]) data[collection] = [];
    if (!item.id) { item.id = uid(); data[collection].push(item); }
    else {
      var arr = data[collection], found = false;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === item.id) { arr[i] = item; found = true; break; }
      }
      if (!found) arr.push(item);
    }
    save();
    return item;
  }

  function remove(collection, id) {
    var arr = data[collection] || [];
    data[collection] = arr.filter(function (x) { return x.id !== id; });
    save();
  }

  // ---------- גיבוי/שחזור ידני (הורדה/העלאה) ----------
  function exportJSON() {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    a.href = url;
    a.download = 'גיבוי-חקלאות-' + d.toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importJSONFile(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        data = parsed;
        var def = defaultData();
        for (var k in def) { if (!(k in data)) data[k] = def[k]; }
        save();
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    };
    reader.onerror = function () { cb && cb(reader.error); };
    reader.readAsText(file);
  }

  // ---------- File System Access API (חיבור קבוע לקובץ ב-OneDrive) ----------
  function fsSupported() {
    return typeof global.showOpenFilePicker === 'function' &&
           typeof global.showSaveFilePicker === 'function';
  }

  function writeToFileHandle() {
    if (!fileHandle) return Promise.resolve();
    return fileHandle.createWritable().then(function (w) {
      return w.write(JSON.stringify(data, null, 2)).then(function () { return w.close(); });
    }).then(function () {
      setStatus('נשמר ל-OneDrive ' + new Date().toLocaleTimeString('he-IL'));
    }).catch(function (e) {
      console.error('writeToFileHandle', e);
      setStatus('שגיאת שמירה לקובץ');
    });
  }

  function connectFile() {
    if (!fsSupported()) {
      if (global.U && U.toast) U.toast('הדפדפן לא תומך בחיבור אוטומטי לקובץ — השתמשו בגיבוי/טעינה ידניים.', 'error');
      return Promise.reject();
    }
    return global.showSaveFilePicker({
      suggestedName: 'data.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      fileHandle = handle;
      return writeToFileHandle();
    }).then(function () {
      setStatus('מחובר לקובץ OneDrive');
    });
  }

  function openExistingFile() {
    if (!fsSupported()) {
      if (global.U && U.toast) U.toast('הדפדפן לא תומך בפתיחת קובץ אוטומטית — השתמשו ב"טעינת גיבוי".', 'error');
      return Promise.reject();
    }
    return global.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    }).then(function (handles) {
      fileHandle = handles[0];
      return fileHandle.getFile();
    }).then(function (file) { return file.text(); })
      .then(function (text) {
        data = JSON.parse(text);
        var def = defaultData();
        for (var k in def) { if (!(k in data)) data[k] = def[k]; }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        notify();
        setStatus('נטען מ-OneDrive');
      });
  }

  var statusEl = null;
  function setStatus(msg) {
    if (!statusEl) statusEl = document.getElementById('saveStatus');
    if (!statusEl) return;
    // יצירת span חדש בכל עדכון — מפעיל מחדש את אנימציית ההבהוב (חיווי "נשמר" חי)
    statusEl.innerHTML = '';
    var span = document.createElement('span');
    span.className = 'flash';
    span.textContent = msg;
    statusEl.appendChild(span);
  }

  // אימוץ אובייקט נתונים שלם (לטעינה אוטומטית מ-data.json בהפעלה ראשונה)
  function replaceAll(obj) {
    data = obj;
    var def = defaultData();
    for (var k in def) { if (!(k in data)) data[k] = def[k]; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    notify();
  }

  // האם המאגר הנוכחי ריק מתוכן (אין תלמידים/אתרים/צוות/הסעות/ימים/תכנון)
  function isEmptyData() {
    if (!data) return true;
    return !((data.students && data.students.length) ||
             (data.sites && data.sites.length) ||
             (data.staff && data.staff.length) ||
             (data.transports && data.transports.length) ||
             (data.days && Object.keys(data.days).length) ||
             (data.weeklyPlan && Object.keys(data.weeklyPlan).length));
  }

  // ---------- ענן: התחברות ואתחול ----------
  function cloudStart(cb) {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    cloudLoad().then(function (cloud) {
      var cloudHas = cloud && ((cloud.students && cloud.students.length) || (cloud.sites && cloud.sites.length) ||
        (cloud.staff && cloud.staff.length) || (cloud.days && Object.keys(cloud.days).length) ||
        (cloud.weeklyPlan && Object.keys(cloud.weeklyPlan).length));
      if (cloudHas) {
        replaceAll(cloud);
      } else {
        // ענן ריק — זריעה ראשונית מהמאגר המקומי / הנתונים המוטמעים, ושמירה לענן
        if (isEmptyData() && global.__SEED_DATA) replaceAll(global.__SEED_DATA);
        cloudSave();
      }
      subscribeRealtime();
      updateUserBar();
      setStatus('מחובר לענן');
      cb && cb(true);
      // הגעה מקישור איפוס סיסמה — מבקשים סיסמה חדשה מיד אחרי הטעינה
      if (pendingRecovery) { pendingRecovery = false; setTimeout(openNewPasswordDialog, 400); }
    });
  }

  // דיאלוג בחירת סיסמה חדשה (אחרי לחיצה על הקישור מהמייל)
  function openNewPasswordDialog() {
    var U = global.U, Modal = global.Modal;
    if (!U || !Modal) return;
    var p1 = U.el('input', { type: 'password', placeholder: 'סיסמה חדשה (6 תווים לפחות)', autocomplete: 'new-password', style: 'width:100%;' });
    var p2 = U.el('input', { type: 'password', placeholder: 'אימות הסיסמה', autocomplete: 'new-password', style: 'width:100%;' });
    var err = U.el('div', { class: 'login-err', style: 'min-height:18px;' });
    Modal.open('🔑 בחירת סיסמה חדשה', U.el('div', null, [
      U.el('p', { class: 'muted', style: 'margin-top:0;', text: 'נכנסתם דרך קישור איפוס הסיסמה. בחרו סיסמה חדשה לחשבון.' }),
      U.el('div', { class: 'field' }, [p1]),
      U.el('div', { class: 'field' }, [p2]),
      err
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירת סיסמה', onClick: function (close) {
        var v1 = p1.value || '', v2 = p2.value || '';
        if (v1.length < 6) { err.textContent = 'הסיסמה חייבת להכיל לפחות 6 תווים'; p1.focus(); return; }
        if (v1 !== v2) { err.textContent = 'הסיסמאות אינן זהות'; p2.focus(); return; }
        err.textContent = '';
        sb.auth.updateUser({ password: v1 }).then(function (res) {
          if (res.error) { err.textContent = 'שמירת הסיסמה נכשלה — נסו שוב'; return; }
          close();
          global.U.toast('הסיסמה עודכנה בהצלחה');
        });
      } }
    ]);
  }

  function showLogin(cb) {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'flex';
    var btn = document.getElementById('loginBtn');
    var emailEl = document.getElementById('loginEmail');
    var passEl = document.getElementById('loginPass');
    var errEl = document.getElementById('loginErr');
    function doLogin() {
      var email = (emailEl.value || '').trim(), pass = passEl.value || '';
      if (!email || !pass) { if (errEl) errEl.textContent = 'נא למלא אימייל וסיסמה'; return; }
      if (errEl) errEl.textContent = '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spin"></span>מתחבר…'; }
      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = 'כניסה'; }
        if (res.error) { if (errEl) errEl.textContent = 'אימייל או סיסמה שגויים — נסו שוב'; if (passEl) { passEl.value = ''; passEl.focus(); } return; }
        setSessionUser(res.data && res.data.user);
        cloudStart(cb);
      });
    }
    if (btn) btn.onclick = doLogin;
    // שכחתי סיסמה — שליחת מייל עם קישור איפוס לכתובת שהוזנה
    var forgot = document.getElementById('forgotBtn');
    if (forgot) forgot.onclick = function () {
      var email = (emailEl.value || '').trim();
      if (!email) {
        if (errEl) { errEl.classList.remove('ok'); errEl.textContent = 'מלאו את האימייל למעלה ואז לחצו שוב על "שכחתי סיסמה"'; }
        emailEl.focus(); return;
      }
      forgot.disabled = true; forgot.textContent = 'שולח…';
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (res) {
        forgot.disabled = false; forgot.textContent = 'שכחתי סיסמה';
        if (!errEl) return;
        if (res.error) { errEl.classList.remove('ok'); errEl.textContent = 'שליחת המייל נכשלה — נסו שוב בעוד רגע'; return; }
        errEl.classList.add('ok');
        errEl.textContent = '✓ נשלח מייל עם קישור לאיפוס — בדקו את תיבת הדואר (גם בספאם)';
      });
    };
    if (passEl) passEl.onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
    if (emailEl) emailEl.onkeydown = function (e) { if (e.key === 'Enter') { passEl && passEl.focus(); } };
    // עין להצגת/הסתרת הסיסמה
    var eye = document.getElementById('passEye');
    if (eye && passEl) eye.onclick = function () {
      var show = passEl.type === 'password';
      passEl.type = show ? 'text' : 'password';
      eye.textContent = show ? '🙈' : '👁️';
      passEl.focus();
    };
  }

  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // שם התצוגה של המשתמש: רשומת איש הצוות עם אותו אימייל → שם מהחשבון → תחילת האימייל
  function userDisplayName(u) {
    var em = (u.email || '').toLowerCase();
    var m = ((data && data.staff) || []).filter(function (s) { return (s.email || '').toLowerCase() === em; })[0];
    if (m && m.name && m.name.trim()) return m.name.trim();
    var n = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '';
    if (n && n.trim()) return n.trim();
    return (u.email || '?').split('@')[0];
  }
  function updateUserBar() {
    if (!sb) return;
    sb.auth.getUser().then(function (r) {
      var u = r.data && r.data.user;
      var el = document.getElementById('headerSync');
      if (!el || !u) return;
      var email = u.email || '';
      var name = userDisplayName(u);
      var first = name.split(/\s+/)[0] || '?';
      var dark = document.body.classList.contains('dark');
      el.innerHTML = '<button class="mode-switch' + (dark ? ' on' : '') + '" id="darkToggle" role="switch" aria-checked="' + dark + '" aria-label="מצב לילה" title="' + (dark ? 'מעבר למצב יום' : 'מעבר למצב לילה') + '">'
          + '<span class="ms-ico ms-sun">☀️</span><span class="ms-ico ms-moon">🌙</span><span class="ms-knob"></span></button>'
        + '<div class="usermenu">'
        + '<button class="avatar" id="avatarBtn" aria-label="תפריט משתמש" title="' + escHtml(name) + ' · ' + escHtml(email) + '">' + escHtml(first) + '</button>'
        + '<div class="usermenu-pop" id="userPop">'
          + '<div class="um-name">' + escHtml(name) + '</div>'
          + '<div class="um-email">' + escHtml(email) + '</div>'
          + '<button class="um-item um-logout" id="umLogout">↩️ התנתקות</button>'
        + '</div></div>';
      var ab = document.getElementById('avatarBtn'), pop = document.getElementById('userPop');
      if (ab && pop) {
        ab.onclick = function (e) { e.stopPropagation(); pop.classList.toggle('open'); };
        document.addEventListener('click', function () { pop.classList.remove('open'); });
      }
      var lo = document.getElementById('umLogout'); if (lo) lo.onclick = doLogout;
      var dt = document.getElementById('darkToggle');
      if (dt) dt.onclick = function () {
        var on = document.body.classList.toggle('dark');
        try { localStorage.setItem('agri_dark', on ? '1' : '0'); } catch (e) {}
        dt.classList.toggle('on', on);
        dt.setAttribute('aria-checked', on ? 'true' : 'false');
        dt.title = on ? 'מעבר למצב יום' : 'מעבר למצב לילה';
      };
    }).catch(function () {});
  }
  function doLogout() { if (sb) sb.auth.signOut().then(function () { location.reload(); }); }

  // אתחול שמירה/טעינה אוטומטית — נקרא פעם אחת בעליית האפליקציה.
  // עדיפות: ענן (Supabase) → שרת מקומי (data.json) → קובץ/מוטמע (file://).
  function initPersistence(cb) {
    if (cloudMode) {
      sb.auth.getSession().then(function (r) {
        if (r.data && r.data.session) { setSessionUser(r.data.session.user); cloudStart(cb); }
        else showLogin(cb);
      }).catch(function () { showLogin(cb); });
      return;
    }
    if (serverMode) {
      // שמירה אחרונה לפני סגירת הדף (כדי לא לאבד שינוי של הרגע האחרון)
      window.addEventListener('beforeunload', function () {
        try {
          if (navigator.sendBeacon) {
            navigator.sendBeacon('save', new Blob([JSON.stringify(data)], { type: 'application/json' }));
          }
        } catch (e) {}
      });
      fetch('data.json?_=' + Date.now()).then(function (r) {
        if (!r.ok) throw new Error('no file');
        return r.json();
      }).then(function (obj) {
        var fileHasContent = (obj.students && obj.students.length) || (obj.sites && obj.sites.length) ||
          (obj.staff && obj.staff.length) || (obj.days && Object.keys(obj.days).length) ||
          (obj.weeklyPlan && Object.keys(obj.weeklyPlan).length);
        var localEmpty = isEmptyData();
        if (!fileHasContent) {
          // הקובץ ריק — שומרים על המידע המקומי, ואם יש בו תוכן דוחפים אותו לקובץ
          if (!localEmpty) serverSave();
          setStatus('מסונכרן עם OneDrive');
          cb && cb(true);
          return;
        }
        if (localEmpty) {
          replaceAll(obj); // אין מידע מקומי — טוענים מהקובץ
        } else {
          // יש מידע בשני המקומות — מנצח העדכני יותר (לפי זמן שמירה)
          var fileTime = (obj.meta && Date.parse(obj.meta.lastModified)) || 0;
          var localTime = (data.meta && Date.parse(data.meta.lastModified)) || 0;
          if (fileTime >= localTime) replaceAll(obj);
          else serverSave(); // המידע המקומי חדש יותר — מעדכנים את הקובץ
        }
        setStatus('מסונכרן עם OneDrive');
        cb && cb(true);
      }).catch(function () {
        // אין קובץ עדיין — נשתמש במאגר המקומי / בנתונים המוטמעים
        autoSeedIfEmpty(function () { cb && cb(false); });
      });
      return;
    }
    autoSeedIfEmpty(function (seeded) { cb && cb(seeded); });
  }

  // טעינה אוטומטית של נתוני פתיחה אם המאגר המקומי ריק מתוכן.
  // מקור עדיף: נתונים מוטמעים (seed-data.js) שעובדים גם מ-file://; אחרת data.json דרך שרת.
  function autoSeedIfEmpty(cb) {
    if (!isEmptyData()) { cb && cb(false); return; }
    var seed = global.__SEED_DATA;
    if (seed && ((seed.students && seed.students.length) || (seed.sites && seed.sites.length))) {
      replaceAll(seed);
      cb && cb(true);
      return;
    }
    fetch('data.json?_=' + Date.now()).then(function (r) {
      if (!r.ok) throw new Error('no file');
      return r.json();
    }).then(function (obj) {
      var hasContent = (obj.students && obj.students.length) || (obj.sites && obj.sites.length) ||
        (obj.staff && obj.staff.length) || (obj.days && Object.keys(obj.days).length);
      if (hasContent) { replaceAll(obj); cb && cb(true); }
      else { cb && cb(false); }
    }).catch(function () { cb && cb(false); });
  }

  // ---------- שליחת SMS (דרך Edge Function send-sms) ----------
  function sendSms(messages) {
    if (!sb) return Promise.reject(new Error('אין חיבור לענן'));
    return sb.functions.invoke('rapid-worker', { body: { messages: messages } }).then(function (res) {
      if (res.error) throw res.error;
      return res.data || {};
    });
  }

  // ---------- ניהול משתמשים (דרך Edge Function manage-users) ----------
  function manageUsers(payload) {
    if (!sb) return Promise.reject(new Error('אין חיבור לענן'));
    return sb.functions.invoke('manage-users', { body: payload }).then(function (res) {
      if (res.error) {
        var ctx = res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().then(
            function (j) { throw new Error((j && j.error) || res.error.message); },
            function () { throw res.error; }
          );
        }
        throw res.error;
      }
      if (res.data && res.data.error) throw new Error(res.data.error);
      return res.data || {};
    });
  }

  // ---------- ניתוח PDF חובות עם AI (דרך Edge Function parse-debts-pdf) ----------
  function parseDebtsPdf(payload) {
    if (!sb) return Promise.reject(new Error('אין חיבור לענן'));
    return sb.functions.invoke('parse-debts-pdf', { body: payload }).then(function (res) {
      if (res.error) {
        var ctx = res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().then(
            function (j) { throw new Error((j && j.error) || res.error.message); },
            function () { throw res.error; }
          );
        }
        throw res.error;
      }
      if (res.data && res.data.error) throw new Error(res.data.error);
      return res.data || {};
    });
  }

  // ---------- חשיפה גלובלית ----------
  global.Store = {
    uid: uid,
    sendSms: sendSms,
    manageUsers: manageUsers,
    parseDebtsPdf: parseDebtsPdf,
    load: load,
    save: save,
    get: get,
    getById: getById,
    upsert: upsert,
    remove: remove,
    onChange: onChange,
    exportJSON: exportJSON,
    importJSONFile: importJSONFile,
    fsSupported: fsSupported,
    connectFile: connectFile,
    openExistingFile: openExistingFile,
    setStatus: setStatus,
    defaultData: defaultData,
    replaceAll: replaceAll,
    autoSeedIfEmpty: autoSeedIfEmpty,
    initPersistence: initPersistence,
    serverMode: serverMode,
    isAdmin: isAdmin,
    isKitchen: isKitchen,
    canManage: canManage,
    currentRole: currentRole,
    roleOf: roleOf,
    setUserRole: setUserRole,
    currentEmail: function () { return sessionUser && sessionUser.email ? String(sessionUser.email).toLowerCase() : null; },
    myName: function () { return sessionUser ? userDisplayName(sessionUser) : ''; },
    myFirstName: function () { return sessionUser ? (userDisplayName(sessionUser).split(/\s+/)[0] || '') : ''; },
    flushPendingRemote: flushPendingRemote
  };
})(window);
