(function () {
  'use strict';

  if (!window.RDESAuth || !window.RDESAuth.requireAuth()) return;

  var currentUser = window.RDESAuth.getCurrentUser();
  var isOjt = currentUser && currentUser.role === 'ojt';

  var userInfo = document.getElementById('userInfo');
  var btnSignOut = document.getElementById('btnSignOut');
  var pageTitle = document.getElementById('pageTitle');
  var pageTagline = document.getElementById('pageTagline');
  var navAdmin = document.getElementById('navAdmin');

  if (userInfo) userInfo.textContent = currentUser ? currentUser.name + ' (' + (currentUser.role === 'admin' ? 'Admin' : 'OJT') + ')' : '';
  if (btnSignOut) btnSignOut.addEventListener('click', function () { window.RDESAuth.signOut(); });
  if (navAdmin) navAdmin.style.display = currentUser && currentUser.role === 'admin' ? '' : 'none';

  if (isOjt) {
    if (pageTitle) pageTitle.textContent = 'My Record';
    if (pageTagline) pageTagline.textContent = 'Download your time in/out record for your OJT folder';
  } else {
    if (pageTitle) pageTitle.textContent = 'Records by Person';
    if (pageTagline) pageTagline.textContent = 'Download time in/out records for each person (OJT folder)';
  }

  const STORAGE_KEY = 'rdes-logbook-entries';
  const PAGE_SIZE = 10;

  var personsPage = 1;

  const personsList = document.getElementById('personsList');
  const personsPagination = document.getElementById('personsPagination');
  const emptyPersons = document.getElementById('emptyPersons');
  const personsTitle = document.getElementById('personsTitle');
  const personsDesc = document.getElementById('personsDesc');

  if (isOjt) {
    if (personsTitle) personsTitle.textContent = 'My record';
    if (personsDesc) personsDesc.textContent = 'Download your time in/out record for your OJT folder.';
  } else {
    if (personsTitle) personsTitle.textContent = 'Records by person (OJT folder)';
    if (personsDesc) personsDesc.textContent = 'At the end of OJT, each person can download their own time in/out record as a file for their folder.';
  }

  function getEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
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

  function escapeHtml(text) {
    var div = document.createElement('div');
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

  function renderPersonsList() {
    const entries = getEntries();
    var names = getUniqueNames(entries);
    if (isOjt && currentUser) names = [currentUser.name];
    if (!personsList) return;

    if (names.length === 0) {
      personsList.innerHTML = '';
      if (emptyPersons) emptyPersons.classList.add('visible');
      if (personsPagination) { personsPagination.innerHTML = ''; personsPagination.classList.remove('visible'); }
      return;
    }
    if (emptyPersons) emptyPersons.classList.remove('visible');

    const totalPages = Math.ceil(names.length / PAGE_SIZE);
    if (personsPage > totalPages) personsPage = totalPages;
    const start = (personsPage - 1) * PAGE_SIZE;
    const pageNames = names.slice(start, start + PAGE_SIZE);

    personsList.innerHTML = pageNames.map(function (name) {
      const count = entries.filter(function (e) { return e.name === name; }).length;
      const safeName = escapeHtml(name);
      const fileSlug = name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
      return '<div class="person-card">' +
        '<div class="person-info">' +
          '<span class="person-name">' + safeName + '</span>' +
          '<span class="person-count">' + count + ' record' + (count !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '<button type="button" class="btn btn-small btn-primary btn-download-record" data-name="' + safeName + '" data-slug="' + escapeHtml(fileSlug) + '">' + (isOjt ? 'Download my record' : 'Download their Record') + '</button>' +
      '</div>';
    }).join('');

    personsList.querySelectorAll('.btn-download-record').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const name = btn.getAttribute('data-name');
        const slug = btn.getAttribute('data-slug') || 'record';
        exportPersonRecord(name, slug);
      });
    });

    renderPagination(personsPagination, personsPage, names.length, PAGE_SIZE, function (page) {
      personsPage = page;
      renderPersonsList();
    });
  }

  function exportPersonRecord(name, slug) {
    const entries = getEntries().filter(function (e) { return e.name === name; });
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
    a.download = 'RDES-LogBook-' + slug + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  renderPersonsList();
})();
