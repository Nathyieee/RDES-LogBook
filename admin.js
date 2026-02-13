(function () {
  'use strict';

  if (!window.RDESAuth || !window.RDESAuth.requireAuth()) return;

  var currentUser = window.RDESAuth.getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') {
    window.location.href = 'index.html';
    return;
  }

  var userInfo = document.getElementById('userInfo');
  var btnSignOut = document.getElementById('btnSignOut');
  var usersBody = document.getElementById('usersBody');
  var emptyUsers = document.getElementById('emptyUsers');
  var formManual = document.getElementById('formManualEntry');
  var manualUser = document.getElementById('manualUser');
  var manualDate = document.getElementById('manualDate');
  var manualTime = document.getElementById('manualTime');
  var manualAction = document.getElementById('manualAction');
  var manualMessage = document.getElementById('manualEntryMessage');

  if (userInfo) userInfo.textContent = currentUser.name + ' (Admin)';
  if (btnSignOut) btnSignOut.addEventListener('click', function () { window.RDESAuth.signOut(); });

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function populateManualUserSelect(users) {
    if (!manualUser) return;
    var ojtApproved = (users || []).filter(function (u) { return u.role === 'ojt' && u.approved; });
    manualUser.innerHTML = '<option value="">— Select student —</option>' +
      ojtApproved.map(function (u) {
        return '<option value="' + escapeHtml(u.email) + '">' + escapeHtml(u.name) + ' (' + escapeHtml(u.email) + ')</option>';
      }).join('');
  }

  async function render() {
    var users = await window.RDESAuth.getUsersList();
    if (!usersBody) return;

    populateManualUserSelect(users);

    if (users.length === 0) {
      usersBody.innerHTML = '';
      if (emptyUsers) emptyUsers.classList.add('visible');
      return;
    }
    if (emptyUsers) emptyUsers.classList.remove('visible');

    usersBody.innerHTML = users.map(function (u) {
      var status = u.approved ? '<span class="badge badge-in">Approved</span>' : '<span class="badge badge-out">Pending</span>';
      var roleLabel = u.role === 'admin' ? 'Admin' : 'OJT';

      var buttons = [];
      if (!u.approved) {
        buttons.push('<button type="button" class="btn btn-small btn-primary btn-approve" data-email="' + escapeHtml(u.email) + '">Approve</button>');
      }
      // Allow deleting any account except your own (current admin).
      if (!currentUser || (u.email || '').toLowerCase() !== (currentUser.email || '').toLowerCase()) {
        buttons.push('<button type="button" class="btn btn-small btn-delete-user" data-email="' + escapeHtml(u.email) + '">Delete</button>');
      }
      var action = buttons.length ? buttons.join(' ') : '<span class="muted">—</span>';

      return '<tr><td>' + escapeHtml(u.name) + '</td><td>' + escapeHtml(u.email) + '</td><td>' + roleLabel + '</td><td>' + status + '</td><td>' + action + '</td></tr>';
    }).join('');

    usersBody.querySelectorAll('.btn-approve').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var email = btn.getAttribute('data-email');
        if (!email) return;
        window.RDESAuth.approveUser(email).then(function (result) {
          if (result && result.ok) {
            render();
          } else {
            alert(result && result.message ? result.message : 'Failed to approve user. Please try again.');
          }
        });
      });
    });

    usersBody.querySelectorAll('.btn-delete-user').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var email = btn.getAttribute('data-email');
        if (!email) return;
        if (!window.confirm('Delete this account permanently? This will also remove their time log entries.')) {
          return;
        }
        window.RDESAuth.deleteUser(email).then(function (result) {
          if (result && result.ok) {
            render();
          } else {
            alert(result && result.message ? result.message : 'Failed to delete user. Please try again.');
          }
        });
      });
    });
  }

  if (formManual) {
    formManual.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!manualMessage) return;
      manualMessage.textContent = '';
      manualMessage.classList.remove('error', 'success');

      var userEmail = manualUser && manualUser.value ? manualUser.value.trim() : '';
      var entryDate = manualDate && manualDate.value ? manualDate.value.trim() : '';
      var entryTime = manualTime && manualTime.value ? manualTime.value.trim() : '';
      var logAction = manualAction && manualAction.value ? manualAction.value : 'time_in';
      if (!userEmail || !entryDate || !entryTime) {
        manualMessage.textContent = 'Please select a student and enter date and time.';
        manualMessage.classList.add('error');
        return;
      }
      if (!currentUser || !currentUser.id) {
        manualMessage.textContent = 'Session expired. Please sign in again.';
        manualMessage.classList.add('error');
        return;
      }

      fetch('api/logs.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_entry_manual',
          createdByUserId: currentUser.id,
          userEmail: userEmail,
          entryDate: entryDate,
          entryTime: entryTime,
          logAction: logAction
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.ok) {
            manualMessage.textContent = 'Entry added: ' + (data.entry && data.entry.name ? data.entry.name : '') + ' — ' + (data.entry && data.entry.date ? data.entry.date : '') + ' ' + (data.entry && data.entry.time ? data.entry.time : '') + ' (' + (data.entry && data.entry.action ? data.entry.action : '') + ').';
            manualMessage.classList.add('success');
          } else {
            manualMessage.textContent = (data && data.message) ? data.message : 'Could not add entry. Try again.';
            manualMessage.classList.add('error');
          }
        })
        .catch(function () {
          manualMessage.textContent = 'Could not reach server. Check your connection.';
          manualMessage.classList.add('error');
        });
    });
  }

  render();
})();
