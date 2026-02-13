(function () {
  'use strict';

  const CURRENT_USER_KEY = 'rdes-current-user';
  const AUTH_PAGE = 'auth.html';

  const AUTH_API_URL = 'api/auth.php';

  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(CURRENT_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function setCurrentUser(user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  }

  function clearCurrentUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  function requireAuth() {
    var user = getCurrentUser();
    if (!user) {
      window.location.href = AUTH_PAGE;
      return false;
    }
    if (user.approved === false) {
      window.location.href = 'pending-approval.html';
      return false;
    }
    return true;
  }

  function getUsersList() {
    var users = getUsers();
    return users.map(function (u) {
      return { email: u.email, name: u.name, role: u.role, approved: u.approved !== false };
    });
  }

  function approveUser(email) {
    var users = getUsers();
    var normalized = (email || '').trim().toLowerCase();
    var i = users.findIndex(function (u) { return (u.email || '').toLowerCase() === normalized; });
    if (i === -1) return false;
    users[i].approved = true;
    saveUsers(users);
    return true;
  }

  function signOut() {
    clearCurrentUser();
    window.location.href = AUTH_PAGE;
  }

  async function hashPassword(password) {
    const enc = new TextEncoder().encode(password);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  async function signIn(email, password) {
    const payload = { action: 'sign_in', email: email, password: password };
    var res;
    try {
      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, 15000);
      res = await fetch(AUTH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (e) {
      if (e.name === 'AbortError') {
        return { ok: false, message: 'Connection timed out. Check your connection and try again.' };
      }
      return { ok: false, message: 'Cannot reach server. Check your connection and try again.' };
    }
    var data;
    try {
      data = await res.json();
    } catch (_) {
      return { ok: false, message: 'Invalid response from server. Try again.' };
    }
    if (!data || !data.ok) {
      return { ok: false, message: (data && data.message) ? data.message : 'Sign in failed.' };
    }
    var user = data.user || {};
    var session = { email: user.email, name: user.name, role: user.role, approved: true, id: user.id };
    setCurrentUser(session);
    return { ok: true, user: session };
  }

  async function signUp(name, email, password, role, ojtStartTime, ojtEndTime, ojtHoursPerDay, ojtTotalHoursRequired) {
    const trimmedName = (name || '').trim();
    const trimmedEmail = (email || '').trim().toLowerCase();
    if (!trimmedName) return { ok: false, message: 'Name is required.' };
    if (!trimmedEmail) return { ok: false, message: 'Email is required.' };
    if (!password || password.length < 4) return { ok: false, message: 'Password must be at least 4 characters.' };
    if (role !== 'ojt' && role !== 'admin') return { ok: false, message: 'Please select a role.' };

    if (role === 'ojt') {
      if (!ojtStartTime || !ojtEndTime) return { ok: false, message: 'Please enter OJT start and end time.' };
      var hours = parseInt(ojtHoursPerDay, 10);
      if (isNaN(hours) || hours < 1 || hours > 24) return { ok: false, message: 'Hours per day must be between 1 and 24.' };
      var totalHours = parseInt(ojtTotalHoursRequired, 10);
      if (isNaN(totalHours) || totalHours < 1) return { ok: false, message: 'Total hours needed must be at least 1 hour.' };
    }

    // Send registration to PHP API
    const payload = {
      action: 'sign_up',
      name: trimmedName,
      email: trimmedEmail,
      password: password,
      role: role,
      ojtStartTime: ojtStartTime,
      ojtEndTime: ojtEndTime,
      ojtHoursPerDay: ojtHoursPerDay,
      ojtTotalHoursRequired: ojtTotalHoursRequired
    };

    const res = await fetch(AUTH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.message || 'Sign up failed.' };

    const user = data.user;
    if (user && data.redirect === 'index.html') {
      const session = { email: user.email, name: user.name, role: user.role, approved: true, id: user.id };
      setCurrentUser(session);
      return { ok: true, user: session, redirect: 'index.html' };
    }
    return { ok: true, user: null, redirect: data.redirect || 'pending-approval.html' };
  }

  async function getUsersListRemote() {
    const res = await fetch(AUTH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_users' })
    });
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.users)) return [];
    return data.users.map(function (u) {
      return { email: u.email, name: u.name, role: u.role, approved: u.approved !== false };
    });
  }

  async function approveUserRemote(email) {
    const res = await fetch(AUTH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve_user', email: email })
    });
    const data = await res.json();
    return data;
  }

  async function deleteUserRemote(email) {
    const res = await fetch(AUTH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_user', email: email })
    });
    const data = await res.json();
    return data;
  }

  window.RDESAuth = {
    getCurrentUser: getCurrentUser,
    requireAuth: requireAuth,
    signOut: signOut,
    signIn: signIn,
    signUp: signUp,
    // Remote, DB-backed helpers for admin screens
    getUsersList: getUsersListRemote,
    approveUser: approveUserRemote,
    deleteUser: deleteUserRemote
  };
})();
