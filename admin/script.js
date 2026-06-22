const PAGE_SIZE = 10;

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};


let companies = [];
let filtered = [];
let quoteLeads = [];
let currentPage = 1;
let activeTab = 'directory';
let pendingAction = null;
const sortByTab = {
  directory: 'name-asc',
  inprogress: 'name-asc'
};

function loadIdSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key)) || []);
  } catch {
    return new Set();
  }
}

const deletedIds = loadIdSet('webgap_deleted');
const inProgressIds = loadIdSet('webgap_inprogress');
const finishedIds = loadIdSet('webgap_finished');
let siteUrls = {};
let businessNotes = {};

function loadSiteUrls() {
  try {
    const raw = localStorage.getItem('webgap_site_urls');
    siteUrls = raw ? JSON.parse(raw) : {};
  } catch {
    siteUrls = {};
  }
}

function loadBusinessNotes() {
  try {
    const raw = localStorage.getItem('webgap_notes');
    businessNotes = raw ? JSON.parse(raw) : {};
  } catch {
    businessNotes = {};
  }
}

loadSiteUrls();
loadBusinessNotes();

function getBusinessNote(id) {
  return businessNotes[id] || '';
}

function saveBusinessNote(id, text) {
  const trimmed = (text || '').trim();
  if (trimmed) {
    businessNotes[id] = trimmed;
  } else {
    delete businessNotes[id];
  }
  saveIdSets();
}

function hasBusinessNote(id) {
  return Boolean(getBusinessNote(id));
}

function saveIdSets() {
  localStorage.setItem('webgap_deleted', JSON.stringify([...deletedIds]));
  localStorage.setItem('webgap_inprogress', JSON.stringify([...inProgressIds]));
  localStorage.setItem('webgap_finished', JSON.stringify([...finishedIds]));
  localStorage.setItem('webgap_site_urls', JSON.stringify(siteUrls));
  localStorage.setItem('webgap_notes', JSON.stringify(businessNotes));
  fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deleted: [...deletedIds],
      inprogress: [...inProgressIds],
      finished: [...finishedIds],
      sites: siteUrls,
      notes: businessNotes
    })
  }).catch(() => {});
}

function loadServerState() {
  fetch('/api/state')
    .then(r => r.json())
    .then(s => {
      (s.deleted || []).forEach(id => deletedIds.add(id));
      (s.inprogress || []).forEach(id => inProgressIds.add(id));
      (s.finished || []).forEach(id => finishedIds.add(id));
      const serverSites = s.sites && typeof s.sites === 'object' ? s.sites : {};
      const serverNotes = s.notes && typeof s.notes === 'object' ? s.notes : {};
      siteUrls = { ...siteUrls, ...serverSites };
      businessNotes = { ...businessNotes, ...serverNotes };
      localStorage.setItem('webgap_site_urls', JSON.stringify(siteUrls));
      localStorage.setItem('webgap_notes', JSON.stringify(businessNotes));
      saveIdSets();
      refreshAll();
    })
    .catch(() => {});
}

function normalizeLeads(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && data.id) return [data];
  return [];
}

function loadQuoteLeads() {
  return fetch('/api/leads')
    .then(r => r.json())
    .then(data => {
      quoteLeads = normalizeLeads(data);
      mergeQuoteEmailsIntoCompanies();
      updateTabCounts();
      updateHeroStats();
      if (activeTab === 'quotes') renderQuotes();
      else if (activeTab === 'finished') renderFinished();
      else applyFilters();
    })
    .catch(() => {
      quoteLeads = [];
      updateTabCounts();
      if (activeTab === 'quotes') renderQuotes();
    });
}

function switchTabPanel() {
  const onQuotes = activeTab === 'quotes';
  const onFinished = activeTab === 'finished';
  document.getElementById('businessPanel').hidden = onQuotes || onFinished;
  document.getElementById('quotesPanel').hidden = !onQuotes;
  document.getElementById('finishedPanel').hidden = !onFinished;
}

const searchInput = document.getElementById('search');
const stateFilter = document.getElementById('stateFilter');
const industryFilter = document.getElementById('industryFilter');
const sortBy = document.getElementById('sortBy');
const companyList = document.getElementById('companyList');
const emptyState = document.getElementById('emptyState');
const resultsCount = document.getElementById('resultsCount');
const pagination = document.getElementById('pagination');
const clearFilters = document.getElementById('clearFilters');
const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');
const searchSuggestions = document.getElementById('searchSuggestions');
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmText = document.getElementById('confirmText');
const confirmCancel = document.getElementById('confirmCancel');
const confirmDelete = document.getElementById('confirmDelete');
const tabDirectory = document.getElementById('tabDirectory');
const tabInProgress = document.getElementById('tabInProgress');
const tabQuotes = document.getElementById('tabQuotes');
const tabFinished = document.getElementById('tabFinished');
const quotesList = document.getElementById('quotesList');
const quotesEmpty = document.getElementById('quotesEmpty');
const quotesCount = document.getElementById('quotesCount');
const finishedList = document.getElementById('finishedList');
const finishedEmpty = document.getElementById('finishedEmpty');
const finishedCount = document.getElementById('finishedCount');
const emptyTitle = document.getElementById('emptyTitle');
const emptyText = document.getElementById('emptyText');

function hasWebsiteOnGoogle(c) {
  return c.hasWebsite === true;
}

function verificationBadgeHtml(c) {
  if (hasWebsiteOnGoogle(c)) {
    return '<span class="website-now-badge">Website on Google now</span>';
  }
  return '<span class="no-website-badge">Real · No website on file</span>';
}

function verificationPanelHtml(c) {
  const verifiedLine = c.verifiedAt
    ? `<p class="verification-meta">Last checked on Google: ${escapeHtml(c.verifiedAt)}</p>`
    : '<p class="verification-meta">Checked when added from Google Places.</p>';

  if (hasWebsiteOnGoogle(c)) {
    return `
      <div class="verification-panel verification-panel-warn">
        <p class="verification-summary">Google now lists a website on this profile. It may no longer be a good lead for Webnara.</p>
        ${verifiedLine}
        <ul class="verification-list">
          <li><span class="warn-icon">!</span><span class="check-label">Google website field</span><span class="check-status warn">website linked</span></li>
          ${c.websiteUrl ? `<li><span class="warn-icon">→</span><span class="check-label">Website URL</span><span class="check-status"><a href="${escapeHtml(c.websiteUrl)}" target="_blank" rel="noopener">${escapeHtml(c.websiteUrl)}</a></span></li>` : ''}
          <li><span class="check-icon">✓</span><span class="check-label">Business status</span><span class="check-status">${escapeHtml(c.googleStatus || 'operational').toLowerCase()}</span></li>
        </ul>
      </div>`;
  }

  return `
    <div class="verification-panel">
      <p class="verification-summary">Verified against Google's own business data — this business has no website on its Google profile.</p>
      ${verifiedLine}
      <ul class="verification-list">
        <li><span class="check-icon">✓</span><span class="check-label">Google website field</span><span class="check-status">empty — no website</span></li>
        <li><span class="check-icon">✓</span><span class="check-label">Business status</span><span class="check-status">${escapeHtml(c.googleStatus || 'operational').toLowerCase()}</span></li>
        <li><span class="check-icon">✓</span><span class="check-label">Phone number</span><span class="check-status">listed — callable</span></li>
        ${c.rating ? `<li><span class="check-icon">✓</span><span class="check-label">Google rating</span><span class="check-status">${escapeHtml(String(c.rating))} ★ from ${escapeHtml(String(c.reviews || 0))} reviews — active business</span></li>` : ''}
      </ul>
    </div>`;
}

