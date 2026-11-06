/**
 * PDF Studio Ultimate - Built-in Sample PDF Generators
 * Generates valid, self-contained PDF documents offline using PDF-Lib
 */
const SampleDocs = {
  /**
   * Generates a professional sample invoice PDF
   */
  async createSampleInvoice() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const primaryColor = PDFLib.rgb(1, 0.2, 0.4);
    const darkColor = PDFLib.rgb(0.1, 0.1, 0.15);
    const grayColor = PDFLib.rgb(0.4, 0.4, 0.5);

    // Header Banner
    page.drawRectangle({
      x: 0,
      y: 780,
      width: 595.28,
      height: 61.89,
      color: PDFLib.rgb(0.96, 0.96, 0.98),
    });

    page.drawText('PDF STUDIO INC.', {
      x: 40,
      y: 800,
      size: 20,
      font: fontBold,
      color: primaryColor,
    });

    page.drawText('INVOICE #INV-2026-089', {
      x: 370,
      y: 800,
      size: 14,
      font: fontBold,
      color: darkColor,
    });

    // Client Info
    page.drawText('Billed To:', { x: 40, y: 740, size: 12, font: fontBold, color: primaryColor });
    page.drawText('Acme Global Enterprises', { x: 40, y: 722, size: 11, font: fontRegular, color: darkColor });
    page.drawText('100 Innovation Way, Suite 400', { x: 40, y: 706, size: 10, font: fontRegular, color: grayColor });
    page.drawText('San Francisco, CA 94105', { x: 40, y: 692, size: 10, font: fontRegular, color: grayColor });

    // Invoice Meta
    page.drawText('Issue Date: November 05, 2026', { x: 370, y: 740, size: 10, font: fontRegular, color: darkColor });
    page.drawText('Due Date: December 05, 2026', { x: 370, y: 724, size: 10, font: fontRegular, color: darkColor });
    page.drawText('Payment Terms: Net 30', { x: 370, y: 708, size: 10, font: fontRegular, color: darkColor });

    // Table Header
    page.drawRectangle({
      x: 40,
      y: 640,
      width: 515.28,
      height: 28,
      color: primaryColor,
    });

    page.drawText('Description', { x: 50, y: 650, size: 10, font: fontBold, color: PDFLib.rgb(1, 1, 1) });
    page.drawText('Qty', { x: 320, y: 650, size: 10, font: fontBold, color: PDFLib.rgb(1, 1, 1) });
    page.drawText('Rate', { x: 390, y: 650, size: 10, font: fontBold, color: PDFLib.rgb(1, 1, 1) });
    page.drawText('Amount', { x: 480, y: 650, size: 10, font: fontBold, color: PDFLib.rgb(1, 1, 1) });

    // Line Items
    const items = [
      { desc: 'PDF Studio Enterprise License (Offline Edition)', qty: '50', rate: '$49.00', total: '$2,450.00' },
      { desc: 'Document Security & Digital Signature Engine', qty: '1', rate: '$850.00', total: '$850.00' },
      { desc: 'Local OCR & Batch Conversion Module', qty: '1', rate: '$620.00', total: '$620.00' },
      { desc: 'Annual On-Site Support & Software Assurance', qty: '12', rate: '$75.00', total: '$900.00' },
    ];

    let currentY = 615;
    items.forEach((item, index) => {
      if (index % 2 === 1) {
        page.drawRectangle({
          x: 40,
          y: currentY - 6,
          width: 515.28,
          height: 24,
          color: PDFLib.rgb(0.97, 0.97, 0.99),
        });
      }
      page.drawText(item.desc, { x: 50, y: currentY, size: 9, font: fontRegular, color: darkColor });
      page.drawText(item.qty, { x: 325, y: currentY, size: 9, font: fontRegular, color: darkColor });
      page.drawText(item.rate, { x: 390, y: currentY, size: 9, font: fontRegular, color: darkColor });
      page.drawText(item.total, { x: 480, y: currentY, size: 9, font: fontBold, color: darkColor });
      currentY -= 28;
    });

    // Summary Box
    page.drawRectangle({
      x: 360,
      y: currentY - 60,
      width: 195.28,
      height: 70,
      color: PDFLib.rgb(0.95, 0.95, 0.98),
      borderColor: PDFLib.rgb(0.85, 0.85, 0.9),
      borderWidth: 1,
    });

    page.drawText('Subtotal: $4,820.00', { x: 380, y: currentY - 15, size: 10, font: fontRegular, color: darkColor });
    page.drawText('Tax (8.5%): $409.70', { x: 380, y: currentY - 32, size: 10, font: fontRegular, color: darkColor });
    page.drawText('Total Due: $5,229.70', { x: 380, y: currentY - 50, size: 12, font: fontBold, color: primaryColor });

    // Footer & Notes
    page.drawText('Thank you for choosing PDF Studio! Payments accepted via ACH or wire transfer.', {
      x: 40,
      y: 100,
      size: 9,
      font: fontRegular,
      color: grayColor,
    });
    page.drawText('Support: support@pdfstudio.local | Verification ID: 8847-XF-2026', {
      x: 40,
      y: 85,
      size: 8,
      font: fontRegular,
      color: grayColor,
    });

    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  },

  /**
   * Generates a sample business agreement / contract PDF
   */
  async createSampleContract() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const page1 = pdfDoc.addPage([595.28, 841.89]);
    const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const primaryColor = PDFLib.rgb(0.08, 0.45, 0.85);
    const darkColor = PDFLib.rgb(0.12, 0.12, 0.18);

    page1.drawText('NON-DISCLOSURE AND SERVICE AGREEMENT', {
      x: 50,
      y: 770,
      size: 16,
      font: fontBold,
      color: primaryColor,
    });

    page1.drawText('This Agreement is entered into as of November 05, 2026, by and between:', {
      x: 50,
      y: 735,
      size: 10,
      font: fontRegular,
      color: darkColor,
    });

    page1.drawText('PARTY A: Alpha Tech Solutions LLC ("Disclosing Party")', {
      x: 50,
      y: 710,
      size: 10,
      font: fontBold,
      color: darkColor,
    });
    page1.drawText('PARTY B: Beta Development Corp ("Receiving Party")', {
      x: 50,
      y: 690,
      size: 10,
      font: fontBold,
      color: darkColor,
    });

    const clauses = [
      '1. PURPOSE & SCOPE OF CONFIDENTIALITY',
      'The parties agree that all trade secrets, source code, design blueprints, and algorithmic workflows disclosed shall remain confidential for a period of five (5) years from disclosure.',
      '2. PERMITTED USE & EXCLUSIONS',
      'The Receiving Party shall not reverse engineer, duplicate, or distribute any proprietary material without express written consent from the Disclosing Party.',
      '3. DATA PRIVACY & COMPLIANCE',
      'Both parties commit to strict local storage, encryption at rest, and zero unauthorized third-party telemetry in compliance with international privacy mandates.',
      '4. TERMINATION & SURVIVAL',
      'Either party may terminate this agreement with thirty (30) days written notice. Obligations of non-disclosure shall survive termination indefinitely.',
    ];

    let y = 650;
    for (let i = 0; i < clauses.length; i += 2) {
      page1.drawText(clauses[i], { x: 50, y, size: 11, font: fontBold, color: primaryColor });
      y -= 18;
      page1.drawText(clauses[i + 1], { x: 50, y, size: 9, font: fontRegular, color: darkColor, maxWidth: 495 });
      y -= 45;
    }

    // Signatures placeholder block
    page1.drawText('IN WITNESS WHEREOF, the parties hereto have executed this Agreement.', {
      x: 50,
      y: 200,
      size: 10,
      font: fontBold,
      color: darkColor,
    });

    page1.drawRectangle({
      x: 50,
      y: 90,
      width: 220,
      height: 80,
      borderColor: PDFLib.rgb(0.7, 0.7, 0.75),
      borderWidth: 1,
    });
    page1.drawText('Authorized Signature (Party A):', { x: 60, y: 155, size: 9, font: fontRegular, color: darkColor });
    page1.drawText('[Sign here using Smart Signature tool]', { x: 60, y: 105, size: 8, font: fontRegular, color: PDFLib.rgb(0.6, 0.6, 0.6) });

    page1.drawRectangle({
      x: 320,
      y: 90,
      width: 220,
      height: 80,
      borderColor: PDFLib.rgb(0.7, 0.7, 0.75),
      borderWidth: 1,
    });
    page1.drawText('Authorized Signature (Party B):', { x: 330, y: 155, size: 9, font: fontRegular, color: darkColor });
    page1.drawText('[Sign here using Smart Signature tool]', { x: 330, y: 105, size: 8, font: fontRegular, color: PDFLib.rgb(0.6, 0.6, 0.6) });

    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  },

  /**
   * Creates a blank PDF with specified page count
   */
  async createBlankPdf(pageCount = 1, orientation = 'portrait') {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const dimensions = orientation === 'landscape' ? [841.89, 595.28] : [595.28, 841.89];
    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.addPage(dimensions);
      page.drawText(`Page ${i + 1}`, {
        x: dimensions[0] / 2 - 20,
        y: 30,
        size: 9,
        font: font,
        color: PDFLib.rgb(0.6, 0.6, 0.6),
      });
    }

    return await pdfDoc.save();
  }
};
