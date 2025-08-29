/* Basic frontend controller:
   - Only Login shows by default
   - After successful login (test/test) show header + dashboard
   - “Search Patients” is a placeholder for now
   - “Create New Patient” opens a local form (still behind login)
*/

const views = {
  login: document.getElementById('view-login'),
  dashboard: document.getElementById('view-dashboard'),
  new: document.getElementById('view-new')
};
const headerBar = document.getElementById('app-header');
const whoami = document.getElementById('whoami');
const year = document.getElementById('year');
year.textContent = new Date().getFullYear();

const DEMO = { username: 'test', password: 'test' };

function showOnly(viewEl) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  viewEl.classList.remove('hidden');
}

function onLoggedIn(username) {
  whoami.textContent = username || 'Doctor';
  headerBar.classList.remove('hidden');         // show header (Logout + brand)
  showOnly(views.dashboard);                    // show dashboard tiles
}

function onLoggedOut() {
  headerBar.classList.add('hidden');            // hide header when logged out
  showOnly(views.login);
  document.getElementById('loginMsg').textContent = '';
  document.getElementById('loginForm').reset();
}

// Auto-restore session if present
if (sessionStorage.getItem('auth') === 'true') {
  onLoggedIn(sessionStorage.getItem('username'));
} else {
  onLoggedOut();
}

/* ===== Login handling ===== */
const loginForm = document.getElementById('loginForm');
const loginMsg = document.getElementById('loginMsg');
document.getElementById('fillDemo').addEventListener('click', () => {
  document.getElementById('username').value = DEMO.username;
  document.getElementById('password').value = DEMO.password;
});

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;

  if (u === DEMO.username && p === DEMO.password) {
    sessionStorage.setItem('auth', 'true');
    sessionStorage.setItem('username', u);
    loginMsg.textContent = 'Login successful.';
    loginMsg.classList.remove('error'); loginMsg.classList.add('ok');
    onLoggedIn(u);
  } else {
    loginMsg.textContent = 'Invalid credentials. Use test / test.';
    loginMsg.classList.remove('ok'); loginMsg.classList.add('error');
  }
});

/* ===== Nav actions (only available after login) ===== */
document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  onLoggedOut();
});

document.getElementById('btnSearch').addEventListener('click', () => {
  alert('Search Patients is coming soon.');
});

document.getElementById('btnCreate').addEventListener('click', () => {
  // Reveal the new-patient form section (still behind login)
  views.new.classList.remove('hidden');
  // Scroll to it smoothly
  views.new.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('backToDash').addEventListener('click', () => {
  views.new.classList.add('hidden');
  showOnly(views.dashboard);
});

/* ===== New Patient (local demo staging) =====
   For now, we just validate and “save” to localStorage so you can test flow.
   Next step: wire this up to Python/SQL backend.
*/
const newForm = document.getElementById('newPatientForm');
const newMsg  = document.getElementById('newMsg');

function getPatients(){
  try { return JSON.parse(localStorage.getItem('patients') || '[]'); }
  catch { return []; }
}
function setPatients(list){
  localStorage.setItem('patients', JSON.stringify(list));
}

newForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('pName').value.trim();
  const dob = document.getElementById('pDob').value;
  const phone = document.getElementById('pPhone').value.trim();
  const address = document.getElementById('pAddress').value.trim();

  if (!name) {
    newMsg.textContent = 'Name is required.';
    newMsg.classList.add('error'); newMsg.classList.remove('ok');
    return;
  }

  const patients = getPatients();
  const id = (patients.at(-1)?.id || 0) + 1;
  patients.push({ id, name, dob, phone, address, createdAt: new Date().toISOString() });
  setPatients(patients);

  newMsg.textContent = `Patient saved (ID: ${id}).`;
  newMsg.classList.add('ok'); newMsg.classList.remove('error');
  newForm.reset();
});
