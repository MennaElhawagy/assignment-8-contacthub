'use strict';

/* =========================================================
   ContactHub - Smart Contact Manager
   Add / edit / delete contacts, search, favorites & emergency
   lists, validation, SweetAlert2 dialogs, LocalStorage.
   ========================================================= */

/* ---------- Config ---------- */
const STORAGE_KEY = 'contactHub.contacts';
const PHOTO_SIZE = 160; // uploaded photos are cropped to a 160x160 square

const PATTERNS = {
  // English or Arabic letters and spaces, 2-50 characters
  name: /^[A-Za-zء-ي ]{2,50}$/,
  // Egyptian mobile: 010 / 011 / 012 / 015 + 8 digits, optional +20 or 0020
  phone: /^(?:(?:\+|00)20|0)1[0125]\d{8}$/,
  email: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
};

const GROUPS = {
  family: 'Family',
  friends: 'Friends',
  work: 'Work',
  school: 'School',
  other: 'Other',
};

const AVATAR_TONES = 8; // .tone-1 ... .tone-8 in style.css

// Defaults for optional fields when reading saved contacts.
const EMPTY_CONTACT = {
  email: '',
  address: '',
  group: '',
  notes: '',
  avatar: '',
  isFavorite: false,
  isEmergency: false,
};

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);

const els = {
  addBtn: $('addContactBtn'),
  search: $('searchInput'),
  grid: $('contactsGrid'),
  subtitle: $('contactsSubtitle'),
  totalCount: $('totalCount'),
  favoritesCount: $('favoritesCount'),
  emergencyCount: $('emergencyCount'),
  favoritesList: $('favoritesList'),
  emergencyList: $('emergencyList'),

  modal: $('contactModal'),
  modalTitle: $('modalTitle'),
  form: $('contactForm'),
  submitLabel: $('submitLabel'),
  avatarPreview: $('avatarPreview'),
  avatarInput: $('avatarInput'),
  removePhotoBtn: $('removePhotoBtn'),

  fields: {
    name: $('contactName'),
    phone: $('contactPhone'),
    email: $('contactEmail'),
    address: $('contactAddress'),
    group: $('contactGroup'),
    notes: $('contactNotes'),
    favorite: $('contactFavorite'),
    emergency: $('contactEmergency'),
  },
};

/* ---------- State ---------- */
let contacts = loadContacts();
let editingId = null; // id of the contact being edited, null when adding
let photoData = ''; // data URL of the photo shown in the modal

const Toast = Swal.mixin({
  toast: true,
  position: 'bottom-end',
  showConfirmButton: false,
  timer: 1800,
  timerProgressBar: true,
});

/* =========================================================
   Storage
   ========================================================= */
function loadContacts() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return []; // corrupted JSON
  }
  if (!Array.isArray(data)) return [];

  // Skip broken entries and fill in any missing optional fields.
  return data
    .filter((item) => item && item.id && item.name && item.phone)
    .map((item) => ({ ...EMPTY_CONTACT, ...item }));
}

/** Saves the new list to LocalStorage, then updates state and UI. */
function commit(nextContacts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextContacts));
  } catch {
    Swal.fire({
      icon: 'error',
      title: 'Could not save',
      text: 'Your browser storage is full. Try removing some contact photos.',
      confirmButtonColor: '#7c3aed',
    });
    return false;
  }
  contacts = nextContacts;
  renderAll();
  return true;
}

/* =========================================================
   Helpers
   ========================================================= */
