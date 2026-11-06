/**
 * PDF Studio Ultimate - Document Translation Workspace
 * Extracts PDF text, provides side-by-side translation editor with local offline phrasebook,
 * and compiles translated text directly into a new downloadable PDF.
 * NOTE: Does not call external translation APIs.
 */

const PdfTranslator = {
  extractedText: '',

  /**
   * Extracts text from current PDF for the translation workspace
   */
  async loadTextFromCurrentPdf() {
    if (!window.pdfEditor || !window.pdfEditor.pdfDoc) {
      alert('Please open a PDF document first.');
      return '';
    }

    const doc = window.pdfEditor.pdfDoc;
    let fullText = '';

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += `[Page ${i}]\n` + pageText + '\n\n';
    }

    this.extractedText = fullText.trim();
    return this.extractedText;
  },

  /**
   * Applies local dictionary substitutions for common formal business/document phrases
   */
  applyOfflineGlossary(text, sourceLang, targetLang) {
    if (sourceLang === targetLang) return text;

    // Offline translation phrase dictionary for standard business/legal terms
    const glossary = {
      'es': {
        'invoice': 'factura',
        'agreement': 'acuerdo',
        'contract': 'contrato',
        'date': 'fecha',
        'total': 'total',
        'amount': 'monto',
        'signature': 'firma',
        'confidential': 'confidencial',
        'client': 'cliente',
        'description': 'descripción',
        'terms': 'términos',
        'payment': 'pago'
      },
      'fr': {
        'invoice': 'facture',
        'agreement': 'accord',
        'contract': 'contrat',
        'date': 'date',
        'total': 'total',
        'amount': 'montant',
        'signature': 'signature',
        'confidential': 'confidentiel',
        'client': 'client',
        'description': 'description',
        'terms': 'conditions',
        'payment': 'paiement'
      },
      'de': {
        'invoice': 'Rechnung',
        'agreement': 'Vereinbarung',
        'contract': 'Vertrag',
        'date': 'Datum',
        'total': 'Gesamt',
        'amount': 'Betrag',
        'signature': 'Unterschrift',
        'confidential': 'vertraulich',
        'client': 'Kunde',
        'description': 'Beschreibung',
        'terms': 'Bedingungen',
        'payment': 'Zahlung'
      },
      'bn': {
        'invoice': 'চালান (Invoice)',
        'agreement': 'চুক্তি (Agreement)',
        'contract': 'চুক্তিপত্র (Contract)',
        'date': 'তারিখ (Date)',
        'total': 'মোট (Total)',
        'amount': 'পরিমাণ (Amount)',
        'signature': 'স্বাক্ষর (Signature)',
        'confidential': 'গোপনীয় (Confidential)',
        'client': 'গ্রাহক (Client)',
        'payment': 'পরিশোধ (Payment)'
      }
    };

    let translated = text;
    const dict = glossary[targetLang];
    if (dict) {
      Object.entries(dict).forEach(([enWord, transWord]) => {
        const regex = new RegExp(`\\b${enWord}\\b`, 'gi');
        translated = translated.replace(regex, transWord);
      });
    }

    return translated;
  },

  /**
   * Compiles translated text into a fresh, formatted PDF
   */
  async compileTranslatedPdf(translatedText, targetLangName = 'Translated') {
    if (!translatedText || !translatedText.trim()) {
      alert('Please enter or import translated text first.');
      return;
    }

    const title = `Document_${targetLangName}`;
    await PdfConverter.textToPdf(translatedText, title);
    if (window.AndroidBridge) window.AndroidBridge.showToast('Translated PDF compiled successfully');
  }
};
