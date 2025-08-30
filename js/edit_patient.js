/**
 * edit_patient.js
 * Controller for editing existing patient records.
 */
(function () {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  const form = document.getElementById('patientForm');
  const msg  = document.getElementById('saveMsg');

  const params = new URLSearchParams(window.location.search);
  const refNo = params.get('refNo');
  if (!refNo) {
    alert('No patient reference provided.');
    window.location.href = 'search.html';
    return;
  }

  const refField = document.getElementById('refNo');
  if (refField) {
    refField.value = refNo;
    refField.readOnly = true;
  }

  const el = (id) => document.getElementById(id);
  const getVal = (id) => (el(id)?.value ?? '').trim();
  const setVal = (id, v) => { const e = el(id); if (e) e.value = v ?? ''; };
  const numOrNull = (v) => (v === '' ? null : Number(v));

  // Initialise Supabase client
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
    console.warn('Supabase client could not be initialised', err);
  }

  function getPatients() {
    try { return JSON.parse(localStorage.getItem('patients_full') || '[]'); }
    catch { return []; }
  }
  function setPatients(list) {
    localStorage.setItem('patients_full', JSON.stringify(list));
  }

  async function loadPatient() {
    let patient = null;
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('patients')
          .select('*')
          .eq('refNo', refNo)
          .single();
        if (!error) patient = data;
      } catch (e) {
        console.error('Error loading patient', e);
      }
    }
    if (!patient) {
      const list = getPatients();
      patient = list.find(p => p.refNo === refNo) || null;
    }
    if (!patient) {
      alert('Patient not found.');
      return;
    }
    setVal('name', patient.name);
    setVal('cast', patient.cast);
    setVal('age', patient.age);
    setVal('date', patient.date ? patient.date.split('T')[0] : '');
    setVal('address', patient.address);
    setVal('mobile', patient.mobile);

    const labs = patient.labs || {};
    setVal('fbs', labs.fbs);
    setVal('rbs', labs.rbs);
    setVal('bMealSugar', labs.bMealSugar);
    setVal('bChol', labs.bChol);
    setVal('ldl', labs.ldl);
    setVal('tg', labs.tg);
    setVal('hdl', labs.hdl);
    setVal('bp', labs.bp);
    setVal('sCreat', labs.sCreat);
    setVal('sUric', labs.sUric);
    setVal('bmi', labs.bmi);
    setVal('spo2', labs.spo2);
    setVal('pulse', labs.pulse);
    setVal('weight', labs.weight);
    setVal('temp', labs.temp);

    const hist = patient.history || {};
    setVal('dmAbove', hist.dm?.value);
    setVal('dmUnit', hist.dm?.unit);
    setVal('bpAbove', hist.bp?.value);
    setVal('bpUnit', hist.bp?.unit);
    setVal('psychAbove', hist.depressionFits?.value);
    setVal('psychUnit', hist.depressionFits?.unit);
    setVal('psychosisAbove', hist.psychosis?.value);
    setVal('psychosisUnit', hist.psychosis?.unit);
    setVal('ckdAbove', hist.ckd?.value);
    setVal('ckdUnit', hist.ckd?.unit);
    setVal('dfAbove', hist.diabeticFoot?.value);
    setVal('dfUnit', hist.diabeticFoot?.unit);
    setVal('others', hist.others);
    if (hist.smoking) {
      const r = document.querySelector(`input[name="smoke"][value="${hist.smoking}"]`);
      if (r) r.checked = true;
    }

    const comp = patient.complaints || {};
    setVal('presentComplaint', comp.present);
    setVal('pastComplaint', comp.past);
    setVal('hoDrugs', comp.hoDrugs);
  }

  loadPatient();

  async function updatePatient(payload) {
    if (!supabaseClient) return false;
    try {
      const { error } = await supabaseClient
        .from('patients')
        .update(payload)
        .eq('refNo', refNo);
      if (error) {
        console.error('Error updating patient', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Unexpected error during Supabase update', err);
      return false;
    }
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: getVal('name'),
        cast: getVal('cast') || null,
        age: numOrNull(getVal('age')),
        date: getVal('date') || null,
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
      };

      let saved = false;
      let dbUpdated = false;
      if (supabaseClient) {
        dbUpdated = await updatePatient(payload);
        saved = dbUpdated;
      }
      if (!saved) {
        const list = getPatients();
        const idx = list.findIndex(p => p.refNo === refNo);
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...payload, refNo };
        } else {
          list.push({ ...payload, refNo });
        }
        setPatients(list);
        saved = true;
      }

      if (msg) {
        if (dbUpdated) {
          msg.textContent = 'Patient updated in database.';
          msg.classList.remove('error'); msg.classList.add('ok');
        } else if (supabaseClient) {
          msg.textContent = 'Database update failed; patient saved locally.';
          msg.classList.remove('ok'); msg.classList.add('error');
        } else {
          msg.textContent = 'Patient updated locally (offline demo).';
          msg.classList.remove('error'); msg.classList.add('ok');
        }
      }
    });

    form.addEventListener('reset', () => {
      setTimeout(loadPatient, 0);
    });
  }

  // Reuse print logic from patient_form.js
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
