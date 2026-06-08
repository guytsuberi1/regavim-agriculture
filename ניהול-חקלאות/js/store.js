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
      students: [],     // { id, name, grade, active, notes }
      sites: [],        // { id, name, location, contactName, phone, email, hourlyRate, travelPay, defaultHours, defaultTransportId, active, notes }
      staff: [],        // { id, name, role: 'staff'|'leader', phone, active }
      transports: [],   // { id, name, capacity, active }
      teams: [],        // { id, leaderStudentId, memberIds: [studentId,...] }  (ראש צוות = תלמיד י"ב)
      weeklyPlan: {},   // { 'YYYY-MM-DD': [ { siteId, workers, group, transportId, note } ] }
      days: {},         // { 'YYYY-MM-DD': { cards: [ {id, siteId, transportId, staffId, leaderId, hours, travel, notes, students:[{studentId,duty,arrived,wentToWork}] } ] } }
      billingAdjustments: {} // { 'YYYY-MM|siteId': { 'YYYY-MM-DD': { note, hoursOverride, workersOverride, travelOverride } } }
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

  var saveTimer = null;
  function save() {
    if (!data) return;
    data.meta.lastModified = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('save failed', e);
      alert('שגיאה בשמירה מקומית: ' + e.message);
    }
    // שמירה אוטומטית ל-OneDrive
    if (fileHandle) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(writeToFileHandle, 800);
    } else if (serverMode) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(serverSave, 700);
    }
    notify();
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
      alert('הדפדפן לא תומך בחיבור אוטומטי לקובץ. השתמשו בכפתורי גיבוי/טעינה ידניים.');
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
      alert('הדפדפן לא תומך בפתיחת קובץ אוטומטית. השתמשו בכפתור "טעינת גיבוי".');
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
    if (statusEl) statusEl.textContent = msg;
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

  // אתחול שמירה/טעינה אוטומטית — נקרא פעם אחת בעליית האפליקציה.
  // במצב שרת: data.json הוא מקור האמת — טוענים ממנו, ושומרים אליו בכל שינוי.
  // במצב קובץ (file://): טוענים נתוני פתיחה מוטמעים אם המאגר ריק.
  function initPersistence(cb) {
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
        var hasContent = (obj.students && obj.students.length) || (obj.sites && obj.sites.length) ||
          (obj.staff && obj.staff.length) || (obj.days && Object.keys(obj.days).length) ||
          (obj.weeklyPlan && Object.keys(obj.weeklyPlan).length);
        if (hasContent) { replaceAll(obj); }
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

  // ---------- חשיפה גלובלית ----------
  global.Store = {
    uid: uid,
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
    serverMode: serverMode
  };
})(window);
