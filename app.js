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

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function entryDateMatches(entryDate) {
    if (!entryDate) return false;
    var key = todayKey();
    if (entryDate === key) return true;
    if (/^\d{4}-\d{2}-\d{2}/.test(String(entryDate))) return String(entryDate).substring(0, 10) === key;
    var x = new Date(entryDate);
    return !isNaN(x.getTime()) && (x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')) === key;
  }

  function getTodaysEntriesForUser(userName) {
    var key = todayKey();
    return getEntries().filter(function (e) {
      return entryDateMatches(e.date) && e.name === userName;
    });
  }

  async function sendEntryToServer(entry) {
    if (!currentUser || !currentUser.id) {
      return { ok: false, message: 'Your session is missing user id. Sign out, sign in again, then try Time In.' };
    }
    try {
      var res = await fetch(LOGS_API_URL, {
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
      var data = await res.json();
      if (data && data.ok) return { ok: true, entryId: data.entry && data.entry.id };
      return { ok: false, message: (data && data.message) ? data.message : 'Server could not save your time. Try again.' };
    } catch (_) {
      return { ok: false, message: 'Could not reach server. Check your connection and try again.' };
    }
  }

  async function addEntry(name, action) {
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

    var result = await sendEntryToServer(entry);

    const actionLabel = action === 'time_in' ? 'Time In' : 'Time Out';
    if (result.ok) {
      if (result.entryId) {
        var tempId = entry.id;
        entry.id = result.entryId;
        var list = getEntries();
        var idx = list.findIndex(function (e) { return e.id === tempId; });
        if (idx >= 0) {
          list[idx].id = result.entryId;
          saveEntries(list);
        }
      }
      var idNote = result.entryId ? ' (saved as ID ' + result.entryId + ')' : '';
      lastAction.textContent = actionLabel + ' recorded for ' + trimmed + ' at ' + entry.time + '.' + idNote;
    } else {
      lastAction.textContent = result.message || (actionLabel + ' could not be saved. Try again.');
      lastAction.classList.add('error');
    }
  }

  // ——— Event listeners ———
  if (btnTimeIn) btnTimeIn.addEventListener('click', function () { addEntry('', 'time_in'); });
  if (btnTimeOut) btnTimeOut.addEventListener('click', function () { addEntry('', 'time_out'); });
})();