function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (ch) => map[ch]);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function hashString(text) {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

/** Removes spaces and dashes so "010 1234-5678" is accepted. */
function cleanPhone(phone) {
  return phone.replace(/[\s-]/g, '');
}

/** Last 10 digits, so 01012345678 and +201012345678 count as the same number. */
function phoneKey(phone) {
  return phone.replace(/\D/g, '').slice(-10);
}

function normalizeSpaces(text) {
  return text.trim().replace(/\s+/g, ' ');
}

function findContact(id) {
  return contacts.find((contact) => contact.id === id) || null;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/* =========================================================
   Rendering
   ========================================================= */
function avatarHtml(contact, size) {
  const name = escapeHtml(contact.name);
  if (contact.avatar) {
    return `<img class="avatar avatar-${size}" src="${escapeHtml(contact.avatar)}" alt="${name}" />`;
  }
  const tone = (hashString(contact.name) % AVATAR_TONES) + 1;
  return `<div class="avatar avatar-${size} tone-${tone}" aria-hidden="true">${escapeHtml(getInitials(contact.name))}</div>`;
}

function infoLineHtml(type, icon, text) {
  return `
    <div class="info-line">
      <span class="info-icon info-${type}"><i class="fa-solid ${icon}"></i></span>
      <span class="truncate">${escapeHtml(text)}</span>
    </div>`;
}

function contactCardHtml(contact) {
  const id = escapeHtml(contact.id);
  const name = escapeHtml(contact.name);
  const phone = escapeHtml(contact.phone);
  const email = escapeHtml(contact.email);

  const details = [
    contact.email ? infoLineHtml('email', 'fa-envelope', contact.email) : '',
    contact.address ? infoLineHtml('address', 'fa-location-dot', contact.address) : '',
    contact.notes ? infoLineHtml('notes', 'fa-note-sticky', contact.notes) : '',
  ].join('');

  const tags = [
    GROUPS[contact.group] ? `<span class="tag tag-${contact.group}">${GROUPS[contact.group]}</span>` : '',
    contact.isEmergency ? '<span class="tag tag-emergency"><i class="fa-solid fa-heart-pulse"></i>Emergency</span>' : '',
  ].join('');

  return `
    <article class="contact-card">
      <div class="card-body">
        <div class="card-head">
          <div class="avatar-wrap">
            ${avatarHtml(contact, 'lg')}
            ${contact.isFavorite ? '<span class="avatar-badge badge-favorite"><i class="fa-solid fa-star"></i></span>' : ''}
            ${contact.isEmergency ? '<span class="avatar-badge badge-emergency"><i class="fa-solid fa-heart-pulse"></i></span>' : ''}
          </div>
          <div class="card-title">
            <h3 class="truncate">${name}</h3>
            <div class="info-line">
              <span class="info-icon info-phone"><i class="fa-solid fa-phone"></i></span>
              <span class="truncate">${phone}</span>
            </div>
          </div>
        </div>
        <div class="card-details">${details}</div>
        ${tags ? `<div class="tags">${tags}</div>` : ''}
      </div>

      <div class="card-actions">
        <div class="action-group">
          <a href="tel:${phone}" class="action action-call" title="Call ${name}" aria-label="Call ${name}">
            <i class="fa-solid fa-phone"></i>
          </a>
          ${contact.email ? `
          <a href="mailto:${email}" class="action action-email" title="Email ${name}" aria-label="Email ${name}">
            <i class="fa-solid fa-envelope"></i>
          </a>` : ''}
        </div>
        <div class="action-group">
          <button type="button" class="action action-favorite ${contact.isFavorite ? 'is-active' : ''}"
            data-action="favorite" data-id="${id}" aria-pressed="${contact.isFavorite}"
            title="${contact.isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
            <i class="${contact.isFavorite ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
          <button type="button" class="action action-emergency ${contact.isEmergency ? 'is-active' : ''}"
            data-action="emergency" data-id="${id}" aria-pressed="${contact.isEmergency}"
            title="${contact.isEmergency ? 'Remove from emergency' : 'Mark as emergency'}">
            <i class="${contact.isEmergency ? 'fa-solid fa-heart-pulse' : 'fa-regular fa-heart'}"></i>
          </button>
          <button type="button" class="action action-edit" data-action="edit" data-id="${id}" title="Edit">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="action action-delete" data-action="delete" data-id="${id}" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    </article>`;
}

function emptyStateHtml(query) {
  const title = query ? `No contacts match "${escapeHtml(query)}"` : 'No contacts found';
  const hint = query ? 'Try a different name, phone, or email' : 'Click "Add Contact" to get started';
  return `
    <div class="empty-state">
      <div class="empty-icon"><i class="fa-solid fa-address-book"></i></div>
      <p class="empty-title">${title}</p>
      <p class="empty-hint">${hint}</p>
    </div>`;
}

function quickItemHtml(contact) {
  const name = escapeHtml(contact.name);
  const phone = escapeHtml(contact.phone);
  return `
    <div class="quick-item">
      ${avatarHtml(contact, 'sm')}
      <div class="quick-info">
        <h4 class="truncate">${name}</h4>
        <p class="truncate">${phone}</p>
      </div>
      <a href="tel:${phone}" class="quick-call" title="Call ${name}" aria-label="Call ${name}">
        <i class="fa-solid fa-phone"></i>
      </a>
    </div>`;
}

function sortByName(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/** Contacts matching the search box (name, phone, or email). */
function getVisibleContacts() {
  const query = els.search.value.trim().toLowerCase();
  if (!query) return contacts;

  // Number-only queries also match ignoring spaces/dashes/"+".
  const digits = /^[\d\s+()-]+$/.test(query) ? query.replace(/\D/g, '') : '';

  return contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(query) ||
      contact.email.toLowerCase().includes(query) ||
      contact.phone.includes(query) ||
      (digits && contact.phone.replace(/\D/g, '').includes(digits))
  );
}

function renderContacts() {
  const visible = sortByName(getVisibleContacts());
  els.grid.innerHTML = visible.length
    ? visible.map(contactCardHtml).join('')
    : emptyStateHtml(els.search.value.trim());
}

function renderQuickList(container, list, emptyText) {
  container.innerHTML = list.length
    ? sortByName(list).map(quickItemHtml).join('')
    : `<p class="quick-empty">${emptyText}</p>`;
}

function renderStats(favorites, emergency) {
  els.totalCount.textContent = contacts.length;
  els.favoritesCount.textContent = favorites.length;
  els.emergencyCount.textContent = emergency.length;
  els.subtitle.textContent = `Manage and organize your ${plural(contacts.length, 'contact')}`;
}

function renderAll() {
  const favorites = contacts.filter((contact) => contact.isFavorite);
  const emergency = contacts.filter((contact) => contact.isEmergency);

  renderStats(favorites, emergency);
  renderContacts();
  renderQuickList(els.favoritesList, favorites, 'No favorites yet');
  renderQuickList(els.emergencyList, emergency, 'No emergency contacts');
}

/* =========================================================
   Modal
   ========================================================= */
function openModal(contact = null) {
  editingId = contact ? contact.id : null;

  els.form.reset();
  clearErrors();
  els.modalTitle.textContent = contact ? 'Edit Contact' : 'Add New Contact';
  els.submitLabel.textContent = contact ? 'Update Contact' : 'Save Contact';

  if (contact) {
    const f = els.fields;
    f.name.value = contact.name;
    f.phone.value = contact.phone;
    f.email.value = contact.email;
    f.address.value = contact.address;
    f.group.value = contact.group;
    f.notes.value = contact.notes;
    f.favorite.checked = contact.isFavorite;
    f.emergency.checked = contact.isEmergency;
  }
  setPhoto(contact ? contact.avatar : '');

  els.modal.classList.add('is-open');
  els.modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  els.fields.name.focus();
}

function closeModal() {
  els.modal.classList.remove('is-open');
  els.modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  editingId = null;
  photoData = '';
}

function isModalOpen() {
  return els.modal.classList.contains('is-open');
}

/* ---------- Photo ---------- */
function setPhoto(dataUrl) {
  photoData = dataUrl || '';
  els.removePhotoBtn.hidden = !photoData;
  updateAvatarPreview();
}

function updateAvatarPreview() {
  if (photoData) {
    els.avatarPreview.innerHTML = `<img src="${escapeHtml(photoData)}" alt="Contact photo" />`;
    return;
  }
  const initials = getInitials(els.fields.name.value);
  els.avatarPreview.innerHTML = initials
    ? escapeHtml(initials)
    : '<i class="fa-solid fa-user"></i>';
}

/** Crops an image file to a small square JPEG so it fits in LocalStorage. */
function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);

      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unreadable image'));
    };

    img.src = url;
  });
}

