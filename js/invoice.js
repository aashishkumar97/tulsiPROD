// invoice.js
//
// This script powers the invoice form for Tulsi Sugar Care Clinic. It
// generates sequential invoice numbers, saves invoices into Supabase
// (if configured), and renders a receipt using a small HTML template suitable
// for thermal printers. The payer field starts empty so the user's entry
// (e.g., patient name) is always used.

(function () {
  // Grab form controls
  const invEl       = document.getElementById('invoiceNo');
  const dateEl      = document.getElementById('invoiceDate');
  const receivedEl  = document.getElementById('receivedFrom');
  const clinicEl    = document.getElementById('clinicName');
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

  // Load the logo image referenced by a hidden field (#logoPath). Instead of
  // using fetch (which can fail when the app is opened directly from the
  // filesystem), draw the image to a canvas and extract a DataURL. The natural
  // dimensions are returned so the image can be scaled without distortion.
  async function getLogoDataUrl() {
    const logoPathInput = document.getElementById('logoPath');
    const logoPath = logoPathInput?.value || '../images/logo.png';
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        } catch (err) {
          console.warn('Unable to convert logo to DataURL', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = logoPath;
    });
  }

  /**
   * Render the receipt using an HTML template and optionally trigger printing.
   * @param {Object} payload Invoice data
   * @param {boolean} autoPrint Whether to automatically open the print dialog
   */
  async function generateReceiptHtml(payload, autoPrint = false) {
    const logoData = await getLogoDataUrl();
    const sum = (payload.items || []).reduce((s, r) => s + (Number(r.amt) || 0), 0);
    const css = `#invoice-POS{box-shadow:0 0 1in -0.25in rgba(0,0,0,.5);padding:2mm;margin:0 auto;width:44mm;background:#FFF;}\n` +
      `#top,#mid,#bot{border-bottom:1px solid #EEE;}\n` +
      `#top{min-height:100px;}#mid{min-height:80px;}#bot{min-height:50px;}\n` +
      `.logo{height:60px;width:60px;background-size:60px 60px;margin:0 auto;}\n` +
      `.info{text-align:center;}\n` +
      `table{width:100%;border-collapse:collapse;}\n` +
      `.tabletitle{font-size:.5em;background:#EEE;}\n` +
      `.service{border-bottom:1px solid #EEE;}\n` +
      `.item{width:24mm;}\n` +
      `.itemtext{font-size:.5em;}\n` +
      `#legalcopy{margin-top:5mm;text-align:center;font-size:.5em;}`;

    const rows = (payload.items && payload.items.length)
      ? payload.items.map(item => `\n<tr class="service">\n  <td class="tableitem"><p class="itemtext">${item.label}</p></td>\n  <td class="tableitem"><p class="itemtext">1</p></td>\n  <td class="tableitem"><p class="itemtext">${Number(item.amt).toFixed(2)}</p></td>\n</tr>`).join('')
      : '\n<tr class="service"><td class="tableitem"><p class="itemtext">—</p></td><td class="tableitem"><p class="itemtext">0</p></td><td class="tableitem"><p class="itemtext">0.00</p></td></tr>';

    const html = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"/>\n<title>${payload.invoiceNo || ''}</title>\n<style>${css}\n.logo{background:url('${logoData?.dataUrl || ''}') no-repeat;}\n</style></head>\n<body>\n<div id="invoice-POS">\n  <center id="top">\n    <div class="logo"></div>\n    <div class="info"><h2>${payload.clinicName || ''}</h2></div>\n  </center>\n  <div id="mid">\n    <div class="info">\n      <h2>Receipt Info</h2>\n      <p>Invoice No: ${payload.invoiceNo || ''}<br/>Date: ${payload.date || ''}<br/>Received: ${payload.received || ''}<br/>Doctor: ${payload.doctorName || ''}</p>\n    </div>\n  </div>\n  <div id="bot">\n    <div id="table">\n      <table>\n        <tr class="tabletitle"><td class="item"><h2>Item</h2></td><td class="Hours"><h2>Qty</h2></td><td class="Rate"><h2>Sub Total</h2></td></tr>${rows}\n        <tr class="tabletitle"><td></td><td class="Rate"><h2>Total</h2></td><td class="payment"><h2>${sum.toFixed(2)}</h2></td></tr>\n      </table>\n    </div>\n    <div id="legalcopy"><p class="legal"><strong>Thank you for your business!</strong></p></div>\n  </div>\n</div>\n</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    if (autoPrint) {
      win.focus();
      win.print();
    }
  }

  /**
   * Collect form data, store it locally, optionally store in Supabase and
   * generate a PDF. If autoPrint is true, the PDF will trigger the print dialog.
   * @param {boolean} autoPrint
   */
  async function openReceipt(autoPrint = false) {
    const items      = collectItems();
    const clinic     = clinicEl?.value?.trim() || '';
    const doctor     = doctorEl?.value?.trim() || '';
    const rsVal      = rsBottomEl?.value;
    const generatedAt = new Date().toISOString();
    const payload = {
      invoiceNo : invEl.value,
      date      : dateEl.value || todayISOLocal(),
      generatedAt,
      received  : receivedEl.value.trim(),
      clinicName: clinic || null,
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
    await generateReceiptHtml(payload, autoPrint);
  }

  // Hook up buttons
  printBtn?.addEventListener('click', () => {
    openReceipt(true);
  });
  downloadBtn?.addEventListener('click', () => {
    openReceipt(false);
  });
})();
