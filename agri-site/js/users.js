/* users.js — ניהול משתמשים: יצירת חשבון התחברות / איפוס סיסמה לאנשי צוות (אדמין בלבד) */
(function (global) {
  'use strict';
  var U = global.U;

  function genPassword() {
    var a = 'abcdefghjkmnpqrstuvwxyz';
    var n = '23456789';
    var s = '';
    for (var i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    for (var j = 0; j < 4; j++) s += n[Math.floor(Math.random() * n.length)];
    return s;
  }

  function render(root) {
    if (!Store.isAdmin()) { root.appendChild(U.el('div', { class: 'card empty' }, 'אין הרשאה.')); return; }

    root.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '👥 ניהול משתמשים' }),
      U.el('button', { class: 'btn secondary small', onclick: function () { App.render(); } }, '↻ רענן')
    ]));
    root.appendChild(U.el('p', { class: 'muted', text: 'יצירת חשבון התחברות (אימייל + סיסמה) לכל איש צוות. לאחר חיבור החשבון, איש הצוות מתחבר ורואה אוטומטית את האתר ששובץ לו במצב שטח. האימייל נקבע בנתוני בסיס → אנשי צוות.' }));

    var staff = (Store.get().staff || []).filter(function (s) { return s.active !== false; })
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'he'); });

    var tableWrap = U.el('div');
    root.appendChild(tableWrap);
    tableWrap.appendChild(U.el('div', { class: 'card', text: 'טוען חשבונות…' }));

    Store.manageUsers({ action: 'list' }).then(function (res) {
      var accounts = {};
      (res.users || []).forEach(function (u) { if (u.email) accounts[u.email.toLowerCase()] = true; });
      U.clear(tableWrap);
      tableWrap.appendChild(buildTable(staff, accounts));
    }).catch(function (e) {
      U.clear(tableWrap);
      tableWrap.appendChild(U.el('div', { class: 'card' }, [
        U.el('div', { class: 'muted', text: 'לא ניתן לטעון את רשימת החשבונות: ' + (e.message || e) }),
        U.el('div', { class: 'muted', style: 'margin-top:6px;font-size:12px;', text: 'ודאו שפונקציית השרת manage-users פרוסה ושאתם מחוברים כאדמין.' })
      ]));
    });
  }

  function buildTable(staff, accounts) {
    var rows = staff.map(function (s) {
      var email = (s.email || '').trim();
      var hasEmail = !!email;
      var hasAccount = hasEmail && accounts[email.toLowerCase()];

      var status;
      if (!hasEmail) status = U.el('span', { class: 'muted', text: '— ללא אימייל' });
      else if (hasAccount) status = U.el('span', { class: 'tag', style: 'background:#e8f5e9;color:#1b5e20;', text: '✓ יש חשבון' });
      else status = U.el('span', { class: 'tag', style: 'background:#fff3e0;color:#b07a3f;', text: 'אין חשבון' });

      var actions = U.el('td', { class: 'actions' });
      if (!hasEmail) {
        actions.appendChild(U.el('span', { class: 'muted', style: 'font-size:12px;', text: 'הוסיפו אימייל בנתוני בסיס' }));
      } else if (hasAccount) {
        actions.appendChild(U.el('button', { class: 'btn small secondary', onclick: function () { openPwdDialog('resetPassword', s, email); } }, '🔑 אפס סיסמה'));
        actions.appendChild(U.el('button', { class: 'btn small danger', style: 'margin-inline-start:6px;', onclick: function () { delAccount(s, email); } }, '✕ מחק חשבון'));
      } else {
        actions.appendChild(U.el('button', { class: 'btn small', onclick: function () { openPwdDialog('create', s, email); } }, '➕ צור חשבון'));
      }

      return U.el('tr', null, [
        U.el('td', { text: s.name + (s.role === 'leader' ? ' · ראש צוות' : '') }),
        U.el('td', { text: email || '—', style: 'direction:ltr;text-align:right;' }),
        U.el('td', null, [status]),
        actions
      ]);
    });

    var table = U.el('table', { class: 'grid' }, [
      U.el('thead', null, [U.el('tr', null, [
        U.el('th', { text: 'איש צוות' }),
        U.el('th', { text: 'אימייל התחברות' }),
        U.el('th', { text: 'סטטוס' }),
        U.el('th', { text: 'פעולות' })
      ])]),
      U.el('tbody', null, rows.length ? rows : [U.el('tr', null, [U.el('td', { colspan: '4', class: 'center muted', text: 'אין אנשי צוות פעילים.' })])])
    ]);
    return table;
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
          alert((isReset ? 'הסיסמה אופסה בהצלחה.' : 'החשבון נוצר בהצלחה.') + '\n\nאימייל: ' + email + '\nסיסמה: ' + pwd);
          App.render();
        }).catch(function (e) {
          msg.style.color = '#c62828'; msg.textContent = 'שגיאה: ' + (e.message || e);
        });
      } }
    ]);
  }

  function delAccount(staff, email) {
    if (!confirm('למחוק את חשבון ההתחברות של "' + staff.name + '" (' + email + ')?\nאיש הצוות לא יוכל להתחבר יותר. רשומת איש הצוות עצמה לא תימחק.')) return;
    Store.manageUsers({ action: 'delete', email: email }).then(function () {
      alert('החשבון נמחק.');
      App.render();
    }).catch(function (e) { alert('שגיאה: ' + (e.message || e)); });
  }

  global.UsersView = { render: render };
})(window);
