(function () {
  'use strict';

  if (!window.RDESAuth || !window.RDESAuth.requireAuth()) return;

  var currentUser = window.RDESAuth.getCurrentUser();
  if (!currentUser) return;

  var userInfo = document.getElementById('userInfo');
  var btnSignOut = document.getElementById('btnSignOut');
  var navAdmin = document.getElementById('navAdmin');
  var profileName = document.getElementById('profileName');
  var profileEmail = document.getElementById('profileEmail');
  var profileRole = document.getElementById('profileRole');
  var ojtProgressCard = document.getElementById('ojtProgressCard');
  var statTotalHours = document.getElementById('statTotalHours');
  var statHoursCompleted = document.getElementById('statHoursCompleted');
  var statRemainingHours = document.getElementById('statRemainingHours');
  var statRemainingDays = document.getElementById('statRemainingDays');
  var progressPercent = document.getElementById('progressPercent');
  var progressBarFill = document.getElementById('progressBarFill');
  var ojtScheduleInfo = document.getElementById('ojtScheduleInfo');
  var ojtStartTime = document.getElementById('ojtStartTime');
  var ojtEndTime = document.getElementById('ojtEndTime');
  var ojtHoursPerDay = document.getElementById('ojtHoursPerDay');

  if (userInfo) userInfo.textContent = currentUser.name + ' (' + (currentUser.role === 'admin' ? 'Admin' : 'OJT') + ')';
  if (btnSignOut) btnSignOut.addEventListener('click', function () { window.RDESAuth.signOut(); });
  if (navAdmin) navAdmin.style.display = currentUser.role === 'admin' ? '' : 'none';

  const STORAGE_KEY = 'rdes-logbook-entries';
  const USERS_KEY = 'rdes-users';
  const LOGS_API_URL = 'api/logs.php';

  function getUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function getEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  async function syncEntriesFromServer() {
    try {
      const res = await fetch(LOGS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_entries' })
      });
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.entries)) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.entries));
    } catch (_) {
      // ignore sync failures
    }
  }

  function formatTime12(timeStr) {
    if (!timeStr) return '—';
    var parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    var hour = parseInt(parts[0], 10);
    var minute = parts[1];
    var ampm = hour >= 12 ? 'PM' : 'AM';
    var hour12 = hour % 12 || 12;
    return hour12 + ':' + minute + ' ' + ampm;
  }

  function calculateActualHoursCompleted(entries, userName) {
    var userEntries = entries.filter(function (e) { return e.name === userName; });
    var daysMap = {};
    
    // Group entries by date and collect time_in/time_out timestamps
    userEntries.forEach(function (e) {
      if (!daysMap[e.date]) {
        daysMap[e.date] = { timeIn: null, timeOut: null };
      }
      if (e.action === 'time_in' && e.timestamp) {
        var timeInDate = new Date(e.timestamp);
        if (!daysMap[e.date].timeIn || timeInDate < new Date(daysMap[e.date].timeIn)) {
          daysMap[e.date].timeIn = e.timestamp;
        }
      }
      if (e.action === 'time_out' && e.timestamp) {
        var timeOutDate = new Date(e.timestamp);
        if (!daysMap[e.date].timeOut || timeOutDate > new Date(daysMap[e.date].timeOut)) {
          daysMap[e.date].timeOut = e.timestamp;
        }
      }
    });
    
    // Calculate total hours from actual time differences
    var totalMilliseconds = 0;
    Object.keys(daysMap).forEach(function (date) {
      var dayData = daysMap[date];
      if (dayData.timeIn && dayData.timeOut) {
        var timeIn = new Date(dayData.timeIn);
        var timeOut = new Date(dayData.timeOut);
        if (timeOut > timeIn) {
          totalMilliseconds += (timeOut - timeIn);
        }
      }
    });
    
    // Convert milliseconds to hours
    var totalHours = totalMilliseconds / (1000 * 60 * 60);
    return totalHours;
  }

  function renderProfile() {
    if (profileName) profileName.textContent = currentUser.name || '—';
    if (profileEmail) profileEmail.textContent = currentUser.email || '—';
    if (profileRole) profileRole.textContent = currentUser.role === 'admin' ? 'Admin' : 'OJT';

    if (currentUser.role !== 'ojt') {
      if (ojtProgressCard) ojtProgressCard.style.display = 'none';
      return;
    }

    var users = getUsers();
    var userData = users.find(function (u) { return (u.email || '').toLowerCase() === (currentUser.email || '').toLowerCase(); });
    if (!userData) {
      if (ojtProgressCard) ojtProgressCard.style.display = 'none';
      return;
    }

    if (ojtProgressCard) ojtProgressCard.style.display = 'block';

    var totalHoursRequired = parseInt(userData.ojtTotalHoursRequired || '0', 10);
    var hoursPerDay = parseInt(userData.ojtHoursPerDay || '8', 10);
    var startTime = userData.ojtStartTime || '';
    var endTime = userData.ojtEndTime || '';

    if (ojtStartTime) ojtStartTime.textContent = formatTime12(startTime);
    if (ojtEndTime) ojtEndTime.textContent = formatTime12(endTime);
    if (ojtHoursPerDay) ojtHoursPerDay.textContent = hoursPerDay + ' hours';

    var entries = getEntries();
    var hoursCompleted = calculateActualHoursCompleted(entries, currentUser.name);
    var remainingHours = Math.max(0, totalHoursRequired - hoursCompleted);
    var remainingDays = hoursPerDay > 0 ? Math.ceil(remainingHours / hoursPerDay) : 0;
    var progress = totalHoursRequired > 0 ? Math.min(100, Math.round((hoursCompleted / totalHoursRequired) * 100)) : 0;

    if (statTotalHours) statTotalHours.textContent = totalHoursRequired.toLocaleString() + ' hrs';
    if (statHoursCompleted) statHoursCompleted.textContent = hoursCompleted.toFixed(2) + ' hrs';
    if (statRemainingHours) statRemainingHours.textContent = remainingHours.toFixed(2) + ' hrs';
    if (statRemainingDays) statRemainingDays.textContent = remainingDays + ' day' + (remainingDays !== 1 ? 's' : '');
    if (progressPercent) progressPercent.textContent = progress + '%';
    if (progressBarFill) progressBarFill.style.width = progress + '%';
  }

  async function init() {
    await syncEntriesFromServer();
    renderProfile();
  }

  init();
})();
