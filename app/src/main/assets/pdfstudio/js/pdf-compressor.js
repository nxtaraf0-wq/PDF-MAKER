/**
 * PDF Studio Ultimate - PDF Compressor
 * Compresses PDF files by optimizing and re-encoding page render streams at user-chosen quality,
 * calculating and displaying exact before/after bytes and genuine reduction percentage.
 */

const PdfCompressor = {
  /**
   * Compresses current or uploaded PDF
   * level: 'low' (quality 0.85, scale 1.5), 'medium' (quality 0.65, scale 1.2), 'high' (quality 0.45, scale 1.0)
   */
  async compressDocument(level = 'medium', customQuality = null, customScale = null) {
    if (!window.pdfEditor || !window.pdfEditor.rawBytes || !window.pdfEditor.pdfDoc) {
      alert('Please open a PDF document first.');
      return;
    }

    const originalBytes = window.pdfEditor.rawBytes;
    const originalSize = originalBytes.byteLength;
    const doc = window.pdfEditor.pdfDoc;
    const numPages = doc.numPages;

    let quality = 0.65;
    let scale = 1.2;

    if (level === 'low') {
      quality = 0.85;
      scale = 1.4;
    } else if (level === 'medium') {
      quality = 0.65;
      scale = 1.1;
    } else if (level === 'high') {
      quality = 0.42;
      scale = 0.85;
    } else if (level === 'custom') {
      quality = customQuality !== null ? customQuality : 0.6;
      scale = customScale !== null ? customScale : 1.0;
    }

    const compressedPdfDoc = await PDFLib.PDFDocument.create();

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Also bake any overlay edits
      const overlay = document.getElementById(`overlay-canvas-${i}`);
      if (overlay) {
        ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
      }

      const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
      const jpegImage = await compressedPdfDoc.embedJpg(jpegDataUrl);

      // Keep original page points dimensions
      const originalPage = await (await PDFLib.PDFDocument.load(originalBytes)).getPages()[i - 1];
      const { width, height } = originalPage.getSize();

      const newPage = compressedPdfDoc.addPage([width, height]);
      newPage.drawImage(jpegImage, {
        x: 0,
        y: 0,
        width: width,
        height: height
      });
    }

    let compressedBytes = await compressedPdfDoc.save();
    let finalSize = compressedBytes.byteLength;

    // Accuracy guarantee: Never claim compression if file size did not decrease
    let reductionPercent = 0;
    let isCompressed = false;

    if (finalSize < originalSize) {
      reductionPercent = (((originalSize - finalSize) / originalSize) * 100).toFixed(1);
      isCompressed = true;
    } else {
      // If re-encoding resulted in a larger file (rare, but can happen on pure text PDFs),
      // keep original and inform user with honest metrics
      compressedBytes = originalBytes;
      finalSize = originalSize;
      reductionPercent = '0.0';
      isCompressed = false;
    }

    return {
      originalBytes: originalSize,
      originalFormatted: this.formatBytes(originalSize),
      compressedBytes: finalSize,
      compressedFormatted: this.formatBytes(finalSize),
      reductionPercent: reductionPercent,
      isCompressed: isCompressed,
      pdfBytes: compressedBytes
    };
  },

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};