function leadProgressId(lead) {
  return `lead:${lead.id}`;
}

function isLeadFinished(lead) {
  return finishedIds.has(leadProgressId(lead));
}

function isLeadInProgress(lead) {
  return inProgressIds.has(leadProgressId(lead)) && !isLeadFinished(lead);
}

function activeQuoteLeads() {
  return quoteLeads.filter(lead => !isLeadInProgress(lead) && !isLeadFinished(lead));
}

function leadToCompany(lead) {
  return {
    id: leadProgressId(lead),
    name: lead.business,
    industry: lead.type || 'Other',
    state: '',
    city: '',
    address: '',
    zip: '',
    phone: lead.phone || '',
    email: lead.email || '',
    owner: lead.name,
    fromQuote: true,
    quoteLead: lead
  };
}

function quoteProjectsInMaking() {
  return quoteLeads.filter(isLeadInProgress).map(leadToCompany);
}

function finishedListData() {
  const directory = companies.filter(c =>
    !deletedIds.has(c.id) && finishedIds.has(c.id)
  );
  const quoteFinished = quoteLeads
    .filter(lead => finishedIds.has(leadProgressId(lead)))
    .map(leadToCompany);
  return [...directory, ...quoteFinished];
}

function baseList() {
  const directory = companies.filter(c =>
    !deletedIds.has(c.id) &&
    (activeTab === 'inprogress'
      ? inProgressIds.has(c.id) && !finishedIds.has(c.id)
      : !inProgressIds.has(c.id) && !finishedIds.has(c.id))
  );
  if (activeTab === 'inprogress') {
    return [...directory, ...quoteProjectsInMaking()];
  }
  return directory;
}

let activeSuggestionIndex = -1;

function getStateName(code) {
  return STATE_NAMES[code] || code;
}

function companyMatchesSearch(c, query) {
  if (!query) return true;

  const q = query.toLowerCase().trim();
  if (c.fromQuote) {
    if (c.name.toLowerCase().includes(q)) return true;
    if ((c.owner || '').toLowerCase().includes(q)) return true;
    if ((c.email || '').toLowerCase().includes(q)) return true;
    if (c.industry.toLowerCase().includes(q)) return true;
    return false;
  }

  if ((c.email || '').toLowerCase().includes(q)) return true;

  const stateName = getStateName(c.state).toLowerCase();

  if (c.name.toLowerCase().includes(q)) return true;
  if (c.city.toLowerCase().includes(q)) return true;
  if (c.industry.toLowerCase().includes(q)) return true;
  if (c.state.toLowerCase() === q) return true;
  if (q.length === 2 && c.state.toLowerCase() === q) return true;
  if (stateName.includes(q)) return true;
  if (stateName.split(' ').some(word => word.startsWith(q))) return true;

  return false;
}

