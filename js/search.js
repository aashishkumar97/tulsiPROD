(function () {
  // Grab page elements
  const searchInput = document.getElementById('searchInput');
  const searchBtn   = document.getElementById('searchBtn');
  const searchMsg   = document.getElementById('searchMsg');
  const resultsEl   = document.getElementById('results');
  const detailEl    = document.getElementById('detailContent');

  // Initialise Supabase client if available. These fallback credentials
  // mirror those used elsewhere in the project. If you have different
  // project credentials, update supabase-client.js accordingly.
  const SUPABASE_URL = 'https://dxypmfzpeeovghrzmmnq.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4eXBtZnpwZWVvdmdocnptbW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MjgwNzAsImV4cCI6MjA3MjAwNDA3MH0.MRuGQCxuSCSiemaRag3hUMftypgizDJQXLGpCdEmi8U';
  let supabaseClient = null;
  try {
    if (window.supabaseClient) {
      supabaseClient = window.supabaseClient;
    } else if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  } catch (err) {
    console.warn('Supabase client could not be initialised for search', err);
  }

  // Local storage helpers (used if supabase is not configured)
  function getLocalPatients() {
    let list = [];
    // patient_form.js stores full patient objects under 'patients_full'
    try {
      const full = JSON.parse(localStorage.getItem('patients_full') || '[]');
      list = list.concat(full);
    } catch {}
    // dashboard.js demo stores simplified patients under 'patients'
    try {
      const demo = JSON.parse(localStorage.getItem('patients') || '[]');
      // Normalise demo entries to have a name property; reuse id as refNo
      list = list.concat(
        demo.map(p => ({
          refNo: p.id,
          name: p.name,
          age: null,
          date: p.dob,
          address: p.address,
          mobile: p.phone,
          createdAt: p.createdAt
        }))
      );
    } catch {}
    return list;
  }

  // Fetch patients from Supabase or local storage based on the search term
  async function fetchPatients(term) {
    const trimmed = term.trim();
    if (!trimmed) return [];
    // Supabase search
    if (supabaseClient) {
      try {
        // Use ilike for case-insensitive matching; wrap term with wildcards
        const { data: patients, error } = await supabaseClient
          .from('patients')
          .select('*')
          .ilike('name', `%${trimmed}%`);
        if (error) {
          console.error('Error searching patients', error);
          return [];
        }
        return patients || [];
      } catch (err) {
        console.error('Unexpected error searching patients', err);
        return [];
      }
    }
    // Fallback: filter local storage list by name (case-insensitive)
    const pts = getLocalPatients();
    return pts.filter(p => (p.name || '').toLowerCase().includes(trimmed.toLowerCase()));
  }

  // Fetch invoices for a given patient name. If supabase isn't configured,
  // an empty array is returned.
  async function fetchInvoicesForPatient(name) {
    if (supabaseClient) {
      try {
        const { data: invoices, error } = await supabaseClient
          .from('invoices')
          .select('*')
          .eq('patientName', name);
        if (error) {
          console.error('Error fetching invoices for', name, error);
          return [];
        }
        return invoices || [];
      } catch (err) {
        console.error('Unexpected error fetching invoices for', name, err);
        return [];
      }
    }
    // Local fallback: we do not have multiple invoices stored locally
    return [];
  }

  async function renderDetail(patient) {
    if (!patient) {
      detailEl.innerHTML = '';
      return;
    }
    detailEl.innerHTML = '';

    const header = document.createElement('h3');
    header.textContent = patient.name || '(Unnamed)';
    detailEl.appendChild(header);

    const dl = document.createElement('dl');
    function addDetail(label, value) {
      if (value !== undefined && value !== null && value !== '') {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
    }
    addDetail('Ref No', patient.refNo || patient.id || '');
    addDetail('Age', patient.age);
    if (patient.date) {
      try {
        const dtObj = new Date(patient.date);
        addDetail('Date', dtObj.toLocaleDateString());
      } catch {
        addDetail('Date', patient.date);
      }
    }
    addDetail('Address', patient.address || '');
    addDetail('Mobile', patient.mobile || patient.phone || '');
    detailEl.appendChild(dl);

    // Helper to create a table of key/value pairs
    function renderTable(obj, title) {
      const header = document.createElement('h4');
      header.textContent = title;
      header.style.marginTop = '12px';
      detailEl.appendChild(header);
      const table = document.createElement('table');
      table.className = 'detail-table';
      const tbody = document.createElement('tbody');
      table.appendChild(tbody);
      Object.entries(obj).forEach(([key, val]) => {
        if (val === undefined || val === null || val === '') return;
        const row = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
        const td = document.createElement('td');
        td.textContent = val;
        row.appendChild(th);
        row.appendChild(td);
        tbody.appendChild(row);
      });
      detailEl.appendChild(table);
    }

    // Labs
    const labs = patient.labs || {};
    if (Object.keys(labs).length > 0) {
      renderTable(labs, 'Labs & Vitals');
    }

    // History
    const hist = patient.history || {};
    if (Object.keys(hist).length > 0) {
      const histObj = {};
      for (const [key, data] of Object.entries(hist)) {
        if (data && typeof data === 'object' && 'value' in data) {
          if (data.value === null || data.value === undefined || data.value === '') continue;
          histObj[key] = data.value + (data.unit ? ` ${data.unit}` : '');
        } else if (data !== null && data !== undefined && data !== '') {
          histObj[key] = data;
        }
      }
      if (Object.keys(histObj).length > 0) {
        renderTable(histObj, 'History');
      }
    }

    // Invoices
    const invHeader = document.createElement('h4');
    invHeader.textContent = 'Invoices';
    invHeader.style.marginTop = '12px';
    detailEl.appendChild(invHeader);
    const invList = document.createElement('ul');
    invList.className = 'invoice-list';
    const invoices = await fetchInvoicesForPatient(patient.name);
    if (invoices && invoices.length > 0) {
      invoices.forEach(inv => {
        const li = document.createElement('li');
        let total = inv.rsBottom;
        if (total === undefined || total === null) {
          total = (inv.items || []).reduce((s, r) => s + (Number(r.amt) || 0), 0);
        }
        li.textContent = `${inv.invoiceNo || '(no #)'} – ${inv.date || ''} – Rs ${total}`;
        invList.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'No invoices.';
      invList.appendChild(li);
    }
    detailEl.appendChild(invList);

    // --- Edit button ---
    if (patient.refNo) {
      const editBtn = document.createElement('a');
      editBtn.textContent = 'Edit Patient';
      editBtn.className = 'btn btn-cta';
      editBtn.style.marginTop = '12px';
      editBtn.href = `editpatient.html?refNo=${encodeURIComponent(patient.refNo)}`;
      detailEl.appendChild(editBtn);
    }
  }

  function renderResults(patients) {
    resultsEl.innerHTML = '';
    detailEl.innerHTML = '';
    if (!patients || patients.length === 0) {
      searchMsg.textContent = 'No patients found.';
      searchMsg.classList.remove('ok');
      searchMsg.classList.add('error');
      return;
    }
    searchMsg.textContent = '';
    searchMsg.classList.remove('error');
    searchMsg.classList.remove('ok');

    patients.forEach(patient => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'result-item';
      btn.textContent = patient.name || '(Unnamed)';
      btn.addEventListener('click', () => renderDetail(patient));
      li.appendChild(btn);
      resultsEl.appendChild(li);
    });
  }

  // Click handler: perform the search
  searchBtn?.addEventListener('click', async () => {
    const term = searchInput.value || '';
    searchMsg.textContent = '';
    searchMsg.classList.remove('error');
    searchMsg.classList.remove('ok');
    resultsEl.innerHTML = '';

    if (!term.trim()) {
      searchMsg.textContent = 'Please enter a name to search.';
      searchMsg.classList.add('error');
      return;
    }
    searchMsg.textContent = 'Searching...';
    const patients = await fetchPatients(term);
    renderResults(patients);
  });
})();