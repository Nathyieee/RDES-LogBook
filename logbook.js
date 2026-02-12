(function () {
  'use strict';

  if (!window.RDESAuth || !window.RDESAuth.requireAuth()) return;

  var currentUser = window.RDESAuth.getCurrentUser();
  var isOjt = currentUser && currentUser.role === 'ojt';

  var userInfo = document.getElementById('userInfo');
  var btnSignOut = document.getElementById('btnSignOut');
  if (userInfo) userInfo.textContent = currentUser ? currentUser.name + ' (' + (currentUser.role === 'admin' ? 'Admin' : 'OJT') + ')' : '';
  if (btnSignOut) btnSignOut.addEventListener('click', function () { window.RDESAuth.signOut(); });
  var navAdmin = document.getElementById('navAdmin');
  if (navAdmin) navAdmin.style.display = currentUser && currentUser.role === 'admin' ? '' : 'none';

  const STORAGE_KEY = 'rdes-logbook-entries';
  const LOGS_API_URL = 'api/logs.php';
  const PAGE_SIZE = 10;

  var logbookPage = 1;

  const filterDate = document.getElementById('filterDate');
  const filterDateFrom = document.getElementById('filterDateFrom');
  const filterDateTo = document.getElementById('filterDateTo');
  const customDateGroup = document.getElementById('customDateGroup');
  const customDateToGroup = document.getElementById('customDateToGroup');
  const filterName = document.getElementById('filterName');
  const filterNameGroup = document.getElementById('filterNameGroup');
  const filterAction = document.getElementById('filterAction');
  const btnApplyFilters = document.getElementById('btnApplyFilters');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnExportAll = document.getElementById('btnExportAll');
  const logbookBody = document.getElementById('logbookBody');
  const emptyLog = document.getElementById('emptyLog');
  const entryCount = document.getElementById('entryCount');
  const logbookPagination = document.getElementById('logbookPagination');

  var deleteHeader = document.getElementById('deleteHeader');
  if (isOjt) {
    if (filterNameGroup) filterNameGroup.style.display = 'none';
    if (btnExportAll) btnExportAll.style.display = 'none';
    // OJT users can delete their own entries, so show delete header
    if (deleteHeader) deleteHeader.style.display = '';
  } else {
    if (deleteHeader) deleteHeader.style.display = '';
  }

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

  async function syncEntriesFromServer() {
    try {
      const res = await fetch(LOGS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_entries' })
      });
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.entries)) return;
      saveEntries(data.entries);
    } catch (_) {
      // If it fails, keep whatever is in localStorage.
    }
  }

  function showDeleteModal(entryId, callback) {
    var modal = document.getElementById('deleteModal');
    var btnCancel = document.getElementById('modalCancel');
    var btnConfirm = document.getElementById('modalConfirm');
    if (!modal || !btnCancel || !btnConfirm) return;

    modal.style.display = 'flex';

    function closeModal() {
      modal.style.display = 'none';
      btnCancel.removeEventListener('click', cancelHandler);
      btnConfirm.removeEventListener('click', confirmHandler);
      modal.removeEventListener('click', overlayHandler);
    }

    function cancelHandler() {
      closeModal();
    }

    function confirmHandler() {
      closeModal();
      if (callback) callback();
    }

    function overlayHandler(e) {
      if (e.target === modal) closeModal();
    }

    btnCancel.addEventListener('click', cancelHandler);
    btnConfirm.addEventListener('click', confirmHandler);
    modal.addEventListener('click', overlayHandler);
  }

  function deleteEntry(entryId) {
    showDeleteModal(entryId, function () {
      var entries = getEntries();
      entries = entries.filter(function (e) { return e.id !== entryId; });
      saveEntries(entries);
      logbookPage = 1;
      renderTable();
    });
  }

  function getUniqueNames(entries) {
    const set = new Set();
    entries.forEach(function (e) {
      if (e.name && e.name.trim()) set.add(e.name.trim());
    });
    return Array.from(set).sort(function (a, b) { return a.localeCompare(b); });
  }

  function formatDateForInput(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function entryDateKey(entry) {
    var d = new Date(entry.timestamp || entry.date);
    return formatDateForInput(d);
  }

  function formatTime12(entry) {
    var d = new Date(entry.timestamp || entry.date);
    return d.toLocaleTimeString('en-PH', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }

  function applyFilters() {
    let entries = getEntries();
    if (isOjt && currentUser) entries = entries.filter(function (e) { return e.name === currentUser.name; });

    // Use normalized YYYY-MM-DD keys for date comparisons so that
    // data coming from both localStorage and the database matches.
    const todayKey = formatDateForInput(new Date());
    const yesterdayKey = (function () {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return formatDateForInput(d);
    })();

    let list = entries.slice();

    const dateVal = filterDate ? filterDate.value : 'all';
    if (dateVal === 'today') {
      list = list.filter(function (e) { return entryDateKey(e) === todayKey; });
    } else if (dateVal === 'yesterday') {
      list = list.filter(function (e) { return entryDateKey(e) === yesterdayKey; });
    } else if (dateVal === 'custom' && filterDateFrom && filterDateTo) {
      const from = filterDateFrom.value;
      const to = filterDateTo.value;
      list = list.filter(function (e) {
        const key = entryDateKey(e);
        if (from && key < from) return false;
        if (to && key > to) return false;
        return true;
      });
    }

    const nameVal = filterName ? filterName.value : '';
    if (nameVal) list = list.filter(function (e) { return e.name === nameVal; });

    const actionVal = filterAction ? filterAction.value : 'all';
    if (actionVal === 'time_in') list = list.filter(function (e) { return e.action === 'time_in'; });
    if (actionVal === 'time_out') list = list.filter(function (e) { return e.action === 'time_out'; });

    return list;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

  function renderTable() {
    const entries = applyFilters();
    if (entryCount) entryCount.textContent = entries.length ? '(' + entries.length + ')' : '';

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
      // Show delete button for admins (all entries) or OJT users (only their own entries)
      var canDelete = !isOjt || (isOjt && currentUser && e.name === currentUser.name);
      var deleteCell = canDelete ? '<td><button type="button" class="btn btn-small btn-delete" data-id="' + escapeHtml(e.id) + '" aria-label="Delete entry">Delete</button></td>' : '<td></td>';
      return '<tr><td>' + escapeHtml(e.date) + '</td><td>' + escapeHtml(formatTime12(e)) + '</td><td>' + escapeHtml(e.name) + '</td><td><span class="badge ' + actionClass + '">' + actionLabel + '</span></td>' + deleteCell + '</tr>';
    }).join('');

    // Add delete event listeners for all delete buttons (both admin and OJT)
    logbookBody.querySelectorAll('.btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var entryId = btn.getAttribute('data-id');
        if (entryId) {
          // For OJT users, verify the entry belongs to them before deleting
          if (isOjt && currentUser) {
            var entries = getEntries();
            var entry = entries.find(function (e) { return e.id === entryId; });
            if (entry && entry.name !== currentUser.name) {
              alert('You can only delete your own entries.');
              return;
            }
          }
          deleteEntry(entryId);
        }
      });
    });

    renderPagination(logbookPagination, logbookPage, entries.length, PAGE_SIZE, function (page) {
      logbookPage = page;
      renderTable();
    });
  }

  function renderNameFilter() {
    if (isOjt && filterName) { filterName.innerHTML = ''; return; }
    const entries = getEntries();
    const names = getUniqueNames(entries);
    if (!filterName) return;

    const current = filterName.value;
    filterName.innerHTML = '<option value="">All</option>' + names.map(function (n) {
      return '<option value="' + escapeHtml(n) + '"' + (n === current ? ' selected' : '') + '>' + escapeHtml(n) + '</option>';
    }).join('');
  }


  function exportFiltered() {
    const entries = applyFilters();
    if (entries.length === 0) return;

    const headers = ['Date', 'Time', 'Name', 'Action'];
    const rows = entries.map(function (e) {
      return [entryDateKey(e), formatTime12(e), e.name, e.action === 'time_in' ? 'Time In' : 'Time Out'];
    });
    const csv = [headers.join(','), ...rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    })].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rdes-logbook-' + formatDateForInput(new Date()) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function showCustomDateFields() {
    const show = filterDate && filterDate.value === 'custom';
    if (customDateGroup) customDateGroup.hidden = !show;
    if (customDateToGroup) customDateToGroup.hidden = !show;
  }

  function resetFilters() {
    if (filterDate) filterDate.value = 'today';
    if (filterDateFrom) filterDateFrom.value = '';
    if (filterDateTo) filterDateTo.value = '';
    if (filterName) filterName.value = '';
    if (filterAction) filterAction.value = 'all';
    showCustomDateFields();
    renderNameFilter();
    logbookPage = 1;
    renderTable();
  }

  if (filterDate) filterDate.addEventListener('change', showCustomDateFields);
  if (btnApplyFilters) btnApplyFilters.addEventListener('click', function () { logbookPage = 1; renderTable(); });
  if (btnResetFilters) btnResetFilters.addEventListener('click', resetFilters);
  if (btnExportAll) btnExportAll.addEventListener('click', exportFiltered);

  if (filterName) filterName.addEventListener('change', renderTable);
  if (filterAction) filterAction.addEventListener('change', renderTable);

  async function init() {
    if (filterDate) filterDate.value = 'today';
    showCustomDateFields();
    await syncEntriesFromServer();
    renderNameFilter();
    renderTable();
  }

  init();
})();