async function handlePhotoChange() {
  const file = els.avatarInput.files[0];
  els.avatarInput.value = ''; // lets the same file be picked again
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire({ icon: 'error', title: 'Invalid file', text: 'Please choose an image file.', confirmButtonColor: '#7c3aed' });
    return;
  }

  try {
    setPhoto(await resizeImage(file, PHOTO_SIZE));
  } catch {
    Swal.fire({ icon: 'error', title: 'Invalid image', text: 'That image could not be read.', confirmButtonColor: '#7c3aed' });
  }
}

/* =========================================================
   Validation
   ========================================================= */
/** Returns { title, text } describing the problem, or null if the field is valid. */
function getFieldError(field) {
  const value = els.fields[field].value.trim();

  if (field === 'name') {
    if (!value) return { title: 'Missing Name', text: 'Please enter a name for the contact.' };
    if (!PATTERNS.name.test(value)) {
      return { title: 'Invalid Name', text: 'Name should contain only letters and spaces (2-50 characters).' };
    }
  }

  if (field === 'phone') {
    const phone = cleanPhone(value);
    if (!phone) return { title: 'Missing Phone', text: 'Please enter a phone number.' };
    if (!PATTERNS.phone.test(phone)) {
      return {
        title: 'Invalid Phone',
        text: 'Please enter a valid Egyptian phone number (e.g., 01012345678 or +201012345678).',
      };
    }
    const duplicate = contacts.find(
      (contact) => contact.id !== editingId && phoneKey(contact.phone) === phoneKey(phone)
    );
    if (duplicate) {
      return { title: 'Duplicate Phone Number', text: `This number already belongs to ${duplicate.name}.` };
    }
  }

  if (field === 'email' && value && !PATTERNS.email.test(value)) {
    return { title: 'Invalid Email', text: 'Please enter a valid email address.' };
  }

  return null;
}

function showFieldError(field, error) {
  const input = els.fields[field];
  const message = $(`${input.id}Error`);

  input.classList.toggle('is-invalid', Boolean(error));
  input.setAttribute('aria-invalid', String(Boolean(error)));
  message.textContent = error ? error.text : '';
  message.hidden = !error;
}

