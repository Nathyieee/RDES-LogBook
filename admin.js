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

  function render() {
    var users = window.RDESAuth.getUsersList();
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
      var action = u.approved
        ? '<span class="muted">—</span>'
        : '<button type="button" class="btn btn-small btn-primary btn-approve" data-email="' + escapeHtml(u.email) + '">Approve</button>';
      return '<tr><td>' + escapeHtml(u.name) + '</td><td>' + escapeHtml(u.email) + '</td><td>' + roleLabel + '</td><td>' + status + '</td><td>' + action + '</td></tr>';
    }).join('');

    usersBody.querySelectorAll('.btn-approve').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var email = btn.getAttribute('data-email');
        if (!email) return;
        if (window.RDESAuth.approveUser(email)) {
          render();
        }
      });
    });
  }

  render();
})();
