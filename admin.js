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

  if (userInfo) userInfo.textContent = currentUser.name + ' (Admin)';
  if (btnSignOut) btnSignOut.addEventListener('click', function () { window.RDESAuth.signOut(); });

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function render() {
    var users = await window.RDESAuth.getUsersList();
    if (!usersBody) return;

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

  render();
})();