function getSearchSuggestions(query) {
  if (!query || query.length < 1) return [];

  const q = query.toLowerCase().trim();
  const suggestions = [];
  const seen = new Set();
  const pool = baseList();

  Object.keys(STATE_NAMES)
    .filter(code => {
      const name = STATE_NAMES[code].toLowerCase();
      return code.toLowerCase().includes(q) ||
        name.includes(q) ||
        name.split(' ').some(w => w.startsWith(q));
    })
    .map(code => ({ code, count: pool.filter(c => c.state === code).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .forEach(({ code, count }) => {
      if (seen.has(`state-${code}`)) return;
      seen.add(`state-${code}`);
      suggestions.push({
        type: 'state',
        label: `${STATE_NAMES[code]} (${code})`,
        value: code,
        meta: `${count} ${count === 1 ? 'business' : 'businesses'} without a website`
      });
    });

  const cities = [...new Map(pool.map(c => [`${c.city}|${c.state}`, { city: c.city, state: c.state }])).values()];
  cities
    .filter(({ city, state }) => city.toLowerCase().includes(q))
    .slice(0, 5)
    .forEach(({ city, state }) => {
      const key = `city-${city}-${state}`;
      if (seen.has(key)) return;
      seen.add(key);
      const count = pool.filter(c => c.city === city && c.state === state).length;
      suggestions.push({
        type: 'city',
        label: city,
        value: city,
        meta: `${state} · ${count} businesses`
      });
    });

  pool
    .filter(c => c.name.toLowerCase().includes(q))
    .slice(0, 5)
    .forEach(c => {
      const key = `company-${c.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      suggestions.push({
        type: 'company',
        label: c.name,
        value: c.name,
        meta: [c.city, c.state].filter(Boolean).join(', '),
        company: c
      });
    });

  const industriesInData = [...new Set(pool.map(c => c.industry))];
  industriesInData
    .filter(ind => ind.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach(ind => {
      const key = `industry-${ind}`;
      if (seen.has(key)) return;
      seen.add(key);
      const count = pool.filter(c => c.industry === ind).length;
      suggestions.push({
        type: 'industry',
        label: ind,
        value: ind,
        meta: `${count} businesses`
      });
    });

  return suggestions.slice(0, 10);
}

function showSuggestions(query) {
  const items = getSearchSuggestions(query);
  activeSuggestionIndex = -1;

  if (!items.length) {
    hideSuggestions();
    return;
  }

  searchSuggestions.innerHTML = items.map((item, i) => `
    <li class="suggestion-item" role="option" data-index="${i}">
      <span class="suggestion-type type-${item.type}">${item.type === 'company' ? 'business' : item.type}</span>
      <span class="suggestion-label">${escapeHtml(item.label)}</span>
      <span class="suggestion-meta">${escapeHtml(item.meta)}</span>
    </li>
  `).join('');

  searchSuggestions._items = items;
  searchSuggestions.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');

  searchSuggestions.querySelectorAll('.suggestion-item').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      selectSuggestion(parseInt(el.dataset.index, 10));
    });
  });
}

function hideSuggestions() {
  searchSuggestions.hidden = true;
  searchSuggestions.innerHTML = '';
  searchSuggestions._items = [];
  activeSuggestionIndex = -1;
  searchInput.setAttribute('aria-expanded', 'false');
}

function selectSuggestion(index) {
  const items = searchSuggestions._items;
  if (!items || !items[index]) return;

  const item = items[index];
  searchInput.value = item.value;

  if (item.type === 'state') {
    stateFilter.value = item.value;
  }

  if (item.type === 'industry') {
    industryFilter.value = item.value;
    searchInput.value = '';
  }

  hideSuggestions();
  currentPage = 1;
  applyFilters();

  if (item.type === 'company' && item.company) {
    openModal(item.company);
  }
}

function handleSearchKeydown(e) {
  const items = searchSuggestions._items || [];
  if (searchSuggestions.hidden || !items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
    highlightSuggestion();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
    highlightSuggestion();
  } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
    e.preventDefault();
    selectSuggestion(activeSuggestionIndex);
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
}

function highlightSuggestion() {
  searchSuggestions.querySelectorAll('.suggestion-item').forEach((el, i) => {
    el.classList.toggle('active', i === activeSuggestionIndex);
  });
}

/* ---------- Real business data (Google Places API) ---------- */
// places-data.js is generated by api/fetch-places.ps1. Every business in it is
// operating, has a phone number, and has NO website on its Google profile.

function loadPreloaded() {
  const list = GOOGLE_BUSINESSES.map(c => ({
    ...c,
    address: c.address || 'No street address on file',
    owner: (typeof OWNER_OVERRIDES !== 'undefined' && OWNER_OVERRIDES[c.id]) ? OWNER_OVERRIDES[c.id].name : null,
    ownerSource: (typeof OWNER_OVERRIDES !== 'undefined' && OWNER_OVERRIDES[c.id]) ? OWNER_OVERRIDES[c.id].source : null,
    email: (typeof EMAIL_OVERRIDES !== 'undefined' && EMAIL_OVERRIDES[c.id]) ? EMAIL_OVERRIDES[c.id].email : (c.email || null),
    emailSource: (typeof EMAIL_OVERRIDES !== 'undefined' && EMAIL_OVERRIDES[c.id]) ? EMAIL_OVERRIDES[c.id].source : null
  }));
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function businessEmailLine(c) {
  if (!c.email) return '';
  return `<a href="mailto:${escapeHtml(c.email)}" class="card-email">${escapeHtml(c.email)}</a>`;
}

function mergeQuoteEmailsIntoCompanies() {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  quoteLeads.forEach(lead => {
    if (!lead.email || !lead.business) return;
    const leadKey = norm(lead.business);
    if (!leadKey) return;
    companies.forEach(c => {
      if (c.email) return;
      const cKey = norm(c.name);
      if (!cKey) return;
      if (cKey === leadKey || cKey.includes(leadKey) || leadKey.includes(cKey)) {
        c.email = lead.email;
        c.emailSource = 'Quote request match';
      }
    });
  });
}

function init() {
  companies = loadPreloaded();

  populateFilters();
  updateHeroStats();
  applyFilters();
  loadQuoteLeads().then(() => loadServerState());

  searchInput.addEventListener('input', () => {
    currentPage = 1;
    showSuggestions(searchInput.value.trim());
    applyFilters();
  });
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) showSuggestions(searchInput.value.trim());
  });
  searchInput.addEventListener('keydown', handleSearchKeydown);
  searchInput.addEventListener('blur', () => {
    setTimeout(hideSuggestions, 150);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) hideSuggestions();
  });

  stateFilter.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  industryFilter.addEventListener('change', () => {
    currentPage = 1;
    searchInput.value = '';
    hideSuggestions();
    applyFilters();
  });
  sortBy.addEventListener('change', () => {
    if (usesBusinessSort(activeTab)) {
      sortByTab[activeTab] = sortBy.value;
    }
    applyFilters();
  });
  clearFilters.addEventListener('click', resetFilters);

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!confirmOverlay.hidden) closeConfirm();
    else if (!modalOverlay.hidden) closeModal();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (usesBusinessSort(activeTab)) {
        sortByTab[activeTab] = sortBy.value;
      }

      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      const hideFilters = activeTab === 'inprogress' || activeTab === 'quotes' || activeTab === 'finished';
      document.querySelector('.main').classList.toggle('no-filters', hideFilters);
      if (activeTab === 'inprogress' || activeTab === 'quotes' || activeTab === 'finished') {
        searchInput.value = '';
        stateFilter.value = '';
        industryFilter.value = '';
      }
      if (usesBusinessSort(activeTab)) {
        sortBy.value = sortByTab[activeTab];
      }
      currentPage = 1;
      hideSuggestions();
      switchTabPanel();
      if (activeTab === 'quotes') {
        renderQuotes();
        loadQuoteLeads();
      } else if (activeTab === 'finished') {
        renderFinished();
      } else {
        applyFilters();
      }
    });
  });
  updateTabCounts();

  confirmCancel.addEventListener('click', closeConfirm);
  confirmOverlay.addEventListener('click', e => {
    if (e.target === confirmOverlay) closeConfirm();
  });
  confirmDelete.addEventListener('click', () => {
    if (pendingAction) {
      if (pendingAction.type === 'deleteQuote') {
        fetch(`/api/leads?id=${encodeURIComponent(pendingAction.lead.id)}`, { method: 'DELETE' })
          .then(() => loadQuoteLeads())
          .catch(() => {});
      } else if (pendingAction.type === 'delete') {
        deletedIds.add(pendingAction.company.id);
        saveIdSets();
      } else if (pendingAction.type === 'approve') {
        inProgressIds.add(pendingAction.company.id);
        saveIdSets();
      } else if (pendingAction.type === 'approveQuote') {
        inProgressIds.add(leadProgressId(pendingAction.lead));
        saveIdSets();
      }
      if (pendingAction.type !== 'deleteQuote') refreshAll();
    }
    closeConfirm();
  });
}

function refreshAll() {
  updateHeroStats();
  updateTabCounts();
  switchTabPanel();
  if (activeTab === 'quotes') {
    loadQuoteLeads();
  } else if (activeTab === 'finished') {
    renderFinished();
  } else {
    applyFilters();
  }
}

function updateTabCounts() {
  const live = companies.filter(c => !deletedIds.has(c.id) && !finishedIds.has(c.id));
  const directoryInProgress = live.filter(c => inProgressIds.has(c.id)).length;
  const quoteInProgress = quoteLeads.filter(isLeadInProgress).length;
  const inProgressCount = directoryInProgress + quoteInProgress;
  const finishedCountNum = getFinishedClientCount();
  tabDirectory.textContent = `Businesses (${live.length - directoryInProgress})`;
  tabInProgress.textContent = `Websites in Making (${inProgressCount})`;
  tabQuotes.textContent = `Quote Requests (${activeQuoteLeads().length})`;
  tabFinished.textContent = `Finished Clients (${finishedCountNum})`;
}

function openConfirm(c, type) {
  pendingAction = (type === 'deleteQuote' || type === 'approveQuote')
    ? { lead: c, type }
    : { company: c, type };
  const confirmTitle = document.getElementById('confirmTitle');

  if (type === 'approve') {
    confirmTitle.textContent = 'Move to Websites in Making?';
    confirmText.textContent = `Move "${c.name}" (${[c.city, c.state].filter(Boolean).join(', ')}) to the Websites in Making tab? It will be taken off Businesses.`;
    confirmDelete.textContent = 'Move it';
    confirmDelete.className = 'modal-btn modal-btn-success';
  } else if (type === 'approveQuote') {
    confirmTitle.textContent = 'Start building their website?';
    confirmText.textContent = `Move "${c.business}" (requested by ${c.name}) to Websites in Making? It will leave Quote Requests and appear on your build list.`;
    confirmDelete.textContent = 'Start website';
    confirmDelete.className = 'modal-btn modal-btn-success';
  } else if (type === 'deleteQuote') {
    confirmTitle.textContent = 'Delete this quote request?';
    confirmText.textContent = `Remove the request from ${c.name} at ${c.business}? This cannot be undone.`;
    confirmDelete.textContent = 'Delete';
    confirmDelete.className = 'modal-btn modal-btn-danger';
  } else {
    confirmTitle.textContent = 'Delete this business?';
    confirmText.textContent = `Are you sure you want to delete "${c.name}" (${[c.city, c.state].filter(Boolean).join(', ')}) from Businesses? This will remove it completely.`;
    confirmDelete.textContent = 'Delete';
    confirmDelete.className = 'modal-btn modal-btn-danger';
  }

  confirmOverlay.hidden = false;
  confirmCancel.focus();
}

function closeConfirm() {
  confirmOverlay.hidden = true;
  pendingAction = null;
}

function finishEntityId(entity, fromQuote) {
  return fromQuote ? leadProgressId(entity) : entity.id;
}

function openFinishModal(entity, fromQuote = false) {
  const id = finishEntityId(entity, fromQuote);
  const displayName = fromQuote ? entity.business : entity.name;
  const subtitle = fromQuote
    ? `Requested by ${entity.name}`
    : [entity.city, entity.state].filter(Boolean).join(', ') || '—';
  const savedUrl = siteUrls[id] || '';

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2 id="modalTitle">Move to Finished Clients</h2>
      <div class="modal-tags">
        <span class="tag">${escapeHtml(displayName)}</span>
        <span class="inmaking-badge">Website in making</span>
      </div>
    </div>

    <div class="modal-section">
      <h3>${escapeHtml(displayName)}</h3>
      <p class="manage-sub">${escapeHtml(subtitle)}</p>
      <p class="manage-hint">The site is live and ready. Add the live URL below if you have it, then move this client to Finished Clients.</p>
    </div>

    <div class="modal-section">
      <label class="manage-label" for="finishSiteUrl">Live website URL <span class="manage-label-optional">(optional)</span></label>
      <input type="url" id="finishSiteUrl" class="manage-input" placeholder="https://clientbusiness.com" value="${escapeHtml(savedUrl)}">
    </div>

    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="finishCancelBtn">Cancel</button>
      <button type="button" class="modal-btn modal-btn-secondary modal-notes-btn">Notes</button>
      <button type="button" class="modal-btn modal-btn-success" id="finishConfirmBtn">Move to Finished Clients</button>
    </div>
  `;

  modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  modalClose.focus();

  modalContent.querySelector('#finishCancelBtn').addEventListener('click', closeModal);
  wireNotesButton(id, displayName, () => openFinishModal(entity, fromQuote));
  modalContent.querySelector('#finishConfirmBtn').addEventListener('click', () => {
    const normalized = normalizeSiteUrl(modalContent.querySelector('#finishSiteUrl').value);
    if (normalized) {
      siteUrls[id] = normalized;
    } else {
      delete siteUrls[id];
    }
    inProgressIds.delete(id);
    finishedIds.add(id);
    saveIdSets();
    closeModal();
    activeTab = 'finished';
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === 'finished');
    });
    document.querySelector('.main').classList.add('no-filters');
    refreshAll();
  });
}

function openNotesModal(id, title, onBack) {
  const current = getBusinessNote(id);

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2 id="modalTitle">Notes</h2>
      <div class="modal-tags">
        <span class="tag">${escapeHtml(title)}</span>
      </div>
    </div>

    <div class="modal-section">
      <label class="manage-label" for="businessNotesInput">Your notes</label>
      <textarea id="businessNotesInput" class="notes-textarea" rows="10" placeholder="Call back Tuesday, interested in Starter plan, left voicemail, etc.">${escapeHtml(current)}</textarea>
      <p class="manage-hint">Notes are saved for you and your partner. Clear the box and save to remove notes.</p>
    </div>

    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="notesBackBtn">Back</button>
      <button type="button" class="modal-btn modal-btn-primary" id="notesSaveBtn">Save notes</button>
    </div>
  `;

  modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  modalContent.querySelector('#businessNotesInput').focus();

  modalContent.querySelector('#notesBackBtn').addEventListener('click', () => {
    if (onBack) onBack();
  });

  modalContent.querySelector('#notesSaveBtn').addEventListener('click', () => {
    saveBusinessNote(id, modalContent.querySelector('#businessNotesInput').value);
    refreshAll();
    if (onBack) onBack();
  });
}

function wireNotesButton(id, title, onBack) {
  const btn = modalContent.querySelector('.modal-notes-btn');
  if (!btn) return;
  if (hasBusinessNote(id)) btn.classList.add('notes-btn-has');
  btn.addEventListener('click', () => openNotesModal(id, title, onBack));
}

function openModal(c) {
  const phoneDigits = (c.phone || '').replace(/\D/g, '');
  const fullAddress = [c.address !== 'No street address on file' ? c.address : '', c.city, `${c.state} ${c.zip}`.trim()]
    .filter(Boolean).join(', ');
  const mapsUrl = c.mapsUri || (c.lat && c.lon
    ? `https://maps.google.com/?q=${c.lat},${c.lon}`
    : `https://maps.google.com/?q=${encodeURIComponent(`${c.name}, ${fullAddress}`)}`);
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`"${c.name}" ${c.city} ${c.state}`)}`;

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2 id="modalTitle">${escapeHtml(c.name)}</h2>
      <div class="modal-tags">
        <span class="tag tag-industry">${escapeHtml(c.industry)}</span>
        <span class="tag">${escapeHtml([c.city, c.state].filter(Boolean).join(', '))}</span>
        ${verificationBadgeHtml(c)}
      </div>
    </div>

    <div class="modal-section">
      <h3>Contact & location</h3>
      <div class="modal-grid">
        <div class="modal-field">
          <label>Address</label>
          <span>${escapeHtml(c.address)}<br>${escapeHtml([c.city, c.state].filter(Boolean).join(', '))}${c.zip ? ' ' + escapeHtml(c.zip) : ''}</span>
        </div>
        <div class="modal-field">
          <label>Phone</label>
          <a href="tel:${phoneDigits}">${escapeHtml(c.phone)}</a>
        </div>
        ${c.email ? `
        <div class="modal-field">
          <label>Email</label>
          <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>${c.emailSource ? ` <span style="color:var(--text-muted);font-size:0.8em;">· ${escapeHtml(c.emailSource)}</span>` : ''}
        </div>` : ''}
        ${c.owner ? `
        <div class="modal-field">
          <label>Owner</label>
          <span>${escapeHtml(c.owner)}${c.ownerSource ? ` · <span style="color:var(--text-muted);font-size:0.8em;">found via ${escapeHtml(c.ownerSource)}</span>` : ''}</span>
        </div>` : ''}
        <div class="modal-field">
          <label>Google rating</label>
          <span>${c.rating ? `${escapeHtml(String(c.rating))} ★ (${escapeHtml(String(c.reviews || 0))} reviews)` : 'Not rated yet'}</span>
        </div>
        <div class="modal-field">
          <label>Business type</label>
          <span>${escapeHtml(c.primaryType || c.industry)}</span>
        </div>
        <div class="modal-field">
          <label>Industry group</label>
          <span>${escapeHtml(c.industry)}</span>
        </div>
        <div class="modal-field">
          <label>ZIP code</label>
          <span>${escapeHtml(c.zip || 'Not listed')}</span>
        </div>
      </div>
    </div>

    ${Array.isArray(c.hours) && c.hours.length ? `
    <div class="modal-section">
      <h3>Opening hours</h3>
      <ul class="hours-list">
        ${c.hours.map(h => {
          const [day, ...rest] = String(h).split(': ');
          return `<li><span class="hours-day">${escapeHtml(day)}</span><span>${escapeHtml(rest.join(': ') || '')}</span></li>`;
        }).join('')}
      </ul>
    </div>` : ''}

    <div class="modal-section">
      <div class="modal-alert${hasWebsiteOnGoogle(c) ? ' modal-alert-warn' : ''}">
        <strong>${hasWebsiteOnGoogle(c) ? 'No longer a no-website lead' : 'Web presence gap'}</strong>
        ${hasWebsiteOnGoogle(c)
          ? 'Google now shows a website for this business. Consider removing it from your outreach list.'
          : 'No website on file for this business. It may be a strong candidate for a simple landing page or a full website build — call and ask if they\'d like one.'}
      </div>
    </div>

    <div class="modal-section modal-section-verification">
      <h3>Website verification</h3>
      ${verificationPanelHtml(c)}
    </div>

    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary modal-notes-btn">Notes</button>
      <a href="tel:${phoneDigits}" class="modal-btn modal-btn-primary">Call ${escapeHtml(c.phone)}</a>
      <a href="${googleUrl}" target="_blank" rel="noopener" class="modal-btn modal-btn-secondary">Check on Google</a>
      <a href="${mapsUrl}" target="_blank" rel="noopener" class="modal-btn modal-btn-secondary">Get directions</a>
    </div>
  `;

  modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  modalClose.focus();
  wireNotesButton(c.id, c.name, () => openModal(c));
}

