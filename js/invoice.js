// invoice.js
//
// This script powers the invoice form for Tulsi Sugar Care Clinic. It
// generates sequential invoice numbers, saves invoices into Supabase
// (if configured), and produces a thermal receipt as a PDF using jsPDF.
// The receipt height is calculated dynamically based on its content,
// ensuring the printout ends near the last line. The payer field now
// starts empty so the user's entry (e.g., patient name) is always used.

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

  // Initialize meta and default payer on load
  function init() {
    ensureMeta();
    receivedEl.value = '';
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
    }, 0);
  });

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

  // Load the logo image referenced by a hidden field (#logoPath) into a DataURL.
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
   * Create a receipt PDF sized dynamically based on its content. The width is fixed
   * at 80mm and the height grows depending on the text printed. The "For" line
   * has been removed; only the payer line appears. Optionally auto‑print.
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
    // Use a temporary doc to wrap long text. This gives us line counts for words and address.
    const tmpDoc   = new jsPDF({ unit: 'mm', format: [80, 200], orientation: 'portrait' });
    const wordsWrapped = tmpDoc.splitTextToSize(sumWords, 60);
    const address = 'Near Agha Khan Laboratory VIP Road Larkana';
    const addrWrapped  = tmpDoc.splitTextToSize(address, 50);
    // Calculate the final height of the PDF. Start at 5mm top margin.
    let h = 5;
    // Logo height plus spacing
    const logoWidth = 46;
    const logoHeight = 12;
    if (logoData) {
      h += logoHeight + 3;
    }
    // Meta rows: invoice number and date
    h += 4; // Invoice No row
    h += 4; // Date row
    // "Received from with Thanks" row: label line and bold payer line
    h += 3; // label spacing
    h += 4; // payer name line
    // Items header
    h += 4;
    // Items list: at least one line; each line 3.5mm
    const itemCount = (payload.items && payload.items.length) ? payload.items.length : 1;
    h += itemCount * 3.5;
    // Spacing before totals
    h += 2;
    // Totals lines: sum line and rupees line
    h += 4;
    h += 4;
    // Words lines: each line 3mm
    h += wordsWrapped.length * 3;
    // Spacing after words
    h += 2;
    // Signature line spacing
    h += 4;
    // Clinic name
    h += 3.5;
    // Address lines: each 3mm
    h += addrWrapped.length * 3;
    // Add a bottom margin to prevent clipping
    const finalHeight = Math.max(h + 3, 80);
    // Now create the real PDF with calculated height
    const doc = new jsPDF({ unit: 'mm', format: [80, finalHeight], orientation: 'portrait' });
    let y = 5;
    // Draw logo if available
    if (logoData) {
      const xLogo = (80 - logoWidth) / 2;
      doc.addImage(logoData, 'PNG', xLogo, y, logoWidth, logoHeight);
      y += logoHeight + 3;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    // Invoice number
    doc.text('Invoice No:', 5, y);
    doc.text(String(payload.invoiceNo || ''), 75, y, { align: 'right' });
    y += 4;
    // Date with time (Larkana, Pakistan)
    doc.text('Date:', 5, y);
    const baseDate = payload.date ? new Date(payload.date + 'T00:00:00') : new Date();
    const timeSrc  = payload.generatedAt ? new Date(payload.generatedAt) : new Date();
    const dateStr = `${baseDate.toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })} ${timeSrc.toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour12: false })}`;
    doc.text(dateStr, 75, y, { align: 'right' });
    y += 4;
    // Received with thanks from
    doc.text('Received with Thanks from:', 5, y);
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.text(String(payload.received || ''), 5, y);
    doc.setFont('helvetica', 'normal');
    y += 4;
    // Items header
    doc.setFont('helvetica', 'bold');
    doc.text('On Account of:', 5, y);
    doc.setFont('helvetica', 'normal');
    y += 4;
    // Items list
    if (payload.items && payload.items.length) {
      payload.items.forEach(item => {
        const label = item.label || '—';
        const amt   = Number(item.amt) || 0;
        const line  = '\u2022 ' + label + ' - Rs ' + amt.toFixed(2);
        doc.text(line, 5, y);
        y += 3.5;
      });
    } else {
      doc.text('\u2022 —', 5, y);
      y += 3.5;
    }
    // Spacing before totals
    y += 2;
    // Totals
    doc.setFont('helvetica', 'bold');
    doc.text('Sum of Rs', 5, y);
    doc.text(sum.toFixed(2), 75, y, { align: 'right' });
    y += 4;
    doc.text('Rupees', 5, y);
    doc.text(bottom.toFixed(2), 75, y, { align: 'right' });
    y += 4;
    // Amount in words (bold for visibility)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    wordsWrapped.forEach(line => {
      doc.text(line, 75, y, { align: 'right' });
      y += 3;
    });
    doc.setFont('helvetica', 'normal');
    // Spacing after words
    y += 2;
    // Signature line
    const sigWidth = 32;
    const sigX     = (80 - sigWidth) / 2;
    doc.setLineWidth(0.2);
    doc.line(sigX, y, sigX + sigWidth, y);
    y += 4;
    // Clinic name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Tulsi Sugar Care Clinic', 40, y, { align: 'center' });
    y += 3.5;
    // Address
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.0);
    addrWrapped.forEach(line => {
      doc.text(line, 40, y, { align: 'center' });
      y += 3;
    });
    // Output: print or save
    if (autoPrint) {
      if (typeof doc.autoPrint === 'function') {
        doc.autoPrint();
      }
      const url = doc.output('bloburl');
      const win = window.open(url, '_blank');
      // If autoPrint isn't available, trigger print when the PDF loads
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
   * Collect form data, store it locally, optionally store in Supabase and
   * generate a PDF. If autoPrint is true, the PDF will trigger the print dialog.
   * @param {boolean} autoPrint
   */
  async function openReceipt(autoPrint = false) {
    const items      = collectItems();
    const doctor     = doctorEl?.value?.trim() || '';
    const rsVal      = rsBottomEl?.value;
    const generatedAt = new Date().toISOString();
    const payload = {
      invoiceNo : invEl.value,
      date      : dateEl.value || todayISOLocal(),
      generatedAt,
      received  : receivedEl.value.trim(),
      doctorName: doctor || null,
      items     : items,
      rsBottom  : (rsVal !== undefined && rsVal !== null && rsVal !== '') ? Number(rsVal) : undefined,
    };
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
          }
        }
      } catch (err) {
        console.error('Unexpected error saving invoice', err);
      }
    }
    await generateReceiptPdf(payload, autoPrint);
  }

  // Hook up buttons
  printBtn?.addEventListener('click', () => {
    openReceipt(true);
  });
  downloadBtn?.addEventListener('click', () => {
    openReceipt(false);
  });
})();
