/**
 * PDF Studio Ultimate - Main Application Controller
 * Handles routing, IndexedDB persistence, modal management, theme toggling,
 * keyboard shortcuts, splash screen, and native Android bridge integration.
 */

let db = null;

// Initialize IndexedDB
function initDb() {
  const req = indexedDB.open('PDFStudioDB', 1);
  req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains('recent_docs')) {
      d.createObjectStore('recent_docs', { keyPath: 'id', autoIncrement: true });
    }
  };
  req.onsuccess = (e) => {
    db = e.target.result;
    loadRecentDocs();
  };
}

async function saveRecentDoc(name, bytes) {
  if (!db) return;
  try {
    const tx = db.transaction('recent_docs', 'readwrite');
    const store = tx.objectStore('recent_docs');
    const docItem = {
      name: name,
      size: bytes.byteLength,
      date: new Date().toLocaleDateString(),
      bytes: bytes.slice(0) // clone
    };
    store.add(docItem);
    loadRecentDocs();
  } catch (err) {
    console.warn('Could not save to recent docs', err);
  }
}

function loadRecentDocs() {
  if (!db) return;
  const tx = db.transaction('recent_docs', 'readonly');
  const store = tx.objectStore('recent_docs');
  const req = store.getAll();
  req.onsuccess = () => {
    const list = req.result || [];
    renderRecentDocs(list.reverse().slice(0, 8));
  };
}

function renderRecentDocs(docs) {
  const container = document.getElementById('recent-docs-grid');
  if (!container) return;

  if (!docs.length) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:28px 16px;color:var(--text-muted);font-size:13px;border:1px dashed var(--border-glass);border-radius:16px;">
        No recent documents yet. Open a PDF or create a sample invoice to get started!
      </div>`;
    return;
  }

  container.innerHTML = docs.map((doc, idx) => `
    <div class="recent-card" onclick="openRecentDoc(${doc.id})">
      <div class="doc-thumb">
        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
      </div>
      <div class="doc-meta">
        <div class="doc-title">${doc.name}</div>
        <div class="doc-sub">${PdfCompressor.formatBytes(doc.size)} • ${doc.date}</div>
      </div>
    </div>
  `).join('');
}

function openRecentDoc(id) {
  if (!db) return;
  const tx = db.transaction('recent_docs', 'readonly');
  const store = tx.objectStore('recent_docs');
  const req = store.get(id);
  req.onsuccess = async () => {
    if (req.result) {
      await window.pdfEditor.loadPdfBytes(req.result.bytes, req.result.name);
      showView('editor-view');
    }
  };
}

// View Switching
function showView(viewId) {
  document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
  }

  // Update navbar visibility or breadcrumb
  const isHome = viewId === 'home-view';
  const backBtn = document.getElementById('nav-back-home');
  if (backBtn) backBtn.style.display = isHome ? 'none' : 'flex';
}

// Native Android Back Handling
window.handleAndroidBack = function() {
  // 1. Check if any modal is active
  const activeModal = document.querySelector('.modal-backdrop.active');
  if (activeModal) {
    activeModal.classList.remove('active');
    return true;
  }

  // 2. Check if currently on a sub-view (not home)
  const homeView = document.getElementById('home-view');
  if (homeView && !homeView.classList.contains('active')) {
    showView('home-view');
    return true;
  }

  return false; // Let Android exit app
};

// Global File Input
function triggerFilePicker(accept = '.pdf,application/pdf', onSelected) {
  const input = document.getElementById('global-file-input');
  input.accept = accept;
  input.onchange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onSelected(e.target.files);
    }
    input.value = '';
  };
  input.click();
}

// Theme Toggle
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pdf_studio_theme', next);
}

// Camera Scanner with local contrast optimization
function triggerCameraScan() {
  triggerFilePicker('image/*', async (files) => {
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = async () => {
        // Enhance contrast & binarize
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const val = gray > 130 ? 255 : Math.max(0, gray * 0.7);
          d[i] = val;
          d[i + 1] = val;
          d[i + 2] = val;
        }
        ctx.putImageData(imgData, 0, 0);

        const enhancedBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
        await PdfConverter.imagesToPdf([enhancedBlob]);
        showView('editor-view');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  initDb();

  // Load saved theme
  const savedTheme = localStorage.getItem('pdf_studio_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Initialize signature pad in modal
  const sigCanvas = document.getElementById('sig-canvas');
  if (sigCanvas) {
    SmartSignatures.initCanvas(sigCanvas);
  }

  // Bind Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (window.pdfEditor) window.pdfEditor.undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      if (window.pdfEditor) window.pdfEditor.redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (window.pdfEditor) window.pdfEditor.exportPdf();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      PdfTools.printDocument();
    } else if (e.key === 'Escape') {
      window.handleAndroidBack();
    }
  });

  // Function to dismiss splash screen safely
  function dismissSplash() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('hidden');
      setTimeout(() => {
        splash.style.display = 'none';
      }, 400);
    }
  }

  // Dismiss splash screen immediately after initial layout
  setTimeout(dismissSplash, 500);
  window.addEventListener('load', dismissSplash);

  // Automatically load default sample invoice so user immediately has an active document
  try {
    if (typeof SampleDocs !== 'undefined' && SampleDocs.createSampleInvoice) {
      SampleDocs.createSampleInvoice().then(sampleBytes => {
        if (window.pdfEditor) {
          window.pdfEditor.loadPdfBytes(sampleBytes, 'Sample_Invoice.pdf');
        }
      }).catch(err => {
        console.warn('Initial sample invoice load note:', err);
      });
    }
  } catch (err) {
    console.warn('Sample creation note:', err);
  }
});

// Global failsafe: ensure splash is never stuck
setTimeout(() => {
  const splash = document.getElementById('splash-screen');
  if (splash && splash.style.display !== 'none') {
    splash.classList.add('hidden');
    splash.style.display = 'none';
  }
}, 800);
