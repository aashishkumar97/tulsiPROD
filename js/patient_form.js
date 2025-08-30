// patient_form.js — HTML/CSS print flow (no pdf-lib needed)

/**
 * patient_form.js
 *
 * This controller handles the patient entry form. It collects form values,
 * performs basic validation and saves the record into your Supabase table.
 * A fallback to localStorage is retained for offline usage or initial demos,
 * but priority is given to the remote database when credentials are provided.
 */
(function () {
  // Footer year
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  const form = document.getElementById('patientForm');
  const msg  = document.getElementById('saveMsg');
  // Set the date input default to today's date if not already set.
  const dateInput = document.getElementById('date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Generate a unique patient reference number. Format: TCC-yymmdd-<random>
  function generatePatientRef() {
    const now = new Date();
    const dateSegment = now.toISOString().slice(2, 10).replace(/-/g, '');
    const randSegment = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `TCC-${dateSegment}-${randSegment}`;
  }

  // Set a new reference number on the refNo field and mark it read-only
  function generateAndSetRef() {
    const refField = document.getElementById('refNo');
    if (refField) {
      refField.value = generatePatientRef();
      refField.readOnly = true;
    }
  }

  // Immediately populate the ref number when the form is loaded
  generateAndSetRef();

  const el = (id) => document.getElementById(id);
  const getVal = (id) => (el(id)?.value ?? '').trim();
  const numOrNull = (v) => (v === '' ? null : Number(v));

  // Initialize Supabase client
  // Prefer an existing global client (window.supabaseClient) created in
  // supabase-client.js. If unavailable, fall back to creating a new client
  // using placeholders. You must replace SUPABASE_URL and SUPABASE_KEY with
  // your actual project credentials for the database to work.
  // Fallback credentials – if no global client exists, these values
  // allow a direct connection to the Supabase project. These are the
  // same URL and anon key defined in supabase-client.js.
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
    // If supabase library isn't loaded, supabaseClient remains null.
    console.warn('Supabase client could not be initialised', err);
  }

  // ---- Local storage helpers (used if supabase is not configured) ----
  function getPatients() {
    try { return JSON.parse(localStorage.getItem('patients_full') || '[]'); }
    catch { return []; }
  }
  function setPatients(list) {
    localStorage.setItem('patients_full', JSON.stringify(list));
  }

  // Save a patient record to Supabase. Returns true on success, false on error.
  async function savePatientToSupabase(payload) {
    if (!supabaseClient) return false;
    try {
      // Check for duplicate refNo
      const { data: existing, error: fetchError } = await supabaseClient
        .from('patients')
        .select('refNo')
        .eq('refNo', payload.refNo);
      if (fetchError) {
        console.error('Error checking existing refNo', fetchError);
        return false;
      }
      if (existing && existing.length > 0) {
        if (msg) {
          msg.textContent = 'Reference # already exists in database. Please use a unique value.';
          msg.classList.remove('ok'); msg.classList.add('error');
        }
        return false;
      }
      // Insert new record
      const { error } = await supabaseClient.from('patients').insert([payload]);
      if (error) {
        console.error('Error inserting patient', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Unexpected error during Supabase insert', err);
      return false;
    }
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
        refNo: getVal('refNo'),
        name: getVal('name'),
        cast: getVal('cast') || null,
        age: numOrNull(getVal('age')),
        date: getVal('date'),
        address: getVal('address') || null,
        mobile: getVal('mobile') || null,

        labs: {
          fbs: numOrNull(getVal('fbs')),
          rbs: numOrNull(getVal('rbs')),
          bMealSugar: numOrNull(getVal('bMealSugar')),
          bChol: numOrNull(getVal('bChol')),
          ldl: numOrNull(getVal('ldl')),
          tg: numOrNull(getVal('tg')),
          hdl: numOrNull(getVal('hdl')),
          bp: getVal('bp') || null,
          sCreat: numOrNull(getVal('sCreat')),
          sUric: numOrNull(getVal('sUric')),
          bmi: numOrNull(getVal('bmi')),
          spo2: numOrNull(getVal('spo2')),
          pulse: numOrNull(getVal('pulse')),
          weight: numOrNull(getVal('weight')),
          temp: getVal('temp') || null,
        },

        history: {
          dm: { value: numOrNull(getVal('dmAbove')), unit: getVal('dmUnit') || null },
          bp: { value: numOrNull(getVal('bpAbove')), unit: getVal('bpUnit') || null },
          depressionFits: { value: numOrNull(getVal('psychAbove')), unit: getVal('psychUnit') || null },
          psychosis: { value: numOrNull(getVal('psychosisAbove')), unit: getVal('psychosisUnit') || null },
          ckd: { value: numOrNull(getVal('ckdAbove')), unit: getVal('ckdUnit') || null },
          diabeticFoot: { value: numOrNull(getVal('dfAbove')), unit: getVal('dfUnit') || null },
          others: getVal('others') || null,
          smoking: (document.querySelector('input[name="smoke"]:checked')?.value) || null,
        },

        complaints: {
          present: getVal('presentComplaint') || null,
          past: getVal('pastComplaint') || null,
          hoDrugs: getVal('hoDrugs') || null,
        },

        createdAt: new Date().toISOString(),
      };

      // Require Full Name, Age and Mobile number for saving
      if (!payload.name || !payload.age || !payload.mobile) {
        if (msg) {
          msg.textContent = 'Please fill Full Name, Age, and Mobile no.';
          msg.classList.remove('ok'); msg.classList.add('error');
        }
        return;
      }

      // Try to save to Supabase. If credentials are not set or error occurs,
      // fall back to local storage.
      let saved = false;
      if (supabaseClient) {
        saved = await savePatientToSupabase(payload);
      }
      if (!saved) {
        // Fallback to local storage with duplicate check
        const list = getPatients();
        if (list.some(p => p.refNo === payload.refNo)) {
          if (msg) {
            msg.textContent = 'Reference # already exists. Please use a unique value.';
            msg.classList.remove('ok'); msg.classList.add('error');
          }
          return;
        }
        list.push(payload);
        setPatients(list);
        saved = true;
      }

      if (saved && msg) {
        msg.textContent = supabaseClient ? 'Patient saved to database.' : 'Patient saved locally (offline demo).';
        msg.classList.remove('error'); msg.classList.add('ok');
      }
      // Reset the form and generate a new reference number for the next patient
      form.reset();
      generateAndSetRef();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Whenever the form is reset manually, generate a new reference number
    form.addEventListener('reset', () => {
      generateAndSetRef();
    });
  }

  // ---- Print: stash values → open prescription.html ----
  const printBtn = document.getElementById('printPrescription');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const ids = [
        'refNo','date','name','age','cast','address','mobile',
        'dmAbove','dmUnit','bpAbove','bpUnit','psychAbove','psychUnit',
        'psychosisAbove','psychosisUnit','ckdAbove','ckdUnit','dfAbove','dfUnit',
        'others','bp','pulse','temp','spo2','fbs','rbs','bMealSugar','bChol','ldl','tg','hdl',
        'sCreat','sUric','bmi','weight','presentComplaint','pastComplaint','hoDrugs'
      ];
      const data = {};
      ids.forEach(id => data[id] = (document.getElementById(id)?.value ?? '').trim());
      data.smoke = document.querySelector('input[name="smoke"]:checked')?.value ?? '';
      if (!data.date) data.date = new Date().toLocaleDateString();

      sessionStorage.setItem('tcc_prescription', JSON.stringify(data));
      window.open('prescription.html', '_blank');
    });
  }
})();
