(function () {
  'use strict';

  const USERS_KEY = 'rdes-users';
  const CURRENT_USER_KEY = 'rdes-current-user';
  const AUTH_PAGE = 'auth.html';

  function getUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

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
    const users = getUsers();
    const normalized = (email || '').trim().toLowerCase();
    const user = users.find(function (u) { return (u.email || '').toLowerCase() === normalized; });
    if (!user) return { ok: false, message: 'Email not found.' };
    const hash = await hashPassword(password);
    if (user.passwordHash !== hash) return { ok: false, message: 'Incorrect password.' };
    if (user.approved === false) return { ok: false, message: 'Your account is pending approval by an admin.' };
    const session = { email: user.email, name: user.name, role: user.role, approved: true };
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

    const users = getUsers();
    if (users.some(function (u) { return (u.email || '').toLowerCase() === trimmedEmail; })) {
      return { ok: false, message: 'An account with this email already exists.' };
    }

    const passwordHash = await hashPassword(password);
    var isFirstUser = users.length === 0;
    var approved = isFirstUser && role === 'admin';
    const newUser = { email: trimmedEmail, name: trimmedName, passwordHash: passwordHash, role: role, approved: approved };
    if (role === 'ojt') {
      newUser.ojtStartTime = ojtStartTime;
      newUser.ojtEndTime = ojtEndTime;
      newUser.ojtHoursPerDay = String(parseInt(ojtHoursPerDay, 10) || 8);
      newUser.ojtTotalHoursRequired = String(parseInt(ojtTotalHoursRequired, 10) || '0');
    }
    users.push(newUser);
    saveUsers(users);

    if (approved) {
      const session = { email: newUser.email, name: newUser.name, role: newUser.role, approved: true };
      setCurrentUser(session);
      return { ok: true, user: session, redirect: 'index.html' };
    }
    return { ok: true, user: null, redirect: 'pending-approval.html' };
  }

  window.RDESAuth = {
    getCurrentUser: getCurrentUser,
    requireAuth: requireAuth,
    signOut: signOut,
    signIn: signIn,
    signUp: signUp,
    getUsersList: getUsersList,
    approveUser: approveUser
  };
})();
