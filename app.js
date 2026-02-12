(function () {
  'use strict';

  if (!window.RDESAuth || !window.RDESAuth.requireAuth()) return;

  const currentUser = window.RDESAuth.getCurrentUser();
  const STORAGE_KEY = 'rdes-logbook-entries';
  const PAGE_SIZE = 10;

  let logbookPage = 1;

  const clockDisplay = document.getElementById('clockDisplay');
  const dateDisplay = document.getElementById('dateDisplay');
  const userName = document.getElementById('userName');
  const btnTimeIn = document.getElementById('btnTimeIn');
  const btnTimeOut = document.getElementById('btnTimeOut');
  const lastAction = document.getElementById('lastAction');
  const logbookBody = document.getElementById('logbookBody');
  const emptyLog = document.getElementById('emptyLog');
  const logbookPagination = document.getElementById('logbookPagination');
  const filterBy = document.getElementById('filterBy');
  const btnExport = document.getElementById('btnExport');
  const userInfo = document.getElementById('userInfo');
  const btnSignOut = document.getElementById('btnSignOut');

  if (currentUser && userName) {
    userName.value = currentUser.name;
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

  function addEntry(name, action) {
    const trimmed = (currentUser && currentUser.name) ? currentUser.name.trim() : (name || '').trim();
    if (!trimmed) {
      lastAction.textContent = 'Please sign in again.';
      lastAction.classList.add('error');
      return;
    }
    lastAction.classList.remove('error');

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

    const actionLabel = action === 'time_in' ? 'Time In' : 'Time Out';
    lastAction.textContent = `${actionLabel} recorded for ${trimmed} at ${entry.time}.`;
    renderLogbook();
  }

  // ——— Render logbook table ———
  function getFilteredEntries() {
    let entries = getEntries();
    if (currentUser && currentUser.role === 'ojt') {
      entries = entries.filter(function (e) { return e.name === currentUser.name; });
    }
    const value = filterBy ? filterBy.value : 'all';
    const today = new Date().toLocaleDateString('en-PH');

    if (value === 'today') return entries.filter(e => e.date === today);
    if (value === 'time_in') return entries.filter(e => e.action === 'time_in');
    if (value === 'time_out') return entries.filter(e => e.action === 'time_out');
    return entries;
  }

  function renderPagination(container, currentPage, totalItems, pageSize, onPageChange) {
    if (!container) return;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (totalItems <= pageSize && totalItems > 0) {
      container.innerHTML = '';
      container.classList.remove('visible');
      return;
    }
    if (totalItems === 0) {
      container.innerHTML = '';
      container.classList.remove('visible');
      return;
    }
    container.classList.add('visible');
    const prevDisabled = currentPage <= 1 ? ' disabled' : '';
    const nextDisabled = currentPage >= totalPages ? ' disabled' : '';
    container.innerHTML =
      '<button type="button" class="pagination-btn" data-page="prev"' + prevDisabled + '>Previous</button>' +
      '<span class="pagination-info">Page ' + currentPage + ' of ' + totalPages + '</span>' +
      '<button type="button" class="pagination-btn" data-page="next"' + nextDisabled + '>Next</button>';
    container.querySelectorAll('.pagination-btn').forEach(function (btn) {
      if (btn.disabled) return;
      btn.addEventListener('click', function () {
        var next = currentPage;
        if (btn.getAttribute('data-page') === 'prev') next = currentPage - 1;
        if (btn.getAttribute('data-page') === 'next') next = currentPage + 1;
        if (next >= 1 && next <= totalPages) onPageChange(next);
      });
    });
  }

  function renderLogbook() {
    const entries = getFilteredEntries();
    if (!logbookBody) return;

    if (entries.length === 0) {
      logbookBody.innerHTML = '';
      if (emptyLog) emptyLog.classList.add('visible');
      if (logbookPagination) { logbookPagination.innerHTML = ''; logbookPagination.classList.remove('visible'); }
      return;
    }
    if (emptyLog) emptyLog.classList.remove('visible');

    const totalPages = Math.ceil(entries.length / PAGE_SIZE);
    if (logbookPage > totalPages) logbookPage = totalPages;
    const start = (logbookPage - 1) * PAGE_SIZE;
    const pageEntries = entries.slice(start, start + PAGE_SIZE);

    logbookBody.innerHTML = pageEntries.map(function (e) {
      const actionClass = e.action === 'time_in' ? 'badge-in' : 'badge-out';
      const actionLabel = e.action === 'time_in' ? 'Time In' : 'Time Out';
      return '<tr><td>' + escapeHtml(e.date) + '</td><td>' + escapeHtml(formatTime12(e)) + '</td><td>' + escapeHtml(e.name) + '</td><td><span class="badge ' + actionClass + '">' + actionLabel + '</span></td></tr>';
    }).join('');

    renderPagination(logbookPagination, logbookPage, entries.length, PAGE_SIZE, function (page) {
      logbookPage = page;
      renderLogbook();
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime12(entry) {
    const d = new Date(entry.timestamp || entry.date);
    return d.toLocaleTimeString('en-PH', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }

  // ——— Export as CSV (use YYYY-MM-DD so Excel shows dates correctly) ———
  function exportDate(entry) {
    if (entry.timestamp) return entry.timestamp.slice(0, 10);
    return entry.date;
  }

  function exportLogbook() {
    const entries = getFilteredEntries();
    if (entries.length === 0) {
      lastAction.textContent = 'No entries to export.';
      lastAction.classList.add('error');
      return;
    }
    lastAction.classList.remove('error');

    const headers = ['Date', 'Time', 'Name', 'Action'];
    const rows = entries.map(e => [exportDate(e), formatTime12(e), e.name, e.action === 'time_in' ? 'Time In' : 'Time Out']);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rdes-logbook-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    lastAction.textContent = 'Logbook exported.';
  }

  // ——— Event listeners ———
  if (btnTimeIn) btnTimeIn.addEventListener('click', function () { addEntry(userName ? userName.value : '', 'time_in'); });
  if (btnTimeOut) btnTimeOut.addEventListener('click', function () { addEntry(userName ? userName.value : '', 'time_out'); });
  if (filterBy) filterBy.addEventListener('change', function () { logbookPage = 1; renderLogbook(); });
  if (btnExport) btnExport.addEventListener('click', exportLogbook);

  // OJT: hide filter/export if only viewing own data (optional: keep filter for date/action)
  if (currentUser && currentUser.role === 'ojt' && filterBy) filterBy.style.display = 'none';
  if (currentUser && currentUser.role === 'ojt' && btnExport) btnExport.textContent = 'Download my record';

  // Initial render
  renderLogbook();
})();
