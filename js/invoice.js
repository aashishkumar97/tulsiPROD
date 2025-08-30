// invoice.js
//
// This script powers the invoice form for Tulsi Sugar Care Clinic. It
// generates sequential invoice numbers, saves invoices into Supabase
// (if configured), and produces a thermal receipt as a PDF using jsPDF.
// The receipt now uses a 3″ width with **dynamic height** so the footer
// never gets cut off when many items are selected. The payer field starts
// empty so the user's entry (e.g., patient name) is always used.

(function () {
  // Grab form controls
  const invEl       = document.getElementById('invoiceNo');
  const dateEl      = document.getElementById('invoiceDate');
  const receivedEl  = document.getElementById('receivedFrom');
  const doctorEl    = document.getElementById('doctorName');
  const rsBottomEl  = document.getElementById('rsBottom');
  const printBtn    = document.getElementById('printPage');
  const resetBtn    = document.getElementById('resetForm');
  const downloadBtn = document.getElementById('downloadPdf');
  const form        = document.getElementById('invoiceForm');
  const refreshBtn  = document.getElementById('refreshPage');
  // Status message element to show validation errors or success messages
  const msg         = document.getElementById('msg');
  const patientListEl = document.getElementById('patientList');
  let patients = [];
  let selectedPatientRef = null;

  // Initialise Supabase client if available. You may replace these
  // placeholders with your own credentials or use a global client.
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
    console.warn('Supabase client could not be initialised for invoices', err);
  }

  // ----- Patient search helpers -----
  function getLocalPatients() {
    let list = [];
    try {
      const full = JSON.parse(localStorage.getItem('patients_full') || '[]');
      list = list.concat(full);
    } catch {}
    try {
      const demo = JSON.parse(localStorage.getItem('patients') || '[]');
      list = list.concat(demo.map(p => ({ refNo: p.id, name: p.name })));
    } catch {}
    return list;
  }

  async function loadPatients() {
    patients = [];
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('patients')
          .select('refNo, name');
        if (!error && data) patients = data;
      } catch (e) {
        console.error('Error loading patients', e);
      }
    }
    if (!patients.length) {
      patients = getLocalPatients();
    }
    if (patientListEl) {
      patientListEl.innerHTML = '';
      patients.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        patientListEl.appendChild(opt);
      });
    }
  }

  function matchPatientName(name) {
    const m = patients.find(p => (p.name || '').toLowerCase() === name.toLowerCase());
    selectedPatientRef = m ? m.refNo : null;
  }

  function handlePatientBlur() {
    const name = receivedEl.value.trim();
    if (!name) { selectedPatientRef = null; return; }
    matchPatientName(name);
    if (!selectedPatientRef) {
      if (window.confirm(`Patient "${name}" not found. Save patient?`)) {
        saveDraft();
        const params = new URLSearchParams({ from: 'invoice', name });
        window.location.href = `patient_form.html?${params.toString()}`;
      }
    }
  }

  // ----- Draft helpers -----
  function getFormState() {
    const items = [];
    document.querySelectorAll('#serviceItems tr').forEach(tr => {
      const chk     = tr.querySelector('.svc-check');
      const labelEl = tr.querySelector('.svc-label');
      const amtEl   = tr.querySelector('.svc-amt');
      items.push({
        checked: chk?.checked || false,
        label: labelEl ? labelEl.value : tr.cells[1].textContent.trim(),
        custom: !!labelEl,
        amt: amtEl?.value || ''
      });
    });
    return {
      invoiceNo   : invEl.value,
      date        : dateEl.value,
      receivedFrom: receivedEl.value,
      doctorName  : doctorEl?.value || '',
      rsBottom    : rsBottomEl?.value || '',
      items
    };
  }

  function saveDraft() {
    localStorage.setItem('INVOICE_DRAFT', JSON.stringify(getFormState()));
  }

  function loadDraft() {
    const raw = localStorage.getItem('INVOICE_DRAFT');
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.invoiceNo) invEl.value = d.invoiceNo;
      if (d.date) dateEl.value = d.date;
      if (d.receivedFrom) receivedEl.value = d.receivedFrom;
      if (d.doctorName) doctorEl.value = d.doctorName;
      if (d.rsBottom) rsBottomEl.value = d.rsBottom;
      if (Array.isArray(d.items)) {
        document.querySelectorAll('#serviceItems tr').forEach((tr, i) => {
          const it = d.items[i];
          if (!it) return;
          const chk = tr.querySelector('.svc-check');
          const labelEl = tr.querySelector('.svc-label');
          const amtEl = tr.querySelector('.svc-amt');
          if (chk) chk.checked = it.checked;
          if (labelEl && it.custom) labelEl.value = it.label;
          if (amtEl) amtEl.value = it.amt;
        });
      }
    } catch (e) {
      console.error('Error loading invoice draft', e);
    }
  }

  function clearDraft() {
    localStorage.removeItem('INVOICE_DRAFT');
  }

  // Return today's date in yyyy-mm-dd (local)
  function todayISOLocal() {
    const d = new Date();
    const tzOffMs = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - tzOffMs);
    return local.toISOString().slice(0, 10);
  }

  // Generate next invoice number using a daily counter in localStorage
  function nextInvoiceNumber() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `inv_counter_${y}${m}${day}`;
    const current = parseInt(localStorage.getItem(key) || '0', 10) + 1;
    localStorage.setItem(key, String(current));
    return `INV-${y}${m}${day}-${String(current).padStart(3, '0')}`;
  }

  // Ensure invoice number and date fields are set
  function ensureMeta() {
    if (!dateEl.value) dateEl.value = todayISOLocal();
    if (!invEl.value)  invEl.value  = nextInvoiceNumber();
    invEl.readOnly = true;
  }

  // Initialize meta and restore draft/patients on load
  function init() {
    form?.reset();
    ensureMeta();
    loadDraft();
    const last = localStorage.getItem('LAST_PATIENT');
    if (last) {
      try {
        const p = JSON.parse(last);
        receivedEl.value = p.name || '';
        selectedPatientRef = p.refNo || null;
      } catch {}
      localStorage.removeItem('LAST_PATIENT');
    } else {
      receivedEl.value = '';
      selectedPatientRef = null;
    }
    loadPatients().then(() => {
      matchPatientName(receivedEl.value.trim());
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // On form reset: clear invoice number/date then regenerate and reset payer
  resetBtn?.addEventListener('click', () => {
    setTimeout(() => {
      invEl.value = '';
      dateEl.value = '';
      ensureMeta();
      receivedEl.value = '';
      selectedPatientRef = null;
      clearDraft();
    }, 0);
  });

  refreshBtn?.addEventListener('click', () => {
    clearDraft();
    window.location.reload();
  });

  // Removed automatic draft saving to keep form blank when revisiting

  receivedEl?.addEventListener('input', () => {
    matchPatientName(receivedEl.value.trim());
  });
  receivedEl?.addEventListener('blur', handlePatientBlur);

  // Collect selected service items into an array
  function collectItems() {
    const items = [];
    document.querySelectorAll('#serviceItems tr').forEach(tr => {
      const chk     = tr.querySelector('.svc-check');
      const labelEl = tr.querySelector('.svc-label');
      const amtEl   = tr.querySelector('.svc-amt');
      if (chk?.checked) {
        const label = (labelEl ? (labelEl.value || 'Other') : tr.cells[1].textContent).trim();
        const amt   = parseFloat(amtEl?.value || '0') || 0;
        items.push({ label, amt });
      }
    });
    return items;
  }

  // Convert a number to words using Indian numbering. Always appends "Rupees Only".
  function numberToWordsINR(num) {
    num = Math.floor(Number(num) || 0);
    if (num === 0) return 'Zero Rupees Only';
    const below20 = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function twoDigits(n) {
      if (n < 20) return below20[n];
      const t = Math.floor(n / 10);
      const r = n % 10;
      return tens[t] + (r ? ' ' + below20[r] : '');
    }
    function threeDigits(n) {
      const h = Math.floor(n / 100);
      const r = n % 100;
      return (h ? below20[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? twoDigits(r) : '');
    }
    let remainder = num;
    const crore    = Math.floor(remainder / 10000000);
    remainder     %= 10000000;
    const lakh     = Math.floor(remainder / 100000);
    remainder     %= 100000;
    const thousand = Math.floor(remainder / 1000);
    remainder     %= 1000;
    const rest     = remainder;
    const parts = [];
    if (crore)    parts.push(threeDigits(crore)   + ' Crore');
    if (lakh)     parts.push(threeDigits(lakh)    + ' Lakh');
    if (thousand) parts.push(threeDigits(thousand)+ ' Thousand');
    if (rest)     parts.push(threeDigits(rest));
    return parts.join(' ') + ' Rupees Only';
  }

  // Load the logo as DataURL and return its natural size
  async function getLogoDataUrl() {
    try {
      const logoPathInput = document.getElementById('logoPath');
      const logoPath = logoPathInput?.value || '../images/logo.png';
      const res = await fetch(logoPath);
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const img = new Image();
          img.onload = () =>
            resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ dataUrl, width: 0, height: 0 });
          img.src = dataUrl;
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('Unable to load logo for PDF', err);
      return null;
    }
  }

  /**
   * Create a 3″-wide receipt PDF with **dynamic height** so the footer
   * never gets cut off. Optionally auto-print via a hidden iframe.
   *
   * @param {Object} payload Invoice data
   * @param {boolean} autoPrint If true, opens the print dialog automatically
   */
  async function generateReceiptPdf(payload, autoPrint = false) {
    if (!window.jspdf) {
      console.warn('jsPDF library not loaded; cannot generate PDF');
      return;
    }
    const { jsPDF } = window.jspdf;
    const logoData = await getLogoDataUrl();

    // Compute sums
    const sum = (payload.items || []).reduce((s, r) => s + (Number(r.amt) || 0), 0);
    const bottom = (payload.rsBottom !== undefined && payload.rsBottom !== null && payload.rsBottom !== '')
      ? Number(payload.rsBottom)
      : sum;
    const sumWords = numberToWordsINR(Math.round(bottom));

    // ---------- Measure required height ----------
    const pdfWidth = 76.2;        // ≈ 3 inches
    const measurer = new jsPDF({ unit: 'mm', format: [pdfWidth, 200], orientation: 'portrait' });

    // Use the same font sizes as we will when rendering
    const baseFontSize = 8;
    measurer.setFont('helvetica', 'bold');
    measurer.setFontSize(baseFontSize);

    const wordsWrapped_m = measurer.splitTextToSize(sumWords, pdfWidth - 16);
    const addressText    = 'Near Agha Khan Laboratory VIP Road Larkana';
    const addrWrapped_m  = measurer.splitTextToSize(addressText, pdfWidth - 26);

    let yNeeded = 10; // top margin

    // Logo estimation
    if (logoData?.dataUrl) {
      const logoMaxWidth = 35, logoMaxHeight = 20;
      let lw = logoMaxWidth;
      let lh = lw * (logoData.height ? logoData.height / logoData.width : 1);
      if (lh > logoMaxHeight) { lh = logoMaxHeight; lw = lh * (logoData.width ? logoData.width / logoData.height : 1); }
      yNeeded += lh + 8;
    }

    // Invoice number line
    yNeeded += 6;
    // Date line
    yNeeded += 6;
    // "Received with Thanks from:" + value
    yNeeded += 6 + 8;
    // "On Account of:" header
    yNeeded += 6;
    // Items (6mm per item, min one line)
    yNeeded += (payload.items?.length ? 6 * payload.items.length : 6);
    // Totals block
    yNeeded += 4 + 6 + 6;
    // Amount in words (smaller font, 5mm per line)
    yNeeded += 5 * (wordsWrapped_m.length || 1);
    // Signature line block
    yNeeded += 6 + 8;
    // Clinic name
    yNeeded += 6;
    // Address (centered)
    yNeeded += 5 * (addrWrapped_m.length || 1);
    // Bottom margin
    yNeeded += 6;

    // Minimum 5" tall; otherwise expand as needed
    const pdfHeight = Math.max(127, Math.ceil(yNeeded));

    // ---------- Render with the computed height ----------
    const doc = new jsPDF({ unit: 'mm', format: [pdfWidth, pdfHeight], orientation: 'portrait' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(baseFontSize);

    const wordsWrapped = doc.splitTextToSize(sumWords, pdfWidth - 16);
    const addrWrapped  = doc.splitTextToSize(addressText, pdfWidth - 26);

    let y = 10; // generous top margin

    // Logo (keep aspect ratio)
    if (logoData?.dataUrl) {
      const logoMaxWidth = 35, logoMaxHeight = 20;
      let lw = logoMaxWidth;
      let lh = lw * (logoData.height ? logoData.height / logoData.width : 1);
      if (lh > logoMaxHeight) { lh = logoMaxHeight; lw = lh * (logoData.width ? logoData.width / logoData.height : 1); }
      const xLogo = (pdfWidth - lw) / 2;
      doc.addImage(logoData.dataUrl, 'PNG', xLogo, y, lw, lh);
      y += lh + 8;
    }

    // Invoice number
    doc.text('Invoice No:', 5, y);
    doc.text(String(payload.invoiceNo || ''), pdfWidth - 5, y, { align: 'right' });
    y += 6;

    // Date with time (Larkana, Pakistan)
    doc.text('Date:', 5, y);
    const baseDate = payload.date ? new Date(payload.date + 'T00:00:00') : new Date();
    const timeSrc  = payload.generatedAt ? new Date(payload.generatedAt) : new Date();
    const dateStr  = `${baseDate.toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })} ${timeSrc.toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour12: false })}`;
    doc.text(dateStr, pdfWidth - 5, y, { align: 'right' });
    y += 6;

    // Payer
    doc.text('Received with Thanks from:', 5, y);
    y += 6;
    doc.text(String(payload.patientName || ''), 5, y);
    y += 8;

    // Items header
    doc.text('On Account of:', 5, y);
    y += 6;

    // Items list
    if (payload.items && payload.items.length) {
      payload.items.forEach(item => {
        const label = item.label || '—';
        const amt   = Number(item.amt) || 0;
        const line  = '\u2022 ' + label + ' - Rs ' + amt.toFixed(2);
        doc.text(line, 5, y);
        y += 6;
      });
    } else {
      doc.text('\u2022 —', 5, y);
      y += 6;
    }

    // Totals
    y += 4;
    doc.text('Sum of Rs', 5, y);
    doc.text(sum.toFixed(2), pdfWidth - 5, y, { align: 'right' });
    y += 6;
    doc.text('Rupees', 5, y);
    doc.text(bottom.toFixed(2), pdfWidth - 5, y, { align: 'right' });
    y += 6;

    // Amount in words (smaller)
    doc.setFontSize(7);
    wordsWrapped.forEach(line => {
      doc.text(line, pdfWidth - 5, y, { align: 'right' });
      y += 5;
    });
    doc.setFontSize(baseFontSize);

    // Signature line
    y += 6;
    const sigWidth = 32;
    const sigX = (pdfWidth - sigWidth) / 2;
    doc.setLineWidth(0.2);
    doc.line(sigX, y, sigX + sigWidth, y);
    y += 8;

    // Clinic name
    doc.text('Tulsi Sugar Care Clinic', pdfWidth / 2, y, { align: 'center' });
    y += 6;

    // Address
    doc.setFontSize(8);
    addrWrapped.forEach(line => {
      doc.text(line, pdfWidth / 2, y, { align: 'center' });
      y += 5;
    });

    // Output: print or save
    if (autoPrint) {
      if (typeof doc.autoPrint === 'function') {
        doc.autoPrint();
      }
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try { iframe.contentWindow.focus(); } catch(e) {}
        try { iframe.contentWindow.print(); } catch(e) {}
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      };
      iframe.src = url;
    } else {
      doc.save(`${payload.invoiceNo || 'receipt'}.pdf`);
    }
  }

  /**
   * Collect form data, store it locally, optionally store in Supabase and
   * generate a PDF. If autoPrint is true, the PDF will trigger the print dialog.
   * @param {boolean} autoPrint
   */
  async function openReceipt(autoPrint = false) {
    const items     = collectItems();
    const doctor    = doctorEl?.value?.trim() || '';
    const rsVal     = rsBottomEl?.value;
    matchPatientName(receivedEl.value.trim());
    // Build payload matching the invoices table schema
    const payload = {
      invoiceNo    : invEl.value,
      date         : dateEl.value || todayISOLocal(),
      patientName  : receivedEl.value.trim(),
      patient_refNo: selectedPatientRef,
      doctorName   : doctor || null,
      items        : items,
      rsBottom     : (rsVal !== undefined && rsVal !== null && rsVal !== '') ? Number(rsVal) : null,
    };

    // Validation: Require the patient to be selected from saved records
    if (!payload.patientName || !payload.patient_refNo) {
      if (msg) {
        msg.textContent = 'Please select a saved patient using the search field.';
        msg.classList.remove('ok'); msg.classList.add('error');
      }
      return;
    } else if (msg) {
      msg.textContent = '';
      msg.classList.remove('error'); msg.classList.remove('ok');
    }
    // Save to localStorage so a different page could access it if needed
    localStorage.setItem('RECEIPT_DATA', JSON.stringify(payload));
    // Save to Supabase if client is configured
    if (supabaseClient) {
      try {
        const { data: existing, error: fetchErr } = await supabaseClient
          .from('invoices')
          .select('invoiceNo')
          .eq('invoiceNo', payload.invoiceNo);
        if (!fetchErr && (!existing || existing.length === 0)) {
          const { error: insertErr } = await supabaseClient.from('invoices').insert([payload]);
          if (insertErr) {
            console.error('Error saving invoice', insertErr);
          } else if (msg) {
            msg.textContent = 'Invoice saved to database.';
            msg.classList.remove('error'); msg.classList.add('ok');
          }
        }
      } catch (err) {
        console.error('Unexpected error saving invoice', err);
      }
    } else if (msg) {
      msg.textContent = 'Invoice saved locally.';
      msg.classList.remove('error'); msg.classList.add('ok');
    }
    if (autoPrint) {
      await generateReceiptPdf(payload, true);
    } else {
      await generateReceiptPdf(payload, false);
    }
    form?.reset();
    ensureMeta();
    receivedEl.value = '';
    selectedPatientRef = null;
    clearDraft();
  }

  // Hook up buttons
  // Ensure database save occurs before printing/downloading
  printBtn?.addEventListener('click', async () => {
    await openReceipt(true);
  });
  downloadBtn?.addEventListener('click', async () => {
    await openReceipt(false);
  });
})();
