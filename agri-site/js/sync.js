/* sync.js — סנכרון דו-כיווני בין התכנון השבועי לסידור היומי (לפי תאריך+אתר) */
(function (global) {
  'use strict';
  var U = global.U;

  function planOf(iso) { var d = Store.get(); if (!d.weeklyPlan[iso]) d.weeklyPlan[iso] = []; return d.weeklyPlan[iso]; }
  function dayOf(iso) { var d = Store.get(); if (!d.days[iso]) d.days[iso] = { cards: [] }; return d.days[iso]; }

  function cardForSite(iso, siteId) {
    return dayOf(iso).cards.filter(function (c) { return c.siteId === siteId; })[0] || null;
  }
  function planForSite(iso, siteId) {
    return planOf(iso).filter(function (p) { return p.siteId === siteId; })[0] || null;
  }

  function numOrBlank(v) { return (v === '' || v == null) ? '' : U.num(v); }

  // יצירת כרטיס יומי מתוך פריט תכנון
  function addCardFromPlan(iso, p) {
    var s = p.siteId ? Store.getById('sites', p.siteId) : null;
    var def = Store.get().settings.defaultHours;
    dayOf(iso).cards.push({
      id: Store.uid(), siteId: p.siteId,
      transportId: p.transportId || (s ? s.defaultTransportId : null) || null,
      staffId: null, leaderId: null,
      hours: s ? (s.defaultHours || def) : def,
      travel: true, notes: p.note || '',
      targetWorkers: numOrBlank(p.workers), group: p.group || '',
      students: []
    });
  }

  // יצירת פריט תכנון מתוך כרטיס יומי
  function addPlanFromCard(iso, c) {
    planOf(iso).push({
      siteId: c.siteId,
      workers: c.targetWorkers === undefined ? '' : c.targetWorkers,
      group: c.group || '', transportId: c.transportId || '', note: ''
    });
  }

  // ----- איחוד (ללא מחיקה) — לאתחול ולמצבים קיימים -----
  function mergeDate(iso) {
    var p = planOf(iso), d = dayOf(iso);
    p.forEach(function (pi) {
      if (!pi.siteId) return;
      var c = cardForSite(iso, pi.siteId);
      if (!c) addCardFromPlan(iso, pi);
      else { c.targetWorkers = numOrBlank(pi.workers); if (!c.group) c.group = pi.group || ''; }
    });
    d.cards.forEach(function (c) {
      if (!c.siteId) return;
      if (!planForSite(iso, c.siteId)) addPlanFromCard(iso, c);
    });
  }

  function mergeAll() {
    var d = Store.get(), dates = {};
    Object.keys(d.weeklyPlan).forEach(function (k) { dates[k] = 1; });
    Object.keys(d.days).forEach(function (k) { dates[k] = 1; });
    Object.keys(dates).forEach(mergeDate);
  }

  // ----- שינוי בתכנון → עדכון הסידור היומי -----
  function planChanged(iso) {
    var p = planOf(iso), d = dayOf(iso);
    p.forEach(function (pi) {
      if (!pi.siteId) return;
      var c = cardForSite(iso, pi.siteId);
      if (!c) addCardFromPlan(iso, pi);
      else { c.targetWorkers = numOrBlank(pi.workers); c.group = pi.group || ''; if (pi.transportId && !c.transportId) c.transportId = pi.transportId; }
    });
    // הסרת כרטיסים שהאתר שלהם הוסר מהתכנון — אך לא כרטיס עם תלמידים משובצים
    d.cards = d.cards.filter(function (c) {
      return !c.siteId || planForSite(iso, c.siteId) || (c.students && c.students.length);
    });
  }

  // ----- שינוי בסידור היומי → עדכון התכנון -----
  function dayChanged(iso) {
    var d = dayOf(iso);
    d.cards.forEach(function (c) {
      if (!c.siteId) return;
      var pi = planForSite(iso, c.siteId);
      if (!pi) addPlanFromCard(iso, c);
      else {
        if (c.targetWorkers !== undefined) pi.workers = c.targetWorkers;
        if (c.group) pi.group = c.group;
        if (c.transportId) pi.transportId = c.transportId;
      }
    });
    var newP = planOf(iso).filter(function (pi) { return !pi.siteId || cardForSite(iso, pi.siteId); });
    Store.get().weeklyPlan[iso] = newP;
    if (!newP.length) delete Store.get().weeklyPlan[iso];
  }

  global.Sync = {
    mergeAll: mergeAll, mergeDate: mergeDate,
    planChanged: planChanged, dayChanged: dayChanged,
    cardForSite: cardForSite, planForSite: planForSite
  };
})(window);
