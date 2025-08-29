// dashboard.js
(function () {
  // ------ Auth guard ------
  // If the user is not authenticated, redirect them to the login page in the parent folder.
  if (sessionStorage.getItem('auth') !== 'true') {
    window.location.replace('../index.html');
    return;
  }

  // Header info
  const whoami = document.getElementById('whoami');
  const yearEls = document.querySelectorAll('#year');
  if (whoami) whoami.textContent = sessionStorage.getItem('username') || 'Doctor';
  yearEls.forEach(el => el.textContent = new Date().getFullYear());

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    sessionStorage.clear();
    // Redirect to the root login page after logout
    window.location.replace('../index.html');
  });

  // ------ Sidebar nav switching ------
  const panels = {
    create: document.getElementById('panelCreate'),
    search: document.getElementById('panelSearch'),
    invoice: document.getElementById('panelInvoice')
  };
  const navBtns = {
    create: document.getElementById('navCreate'),
    search: document.getElementById('navSearch'),
    invoice: document.getElementById('navInvoice')
  };
  function activate(which){
    Object.values(panels).forEach(p => p.classList.add('hidden'));
    Object.values(navBtns).forEach(b => b.classList.remove('active'));
    panels[which].classList.remove('hidden');
    navBtns[which].classList.add('active');
  }
  navBtns.create.addEventListener('click', () => activate('create'));
  navBtns.search.addEventListener('click', () => activate('search'));
  navBtns.invoice.addEventListener('click', () => activate('invoice'));

  // ------ Local demo patient store (from earlier form) ------
  function getPatients(){ try { return JSON.parse(localStorage.getItem('patients') || '[]'); } catch { return []; } }
  function setPatients(list){ localStorage.setItem('patients', JSON.stringify(list)); }

  // Stats
  function sameDay(a,b){
    const da = new Date(a), db = new Date(b);
    return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate();
  }
  function refreshStats(){
    const pts = getPatients();
    const today = new Date();
    const todayCount = pts.filter(p => p.createdAt && sameDay(p.createdAt, today)).length;
    const total = pts.length;

    document.getElementById('statToday').textContent = todayCount;
    document.getElementById('statTotal').textContent = total;
    // Demo revenue = total * $85 (placeholder)
    document.getElementById('statRevenue').textContent = `$${(total*85).toLocaleString()}`;
  }

  // ------ New patient form ------
  const form = document.getElementById('newPatientForm');
  const newMsg = document.getElementById('newMsg');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('pName').value.trim();
    const dob = document.getElementById('pDob').value;
    const phone = document.getElementById('pPhone').value.trim();
    const address = document.getElementById('pAddress').value.trim();

    if(!name){ newMsg.textContent='Name is required.'; newMsg.classList.add('error'); return; }

    const pts = getPatients();
    const id = (pts.at(-1)?.id || 0) + 1;
    pts.push({ id, name, dob, phone, address, createdAt: new Date().toISOString() });
    setPatients(pts);

    newMsg.textContent = `Patient saved (ID: ${id}).`;
    newMsg.classList.remove('error'); newMsg.classList.add('ok');
    form.reset();
    refreshStats();
    // keep user on create panel
  });

  // ------ Charts ------
  const ctxPatients = document.getElementById('chartPatients').getContext('2d');
  const ctxMix = document.getElementById('chartMix').getContext('2d');

  // Build last 7 days labels + counts from local data
  function lastNDays(n){
    const days = [];
    for(let i=n-1;i>=0;i--){
      const d = new Date(); d.setDate(d.getDate()-i);
      days.push(d);
    }
    return days;
  }
  function countsForDays(days, pts){
    return days.map(d => pts.filter(p => p.createdAt && sameDay(p.createdAt, d)).length);
  }

  const days = lastNDays(7);
  const pts = getPatients();
  const counts = countsForDays(days, pts);

  new Chart(ctxPatients, {
    type: 'line',
    data: {
      labels: days.map(d => d.toLocaleDateString(undefined,{month:'short', day:'numeric'})),
      datasets: [{
        label: 'Patients / day',
        data: counts,
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      plugins: { legend: { display:false } },
      scales: { y: { beginAtZero: true, ticks: { precision:0 } } }
    }
  });

  new Chart(ctxMix, {
    type: 'doughnut',
    data: {
      labels: ['New', 'Follow-up', 'In Treatment'],
      datasets: [{
        data: [40, 35, 25], // demo distribution
      }]
    },
    options: {
      plugins: { legend: { position:'bottom' } },
      cutout: '62%'
    }
  });

  // Initial stats & default panel
  refreshStats();
  activate('create');
})();
