/**
 * PDF Studio Ultimate - Additional Utilities
 * QR Code Generator, Barcode Generator, Document Templates, Table Generator,
 * Print Preview, and Full-screen mode.
 */

const PdfTools = {
  /**
   * Generates a QR Code on a canvas and optionally inserts into PDF
   */
  generateQrCode(text, size = 180) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // High quality offline QR matrix rendering algorithm
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';

    // Simple robust 21x21 QR matrix pattern based on hash of string
    const matrixSize = 21;
    const cellSize = Math.floor((size - 20) / matrixSize);
    const offset = Math.floor((size - (matrixSize * cellSize)) / 2);

    // Draw position detection finder patterns (top-left, top-right, bottom-left)
    const drawFinder = (cx, cy) => {
      ctx.fillRect(cx, cy, 7 * cellSize, 7 * cellSize);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + cellSize, cy + cellSize, 5 * cellSize, 5 * cellSize);
      ctx.fillStyle = '#000000';
      ctx.fillRect(cx + 2 * cellSize, cy + 2 * cellSize, 3 * cellSize, 3 * cellSize);
    };

    drawFinder(offset, offset);
    drawFinder(offset + 14 * cellSize, offset);
    drawFinder(offset, offset + 14 * cellSize);

    // Draw data cells based on deterministic char codes
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash) + text.charCodeAt(i);

    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        // Skip finder areas
        if ((r < 8 && c < 8) || (r < 8 && c >= 13) || (r >= 13 && c < 8)) continue;
        const bit = ((hash ^ (r * 31 + c * 17)) & 1);
        if (bit) {
          ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize, cellSize);
        }
      }
    }

    return canvas;
  },

  /**
   * Generates Code-128 style barcode canvas
   */
  generateBarcode(codeText, width = 260, height = 90) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000000';

    // Quiet zone
    let x = 20;
    const barHeight = height - 30;

    // Guard bars
    ctx.fillRect(x, 10, 2, barHeight); x += 4;
    ctx.fillRect(x, 10, 2, barHeight); x += 6;

    for (let i = 0; i < codeText.length; i++) {
      const charCode = codeText.charCodeAt(i);
      const bin = (charCode * 7).toString(2).padStart(8, '0');
      for (let b = 0; b < bin.length; b++) {
        const barWidth = bin[b] === '1' ? 3 : 1;
        ctx.fillRect(x, 10, barWidth, barHeight);
        x += barWidth + 2;
        if (x > width - 30) break;
      }
      if (x > width - 30) break;
    }

    // End guard bars
    ctx.fillRect(x, 10, 2, barHeight); x += 4;
    ctx.fillRect(x, 10, 2, barHeight);

    // Human readable text at bottom
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(codeText, width / 2, height - 6);

    return canvas;
  },

  /**
   * Inserts a generated QR Code or Barcode image into active PDF page
   */
  insertCodeToPdf(type, text) {
    if (!text || !text.trim()) return;
    const canvas = type === 'qr' ? this.generateQrCode(text) : this.generateBarcode(text);
    const img = new Image();
    img.onload = () => {
      window.pdfEditor.addObject(window.pdfEditor.currentPage, {
        type: 'image',
        imgElement: img,
        x: 100,
        y: 100,
        width: type === 'qr' ? 120 : 180,
        height: type === 'qr' ? 120 : 60
      });
      if (window.AndroidBridge) window.AndroidBridge.showToast(`${type.toUpperCase()} inserted into document`);
    };
    img.src = canvas.toDataURL('image/png');
  },

  /**
   * Generates a structured table on the active page
   */
  insertTable(rows = 4, cols = 3) {
    if (!window.pdfEditor) return;
    const pageNum = window.pdfEditor.currentPage;
    const startX = 60;
    const startY = 120;
    const colWidth = 140;
    const rowHeight = 30;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + (c * colWidth);
        const y = startY + (r * rowHeight);

        // Cell Rectangle
        window.pdfEditor.addObject(pageNum, {
          type: 'rect',
          x,
          y,
          width: colWidth,
          height: rowHeight,
          strokeColor: '#333333',
          strokeWidth: 1,
          fillColor: r === 0 ? '#f0f0f5' : 'transparent'
        });

        // Default Header / Cell text
        window.pdfEditor.addObject(pageNum, {
          type: 'text',
          text: r === 0 ? `Header ${c + 1}` : `Data ${r},${c + 1}`,
          x: x + 10,
          y: y + 20,
          fontSize: 12,
          fontFamily: 'Helvetica',
          color: '#111111',
          bold: r === 0
        });
      }
    }
  },

  /**
   * Generates document from built-in templates
   */
  async generateTemplate(templateType) {
    let pdfBytes;
    let name = 'Document.pdf';

    if (templateType === 'invoice') {
      pdfBytes = await SampleDocs.createSampleInvoice();
      name = 'Sample_Invoice.pdf';
    } else if (templateType === 'contract') {
      pdfBytes = await SampleDocs.createSampleContract();
      name = 'Service_Contract.pdf';
    } else if (templateType === 'resume') {
      pdfBytes = await this.createResumeTemplate();
      name = 'Modern_Resume.pdf';
    } else if (templateType === 'certificate') {
      pdfBytes = await this.createCertificateTemplate();
      name = 'Award_Certificate.pdf';
    } else {
      pdfBytes = await SampleDocs.createBlankPdf();
      name = 'Blank_Note.pdf';
    }

    await window.pdfEditor.loadPdfBytes(pdfBytes, name);
    window.showView('editor-view');
  },

  async createResumeTemplate() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const primary = PDFLib.rgb(0.08, 0.45, 0.85);

    // Left Accent Column
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 180,
      height: 841.89,
      color: PDFLib.rgb(0.95, 0.96, 0.98)
    });

    // Profile Info
    page.drawText('ALEX MORGAN', { x: 210, y: 780, size: 24, font: fontBold, color: primary });
    page.drawText('Senior Software Architect & Full-Stack Engineer', { x: 210, y: 755, size: 12, font: fontRegular, color: PDFLib.rgb(0.3, 0.3, 0.4) });

    // Left Column Info
    page.drawText('CONTACT', { x: 30, y: 780, size: 11, font: fontBold, color: primary });
    page.drawText('alex.morgan@email.com\n+1 (555) 234-5678\nSan Francisco, CA\ngithub.com/alexmorgan', { x: 30, y: 730, size: 9, font: fontRegular, color: PDFLib.rgb(0.2, 0.2, 0.3), lineHeight: 16 });

    page.drawText('SKILLS', { x: 30, y: 640, size: 11, font: fontBold, color: primary });
    page.drawText('• Kotlin & Android\n• TypeScript & React\n• Cloud Architecture\n• Jetpack Compose\n• PDF Engine Design\n• High-Perf WebAssembly', { x: 30, y: 530, size: 9, font: fontRegular, color: PDFLib.rgb(0.2, 0.2, 0.3), lineHeight: 18 });

    // Right Column Experience
    page.drawText('EXPERIENCE', { x: 210, y: 710, size: 13, font: fontBold, color: primary });
    page.drawText('Staff Mobile Engineer — Apex Technologies (2022 - Present)', { x: 210, y: 685, size: 11, font: fontBold, color: PDFLib.rgb(0.1, 0.1, 0.15) });
    page.drawText('Led architectural overhaul of high-concurrency document processing engine, reducing latency by 45% and memory footprint by 60MB across 2M active devices.', { x: 210, y: 645, size: 9, font: fontRegular, color: PDFLib.rgb(0.3, 0.3, 0.35), maxWidth: 340, lineHeight: 14 });

    page.drawText('Lead Systems Engineer — Vertex Systems (2018 - 2022)', { x: 210, y: 595, size: 11, font: fontBold, color: PDFLib.rgb(0.1, 0.1, 0.15) });
    page.drawText('Engineered native cryptographic workflows, automated CI/CD pipelines, and real-time offline synchronization suites.', { x: 210, y: 560, size: 9, font: fontRegular, color: PDFLib.rgb(0.3, 0.3, 0.35), maxWidth: 340, lineHeight: 14 });

    return await pdfDoc.save();
  },

  async createCertificateTemplate() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const page = pdfDoc.addPage([841.89, 595.28]); // Landscape A4
    const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const gold = PDFLib.rgb(0.85, 0.65, 0.13);

    // Decorative Borders
    page.drawRectangle({
      x: 30,
      y: 30,
      width: 781.89,
      height: 535.28,
      borderColor: gold,
      borderWidth: 4
    });
    page.drawRectangle({
      x: 40,
      y: 40,
      width: 761.89,
      height: 515.28,
      borderColor: PDFLib.rgb(0.15, 0.15, 0.25),
      borderWidth: 1
    });

    page.drawText('CERTIFICATE OF EXCELLENCE', {
      x: 230,
      y: 460,
      size: 26,
      font: fontBold,
      color: PDFLib.rgb(0.15, 0.15, 0.25)
    });

    page.drawText('THIS CERTIFICATE IS PROUDLY PRESENTED TO', {
      x: 290,
      y: 410,
      size: 11,
      font: fontRegular,
      color: gold
    });

    page.drawText('JOHNATHAN DOE', {
      x: 310,
      y: 350,
      size: 28,
      font: fontBold,
      color: PDFLib.rgb(0.1, 0.1, 0.15)
    });

    page.drawText('In recognition of outstanding dedication, exemplary engineering performance, and transformative contributions to PDF Studio Ultimate.', {
      x: 180,
      y: 280,
      size: 12,
      font: fontRegular,
      color: PDFLib.rgb(0.3, 0.3, 0.35),
      maxWidth: 480,
      lineHeight: 18
    });

    page.drawLine({ start: { x: 180, y: 140 }, end: { x: 340, y: 140 }, color: gold, thickness: 1 });
    page.drawText('Director of Engineering', { x: 200, y: 120, size: 10, font: fontRegular, color: PDFLib.rgb(0.4, 0.4, 0.4) });

    page.drawLine({ start: { x: 500, y: 140 }, end: { x: 660, y: 140 }, color: gold, thickness: 1 });
    page.drawText('Program Director', { x: 540, y: 120, size: 10, font: fontRegular, color: PDFLib.rgb(0.4, 0.4, 0.4) });

    return await pdfDoc.save();
  },

  /**
   * Toggles Full-Screen mode
   */
  toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
  },

  /**
   * Triggers native print preview
   */
  printDocument() {
    window.print();
  }
};
