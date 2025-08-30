// invoice.js — single-page 3x5" thermal receipt (auto-shrink to fit) + instant print (no viewer)
(function () {
  const invEl       = document.getElementById('invoiceNo');
  const dateEl      = document.getElementById('invoiceDate');
  const receivedEl  = document.getElementById('receivedFrom');
  const rsBottomEl  = document.getElementById('rsBottom');
  const printBtn    = document.getElementById('printPage');
  const downloadBtn = document.getElementById('downloadPdf');

  const todayISOLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };

  function nextInvoiceNumber() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `inv_counter_${y}${m}${day}`;
    const current = (parseInt(localStorage.getItem(key) || '0', 10) + 1);
    localStorage.setItem(key, String(current));
    return `INV-${y}${m}${day}-${String(current).padStart(3, '0')}`;
  }

  function ensureMeta() {
    if (!dateEl.value) dateEl.value = todayISOLocal();
    if (!invEl.value)  invEl.value  = nextInvoiceNumber();
    invEl.readOnly = true;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureMeta);
  } else ensureMeta();

  function collectItems() {
    const items = [];
    document.querySelectorAll('#serviceItems tr').forEach(tr => {
      const chk = tr.querySelector('.svc-check');
      const labelEl = tr.querySelector('.svc-label');
      const amtEl = tr.querySelector('.svc-amt');
      if (chk?.checked) {
        const label = (labelEl ? (labelEl.value || 'Item') : tr.cells[1]?.textContent || 'Item').trim();
        const amt   = parseFloat(amtEl?.value || '0') || 0;
        items.push({ label, amt });
      }
    });
    return items;
  }

  function numberToWordsINR(num) {
    num = Math.floor(Number(num) || 0);
    if (num === 0) return 'Zero Rupees Only';
    const b20=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const two=n=>n<20?b20[n]:tens[Math.floor(n/10)]+(n%10?` ${b20[n%10]}`:'');
    const three=n=>(Math.floor(n/100)?`${b20[Math.floor(n/100)]} Hundred${n%100?' ':''}`:'')+(n%100?two(n%100):'');
    let r=num, parts=[];
    const c=Math.floor(r/1e7); r%=1e7;
    const l=Math.floor(r/1e5); r%=1e5;
    const t=Math.floor(r/1e3); r%=1e3;
    if(c) parts.push(`${three(c)} Crore`);
    if(l) parts.push(`${three(l)} Lakh`);
    if(t) parts.push(`${three(t)} Thousand`);
    if(r) parts.push(three(r));
    return parts.join(' ') + ' Rupees Only';
  }

  async function getLogoDataUrl() {
    const path = document.getElementById('logoPath')?.value || '../images/logo.png';
    try {
      const res = await fetch(path);
      const blob = await res.blob();
      const fr = new FileReader();
      return await new Promise((resolve, reject) => {
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  // ---------- PDF (single page with auto-shrink) ----------
  async function generateReceiptPdf(payload, opts) {
    const autoPrint = !!opts?.autoPrint;
    if (!window.jspdf) return;
    const { jsPDF } = window.jspdf;

    // Exact thermal size for Black Copper: 3" x 5"
    const W = 76.2, H = 127; // mm
    const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait' });

    // Hint viewers/printers not to rescale & to pick tray by PDF size (if supported by jsPDF build)
    try {
      if (typeof doc.viewerPreferences === 'function') {
        doc.viewerPreferences({ PrintScaling: 'None', PickTrayByPDFSize: true });
      }
      if (typeof doc.setProperties === 'function') {
        doc.setProperties({ title: payload.invoiceNo || 'Receipt 3x5' });
      }
    } catch (_) {}

    const logoData = await getLogoDataUrl();
    const items = payload.items || [];
    const sum = items.reduce((s,r)=>s+(+r.amt||0),0);
    const bottom = (payload.rsBottom!==undefined && payload.rsBottom!=='') ? Number(payload.rsBottom) : sum;
    const inWords = numberToWordsINR(Math.round(bottom));
    const address = 'Near Agha Khan Laboratory VIP Road Larkana';

    const sizes = { title: 11, small: 8, tiny: 7, clinic: 9 };
    const gaps  = { line: 5, small: 4, section: 6, between: 3.5 };
    const margins = { x: 5, top: 6, bottom: 6 };

    function measure(scale) {
      let y = margins.top, x = margins.x, innerW = W - 2*x;
      const sSmall=sizes.small*scale, sTiny=sizes.tiny*scale, sClinic=sizes.clinic*scale;
      const gLine=gaps.line*scale, gSmall=gaps.small*scale, gSect=gaps.section*scale, gBet=gaps.between*scale;
      if (logoData) y += Math.min(18*scale, 35*scale*0.5) + gSect;
      y += gLine; y += gLine; // invoice/date
      y += gLine; y += gSmall; // received
      y += gSect; y += gSmall; // header
      items.forEach(it => {
        const lines = doc.splitTextToSize(`• ${it.label} - Rs ${(+it.amt||0).toFixed(2)}`, innerW);
        y += lines.length * gLine;
      });
      y += gSect; // before totals
      y += gLine; y += gLine; // totals
      y += doc.splitTextToSize(inWords, innerW).length * gSmall + gBet; // words
      y += 8*scale; // signature
      y += gSmall; // clinic
      y += doc.splitTextToSize(address, innerW).length * gSmall; // addr
      y += margins.bottom;
      return y;
    }

    let scale = 1.0;
    const needed = measure(1.0);
    if (needed > H) scale = Math.max(0.62, (H / needed) * 0.985);

    (function render() {
      let y = margins.top, x = margins.x, innerW = W - 2*x;
      const sSmall=sizes.small*scale, sTiny=sizes.tiny*scale, sClinic=sizes.clinic*scale;
      const gLine=gaps.line*scale, gSmall=gaps.small*scale, gSect=gaps.section*scale, gBet=gaps.between*scale;

      if (logoData) {
        const maxW = 35*scale, maxH = 18*scale;
        doc.addImage(logoData,'PNG',(W-maxW)/2,y,maxW,maxH);
        y += maxH + gSect;
      }

      doc.setFont('helvetica','bold'); doc.setFontSize(sSmall);
      doc.text('Invoice No:', x, y);
      doc.text(String(payload.invoiceNo||''), W-x, y, {align:'right'}); y += gLine;

      const baseDate = payload.date ? new Date(payload.date + 'T00:00:00') : new Date();
      const timeStr  = new Date().toLocaleTimeString('en-PK',{timeZone:'Asia/Karachi',hour12:false});
      const dateStr  = `${baseDate.toLocaleDateString('en-PK',{timeZone:'Asia/Karachi'})} ${timeStr}`;
      doc.text('Date:', x, y);
      doc.text(dateStr, W-x, y, {align:'right'}); y += gLine;

      doc.text('Received with Thanks from:', x, y); y += gLine;
      doc.text(String(payload.received||''), x, y); y += gSmall;

      y += gSect; doc.text('On Account of:', x, y); y += gSmall;

      items.forEach(it=>{
        const lines = doc.splitTextToSize(`• ${it.label} - Rs ${(+it.amt||0).toFixed(2)}`, innerW);
        lines.forEach(line=>{ doc.text(line, x, y); y += gLine; });
      });

      y += gSect;
      doc.text('Sum of Rs', x, y); doc.text(sum.toFixed(2), W-x, y, {align:'right'}); y += gLine;
      doc.text('Rupees', x, y);    doc.text(bottom.toFixed(2), W-x, y, {align:'right'}); y += gLine;

      const words = doc.splitTextToSize(inWords, innerW);
      words.forEach(line=>{ doc.text(line, W-x, y, {align:'right'}); y += gSmall; });
      y += gBet;

      const sigW = 32*scale, sigX = (W - sigW)/2; doc.setLineWidth(0.2);
      doc.line(sigX, y, sigX+sigW, y); y += 6*scale;

      doc.setFontSize(sClinic); doc.text('Tulsi Sugar Care Clinic', W/2, y, {align:'center'}); y += gSmall;
      doc.setFontSize(sTiny);
      doc.splitTextToSize(address, innerW).forEach(line=>{ doc.text(line, W/2, y, {align:'center'}); y += gSmall; });
    })();

    if (autoPrint) {
      // Embed in hidden iframe & print immediately (no viewer, no popup)
      try {
        if (typeof doc.autoPrint === 'function') doc.autoPrint(); // adds OpenAction to PDF
      } catch (_) {}
      const blob = doc.output('blob');
      const url  = URL.createObjectURL(blob);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        // Some printers/viewers need a small delay before print call
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } finally {
            // Cleanup shortly after
            setTimeout(() => {
              URL.revokeObjectURL(url);
              document.body.removeChild(iframe);
            }, 2000);
          }
        }, 150);
      };
    } else {
      doc.save(`${payload.invoiceNo || 'receipt'}.pdf`);
    }
  }

  async function openReceipt(autoPrint=false) {
    const items = collectItems();
    const rsVal = rsBottomEl?.value;
    const payload = {
      invoiceNo : invEl.value || nextInvoiceNumber(),
      date      : dateEl.value || todayISOLocal(),
      received  : receivedEl.value.trim(),
      items,
      rsBottom  : (rsVal!==undefined && rsVal!=='') ? Number(rsVal) : undefined,
    };
    await generateReceiptPdf(payload, { autoPrint });
  }

  printBtn?.addEventListener('click', () => openReceipt(true));
  downloadBtn?.addEventListener('click', () => openReceipt(false));
})();
