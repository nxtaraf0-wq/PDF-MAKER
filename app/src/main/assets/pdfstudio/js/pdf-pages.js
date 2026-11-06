/**
 * PDF Studio Ultimate - Page Management Module
 * Add, delete, duplicate, rotate, rearrange, merge, split, extract pages
 */

const PdfPages = {
  /**
   * Adds a blank page to the current document
   */
  async addBlankPage(atIndex = null, orientation = 'portrait') {
    if (!window.pdfEditor || !window.pdfEditor.rawBytes) return;
    const pdfDoc = await PDFLib.PDFDocument.load(window.pdfEditor.rawBytes);
    const size = orientation === 'landscape' ? [841.89, 595.28] : [595.28, 841.89];
    
    const insertIdx = atIndex !== null ? atIndex : pdfDoc.getPageCount();
    pdfDoc.insertPage(insertIdx, size);

    const newBytes = await pdfDoc.save();
    await window.pdfEditor.loadPdfBytes(newBytes, window.pdfEditor.docName);
    if (window.AndroidBridge) window.AndroidBridge.showToast('Blank page added');
  },

  /**
   * Deletes a page from the document
   */
  async deletePage(pageIndex) {
    if (!window.pdfEditor || !window.pdfEditor.rawBytes) return;
    const pdfDoc = await PDFLib.PDFDocument.load(window.pdfEditor.rawBytes);
    if (pdfDoc.getPageCount() <= 1) {
      alert('A PDF document must have at least one page.');
      return;
    }

    pdfDoc.removePage(pageIndex - 1);
    const newBytes = await pdfDoc.save();
    await window.pdfEditor.loadPdfBytes(newBytes, window.pdfEditor.docName);
    if (window.AndroidBridge) window.AndroidBridge.showToast(`Page ${pageIndex} deleted`);
  },

  /**
   * Duplicates a page in the document
   */
  async duplicatePage(pageIndex) {
    if (!window.pdfEditor || !window.pdfEditor.rawBytes) return;
    const pdfDoc = await PDFLib.PDFDocument.load(window.pdfEditor.rawBytes);
    const [copiedPage] = await pdfDoc.copyPages(pdfDoc, [pageIndex - 1]);
    pdfDoc.insertPage(pageIndex, copiedPage);

    const newBytes = await pdfDoc.save();
    await window.pdfEditor.loadPdfBytes(newBytes, window.pdfEditor.docName);
    if (window.AndroidBridge) window.AndroidBridge.showToast(`Page ${pageIndex} duplicated`);
  },

  /**
   * Rotates a page by degrees (90, 180, 270)
   */
  async rotatePage(pageIndex, degrees = 90) {
    if (!window.pdfEditor || !window.pdfEditor.rawBytes) return;
    const pdfDoc = await PDFLib.PDFDocument.load(window.pdfEditor.rawBytes);
    const page = pdfDoc.getPage(pageIndex - 1);
    const currentRot = page.getRotation().angle;
    page.setRotation(PDFLib.degrees((currentRot + degrees) % 360));

    const newBytes = await pdfDoc.save();
    await window.pdfEditor.loadPdfBytes(newBytes, window.pdfEditor.docName);
    if (window.AndroidBridge) window.AndroidBridge.showToast(`Page ${pageIndex} rotated ${degrees}°`);
  },

  /**
   * Moves a page to a new index
   */
  async movePage(fromIndex, toIndex) {
    if (!window.pdfEditor || !window.pdfEditor.rawBytes) return;
    if (fromIndex === toIndex) return;

    const pdfDoc = await PDFLib.PDFDocument.load(window.pdfEditor.rawBytes);
    const count = pdfDoc.getPageCount();
    if (fromIndex < 1 || fromIndex > count || toIndex < 1 || toIndex > count) return;

    const pageIndices = Array.from({ length: count }, (_, i) => i);
    const [moved] = pageIndices.splice(fromIndex - 1, 1);
    pageIndices.splice(toIndex - 1, 0, moved);

    const newDoc = await PDFLib.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach(p => newDoc.addPage(p));

    const newBytes = await newDoc.save();
    await window.pdfEditor.loadPdfBytes(newBytes, window.pdfEditor.docName);
  },

  /**
   * Extracts specific pages into a new standalone PDF
   */
  async extractPages(pageIndicesArray) {
    if (!window.pdfEditor || !window.pdfEditor.rawBytes) return;
    const pdfDoc = await PDFLib.PDFDocument.load(window.pdfEditor.rawBytes);
    const newDoc = await PDFLib.PDFDocument.create();

    const zeroBasedIndices = pageIndicesArray.map(p => p - 1);
    const copiedPages = await newDoc.copyPages(pdfDoc, zeroBasedIndices);
    copiedPages.forEach(p => newDoc.addPage(p));

    const extractedBytes = await newDoc.save();
    const filename = `Extracted_Pages_${pageIndicesArray.join('-')}.pdf`;

    if (window.AndroidBridge) {
      const b64 = window.pdfEditor.uint8ArrayToBase64(extractedBytes);
      window.AndroidBridge.saveFile(b64, filename, 'application/pdf');
    } else {
      const blob = new Blob([extractedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  },

  /**
   * Merges multiple PDF Uint8Arrays into one combined document
   */
  async mergePdfArray(pdfBytesList, outputFilename = 'Merged_Document.pdf') {
    const mergedDoc = await PDFLib.PDFDocument.create();
    for (const bytes of pdfBytesList) {
      const doc = await PDFLib.PDFDocument.load(bytes);
      const count = doc.getPageCount();
      const pageIndices = Array.from({ length: count }, (_, i) => i);
      const copiedPages = await mergedDoc.copyPages(doc, pageIndices);
      copiedPages.forEach(p => mergedDoc.addPage(p));
    }

    const mergedBytes = await mergedDoc.save();
    return mergedBytes;
  },

  /**
   * Adds page numbers (e.g. "Page X of Y") to all pages
   */
  async addPageNumbers(position = 'bottom-center') {
    if (!window.pdfEditor || !window.pdfEditor.rawBytes) return;
    const pdfDoc = await PDFLib.PDFDocument.load(window.pdfEditor.rawBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const total = pages.length;

    pages.forEach((page, idx) => {
      const { width, height } = page.getSize();
      const text = `Page ${idx + 1} of ${total}`;
      const textWidth = font.widthOfTextAtSize(text, 9);
      
      let x = (width - textWidth) / 2;
      let y = 25;
      if (position === 'bottom-right') x = width - textWidth - 35;
      else if (position === 'top-center') y = height - 25;

      page.drawText(text, {
        x,
        y,
        size: 9,
        font,
        color: PDFLib.rgb(0.4, 0.4, 0.4)
      });
    });

    const newBytes = await pdfDoc.save();
    await window.pdfEditor.loadPdfBytes(newBytes, window.pdfEditor.docName);
    if (window.AndroidBridge) window.AndroidBridge.showToast('Page numbers added');
  }
};
