// invoice.js
//
// Handles generation of invoice numbers, stores invoice records in Supabase
// (if configured) and produces thermal‑style receipts as PDF using jsPDF.
// The PDF height is calculated dynamically based on the content so that
// receipts end cleanly instead of leaving a long blank tail. The payer
// defaults to the doctor (patient selection has been removed).

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

  // Initialise Supabase client if credentials are available. If you have a
  // globally initialised client (window.supabaseClient), that will be used.
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

  /**
   * Get a local ISO date (yyyy-mm-dd) in the user's timezone. Used
   * for populating the date <input> so that the correct day is shown.
   */
  function todayISOLocal() {
    const d = new Date();
    const tzOffMs = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - tzOffMs);
    return local.toISOString().slice(0, 10);
  }

  /**
   * Generate the next invoice number. This uses localStorage to persist a
   * counter per day, ensuring numbers increment across reloads. Format:
   * INV-YYYYMMDD-XXX. Resets each day.
   */
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

  /**
   * Ensure the invoice number and date fields are populated. Invoice
   * numbers are read‑only once set.
   */
  function ensureMeta() {
    if (!dateEl.value) dateEl.value = todayISOLocal();
    if (!invEl.value)  invEl.value  = nextInvoiceNumber();
    invEl.readOnly = true;
  }

  // On first load populate meta fields and default the payer to the doctor
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureMeta();
      receivedEl.value = doctorEl?.value || '';
    });
  } else {
    ensureMeta();
    receivedEl.value = doctorEl?.value || '';
  }

  // Mirror doctor name into the "Received from" field when changed
  doctorEl?.addEventListener('input', () => {
    receivedEl.value = doctorEl.value || '';
  });

  // Regenerate invoice number and date on reset
  resetBtn?.addEventListener('click', () => {
    setTimeout(() => {
      invEl.value = '';
      dateEl.value = '';
      ensureMeta();
      receivedEl.value = doctorEl?.value || '';
    }, 0);
  });

  /**
   * Collect selected service items from the form. Each item includes a label
   * and amount. Only checked items are returned.
   */
  function collectItems() {
    const items = [];
    document.querySelectorAll('#serviceItems tr').forEach(tr => {
      const chk = tr.querySelector('.svc-check');
      const labelEl = tr.querySelector('.svc-label');
      const amtEl = tr.querySelector('.svc-amt');
      if (chk?.checked) {
        const label = (labelEl ? (labelEl.value || 'Other') : tr.cells[1].textContent).trim();
        const amt   = parseFloat(amtEl?.value || '0') || 0;
        items.push({ label, amt });
      }
    });
    return items;
  }

  /**
   * Convert a number into words in the Indian numbering system. The string
   * returned always ends with 'Rupees' instead of 'Rs'.
   *
   * @param {number} num Number to convert
   * @returns {string}
   */
  function numberToWordsINR(num) {
    num = Math.floor(Number(num) || 0);
    if (num === 0) return 'Zero Rupees';
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
    const crore = Math.floor(remainder / 10000000);
    remainder %= 10000000;
    const lakh = Math.floor(remainder / 100000);
    remainder %= 100000;
    const thousand = Math.floor(remainder / 1000);
    remainder %= 1000;
    const rest = remainder;
    const parts = [];
    if (crore) parts.push(threeDigits(crore) + ' Crore');
    if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
    if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
    if (rest) parts.push(threeDigits(rest));
    return parts.join(' ') + ' Rupees';
  }

  /**
   * Load the clinic logo and return a Data URL. The path is taken from
   * the hidden #logoPath input if present, otherwise defaults to
   * '../images/logo.png'. If loading fails, null is returned.
   */
  async function getLogoDataUrl() {
    try {
      const logoPathInput = document.getElementById('logoPath');
      const logoPath = logoPathInput?.value || '../images/logo.png';
      const res = await fetch(logoPath);
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('Unable to load logo for PDF', err);
      return null;
    }
  }

  /**
   * Generate a receipt PDF using jsPDF. The page height is computed on the
   * fly based on the content so that there is no unnecessary trailing
   * whitespace. The amount in words is right‑aligned under the numeric
   * total. If autoPrint is true, the resulting PDF is opened in a new tab
   * and the print dialog is triggered; otherwise it is downloaded.
   *
   * @param {Object} payload The invoice data (invoiceNo, date, received, doctorName, items, rsBottom)
   * @param {boolean} autoPrint Whether to auto print (true) or download (false)
   */
  async function generateReceiptPdf(payload, autoPrint = false) {
    if (!window.jspdf) {
      console.warn('jsPDF library not loaded; cannot generate PDF');
      return;
    }
    const { jsPDF } = window.jspdf;
    const logoData = await getLogoDataUrl();
    // Precompute sums
    const sum = (payload.items || []).reduce((s, r) => s + (Number(r.amt) || 0), 0);
    const bottom = (payload.rsBottom !== undefined && payload.rsBottom !== null && payload.rsBottom !== '')
      ? Number(payload.rsBottom)
      : sum;
    const sumWords = numberToWordsINR(Math.round(bottom));
    // Use a temporary doc to calculate number of lines for words and address
    const tempDoc = new jsPDF({ unit: 'mm', format: [80, 200], orientation: 'portrait' });
    const wordsLines = tempDoc.splitTextToSize(sumWords, 60);
    const address = 'Near Agha Khan Laboratory VIP Road Larkana';
    const addrLines = tempDoc.splitTextToSize(address, 50);
    // Compute dynamic height in mm
    let y = 5; // top margin
    if (logoData) {
      y += 15; // logo height (12mm) + spacing (3mm)
    }
    y += 4; // invoice row
    y += 4; // date row
    y += 3; // received label row
    y += 4; // received value row
    y += 3; // for label row
    y += 6; // doctor name row (value + spacing)
    y += 4; // items header
    const itemCount = (payload.items && payload.items.length) ? payload.items.length : 1;
    y += itemCount * 3.5; // each item row
    y += 2; // spacing before totals
    y += 4; // Sum row
    y += 4; // Rupees row
    y += wordsLines.length * 3; // words lines
    y += 2; // spacing before signature
    y += 4; // signature line
    y += 3.5; // clinic name
    y += addrLines.length * 3; // address lines
    const dynamicHeight = Math.max(y + 5, 60); // add bottom margin; ensure min 60mm
    // Now create the real document with dynamic height
    const doc = new jsPDF({ unit: 'mm', format: [80, dynamicHeight], orientation: 'portrait' });
    let yy = 5;
    // Draw logo
    if (logoData) {
      const logoWidth = 46;
      const logoHeight = 12;
      const xLogo = (80 - logoWidth) / 2;
      doc.addImage(logoData, 'PNG', xLogo, yy, logoWidth, logoHeight);
      yy += logoHeight + 3;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    // Invoice number
    doc.text('Invoice No:', 5, yy);
    doc.text(String(payload.invoiceNo || ''), 75, yy, { align: 'right' });
    yy += 4;
    // Date
    doc.text('Date:', 5, yy);
    const dateStr = payload.date ? new Date(payload.date).toLocaleDateString() : new Date().toLocaleDateString();
    doc.text(dateStr, 75, yy, { align: 'right' });
    yy += 4;
    // Received from
    doc.text('Received from with Thanks', 5, yy);
    yy += 3;
    doc.setFont('helvetica', 'bold');
    doc.text(String(payload.received || ''), 5, yy);
    doc.setFont('helvetica', 'normal');
    yy += 4;
    // Doctor (For)
    doc.text('For:', 5, yy);
    yy += 3;
    doc.setFont('helvetica', 'bold');
    doc.text(String(payload.doctorName || ''), 5, yy);
    doc.setFont('helvetica', 'normal');
    yy += 6;
    // Items header
    doc.setFont('helvetica', 'bold');
    doc.text('On Account of:', 5, yy);
    doc.setFont('helvetica', 'normal');
    yy += 4;
    // Items list
    if (payload.items && payload.items.length) {
      payload.items.forEach(item => {
        const label = item.label || '—';
        const amt = Number(item.amt) || 0;
        const line = '\u2022 ' + label + ' - Rs ' + amt.toFixed(2);
        doc.text(line, 5, yy);
        yy += 3.5;
      });
    } else {
      doc.text('\u2022 —', 5, yy);
      yy += 3.5;
    }
    yy += 2;
    // Totals
    doc.setFont('helvetica', 'bold');
    doc.text('Sum of Rs', 5, yy);
    doc.text(sum.toFixed(2), 75, yy, { align: 'right' });
    yy += 4;
    doc.text('Rupees', 5, yy);
    doc.text(bottom.toFixed(2), 75, yy, { align: 'right' });
    yy += 4;
    // Amount in words – right aligned
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const wordsWrapped = doc.splitTextToSize(sumWords, 60);
    wordsWrapped.forEach(line => {
      doc.text(line, 75, yy, { align: 'right' });
      yy += 3;
    });
    yy += 2;
    // Signature line
    const sigLineWidth = 32;
    const sigX = (80 - sigLineWidth) / 2;
    doc.setLineWidth(0.2);
    doc.line(sigX, yy, sigX + sigLineWidth, yy);
    yy += 4;
    // Clinic name and address
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Tulsi Sugar Care Clinic', 40, yy, { align: 'center' });
    yy += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const addrWrapped = doc.splitTextToSize(address, 50);
    addrWrapped.forEach(line => {
      doc.text(line, 40, yy, { align: 'center' });
      yy += 3;
    });
    // Output
    if (autoPrint) {
      // If jsPDF has autoPrint plugin, call it
      if (typeof doc.autoPrint === 'function') {
        doc.autoPrint();
      }
      const blobUrl = doc.output('bloburl');
      const win = window.open(blobUrl, '_blank');
      if (!doc.autoPrint) {
        win?.addEventListener('load', () => {
          win.print();
        });
      }
    } else {
      doc.save(`${payload.invoiceNo || 'receipt'}.pdf`);
    }
  }

  /**
   * Persist invoice to Supabase (if configured), store it in localStorage
   * and then generate the receipt PDF. Payer defaults to doctor and
   * patient fields are omitted.
   *
   * @param {boolean} autoPrint Whether to auto print or download the PDF
   */
  async function openReceipt(autoPrint = false) {
    const items   = collectItems();
    const doctor  = doctorEl?.value?.trim() || '';
    const rsVal   = rsBottomEl?.value;
    const payload = {
      invoiceNo: invEl.value,
      date     : dateEl.value || todayISOLocal(),
      received : receivedEl.value || doctor || '',
      doctorName: doctor || null,
      items    : items,
      rsBottom : (rsVal !== undefined && rsVal !== null && rsVal !== '') ? Number(rsVal) : undefined,
    };
    // Persist for potential other components (template.html) even though we no
    // longer rely on it
    localStorage.setItem('RECEIPT_DATA', JSON.stringify(payload));
    // Save invoice record to Supabase (avoid duplicate invoice numbers)
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
          }
        }
      } catch (err) {
        console.error('Unexpected error saving invoice', err);
      }
    }
    await generateReceiptPdf(payload, autoPrint);
  }

  // Hook up print and download buttons
  printBtn?.addEventListener('click', () => {
    openReceipt(true);
  });
  downloadBtn?.addEventListener('click', () => {
    openReceipt(false);
  });
})();