function closeModal() {
  modalOverlay.hidden = true;
  document.body.style.overflow = '';
}

function populateFilters() {
  while (stateFilter.options.length > 1) stateFilter.remove(1);
  while (industryFilter.options.length > 1) industryFilter.remove(1);

  const states = [...new Set(companies.map(c => c.state))].sort();
  const industries = [...new Set(companies.map(c => c.industry))].sort();

  states.forEach(s => {
    const count = companies.filter(c => c.state === s).length;
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = `${s} (${count})`;
    stateFilter.appendChild(opt);
  });

  industries.forEach(i => {
    const count = companies.filter(c => c.industry === i).length;
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${i} (${count})`;
    industryFilter.appendChild(opt);
  });
}

function getFinishedClientCount() {
  return companies.filter(c => !deletedIds.has(c.id) && finishedIds.has(c.id)).length +
    quoteLeads.filter(isLeadFinished).length;
}

function updateHeroStats() {
  const live = companies.filter(c => !deletedIds.has(c.id) && !inProgressIds.has(c.id) && !finishedIds.has(c.id));
  document.getElementById('totalCount').textContent = live.length;
  document.getElementById('finishedHeroCount').textContent = getFinishedClientCount();
  document.getElementById('stateCount').textContent =
    new Set(live.map(c => c.state)).size;
  document.getElementById('industryCount').textContent =
    new Set(live.map(c => c.industry)).size;
  document.getElementById('inMakingCount').textContent =
    companies.filter(c => !deletedIds.has(c.id) && inProgressIds.has(c.id) && !finishedIds.has(c.id)).length +
    quoteLeads.filter(isLeadInProgress).length;
}

function usesBusinessSort(tab) {
  return tab === 'directory' || tab === 'inprogress';
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const state = stateFilter.value;
  const industry = industryFilter.value;

  filtered = baseList().filter(c => {
    const matchesSearch = companyMatchesSearch(c, query);
    const matchesState = !state || c.state === state;
    const matchesIndustry = !industry || c.industry === industry;
    return matchesSearch && matchesState && matchesIndustry;
  });

  sortResults();
  render();
}

function sortResults() {
  const sortValue = usesBusinessSort(activeTab) ? sortByTab[activeTab] : 'name-asc';
  const [field, dir] = sortValue.split('-');
  filtered.sort((a, b) => {
    if (field === 'reviews') {
      const numA = Number(a.reviews) || 0;
      const numB = Number(b.reviews) || 0;
      const cmp = numA - numB;
      return dir === 'asc' ? cmp : -cmp;
    }
    const valA = (a[field] || '').toLowerCase();
    const valB = (b[field] || '').toLowerCase();
    const cmp = valA.localeCompare(valB);
    return dir === 'asc' ? cmp : -cmp;
  });
}

function render() {
  if (activeTab === 'quotes') {
    renderQuotes();
    return;
  }
  if (activeTab === 'finished') {
    renderFinished();
    return;
  }

  switchTabPanel();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  resultsCount.textContent = total === 1
    ? '1 business found'
    : `${total} businesses found`;

  companyList.innerHTML = '';
  emptyState.hidden = total > 0;

  if (total === 0) {
    if (activeTab === 'inprogress' && baseList().length === 0) {
      emptyTitle.textContent = 'No websites in making yet';
      emptyText.textContent = 'Move a business from the directory, or use “Move to Websites in Making” on a quote request. When the site is live, use “Move to Finished Clients” on a card.';
    } else {
      emptyTitle.textContent = 'No businesses match';
      emptyText.textContent = 'Try adjusting your filters or search term.';
    }
  }

  page.forEach(c => {
    companyList.appendChild(createCard(c));
  });

  renderPagination(totalPages);
}

function formatQuoteDate(ts) {
  if (!ts) return 'Date unknown';
  const d = new Date(ts.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function quoteInitials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || '?';
}

function formatPhoneDisplay(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone || '—';
}

function renderQuotes() {
  switchTabPanel();
  quotesList.innerHTML = '';

  quotesCount.textContent = activeQuoteLeads().length === 1
    ? '1 request'
    : `${activeQuoteLeads().length} requests`;

  if (!activeQuoteLeads().length) {
    quotesEmpty.hidden = false;
    return;
  }

  quotesEmpty.hidden = true;
  activeQuoteLeads().forEach(lead => {
    quotesList.appendChild(createQuoteCard(lead));
  });
}

function renderFinished() {
  switchTabPanel();
  finishedList.innerHTML = '';
  const items = finishedListData();
  const total = items.length;

  finishedCount.textContent = total === 1 ? '1 client' : `${total} clients`;
  finishedEmpty.hidden = total > 0;

  items.forEach(c => {
    finishedList.appendChild(createFinishedCard(c));
  });
}

function openQuoteModal(lead) {
  const phoneDigits = (lead.phone || '').replace(/\D/g, '');
  modalContent.innerHTML = `
    <div class="modal-header">
      <h2 id="modalTitle">Free quote request</h2>
      <div class="modal-tags">
        <span class="tag quote-request-badge">Contact form submission</span>
        <span class="tag">${escapeHtml(lead.type || 'Other')}</span>
      </div>
    </div>

    <div class="modal-section">
      <h3>Submitted</h3>
      <p class="quote-submitted-at">${escapeHtml(formatQuoteDate(lead.timestamp))}</p>
    </div>

    <div class="modal-section">
      <h3>Contact details</h3>
      <div class="modal-grid">
        <div class="modal-field">
          <label>Name</label>
          <span>${escapeHtml(lead.name)}</span>
        </div>
        <div class="modal-field">
          <label>Business name</label>
          <span>${escapeHtml(lead.business)}</span>
        </div>
        <div class="modal-field">
          <label>Phone</label>
          <a href="tel:${phoneDigits}">${escapeHtml(formatPhoneDisplay(lead.phone))}</a>
        </div>
        <div class="modal-field">
          <label>Email</label>
          <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>
        </div>
        <div class="modal-field">
          <label>Business type</label>
          <span>${escapeHtml(lead.type || 'Not specified')}</span>
        </div>
        <div class="modal-field">
          <label>Source</label>
          <span>Webnara contact form · free quote</span>
        </div>
      </div>
    </div>

    <div class="modal-section">
      <h3>What they wrote</h3>
      <div class="quote-message quote-message-modal">${escapeHtml(lead.message || 'No additional message provided.')}</div>
    </div>

    <div class="modal-actions">
      ${isLeadInProgress(lead) ? '' : '<button type="button" class="modal-btn modal-btn-success quote-modal-start">Move to Websites in Making</button>'}
      <button type="button" class="modal-btn modal-btn-secondary modal-notes-btn">Notes</button>
      <a href="tel:${phoneDigits}" class="modal-btn modal-btn-primary">Call ${escapeHtml(formatPhoneDisplay(lead.phone))}</a>
      <a href="mailto:${escapeHtml(lead.email)}" class="modal-btn modal-btn-secondary">Email ${escapeHtml(lead.name)}</a>
    </div>
  `;
  modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  modalClose.focus();
  wireNotesButton(leadProgressId(lead), lead.business, () => openQuoteModal(lead));
  modalContent.querySelector('.quote-modal-start')?.addEventListener('click', () => {
    closeModal();
    openConfirm(lead, 'approveQuote');
  });
}

function createQuoteCard(lead) {
  const card = document.createElement('article');
  card.className = 'quote-card';
  const phoneDigits = (lead.phone || '').replace(/\D/g, '');
  const phoneDisplay = formatPhoneDisplay(lead.phone);
  const messageText = (lead.message || '').trim();
  const messagePreview = messageText
    ? escapeHtml(messageText.length > 180 ? `${messageText.slice(0, 180)}…` : messageText)
    : '';

  card.innerHTML = `
    <div class="quote-card-top">
      <div class="quote-avatar" aria-hidden="true">${escapeHtml(quoteInitials(lead.name))}</div>
      <div class="quote-card-intro">
        <div class="quote-title-row">
          <h3 class="quote-name">${escapeHtml(lead.name)}</h3>
          <time class="quote-time">${escapeHtml(formatQuoteDate(lead.timestamp))}</time>
        </div>
        <p class="quote-business">${escapeHtml(lead.business)}</p>
        <div class="quote-tag-row">
          <span class="quote-type-tag">${escapeHtml(lead.type || 'Other')}</span>
          <span class="quote-source-tag">Webnara form</span>
        </div>
      </div>
      <button class="quote-delete" type="button" title="Delete request" aria-label="Delete request">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="quote-contact-strip">
      <a href="tel:${phoneDigits}" class="quote-contact-chip">
        <span class="quote-chip-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></span>
        <span class="quote-chip-text">${escapeHtml(phoneDisplay)}</span>
      </a>
      <a href="mailto:${escapeHtml(lead.email)}" class="quote-contact-chip">
        <span class="quote-chip-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg></span>
        <span class="quote-chip-text">${escapeHtml(lead.email)}</span>
      </a>
    </div>

    ${messagePreview
      ? `<blockquote class="quote-message"><p>${messagePreview}</p></blockquote>`
      : `<p class="quote-no-message">No message included with this request.</p>`}

    <div class="quote-actions">
      <button type="button" class="quote-btn quote-btn-start quote-start-btn">Move to Websites in Making</button>
      <div class="quote-action-secondary">
        <button type="button" class="quote-btn quote-btn-ghost quote-view-btn">View details</button>
        <a href="tel:${phoneDigits}" class="quote-btn quote-btn-call">Call</a>
        <a href="mailto:${escapeHtml(lead.email)}" class="quote-btn quote-btn-email">Email</a>
      </div>
    </div>
  `;

  card.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('click', e => e.stopPropagation());
  });
  card.querySelector('.quote-view-btn').addEventListener('click', () => openQuoteModal(lead));
  card.querySelector('.quote-start-btn').addEventListener('click', () => openConfirm(lead, 'approveQuote'));
  card.addEventListener('click', () => openQuoteModal(lead));
  card.querySelector('.quote-delete').addEventListener('click', () => openConfirm(lead, 'deleteQuote'));

  return card;
}

function createCard(c) {
  if (c.fromQuote) return createQuoteProjectCard(c);

  const card = document.createElement('article');
  card.className = 'company-card';
  card.innerHTML = `
    <div>
      <h3 class="company-name">${escapeHtml(c.name)}</h3>
      <div class="company-meta">
        <span class="tag tag-industry">${escapeHtml(c.industry)}</span>
        <span class="tag">${escapeHtml(c.state)}</span>
        ${c.rating ? `<span class="tag">★ ${escapeHtml(String(c.rating))} (${escapeHtml(String(c.reviews || 0))})</span>` : ''}
        ${hasBusinessNote(c.id) ? '<span class="tag tag-notes">Notes</span>' : ''}
      </div>
      <div class="company-details">
        <span>${escapeHtml([c.address, c.city, c.state].filter(Boolean).join(', '))}${c.zip ? ' ' + escapeHtml(c.zip) : ''}</span>
        <a href="tel:${(c.phone || '').replace(/\D/g, '')}" class="card-phone">${escapeHtml(c.phone)}</a>
        ${businessEmailLine(c)}
      </div>
    </div>
    <div class="card-side">
      ${inProgressIds.has(c.id)
        ? `<span class="inmaking-badge">Website in making</span>`
        : verificationBadgeHtml(c)}
      ${c.owner ? `<span class="card-owner">Owner: ${escapeHtml(c.owner)}</span>` : ''}
      ${inProgressIds.has(c.id)
        ? `<div class="card-progress-actions">
             <button class="card-finish-btn" type="button">
               <span class="card-finish-icon" aria-hidden="true">&#10003;</span>
               Move to Finished Clients
             </button>
             <button class="action-btn return" type="button" title="Return to Businesses" aria-label="Return to Businesses">&#8617;</button>
           </div>`
        : `<div class="card-actions">
             <button class="action-btn approve" type="button" title="Move to Websites in Making" aria-label="Move to Websites in Making">&#10003;</button>
             <button class="action-btn reject" type="button" title="Delete from Businesses" aria-label="Delete from Businesses">&#10005;</button>
           </div>`}
    </div>
  `;

  card.addEventListener('click', () => openModal(c));

  const phoneLink = card.querySelector('.card-phone');
  phoneLink.addEventListener('click', e => e.stopPropagation());
  card.querySelector('.card-email')?.addEventListener('click', e => e.stopPropagation());

  const approveBtn = card.querySelector('.action-btn.approve');
  if (approveBtn) {
    approveBtn.addEventListener('click', e => {
      e.stopPropagation();
      openConfirm(c, 'approve');
    });
  }

  const returnBtn = card.querySelector('.action-btn.return');
  if (returnBtn) {
    returnBtn.addEventListener('click', e => {
      e.stopPropagation();
      inProgressIds.delete(c.id);
      saveIdSets();
      refreshAll();
    });
  }

  const finishBtn = card.querySelector('.card-finish-btn');
  if (finishBtn) {
    finishBtn.addEventListener('click', e => {
      e.stopPropagation();
      openFinishModal(c, false);
    });
  }

  const rejectBtn = card.querySelector('.action-btn.reject');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', e => {
      e.stopPropagation();
      openConfirm(c, 'delete');
    });
  }

  return card;
}

function createQuoteProjectCard(c) {
  const lead = c.quoteLead;
  const phoneDigits = (c.phone || '').replace(/\D/g, '');
  const card = document.createElement('article');
  card.className = 'company-card company-card-quote';
  card.innerHTML = `
    <div>
      <h3 class="company-name">${escapeHtml(c.name)}</h3>
      <div class="company-meta">
        <span class="tag tag-industry">${escapeHtml(c.industry)}</span>
        <span class="tag quote-lead-tag">Quote request</span>
      </div>
      <div class="company-details">
        <span>Contact: ${escapeHtml(c.owner)}</span>
        <a href="tel:${phoneDigits}" class="card-phone">${escapeHtml(formatPhoneDisplay(c.phone))}</a>
        ${businessEmailLine(c)}
      </div>
    </div>
    <div class="card-side">
      <span class="inmaking-badge">Website in making</span>
      <span class="card-owner">From Webnara contact form</span>
      <div class="card-progress-actions">
        <button class="card-finish-btn" type="button">
          <span class="card-finish-icon" aria-hidden="true">&#10003;</span>
          Move to Finished Clients
        </button>
        <button class="action-btn return" type="button" title="Return to Quote Requests" aria-label="Return to Quote Requests">&#8617;</button>
      </div>
    </div>
  `;

  card.addEventListener('click', () => openQuoteModal(lead));
  card.querySelector('.card-phone')?.addEventListener('click', e => e.stopPropagation());
  card.querySelector('.card-email')?.addEventListener('click', e => e.stopPropagation());
  card.querySelector('.card-finish-btn').addEventListener('click', e => {
    e.stopPropagation();
    openFinishModal(lead, true);
  });
  card.querySelector('.action-btn.return').addEventListener('click', e => {
    e.stopPropagation();
    inProgressIds.delete(c.id);
    saveIdSets();
    refreshAll();
  });

  return card;
}

function normalizeSiteUrl(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function openManageModal(c) {
  const savedUrl = siteUrls[c.id] || '';
  const displayName = escapeHtml(c.name);
  const subtitle = c.fromQuote
    ? `Contact: ${escapeHtml(c.owner || '—')}`
    : escapeHtml([c.city, c.state].filter(Boolean).join(', ') || '—');

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2 id="modalTitle">Manage website</h2>
      <div class="modal-tags">
        <span class="tag">${displayName}</span>
        <span class="finished-badge">Website launched</span>
      </div>
    </div>

    <div class="modal-section">
      <h3>${displayName}</h3>
      <p class="manage-sub">${subtitle}</p>
    </div>

    <div class="modal-section">
      <label class="manage-label" for="manageSiteUrl">Live website URL</label>
      <input type="url" id="manageSiteUrl" class="manage-input" placeholder="https://clientbusiness.com" value="${escapeHtml(savedUrl)}">
      <p class="manage-hint">Save the client's live domain here, then open it anytime from this card.</p>
    </div>

    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary modal-notes-btn">Notes</button>
      <button type="button" class="modal-btn modal-btn-primary" id="manageSaveBtn">Save URL</button>
      <button type="button" class="modal-btn modal-btn-secondary" id="manageOpenBtn"${savedUrl ? '' : ' disabled'}>Open website</button>
    </div>
  `;

  modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  modalClose.focus();
  wireNotesButton(c.id, c.name, () => openManageModal(c));

  const urlInput = modalContent.querySelector('#manageSiteUrl');
  const openBtn = modalContent.querySelector('#manageOpenBtn');

  urlInput.addEventListener('input', () => {
    openBtn.disabled = !urlInput.value.trim();
  });

  modalContent.querySelector('#manageSaveBtn').addEventListener('click', () => {
    const normalized = normalizeSiteUrl(urlInput.value);
    if (normalized) {
      siteUrls[c.id] = normalized;
      urlInput.value = normalized;
    } else {
      delete siteUrls[c.id];
    }
    saveIdSets();
    openBtn.disabled = !normalized;
    renderFinished();
  });

  openBtn.addEventListener('click', () => {
    const normalized = normalizeSiteUrl(urlInput.value || siteUrls[c.id]);
    if (normalized) window.open(normalized, '_blank', 'noopener,noreferrer');
  });
}

function createFinishedCard(c) {
  if (c.fromQuote) {
    const lead = c.quoteLead;
    const phoneDigits = (c.phone || '').replace(/\D/g, '');
    const card = document.createElement('article');
    card.className = 'company-card company-card-quote company-card-finished';
    card.innerHTML = `
      <div>
        <h3 class="company-name">${escapeHtml(c.name)}</h3>
        <div class="company-meta">
          <span class="tag tag-industry">${escapeHtml(c.industry)}</span>
          <span class="tag quote-lead-tag">Quote request</span>
        </div>
        <div class="company-details">
          <span>Contact: ${escapeHtml(c.owner)}</span>
          <a href="tel:${phoneDigits}" class="card-phone">${escapeHtml(formatPhoneDisplay(c.phone))}</a>
          ${businessEmailLine(c)}
        </div>
      </div>
      <div class="card-side">
        <span class="finished-badge">Website launched</span>
        <span class="card-owner">From Webnara contact form</span>
        <button class="card-manage-btn" type="button">Manage the website</button>
        <div class="card-actions">
          <button class="action-btn return" type="button" title="Move back to Websites in Making" aria-label="Move back to Websites in Making">&#8617;</button>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openQuoteModal(lead));
    card.querySelector('.card-phone')?.addEventListener('click', e => e.stopPropagation());
    card.querySelector('.card-email')?.addEventListener('click', e => e.stopPropagation());
    card.querySelector('.card-manage-btn').addEventListener('click', e => {
      e.stopPropagation();
      openManageModal(c);
    });
    card.querySelector('.action-btn.return').addEventListener('click', e => {
      e.stopPropagation();
      finishedIds.delete(c.id);
      inProgressIds.add(c.id);
      saveIdSets();
      refreshAll();
    });
    return card;
  }

  const card = document.createElement('article');
  card.className = 'company-card company-card-finished';
  card.innerHTML = `
    <div>
      <h3 class="company-name">${escapeHtml(c.name)}</h3>
      <div class="company-meta">
        <span class="tag tag-industry">${escapeHtml(c.industry)}</span>
        <span class="tag">${escapeHtml(c.state)}</span>
        ${c.rating ? `<span class="tag">★ ${escapeHtml(String(c.rating))} (${escapeHtml(String(c.reviews || 0))})</span>` : ''}
      </div>
      <div class="company-details">
        <span>${escapeHtml([c.address, c.city, c.state].filter(Boolean).join(', '))}${c.zip ? ' ' + escapeHtml(c.zip) : ''}</span>
        <a href="tel:${(c.phone || '').replace(/\D/g, '')}" class="card-phone">${escapeHtml(c.phone)}</a>
        ${businessEmailLine(c)}
      </div>
    </div>
    <div class="card-side">
      <span class="finished-badge">Website launched</span>
      ${c.owner ? `<span class="card-owner">Owner: ${escapeHtml(c.owner)}</span>` : ''}
      <button class="card-manage-btn" type="button">Manage the website</button>
      <div class="card-actions">
        <button class="action-btn return" type="button" title="Move back to Websites in Making" aria-label="Move back to Websites in Making">&#8617;</button>
      </div>
    </div>
  `;

  card.addEventListener('click', () => openModal(c));
  card.querySelector('.card-phone')?.addEventListener('click', e => e.stopPropagation());
  card.querySelector('.card-email')?.addEventListener('click', e => e.stopPropagation());
  card.querySelector('.card-manage-btn').addEventListener('click', e => {
    e.stopPropagation();
    openManageModal(c);
  });
  card.querySelector('.action-btn.return').addEventListener('click', e => {
    e.stopPropagation();
    finishedIds.delete(c.id);
    inProgressIds.add(c.id);
    saveIdSets();
    refreshAll();
  });

  return card;
}

function renderPagination(totalPages) {
  pagination.innerHTML = '';
  if (totalPages <= 1) return;

  pagination.appendChild(makePageBtn('←', currentPage - 1, currentPage === 1));

  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - currentPage) > 1) {
      if (i === 3 || i === totalPages - 2) {
        const dots = document.createElement('span');
        dots.textContent = '…';
        dots.style.padding = '0 0.25rem';
        dots.style.color = 'var(--text-muted)';
        pagination.appendChild(dots);
      }
      continue;
    }
    pagination.appendChild(makePageBtn(i, i, false, i === currentPage));
  }

  pagination.appendChild(makePageBtn('→', currentPage + 1, currentPage === totalPages));
}

function makePageBtn(label, page, disabled, active = false) {
  const btn = document.createElement('button');
  btn.className = 'page-btn' + (active ? ' active' : '');
  btn.textContent = label;
  btn.type = 'button';
  btn.disabled = disabled;
  if (!disabled) {
    btn.addEventListener('click', () => {
      currentPage = page;
      render();
      window.scrollTo({ top: document.querySelector('.results').offsetTop - 20, behavior: 'smooth' });
    });
  }
  return btn;
}

function resetFilters() {
  searchInput.value = '';
  stateFilter.value = '';
  industryFilter.value = '';
  if (usesBusinessSort(activeTab)) {
    sortByTab[activeTab] = 'name-asc';
    sortBy.value = 'name-asc';
  }
  currentPage = 1;
  hideSuggestions();
  updateHeroStats();
  applyFilters();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
