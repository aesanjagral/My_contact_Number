// Utilities
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const storageKey = 'smart_contacts_v1';
const SUPABASE_URL = 'https://xrbbjwjpnlsmqucdhyvh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhyYmJqd2pwbmxzbXF1Y2RoeXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MjQ0ODcsImV4cCI6MjA3NDIwMDQ4N30.2SLrs93GSXTWbvO_dowgTcgjOY7E0EvT1-v75vyxZfE';
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const state = {
  contacts: [],
  filtered: [],
  recognition: null,
  isListening: false,
  isAdmin: false,
  editIndex: null,
};
// Password removed as per request

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function saveContacts() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state.contacts));
  } catch (_) {
    // ignore quota errors
  }
}

function loadContacts() {
  try {
    const raw = localStorage.getItem(storageKey);
    state.contacts = raw ? JSON.parse(raw) : [];
  } catch (_) {
    state.contacts = [];
  }
}

function normalizePhone(phone) {
  return (phone || '').replace(/[^\d+]/g, '');
}

function renderList(list) {
  const ul = $('#contactList');
  const empty = $('#emptyState');
  if (!ul || !empty) return;

  ul.innerHTML = '';
  if (!list.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach((c, idx) => {
    const li = document.createElement('li');
    li.className = 'contact-item';

    const meta = document.createElement('div');
    meta.className = 'contact-meta';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'contact-name';
    nameDiv.textContent = c?.name || '';
    const phoneDiv = document.createElement('div');
    phoneDiv.className = 'contact-phone';
    phoneDiv.textContent = c?.phone || '';
    meta.appendChild(nameDiv);
    meta.appendChild(phoneDiv);

    const actions = document.createElement('div');
    actions.className = 'contact-actions';

    const callBtn = document.createElement('button');
    callBtn.className = 'secondary small with-icon';
    callBtn.dataset.action = 'call';
    callBtn.dataset.index = String(idx);
    const callIcon = document.createElement('span');
    callIcon.className = 'icon';
    callIcon.setAttribute('aria-hidden', 'true');
    // Static SVG only; no user data
    callIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.62 10.79a15.052 15.052 0 006.59 6.59l2.2-2.2a1 1 0 01.97-.26 11.72 11.72 0 003.68.59 1 1 0 011 1V20a1 1 0 01-1 1C11.85 21 3 12.15 3 2a1 1 0 011-1h3.5a1 1 0 011 1 11.72 11.72 0 00.59 3.68 1 1 0 01-.26.97l-2.21 2.21z" fill="#ffffff"/></svg>';
    const callLabel = document.createElement('span');
    callLabel.textContent = 'Call';
    callBtn.appendChild(callIcon);
    callBtn.appendChild(callLabel);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'secondary small';
    copyBtn.dataset.action = 'copy';
    copyBtn.dataset.index = String(idx);
    copyBtn.textContent = 'Copy';

    actions.appendChild(callBtn);
    actions.appendChild(copyBtn);

    if (state.isAdmin) {
      const editBtn = document.createElement('button');
      editBtn.className = 'secondary small';
      editBtn.dataset.action = 'edit';
      editBtn.dataset.index = String(idx);
      editBtn.textContent = 'Edit';

      const delBtn = document.createElement('button');
      delBtn.className = 'danger small';
      delBtn.dataset.action = 'delete';
      delBtn.dataset.index = String(idx);
      delBtn.textContent = 'Delete';

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
    }

    li.appendChild(meta);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}

function applyFilter(q) {
  const query = (q || '').trim().toLowerCase();
  if (!query) {
    state.filtered = [...state.contacts];
    state.filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    renderList(state.filtered);
    return;
  }
  state.filtered = state.contacts.filter((c) => {
    const name = (c.name || '').toLowerCase();
    const phone = normalizePhone(c.phone);
    return name.includes(query) || phone.includes(query.replace(/\s/g, ''));
  });
  state.filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  renderList(state.filtered);
}

async function addContact(name, phone) {
  const trimmedName = (name || '').trim();
  const normPhone = normalizePhone(phone);
  if (!trimmedName || !normPhone) {
    showToast('Please enter valid name and phone');
    return false;
  }
  const exists = state.contacts.some((c) => normalizePhone(c.phone) === normPhone);
  if (exists) {
    showToast('This number already exists');
    return false;
  }
  if (supabase) {
    try {
      const { error } = await supabase.from('contacts').insert({ name: trimmedName, phone: normPhone });
      if (error) { showToast('Save failed'); return false; }
      await reloadFromBackend();
      showToast('Contact saved');
      return true;
    } catch (_) {
      showToast('Save failed');
      return false;
    }
  } else {
    state.contacts.unshift({ name: trimmedName, phone: normPhone });
    saveContacts();
    applyFilter($('#searchInput')?.value || '');
    showToast('Contact saved');
    return true;
  }
}

async function deleteContact(index) {
  const item = state.filtered[index];
  if (!item) return;
  const originalIndex = state.contacts.findIndex((c) => c === item);
  if (originalIndex >= 0) {
    if (supabase) {
      try {
        const { error } = await supabase.from('contacts').delete().eq('phone', item.phone);
        if (error) { showToast('Delete failed'); return; }
        await reloadFromBackend();
        showToast('Deleted');
      } catch (_) {
        showToast('Delete failed');
      }
    } else {
      state.contacts.splice(originalIndex, 1);
      saveContacts();
      applyFilter($('#searchInput')?.value || '');
      showToast('Deleted');
    }
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied');
  } catch (_) {
    showToast('Copy failed');
  }
}

function callNumber(phone) {
  window.location.href = `tel:${normalizePhone(phone)}`;
}

function initVoice() {
  const VoiceCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!VoiceCtor) return null;
  const rec = new VoiceCtor();
  rec.lang = 'en-IN';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  rec.onresult = (e) => {
    const t = e.results?.[0]?.[0]?.transcript || '';
    $('#searchInput').value = t;
    applyFilter(t);
    showToast('Voice captured');
  };
  rec.onerror = () => {
    showToast('Voice error');
  };
  rec.onend = () => {
    state.isListening = false;
    $('#voiceBtn')?.classList.remove('active');
  };
  return rec;
}

function exportContacts() {
  const data = JSON.stringify(state.contacts, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'contacts.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importContacts(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const list = JSON.parse(reader.result || '[]');
      if (!Array.isArray(list)) throw new Error('Invalid file');
      // Merge unique by phone
      const existingPhones = new Set(state.contacts.map((c) => normalizePhone(c.phone)));
      const merged = [...state.contacts];
      list.forEach((c) => {
        const n = (c?.name || '').toString();
        const p = normalizePhone(c?.phone || '');
        if (n && p && !existingPhones.has(p)) {
          merged.push({ name: n, phone: p });
          existingPhones.add(p);
        }
      });
      if (supabase) {
        const rows = merged.filter((m) => !state.contacts.find((c) => c.phone === m.phone));
        if (rows.length) {
          supabase.from('contacts').insert(rows).then(() => reloadFromBackend());
        } else {
          reloadFromBackend();
        }
        showToast('Imported');
      } else {
        state.contacts = merged;
        saveContacts();
        applyFilter($('#searchInput')?.value || '');
        showToast('Imported');
      }
    } catch (_) {
      showToast('Invalid contacts file');
    }
  };
  reader.readAsText(file);
}

function hydrateDemoIfEmpty() {
  if (state.contacts.length) return;
  state.contacts = [
    { name: 'Rahul Sharma', phone: '+91 9876543210' },
    { name: 'Anita Verma', phone: '+91 9898989898' },
    { name: 'Suresh Kumar', phone: '011-23456789' },
  ];
  saveContacts();
}

function bindEvents() {
  const form = $('#addContactForm');
  const search = $('#searchInput');
  const voice = $('#voiceBtn');
  const clear = $('#clearSearch');
  const openAdd = $('#openAdd');
  const addCard = $('#addCard');
  const closeAdd = $('#closeAdd');
  const fabAdd = $('#fabAdd');
  const importFile = $('#importFile');
  const adminBtn = $('#adminBtn');
  const adminModal = $('#adminModal');
  const adminForm = $('#adminForm');
  const adminPass = $('#adminPass');
  const adminError = $('#adminError');
  const adminSuccess = $('#adminSuccess');
  const adminClose = $('#adminClose');
  const adminCancel = $('#adminCancel');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#name').value;
    const phone = $('#phone').value;
    if (state.editIndex !== null) {
      const item = state.filtered[state.editIndex];
      if (item) {
        const originalIndex = state.contacts.findIndex((c) => c === item);
        if (originalIndex >= 0) {
          const newName = name.trim();
          const newPhone = normalizePhone(phone);
          if (supabase) {
            try {
              const { error } = await supabase.from('contacts').update({ name: newName, phone: newPhone }).eq('phone', item.phone);
              if (error) { showToast('Update failed'); return; }
              await reloadFromBackend();
              showToast('Updated');
            } catch (_) {
              showToast('Update failed');
              return;
            }
          } else {
            state.contacts[originalIndex] = { name: newName, phone: newPhone };
            saveContacts();
            applyFilter($('#searchInput')?.value || '');
            showToast('Updated');
          }
        }
      }
      state.editIndex = null;
      const submitBtn = document.querySelector('#addContactForm button[type="submit"]');
      if (submitBtn) submitBtn.textContent = 'Save';
      closeSheet();
      return;
    }
    if (await addContact(name, phone)) {
      form.reset();
      $('#name').focus();
      closeSheet();
    }
  });

  $('#resetForm').addEventListener('click', () => {
    $('#name').focus();
  });

  search.addEventListener('input', (e) => applyFilter(e.target.value));
  clear.addEventListener('click', () => { search.value = ''; applyFilter(''); search.focus(); });

  $('#contactList').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const index = Number(btn.dataset.index);
    const item = state.filtered[index];
    if (!item) return;
    if (action === 'delete') deleteContact(index);
    if (action === 'copy') copyToClipboard(item.phone);
    if (action === 'call') callNumber(item.phone);
    if (action === 'edit') {
      openSheet();
      $('#name').value = item.name;
      $('#phone').value = item.phone;
      state.editIndex = index;
      const submitBtn = document.querySelector('#addContactForm button[type="submit"]');
      if (submitBtn) submitBtn.textContent = 'Update';
    }
  });

  function openAdminModal() {
    if (!adminModal) return;
    adminModal.classList.remove('hidden');
    adminError?.classList.add('hidden');
    adminSuccess?.classList.add('hidden');
    if (adminPass) adminPass.value = '';
    setTimeout(() => adminPass?.focus(), 0);
  }
  function closeAdminModal() {
    adminModal?.classList.add('hidden');
  }
  if (adminBtn) adminBtn.addEventListener('click', openAdminModal);
  if (adminClose) adminClose.addEventListener('click', closeAdminModal);
  if (adminCancel) adminCancel.addEventListener('click', closeAdminModal);
  if (adminModal) {
    adminModal.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) closeAdminModal();
    });
  }
  if (adminForm) {
    adminForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (adminPass && adminPass.value === 'WWW852') {
        state.isAdmin = true;
        adminError?.classList.add('hidden');
        adminSuccess?.classList.remove('hidden');
        showToast('Admin mode ON');
        renderList(state.filtered.length ? state.filtered : state.contacts);
        // Update Admin button to Logout state
        if (adminBtn) {
          adminBtn.textContent = 'Logout';
          adminBtn.onclick = () => {
            state.isAdmin = false;
            showToast('Logged out');
            renderList(state.filtered.length ? state.filtered : state.contacts);
            adminBtn.textContent = 'Admin';
            adminBtn.onclick = openAdminModal;
          };
        }
        setTimeout(closeAdminModal, 700);
      } else {
        state.isAdmin = false;
        adminSuccess?.classList.add('hidden');
        adminError?.classList.remove('hidden');
        showToast('Wrong password');
      }
    });
  }

  // Ensure correct initial Admin button state
  if (adminBtn) {
    if (state.isAdmin) {
      adminBtn.textContent = 'Logout';
      adminBtn.onclick = () => {
        state.isAdmin = false;
        showToast('Logged out');
        renderList(state.filtered.length ? state.filtered : state.contacts);
        adminBtn.textContent = 'Admin';
        adminBtn.onclick = openAdminModal;
      };
    } else {
      adminBtn.textContent = 'Admin';
      adminBtn.onclick = openAdminModal;
    }
  }
  importFile.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importContacts(file);
    e.target.value = '';
  });

  function openSheet() {
    addCard.classList.remove('hidden');
    addCard.classList.add('open');
    setTimeout(() => $('#name')?.focus(), 0);
  }
  function closeSheet() {
    addCard.classList.remove('open');
    // keep in DOM but hide visually on desktop
    if (window.matchMedia('(min-width: 900px)').matches === false) {
      // on mobile, keep as sheet; do not hide entirely
    }
  }
  if (openAdd && addCard) openAdd.addEventListener('click', openSheet);
  if (fabAdd && addCard) fabAdd.addEventListener('click', openSheet);
  if (closeAdd && addCard) closeAdd.addEventListener('click', closeSheet);

  state.recognition = initVoice();
  if (voice) {
    voice.addEventListener('click', () => {
      if (!state.recognition) {
        showToast('Voice not supported in this browser');
        return;
      }
      if (state.isListening) {
        state.recognition.stop();
        return;
      }
      state.isListening = true;
      voice.classList.add('active');
      try { state.recognition.start(); } catch (_) {}
    });
  }
}

async function reloadFromBackend() {
  if (!supabase) { applyFilter($('#searchInput')?.value || ''); return; }
  const { data, error } = await supabase.from('contacts').select('*').order('name', { ascending: true });
  if (!error && Array.isArray(data)) {
    state.contacts = data.map((r) => ({ name: r.name, phone: r.phone }));
    try { localStorage.setItem(storageKey, JSON.stringify(state.contacts)); } catch (_) {}
    applyFilter($('#searchInput')?.value || '');
  }
}

async function init() {
  if (supabase) {
    await reloadFromBackend();
  } else {
    loadContacts();
    hydrateDemoIfEmpty();
    applyFilter('');
  }
  bindEvents();
}

document.addEventListener('DOMContentLoaded', init);


