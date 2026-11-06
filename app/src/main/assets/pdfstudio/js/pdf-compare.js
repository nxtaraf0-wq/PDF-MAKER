/**
 * PDF Studio Ultimate - PDF Comparison Engine
 * Compares two PDF documents side-by-side, page counts, and diffs extracted text
 * highlighting added/removed segments in green and red.
 */

const PdfCompare = {
  doc1Bytes: null,
  doc2Bytes: null,
  doc1Name: '',
  doc2Name: '',

  /**
   * Runs the comparison between doc1 and doc2
   */
  async compareDocuments(bytes1, name1, bytes2, name2) {
    this.doc1Bytes = bytes1;
    this.doc2Bytes = bytes2;
    this.doc1Name = name1;
    this.doc2Name = name2;

    const pdfjs1 = await pdfjsLib.getDocument({ data: new Uint8Array(bytes1) }).promise;
    const pdfjs2 = await pdfjsLib.getDocument({ data: new Uint8Array(bytes2) }).promise;

    const count1 = pdfjs1.numPages;
    const count2 = pdfjs2.numPages;

    let text1 = '';
    let text2 = '';

    for (let i = 1; i <= count1; i++) {
      const p = await pdfjs1.getPage(i);
      const c = await p.getTextContent();
      text1 += c.items.map(it => it.str).join(' ') + ' ';
    }

    for (let i = 1; i <= count2; i++) {
      const p = await pdfjs2.getPage(i);
      const c = await p.getTextContent();
      text2 += c.items.map(it => it.str).join(' ') + ' ';
    }

    // Render side-by-side preview of Page 1
    const p1 = await pdfjs1.getPage(1);
    const p2 = await pdfjs2.getPage(1);

    const vp1 = p1.getViewport({ scale: 0.8 });
    const vp2 = p2.getViewport({ scale: 0.8 });

    const c1 = document.getElementById('compare-canvas-1');
    const c2 = document.getElementById('compare-canvas-2');

    if (c1 && c2) {
      c1.width = vp1.width;
      c1.height = vp1.height;
      c2.width = vp2.width;
      c2.height = vp2.height;

      await p1.render({ canvasContext: c1.getContext('2d'), viewport: vp1 }).promise;
      await p2.render({ canvasContext: c2.getContext('2d'), viewport: vp2 }).promise;
    }

    // Compute Word-level Diff
    const diffResult = this.computeWordDiff(text1.trim(), text2.trim());

    return {
      name1,
      name2,
      pages1: count1,
      pages2: count2,
      pageDifference: count2 - count1,
      wordCount1: (text1.match(/\b\w+\b/g) || []).length,
      wordCount2: (text2.match(/\b\w+\b/g) || []).length,
      diffHtml: diffResult.html,
      addedWords: diffResult.addedCount,
      removedWords: diffResult.removedCount,
      isIdentical: text1.trim() === text2.trim()
    };
  },

  /**
   * Word-level Longest Common Subsequence (LCS) Diff
   */
  computeWordDiff(text1, text2) {
    const words1 = text1.split(/\s+/).filter(Boolean);
    const words2 = text2.split(/\s+/).filter(Boolean);

    // Dynamic programming matrix (capped at 400 words for responsive UI speed)
    const limit = 400;
    const w1 = words1.slice(0, limit);
    const w2 = words2.slice(0, limit);

    const n = w1.length;
    const m = w2.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (w1[i - 1].toLowerCase() === w2[j - 1].toLowerCase()) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find differences
    let i = n;
    let j = m;
    const diffs = [];
    let addedCount = 0;
    let removedCount = 0;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && w1[i - 1].toLowerCase() === w2[j - 1].toLowerCase()) {
        diffs.unshift({ type: 'equal', word: w1[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diffs.unshift({ type: 'added', word: w2[j - 1] });
        addedCount++;
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        diffs.unshift({ type: 'removed', word: w1[i - 1] });
        removedCount++;
        i--;
      }
    }

    const html = diffs.map(d => {
      if (d.type === 'added') {
        return `<span style="background:rgba(0,230,118,0.25);color:#00e676;padding:2px 4px;border-radius:3px;margin:1px;font-weight:600;">+ ${d.word}</span>`;
      } else if (d.type === 'removed') {
        return `<span style="background:rgba(255,82,82,0.25);color:#ff5252;text-decoration:line-through;padding:2px 4px;border-radius:3px;margin:1px;">- ${d.word}</span>`;
      }
      return `<span>${d.word} </span>`;
    }).join(' ');

    return { html, addedCount, removedCount };
  }
};