function clearErrors() {
  ['name', 'phone', 'email'].forEach((field) => showFieldError(field, null));
}

/** Live validation while typing; an empty field is not flagged until submit. */
function handleLiveValidation(field) {
  const isEmpty = !els.fields[field].value.trim();
  showFieldError(field, isEmpty ? null : getFieldError(field));
}

/* =========================================================
   Actions
   ========================================================= */
function readForm() {
  const f = els.fields;
  return {
    name: normalizeSpaces(f.name.value),
    phone: cleanPhone(f.phone.value.trim()),
    email: f.email.value.trim().toLowerCase(),
    address: normalizeSpaces(f.address.value),
    group: GROUPS[f.group.value] ? f.group.value : '',
    notes: f.notes.value.trim(),
    avatar: photoData,
    isFavorite: f.favorite.checked,
    isEmergency: f.emergency.checked,
  };
}

function handleSubmit(event) {
  event.preventDefault();

  const results = ['name', 'phone', 'email'].map((field) => ({ field, error: getFieldError(field) }));
  results.forEach(({ field, error }) => showFieldError(field, error));

  const firstInvalid = results.find(({ error }) => error);
  if (firstInvalid) {
    Swal.fire({
      icon: 'error',
      title: firstInvalid.error.title,
      text: firstInvalid.error.text,
      confirmButtonColor: '#7c3aed',
      returnFocus: false,
    }).then(() => els.fields[firstInvalid.field].focus());
    return;
  }

  const data = readForm();
  const isEditing = Boolean(editingId);
  const now = new Date().toISOString();

  const nextContacts = isEditing
    ? contacts.map((contact) => (contact.id === editingId ? { ...contact, ...data, updatedAt: now } : contact))
    : [...contacts, { id: generateId(), ...data, createdAt: now }];

  if (!commit(nextContacts)) return;

  closeModal();
  Swal.fire({
    icon: 'success',
    title: isEditing ? 'Updated!' : 'Added!',
    text: `${data.name} has been ${isEditing ? 'updated' : 'added'} successfully.`,
    timer: 1500,
    showConfirmButton: false,
  });
}

function toggleFlag(id, flag) {
  const contact = findContact(id);
  if (!contact) return;

  const isOn = !contact[flag];
  const nextContacts = contacts.map((c) => (c.id === id ? { ...c, [flag]: isOn } : c));
  if (!commit(nextContacts)) return;

  const messages = {
    isFavorite: isOn ? 'added to favorites' : 'removed from favorites',
    isEmergency: isOn ? 'marked as emergency contact' : 'removed from emergency contacts',
  };
  Toast.fire({ icon: 'success', title: `${contact.name} ${messages[flag]}` });
}

function deleteContact(id) {
  const contact = findContact(id);
  if (!contact) return;

  Swal.fire({
    icon: 'warning',
    title: 'Delete Contact?',
    text: `Are you sure you want to delete ${contact.name}? This action cannot be undone.`,
    showCancelButton: true,
    confirmButtonText: 'Yes, delete it!',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#6b7280',
    focusCancel: true,
  }).then((result) => {
    if (!result.isConfirmed) return;
    if (!commit(contacts.filter((c) => c.id !== id))) return;

    Swal.fire({
      icon: 'success',
      title: 'Deleted!',
      text: `${contact.name} has been deleted.`,
      timer: 1500,
      showConfirmButton: false,
    });
  });
}

/* =========================================================
   Events
   ========================================================= */
els.addBtn.addEventListener('click', () => openModal());
els.search.addEventListener('input', renderContacts);
els.form.addEventListener('submit', handleSubmit);
els.avatarInput.addEventListener('change', handlePhotoChange);
els.removePhotoBtn.addEventListener('click', () => setPhoto(''));

// Close buttons, Cancel, and the backdrop all carry [data-close-modal].
els.modal.addEventListener('click', (event) => {
  if (event.target.closest('[data-close-modal]')) closeModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isModalOpen() && !Swal.isVisible()) closeModal();
});

['name', 'phone', 'email'].forEach((field) => {
  els.fields[field].addEventListener('input', () => handleLiveValidation(field));
});

// Show the typed name's initials in the preview when there is no photo.
els.fields.name.addEventListener('input', () => {
  if (!photoData) updateAvatarPreview();
});

// One listener for every card button (favorite, emergency, edit, delete).
els.grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === 'favorite') toggleFlag(id, 'isFavorite');
  if (action === 'emergency') toggleFlag(id, 'isEmergency');
  if (action === 'edit') openModal(findContact(id));
  if (action === 'delete') deleteContact(id);
});

// Keep several open tabs in sync.
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    contacts = loadContacts();
    renderAll();
  }
});

/* ---------- Start ---------- */
renderAll();
