/**
 * PDF Studio Ultimate - Document Conversion Suite
 * Converts PDF to Images (JPG, PNG, WebP), Images to PDF, TXT to PDF,
 * HTML to PDF, PDF to TXT, PDF to DOCX, and PDF to CSV/Excel.
 */

const PdfConverter = {
  /**
   * Converts current PDF pages to Images (PNG, JPG, or WebP) and packages in ZIP or single download
   */
  async pdfToImages(format = 'png', quality = 0.92) {
    if (!window.pdfEditor || !window.pdfEditor.pdfDoc) {
      alert('Please open or create a PDF first.');
      return;
    }

    const doc = window.pdfEditor.pdfDoc;
    const numPages = doc.numPages;
    const mimeType = format === 'jpg' ? 'image/jpeg' : (format === 'webp' ? 'image/webp' : 'image/png');
    const ext = format === 'jpg' ? 'jpg' : (format === 'webp' ? 'webp' : 'png');

    const zip = new JSZip();
    const baseName = window.pdfEditor.docName.replace(/\.pdf$/i, '');

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // High-res

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Also render user annotations on top of the exported image
      const overlay = document.getElementById(`overlay-canvas-${i}`);
      if (overlay) {
        ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
      }

      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64Data = dataUrl.split(',')[1];
      zip.file(`${baseName}_page_${i}.${ext}`, base64Data, { base64: true });
    }

    const zipContent = await zip.generateAsync({ type: 'uint8array' });
    const zipName = `${baseName}_images_${format.toUpperCase()}.zip`;

    if (window.AndroidBridge) {
      const b64 = window.pdfEditor.uint8ArrayToBase64(zipContent);
      window.AndroidBridge.saveFile(b64, zipName, 'application/zip');
    } else {
      const blob = new Blob([zipContent], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      a.click();
    }
  },

  /**
   * Converts multiple uploaded images into a combined single PDF
   */
  async imagesToPdf(imageFileList) {
    if (!imageFileList || !imageFileList.length) return;
    const pdfDoc = await PDFLib.PDFDocument.create();

    for (const file of imageFileList) {
      const arrayBuffer = await file.arrayBuffer();
      let pdfImage;
      if (file.type.includes('png')) {
        pdfImage = await pdfDoc.embedPng(arrayBuffer);
      } else {
        pdfImage = await pdfDoc.embedJpg(arrayBuffer);
      }

      const imgWidth = pdfImage.width;
      const imgHeight = pdfImage.height;

      // Fit inside A4 or match aspect ratio
      const page = pdfDoc.addPage([imgWidth, imgHeight]);
      page.drawImage(pdfImage, {
        x: 0,
        y: 0,
        width: imgWidth,
        height: imgHeight
      });
    }

    const pdfBytes = await pdfDoc.save();
    await window.pdfEditor.loadPdfBytes(pdfBytes, 'Images_Combined.pdf');
    if (window.AndroidBridge) window.AndroidBridge.showToast('Images converted to PDF');
  },

  /**
   * Converts plain text file or string to styled multi-page PDF
   */
  async textToPdf(textString, title = 'Document') {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;
    const fontSize = 11;
    const lineHeight = 16;

    // Split text into lines
    const paragraphs = textString.split('\n');
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let currentY = pageHeight - margin;

    // Header Title
    page.drawText(title, {
      x: margin,
      y: currentY,
      size: 16,
      font: fontBold,
      color: PDFLib.rgb(0.1, 0.1, 0.2)
    });
    currentY -= 30;

    for (const para of paragraphs) {
      if (!para.trim()) {
        currentY -= lineHeight;
        continue;
      }

      // Word wrapping
      const words = para.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth > contentWidth && currentLine) {
          if (currentY < margin + lineHeight) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            currentY = pageHeight - margin;
          }
          page.drawText(currentLine, { x: margin, y: currentY, size: fontSize, font, color: PDFLib.rgb(0.2, 0.2, 0.25) });
          currentY -= lineHeight;
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        if (currentY < margin + lineHeight) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          currentY = pageHeight - margin;
        }
        page.drawText(currentLine, { x: margin, y: currentY, size: fontSize, font, color: PDFLib.rgb(0.2, 0.2, 0.25) });
        currentY -= lineHeight;
      }
    }

    const pdfBytes = await pdfDoc.save();
    await window.pdfEditor.loadPdfBytes(pdfBytes, `${title.replace(/\s+/g, '_')}.pdf`);
  },

  /**
   * Extracts all text from PDF and saves as .txt file
   */
  async pdfToText() {
    if (!window.pdfEditor || !window.pdfEditor.pdfDoc) return;
    const doc = window.pdfEditor.pdfDoc;
    let fullText = '';

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `--- PAGE ${i} ---\n\n${pageText}\n\n`;
    }

    const filename = window.pdfEditor.docName.replace(/\.pdf$/i, '') + '.txt';
    if (window.AndroidBridge) {
      const b64 = window.btoa(unescape(encodeURIComponent(fullText)));
      window.AndroidBridge.saveFile(b64, filename, 'text/plain');
    } else {
      const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  },

  /**
   * Converts PDF to Word DOCX (valid OpenXML DOCX archive)
   */
  async pdfToDocx() {
    if (!window.pdfEditor || !window.pdfEditor.pdfDoc) return;
    const doc = window.pdfEditor.pdfDoc;
    let paragraphs = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      let lastY = null;
      let line = '';

      for (const item of textContent.items) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 8) {
          if (line.trim()) paragraphs.push(line.trim());
          line = item.str;
        } else {
          line += ' ' + item.str;
        }
        lastY = item.transform[5];
      }
      if (line.trim()) paragraphs.push(line.trim());
      paragraphs.push(`--- Page Break (Page ${i}) ---`);
    }

    // Generate valid OpenXML docx file using JSZip
    const zip = new JSZip();

    // [Content_Types].xml
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    // _rels/.rels
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    // word/document.xml
    const pXml = paragraphs.map(p => {
      const escaped = p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<w:p><w:r><w:t>${escaped}</w:t></w:r></w:p>`;
    }).join('');

    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${pXml}
  </w:body>
</w:document>`);

    const docxBytes = await zip.generateAsync({ type: 'uint8array' });
    const filename = window.pdfEditor.docName.replace(/\.pdf$/i, '') + '.docx';

    if (window.AndroidBridge) {
      const b64 = window.pdfEditor.uint8ArrayToBase64(docxBytes);
      window.AndroidBridge.saveFile(b64, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } else {
      const blob = new Blob([docxBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  },

  /**
   * Extracts tabular text into a CSV / Excel compatible spreadsheet
   */
  async pdfToExcel() {
    if (!window.pdfEditor || !window.pdfEditor.pdfDoc) return;
    const doc = window.pdfEditor.pdfDoc;
    let csvRows = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      
      // Group items by vertical position (rows)
      const rowsMap = {};
      textContent.items.forEach(item => {
        const yKey = Math.round(item.transform[5]);
        if (!rowsMap[yKey]) rowsMap[yKey] = [];
        rowsMap[yKey].push(item);
      });

      // Sort rows descending (top to bottom)
      const sortedY = Object.keys(rowsMap).map(Number).sort((a, b) => b - a);
      sortedY.forEach(y => {
        const items = rowsMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
        const cells = items.map(it => `"${it.str.replace(/"/g, '""')}"`);
        csvRows.push(cells.join(','));
      });
      csvRows.push(`"--- End of Page ${i} ---"`);
    }

    const csvContent = csvRows.join('\r\n');
    const filename = window.pdfEditor.docName.replace(/\.pdf$/i, '') + '.csv';

    if (window.AndroidBridge) {
      const b64 = window.btoa(unescape(encodeURIComponent(csvContent)));
      window.AndroidBridge.saveFile(b64, filename, 'text/csv');
    } else {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  }
};
