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
    search: document.getElementById('panelSearch'),
    invoice: document.getElementById('panelInvoice')
  };
  const navBtns = {
    search: document.getElementById('navSearch'),
    invoice: document.getElementById('navInvoice')
  };
  function activate(which){
    Object.values(panels).forEach(p => p.classList.add('hidden'));
    Object.values(navBtns).forEach(b => b.classList.remove('active'));
    panels[which]?.classList.remove('hidden');
    navBtns[which]?.classList.add('active');
  }
  // Override the Search click to open the dedicated search page instead of toggling a panel
  navBtns.search?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'search.html';
  });
  navBtns.invoice?.addEventListener('click', () => activate('invoice'));

  // ------ Local demo patient store (from earlier form) ------
  function getPatients(){ try { return JSON.parse(localStorage.getItem('patients') || '[]'); } catch { return []; } }
  function setPatients(list){ localStorage.setItem('patients', JSON.stringify(list)); }

  function sameDay(a,b){
    const da = new Date(a), db = new Date(b);
    return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate();
  }

  function refreshStatsLocal(){
    const pts = getPatients();
    const today = new Date();
    const todayCount = pts.filter(p => p.createdAt && sameDay(p.createdAt, today)).length;
    const total = pts.length;

    document.getElementById('statToday').textContent = todayCount;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statInvoices').textContent = '0';
  }

  async function refreshStats(){
    if (window.supabaseClient) {
      try {
        const pkDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
        const startUtc = new Date(`${pkDate}T00:00:00+05:00`).toISOString();
        const endUtc   = new Date(`${pkDate}T23:59:59+05:00`).toISOString();

        const { count: todayCount } = await window.supabaseClient
          .from('patients')
          .select('*', { count: 'exact', head: true })
          .gte('createdAt', startUtc)
          .lt('createdAt', endUtc);

        const { count: totalCount } = await window.supabaseClient
          .from('patients')
          .select('*', { count: 'exact', head: true });

        const { count: invoiceCount } = await window.supabaseClient
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('date', pkDate);

        document.getElementById('statToday').textContent   = todayCount ?? 0;
        document.getElementById('statTotal').textContent   = totalCount ?? 0;
        document.getElementById('statInvoices').textContent = invoiceCount ?? 0;
        return;
      } catch (err) {
        console.error('Error fetching stats from Supabase', err);
      }
    }
    refreshStatsLocal();
  }

  // ------ New patient form ------
  const form = document.getElementById('newPatientForm');
  const newMsg = document.getElementById('newMsg');
  if (form) {
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
  }

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
})();
