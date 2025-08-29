// invoice.js
//
// This script powers the invoice form for Tulsi Sugar Care Clinic. It
// generates sequential invoice numbers, saves invoices into Supabase
// (if configured), and produces a thermal receipt as a PDF using jsPDF.
// The receipt now uses a fixed 3×5″ layout; lines are spaced to fill the
// page gracefully. The payer field starts empty so the user's entry (e.g.,
// patient name) is always used.

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
  async function getLogoDataUrl() {
    return new Promise((resolve) => {
      const logoPathInput = document.getElementById('logoPath');
      const logoPath = logoPathInput?.value || '../images/logo.png';
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        } catch (e) {
          console.warn('Unable to process logo for PDF', e);
          resolve(null);
        }
      };
      img.onerror = () => {
        console.warn('Logo image failed to load');
        resolve(null);
      };
      img.src = logoPath;
    });
=======
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
   * Create a 3×5 inch (approximately 76×127 mm) receipt PDF. The size is fixed
   * so it no longer changes with content. Lines are spaced out and all text is
   * bold for better legibility. Optionally auto‑print.
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

    // Fixed document dimensions: 3in × 5in
    const pdfWidth = 76.2;
    const pdfHeight = 127;
    const doc = new jsPDF({ unit: 'mm', format: [pdfWidth, pdfHeight], orientation: 'portrait' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);

    // Wrap text
    const wordsWrapped = doc.splitTextToSize(sumWords, pdfWidth - 16);
    const address = 'Near Agha Khan Laboratory VIP Road Larkana';
    const addrWrapped = doc.splitTextToSize(address, pdfWidth - 26);

    let y = 10; // generous top margin

    // Logo with ample room (maintain aspect ratio). Reserve vertical space even
    // if the image fails to load so text never collides with the expected logo
    // area.
    const reservedLogoSpace = 28; // mm
    if (logoData?.dataUrl) {
      const logoMaxWidth = 35;  // mm
      const logoMaxHeight = 20; // mm
      let logoWidth = logoMaxWidth;
      let logoHeight = logoWidth * (logoData.height ? logoData.height / logoData.width : 1);
      if (logoHeight > logoMaxHeight) {
        logoHeight = logoMaxHeight;
        logoWidth = logoHeight * (logoData.width ? logoData.width / logoData.height : 1);
      }
      const xLogo = (pdfWidth - logoWidth) / 2;
      doc.addImage(logoData.dataUrl, 'PNG', xLogo, y, logoWidth, logoHeight);
      y += logoHeight + 8;
    } else {
      y += reservedLogoSpace; // push text down if no logo
    }

    // Invoice number
    doc.text('Invoice No:', 5, y);
    doc.text(String(payload.invoiceNo || ''), pdfWidth - 5, y, { align: 'right' });
    y += 6;

    // Date with time (Larkana, Pakistan)
    doc.text('Date:', 5, y);
    const baseDate = payload.date ? new Date(payload.date + 'T00:00:00') : new Date();
    const timeSrc  = payload.generatedAt ? new Date(payload.generatedAt) : new Date();
    const dateStr = `${baseDate.toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })} ${timeSrc.toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour12: false })}`;
    doc.text(dateStr, pdfWidth - 5, y, { align: 'right' });
    y += 6;

    // Payer
    doc.text('Received with Thanks from:', 5, y);
    y += 6;
    doc.text(String(payload.received || ''), 5, y);
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

    // Amount in words
    doc.setFontSize(8);
    wordsWrapped.forEach(line => {
      doc.text(line, pdfWidth - 5, y, { align: 'right' });
      y += 5;
    });
    doc.setFontSize(10);

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
      const url = doc.output('bloburl');
      const win = window.open(url, '_blank');
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
