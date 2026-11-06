/**
 * PDF Studio Ultimate - Offline Document Assistant (100% Rule-Based & Local)
 * Extractive summarization, keyword extraction, regex entity extraction,
 * readability scoring, and local grammar/spelling heuristics.
 * NOTE: Operates completely offline without any external AI or cloud API.
 */

const PdfAssistant = {
  /**
   * Analyzes text extracted from current PDF document
   */
  async analyzeDocument() {
    if (!window.pdfEditor || !window.pdfEditor.pdfDoc) {
      alert('Please open or create a PDF first.');
      return null;
    }

    const doc = window.pdfEditor.pdfDoc;
    let fullText = '';
    const pageTexts = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pText = textContent.items.map(it => it.str).join(' ');
      pageTexts.push(pText);
      fullText += ' ' + pText;
    }

    fullText = fullText.trim();
    if (!fullText) {
      return {
        isEmpty: true,
        message: 'No readable text layer found in document. Try the OCR Scanned Document tool.'
      };
    }

    // 1. Text Metrics
    const words = fullText.match(/\b[a-zA-Z0-9'-]+\b/g) || [];
    const wordCount = words.length;
    const charCount = fullText.length;
    const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
    const sentenceCount = sentences.length;
    const readingTimeMin = Math.max(1, Math.ceil(wordCount / 200));
    const speakingTimeMin = Math.max(1, Math.ceil(wordCount / 130));

    // 2. Extractive Summary (Sentence Scoring via term frequency)
    const summary = this.generateExtractiveSummary(sentences, words, 4);

    // 3. Keyword / Key Terms Extraction (TF-IDF approximation)
    const keywords = this.extractKeywords(words, 10);

    // 4. Entity Extraction (Regex)
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
    const dateRegex = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})\b/gi;
    const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/gi;

    const emails = Array.from(new Set(fullText.match(emailRegex) || []));
    const phones = Array.from(new Set(fullText.match(phoneRegex) || []));
    const dates = Array.from(new Set(fullText.match(dateRegex) || []));
    const urls = Array.from(new Set(fullText.match(urlRegex) || []));

    // 5. Headings Identification
    const headings = this.extractHeadings(fullText);

    // 6. Repeated Words
    const repeatedWords = this.findRepeatedWords(words);

    // 7. Grammar & Style Heuristics
    const suggestions = this.checkStyleAndGrammar(fullText, sentences);

    // 8. Readability Score (Flesch Reading Ease)
    const syllables = words.reduce((acc, w) => acc + this.countSyllables(w), 0);
    const avgSentenceLen = wordCount / Math.max(1, sentenceCount);
    const avgSyllablesPerWord = syllables / Math.max(1, wordCount);
    const fleschScore = Math.max(0, Math.min(100, Math.round(206.835 - (1.015 * avgSentenceLen) - (84.6 * avgSyllablesPerWord))));
    let readingLevel = 'Standard (High School)';
    if (fleschScore > 80) readingLevel = 'Very Easy (Conversational)';
    else if (fleschScore > 60) readingLevel = 'Standard / Accessible';
    else if (fleschScore > 40) readingLevel = 'Fairly Difficult (College)';
    else readingLevel = 'Very Confusing / Technical (Graduate)';

    return {
      isEmpty: false,
      metrics: {
        pages: doc.numPages,
        words: wordCount,
        characters: charCount,
        sentences: sentenceCount,
        readingTime: `${readingTimeMin} min`,
        speakingTime: `${speakingTimeMin} min`,
        readabilityScore: fleschScore,
        readingLevel: readingLevel
      },
      summary: summary,
      keywords: keywords,
      entities: {
        emails: emails,
        phones: phones,
        dates: dates,
        urls: urls
      },
      headings: headings,
      repeatedWords: repeatedWords,
      suggestions: suggestions
    };
  },

  /**
   * Ranks sentences by word frequency to produce a concise extractive summary
   */
  generateExtractiveSummary(sentences, words, targetSentences = 3) {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of', 'or', 'by', 'with', 'from',
      'this', 'that', 'it', 'as', 'be', 'are', 'was', 'were', 'will', 'have', 'has', 'had', 'do', 'does', 'did',
      'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him',
      'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'
    ]);

    const freq = {};
    words.forEach(w => {
      const lower = w.toLowerCase();
      if (!stopWords.has(lower) && lower.length > 2) {
        freq[lower] = (freq[lower] || 0) + 1;
      }
    });

    const scored = sentences.map((sentence, index) => {
      const sWords = sentence.match(/\b[a-zA-Z0-9'-]+\b/g) || [];
      if (sWords.length < 5) return { sentence, score: 0, index };
      let score = 0;
      sWords.forEach(w => {
        const lower = w.toLowerCase();
        if (freq[lower]) score += freq[lower];
      });
      // Normalize by sentence length
      score = score / Math.sqrt(sWords.length);
      // Boost initial sentences
      if (index === 0) score *= 1.4;
      return { sentence: sentence.trim(), score, index };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, targetSentences);
    top.sort((a, b) => a.index - b.index); // restore reading order
    return top.map(item => item.sentence).join(' ');
  },

  /**
   * Extracts most frequent non-stop words
   */
  extractKeywords(words, count = 10) {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of', 'or', 'by', 'with', 'from',
      'this', 'that', 'it', 'as', 'be', 'are', 'was', 'were', 'will', 'have', 'has', 'had', 'their', 'there',
      'about', 'into', 'them', 'then', 'than', 'some', 'these', 'would', 'other', 'could', 'after', 'also'
    ]);

    const counts = {};
    words.forEach(w => {
      const l = w.toLowerCase();
      if (!stopWords.has(l) && l.length > 3) {
        counts[l] = (counts[l] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([word, freq]) => ({ word, freq }));
  },

  /**
   * Extracts title & section headings (lines in ALL CAPS or starting with numbering)
   */
  extractHeadings(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const headings = [];

    lines.forEach(line => {
      // Check for numbered sections or capitalized titles
      if (/^(\d+\.|\d+\.\d+|ARTICLE|SECTION|CHAPTER)\s+[A-Z]/i.test(line) ||
          (line.length < 60 && line.length > 4 && line === line.toUpperCase() && !line.includes(':'))) {
        headings.push(line);
      }
    });

    return headings.slice(0, 15);
  },

  /**
   * Finds immediately repeated words (e.g., "the the", "is is")
   */
  findRepeatedWords(words) {
    const duplicates = [];
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].toLowerCase() === words[i + 1].toLowerCase() && words[i].length > 1) {
        duplicates.push(`"${words[i]} ${words[i + 1]}"`);
      }
    }
    return Array.from(new Set(duplicates));
  },

  /**
   * Rule-based grammar and stylistic suggestions
   */
  checkStyleAndGrammar(fullText, sentences) {
    const suggestions = [];

    // Check passive voice flags
    const passiveMatches = fullText.match(/\b(is|are|was|were|been|being)\s+([a-z]+ed|[a-z]+en)\b/gi);
    if (passiveMatches && passiveMatches.length > 2) {
      suggestions.push({
        type: 'Style',
        text: `Detected ${passiveMatches.length} passive voice phrases (e.g., "${passiveMatches[0]}"). Consider active phrasing for stronger tone.`
      });
    }

    // Check for extremely long sentences
    sentences.forEach(s => {
      const wCount = (s.match(/\b\w+\b/g) || []).length;
      if (wCount > 38) {
        suggestions.push({
          type: 'Readability',
          text: `Long sentence with ${wCount} words: "${s.substring(0, 50)}...". Consider splitting.`
        });
      }
    });

    // Check common typo pairs
    const commonTypos = [
      { pattern: /\bteh\b/gi, fix: 'the' },
      { pattern: /\brecieve\b/gi, fix: 'receive' },
      { pattern: /\bseperate\b/gi, fix: 'separate' },
      { pattern: /\bdefinately\b/gi, fix: 'definitely' },
      { pattern: /\boccured\b/gi, fix: 'occurred' }
    ];

    commonTypos.forEach(({ pattern, fix }) => {
      if (pattern.test(fullText)) {
        suggestions.push({
          type: 'Spelling',
          text: `Possible spelling mistake matching '${pattern}'. Suggested: "${fix}".`
        });
      }
    });

    return suggestions;
  },

  countSyllables(word) {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]|ed|es|e)$/, '');
    word = word.replace(/^y/, '');
    const m = word.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }
};
