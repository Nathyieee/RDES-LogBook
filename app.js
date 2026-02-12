(function () {
  'use strict';

  if (!window.RDESAuth || !window.RDESAuth.requireAuth()) return;

  const currentUser = window.RDESAuth.getCurrentUser();
  const STORAGE_KEY = 'rdes-logbook-entries';
  const LOGS_API_URL = 'api/logs.php';

  const clockDisplay = document.getElementById('clockDisplay');
  const dateDisplay = document.getElementById('dateDisplay');
  const welcomeName = document.getElementById('welcomeName');
  const btnTimeIn = document.getElementById('btnTimeIn');
  const btnTimeOut = document.getElementById('btnTimeOut');
  const lastAction = document.getElementById('lastAction');
  const userInfo = document.getElementById('userInfo');
  const btnSignOut = document.getElementById('btnSignOut');

  if (currentUser && welcomeName) {
    welcomeName.textContent = currentUser.name;
  }
  if (userInfo) {
    userInfo.textContent = currentUser ? currentUser.name + ' (' + (currentUser.role === 'admin' ? 'Admin' : 'OJT') + ')' : '';
  }
  var navAdmin = document.getElementById('navAdmin');
  if (navAdmin) navAdmin.style.display = currentUser && currentUser.role === 'admin' ? '' : 'none';
  if (btnSignOut) btnSignOut.addEventListener('click', function () { window.RDESAuth.signOut(); });

  // ——— Live clock ———
  function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-PH', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (clockDisplay) clockDisplay.textContent = timeStr;
    if (dateDisplay) dateDisplay.textContent = dateStr;
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ——— Load / save logbook ———
  function getEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function getTodaysEntriesForUser(userName) {
    const today = new Date().toLocaleDateString('en-PH');
    return getEntries().filter(function (e) {
      return e.date === today && e.name === userName;
    });
  }

  async function sendEntryToServer(entry) {
    try {
      if (!currentUser || !currentUser.id) return;
      await fetch(LOGS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_entry',
          userId: currentUser.id,
          name: entry.name,
          logAction: entry.action,
          timestamp: entry.timestamp
        })
      });
    } catch (_) {
      // Silently ignore; local copy still works.
    }
  }

  function addEntry(name, action) {
    const trimmed = (currentUser && currentUser.name) ? currentUser.name.trim() : (name || '').trim();
    if (!trimmed) {
      lastAction.textContent = 'Please sign in again.';
      lastAction.classList.add('error');
      return;
    }
    lastAction.classList.remove('error');

    const todaysEntries = getTodaysEntriesForUser(trimmed);
    const alreadyTimeIn = todaysEntries.some(function (e) { return e.action === 'time_in'; });
    const alreadyTimeOut = todaysEntries.some(function (e) { return e.action === 'time_out'; });

    if (action === 'time_in' && alreadyTimeIn) {
      lastAction.textContent = 'You have already timed in today. You can only time in once per day.';
      lastAction.classList.add('error');
      return;
    }
    if (action === 'time_out' && alreadyTimeOut) {
      lastAction.textContent = 'You have already timed out today. You can only time out once per day.';
      lastAction.classList.add('error');
      return;
    }

    const now = new Date();
    const entry = {
      id: now.getTime() + '-' + Math.random().toString(36).slice(2, 9),
      name: trimmed,
      action: action,
      timestamp: now.toISOString(),
      date: now.toLocaleDateString('en-PH'),
      time: now.toLocaleTimeString('en-PH', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' })
    };

    const entries = getEntries();
    entries.unshift(entry);
    saveEntries(entries);

    // Also send to shared database so other devices can see it.
    sendEntryToServer(entry);

    const actionLabel = action === 'time_in' ? 'Time In' : 'Time Out';
    lastAction.textContent = `${actionLabel} recorded for ${trimmed} at ${entry.time}.`;
  }

  // ——— Event listeners ———
  if (btnTimeIn) btnTimeIn.addEventListener('click', function () { addEntry('', 'time_in'); });
  if (btnTimeOut) btnTimeOut.addEventListener('click', function () { addEntry('', 'time_out'); });
})();
