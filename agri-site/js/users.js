/* users.js — ניהול משתמשים: יצירת חשבון התחברות / איפוס סיסמה לאנשי צוות (אדמין בלבד) */
(function (global) {
  'use strict';
  var U = global.U;

  var SITE_URL = 'https://chaklaut.rgvb.org.il';

  function genPassword() {
    var a = 'abcdefghjkmnpqrstuvwxyz';
    var n = '23456789';
    var s = '';
    for (var i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    for (var j = 0; j < 4; j++) s += n[Math.floor(Math.random() * n.length)];
    return s;
  }

  function smsPhone(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.indexOf('972') === 0) d = '0' + d.slice(3);
    if (d.length === 9 && d.charAt(0) !== '0') d = '0' + d;
    return d.length >= 9 ? d : null;
  }

  function waNumber(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.indexOf('972') === 0) return d;
    if (d.charAt(0) === '0') return '972' + d.slice(1);
    if (d.length === 9) return '972' + d;
    return d;
  }

  function credsMessage(name, email, password) {
    return 'שלום ' + name + ',\n' +
      'פרטי הכניסה למערכת רגבים בנימין:\n' +
      'קישור: ' + SITE_URL + '\n' +
      'אימייל: ' + email + '\n' +
      'סיסמה: ' + password;
  }

  // יוצר/מאפס סיסמה ושולח את פרטי ההתחברות ב-SMS
  function sendCredentialsSms(staff, email, hasAccount) {
    var phone = smsPhone(staff.phone);
    if (!phone) { U.toast('לאיש צוות זה אין מספר טלפון תקין בנתוני בסיס.', 'error'); return; }
    Modal.confirm({
      title: 'שליחת פרטי התחברות ב-SMS',
      text: 'פעולה זו תייצר סיסמה חדשה ל"' + staff.name + '" ותשלח לו ב-SMS את האימייל, הסיסמה והקישור לאתר.\n⚠️ שליחת SMS עולה כסף בחשבון 019.',
      okLabel: 'שלח'
    }, function () {
      var password = genPassword();
      Store.manageUsers({ action: hasAccount ? 'resetPassword' : 'create', email: email, password: password }).then(function () {
        return Store.sendSms([{ phone: phone, text: credsMessage(staff.name, email, password) }]);
      }).then(function (res) {
        if ((res.sent || 0) > 0) U.toast('נשלח SMS עם פרטי ההתחברות ל' + staff.name);
        else U.toast('הסיסמה עודכנה אך שליחת ה-SMS נכשלה' + ((res.errors && res.errors[0]) ? ' — ' + res.errors[0] : ''), 'error');
        App.render();
      }).catch(function (e) { U.toast('שגיאה: ' + (e.message || e), 'error'); });
    });
  }

  // יוצר/מאפס סיסמה ופותח וואטסאפ עם פרטי ההתחברות מוכנים לשליחה (חינם)
  function sendCredentialsWhatsApp(staff, email, hasAccount) {
    Modal.confirm({
      title: 'שליחת פרטי התחברות בוואטסאפ',
      text: 'פעולה זו תייצר סיסמה חדשה ל"' + staff.name + '" ותפתח וואטסאפ עם האימייל, הסיסמה והקישור מוכנים לשליחה.',
      okLabel: 'המשך'
    }, function () {
      var win = window.open('', '_blank'); // נפתח מיד (מחווה של המשתמש) כדי לעקוף חוסם חלונות קופצים
      var wn = waNumber(staff.phone);
      var password = genPassword();
      Store.manageUsers({ action: hasAccount ? 'resetPassword' : 'create', email: email, password: password }).then(function () {
        var url = (wn ? 'https://wa.me/' + wn : 'https://wa.me/') + '?text=' + encodeURIComponent(credsMessage(staff.name, email, password));
        if (win) win.location = url; else window.open(url, '_blank');
        App.render();
      }).catch(function (e) { if (win) win.close(); U.toast('שגיאה: ' + (e.message || e), 'error'); });
    });
  }

  function render(root) {
    if (!Store.isAdmin()) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין הרשאה.')); return; }

    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '👥 ניהול משתמשים' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { App.render(); } }, '↻ רענן')
    ]));
    root.appendChild(U.el('p', { class: 'muted', text: 'יצירת חשבון התחברות (אימייל + סיסמה) לכל איש צוות, וקביעת ההרשאה שלו. לאחר חיבור החשבון, איש הצוות מתחבר ורואה אוטומטית את האתר ששובץ לו במצב שטח. האימייל נקבע בנתוני בסיס → אנשי צוות.' }));
    root.appendChild(U.el('p', { class: 'muted', style: 'font-size:12px;margin-top:-6px;', text: 'הרשאות: "מצב שטח" — איש צוות רגיל · "מנהל מטבח" — מסך תורני מטבח · "מנהל" — כל המסכים למעט נתוני בסיס, מטבח והגדרות · "רכז חקלאות" — גישה מלאה.' }));

    var staff = (Store.get().staff || []).filter(function (s) { return s.active !== false; })
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });

    var tableWrap = U.el('div');
    root.appendChild(tableWrap);
    tableWrap.appendChild(U.el('div', { class: 'card', text: 'טוען חשבונות…' }));

    Store.manageUsers({ action: 'list' }).then(function (res) {
      var accounts = {};
      (res.users || []).forEach(function (u) { if (u.email) accounts[u.email.toLowerCase()] = true; });
      U.clear(tableWrap);
      tableWrap.appendChild(buildTable(staff, accounts, false));
    }).catch(function (e) {
      // הפונקציה אינה פרוסה — עדיין מציגים את הטבלה כדי שקביעת ההרשאות (שאינה תלויה בשרת) תעבוד
      U.clear(tableWrap);
      tableWrap.appendChild(U.el('div', { class: 'card', style: 'border:1px solid #f0c000;background:#fffbe6;margin-bottom:10px;' }, [
        U.el('div', { style: 'font-weight:600;', text: '⚠️ יצירת/איפוס חשבונות אינה זמינה — פונקציית השרת manage-users אינה פרוסה.' }),
        U.el('div', { class: 'muted', style: 'margin-top:4px;font-size:12px;', text: 'קביעת ההרשאות למטה עובדת כרגיל. לפריסה: Supabase → Edge Functions → Deploy a new function בשם manage-users.' })
      ]));
      tableWrap.appendChild(buildTable(staff, {}, true));
    });
  }

  function buildTable(staff, accounts, accountsUnknown) {
    var rows = staff.map(function (s) {
      var email = (s.email || '').trim();
      var hasEmail = !!email;
      var hasAccount = hasEmail && accounts[email.toLowerCase()];

      var status;
      if (!hasEmail) status = U.el('span', { class: 'tag', style: 'background:#fee2e2;color:#b91c1c;font-weight:700;', text: 'חסר מייל' });
      else if (accountsUnknown) status = U.el('span', { class: 'muted', text: '—' });
      else if (hasAccount) status = U.el('span', { class: 'tag', style: 'background:#e8f5e9;color:#1b5e20;', text: '✓ יש חשבון' });
      else status = U.el('span', { class: 'tag', style: 'background:#fff3e0;color:#b07a3f;', text: 'אין חשבון' });

      // הרשאה — נשמרת לפי אימייל ההתחברות
      var roleCell = U.el('td');
      if (hasEmail) {
        var cur = Store.roleOf(email);
        var roleSel = U.el('select', null, [
          U.el('option', { value: 'field' }, 'מצב שטח'),
          U.el('option', { value: 'kitchen' }, 'מנהל מטבח'),
          U.el('option', { value: 'manager' }, 'מנהל'),
          U.el('option', { value: 'admin' }, 'רכז חקלאות (גישה מלאה)')
        ]);
        roleSel.value = cur;
        roleSel.addEventListener('change', function () {
          Store.setUserRole(email, roleSel.value);
          if (email === Store.currentEmail()) { alert('שינית את ההרשאה של עצמך. המסך ייטען מחדש.'); location.reload(); return; }
          App.render();
        });
        roleCell.appendChild(roleSel);
      } else {
        roleCell.appendChild(U.el('span', { class: 'muted', text: '—' }));
      }

      var actions = U.el('td', { class: 'actions', style: 'display:flex;flex-wrap:wrap;gap:6px;' });
      if (!hasEmail) {
        actions.appendChild(U.el('span', { class: 'muted', style: 'font-size:12px;', text: 'הוסיפו אימייל בנתוני בסיס' }));
      } else if (accountsUnknown) {
        actions.appendChild(U.el('span', { class: 'muted', style: 'font-size:12px;', text: 'דרושה פריסת manage-users' }));
      } else {
        if (hasAccount) actions.appendChild(U.el('button', { class: 'btn small secondary', title: 'אפס סיסמה', onclick: function () { openPwdDialog('resetPassword', s, email); } }, '🔑'));
        else actions.appendChild(U.el('button', { class: 'btn small', title: 'צור חשבון', onclick: function () { openPwdDialog('create', s, email); } }, '➕'));
        // שליחת פרטי התחברות — מוצגים תמיד (אם אין טלפון, תוצג הודעה בלחיצה)
        actions.appendChild(U.el('button', { class: 'btn small ico secondary', title: 'שליחת פרטי התחברות ב-SMS', onclick: function () { sendCredentialsSms(s, email, hasAccount); } }, '📩'));
        actions.appendChild(U.el('button', { class: 'btn small ico', style: 'background:#25D366;color:#fff;', title: 'שליחת פרטי התחברות בוואטסאפ', onclick: function () { sendCredentialsWhatsApp(s, email, hasAccount); }, html: U.WA_SVG }));
        if (hasAccount) actions.appendChild(U.el('button', { class: 'btn small danger', title: 'מחק חשבון', onclick: function () { delAccount(s, email); } }, '🗑'));
      }

      return U.el('tr', null, [
        U.el('td', { text: s.name + (s.role === 'leader' ? ' · ראש צוות' : '') }),
        U.el('td', { text: email || '—', style: 'direction:ltr;text-align:right;' }),
        U.el('td', null, [status]),
        roleCell,
        actions
      ]);
    });

    var table = U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, [
        U.el('th', { text: 'איש צוות' }),
        U.el('th', { text: 'אימייל התחברות' }),
        U.el('th', { text: 'סטטוס' }),
        U.el('th', { text: 'הרשאה' }),
        U.el('th', { text: 'פעולות' })
      ])]),
      U.el('tbody', null, rows.length ? rows : [U.el('tr', null, [U.el('td', { colspan: '5', class: 'center muted', text: 'אין אנשי צוות פעילים.' })])])
    ]);
    // עטיפה לגלילה אופקית — הטבלה נטענת א-סינכרונית ולכן לא נתפסת ע"י העטיפה הגלובלית ב-app.js
    return U.el('div', { class: 'tbl-scroll' }, [table]);
  }

  function openPwdDialog(action, staff, email) {
    var isReset = action === 'resetPassword';
    var pwdInp = U.el('input', { type: 'text', value: genPassword(), style: 'width:100%;direction:ltr;text-align:right;font-size:16px;letter-spacing:1px;' });
    var msg = U.el('div', { class: 'login-err', style: 'min-height:16px;' });

    var body = U.el('div', null, [
      U.el('p', { style: 'margin:0 0 4px;', text: (isReset ? 'איפוס סיסמה עבור ' : 'יצירת חשבון עבור ') + staff.name }),
      U.el('p', { class: 'muted', style: 'margin:0 0 10px;direction:ltr;text-align:right;', text: email }),
      U.el('label', { text: 'סיסמה' }),
      U.el('div', { style: 'display:flex;gap:6px;' }, [
        pwdInp,
        U.el('button', { class: 'btn secondary small', onclick: function () { pwdInp.value = genPassword(); } }, '🎲')
      ]),
      U.el('p', { class: 'muted', style: 'font-size:12px;margin:8px 0 0;', text: 'העתיקו את הסיסמה ומסרו אותה לאיש הצוות. אפשר לשנות אותה כאן בכל עת.' }),
      msg
    ]);

    Modal.open(isReset ? 'איפוס סיסמה' : 'יצירת חשבון', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: isReset ? 'אפס סיסמה' : 'צור חשבון', class: '', onClick: function (close) {
        var pwd = (pwdInp.value || '').trim();
        if (pwd.length < 6) { msg.textContent = 'סיסמה חייבת לפחות 6 תווים'; return; }
        msg.style.color = '#6b7884'; msg.textContent = 'שולח…';
        Store.manageUsers({ action: action, email: email, password: pwd }).then(function () {
          close();
          U.toast((isReset ? 'הסיסמה אופסה בהצלחה' : 'החשבון נוצר בהצלחה') + ' · ' + email);
          App.render();
        }).catch(function (e) {
          msg.style.color = '#c62828'; msg.textContent = 'שגיאה: ' + (e.message || e);
        });
      } }
    ]);
  }

  function delAccount(staff, email) {
    Modal.confirm({
      title: 'מחיקת חשבון התחברות',
      text: 'למחוק את חשבון ההתחברות של "' + staff.name + '" (' + email + ')?\nאיש הצוות לא יוכל להתחבר יותר. רשומת איש הצוות עצמה לא תימחק.',
      okLabel: 'מחק', danger: true
    }, function () {
      Store.manageUsers({ action: 'delete', email: email }).then(function () {
        U.toast('החשבון נמחק');
        App.render();
      }).catch(function (e) { U.toast('שגיאה: ' + (e.message || e), 'error'); });
    });
  }

  global.UsersView = { render: render };
})(window);
