/**
 * PDF Studio Ultimate - Smart Signature Studio
 * Draw signatures on high-res Bézier canvas, upload signature images,
 * save signatures to local storage, and place on document.
 * DISCLAIMER: Visual signatures are electronic image placements and distinct from
 * cryptographically verified X.509 PKI digital certificate signatures.
 */

class SmartSignatureStudio {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.isDrawing = false;
    this.points = [];
    this.penColor = '#000000';
    this.penWidth = 3;
    this.savedSignatures = [];
    this.loadSavedSignatures();
  }

  initCanvas(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.clear();

    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const startDraw = (e) => {
      e.preventDefault();
      this.isDrawing = true;
      const pos = getPos(e);
      this.points = [pos];
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    };

    const continueDraw = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      this.points.push(pos);

      // Smooth Bézier curve interpolation
      if (this.points.length >= 3) {
        const xc = (this.points[this.points.length - 1].x + this.points[this.points.length - 2].x) / 2;
        const yc = (this.points[this.points.length - 1].y + this.points[this.points.length - 2].y) / 2;
        this.ctx.strokeStyle = this.penColor;
        this.ctx.lineWidth = this.penWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.quadraticCurveTo(this.points[this.points.length - 2].x, this.points[this.points.length - 2].y, xc, yc);
        this.ctx.stroke();
      }
    };

    const stopDraw = () => {
      this.isDrawing = false;
      this.points = [];
    };

    this.canvas.addEventListener('mousedown', startDraw);
    this.canvas.addEventListener('mousemove', continueDraw);
    this.canvas.addEventListener('mouseup', stopDraw);
    this.canvas.addEventListener('touchstart', startDraw, { passive: false });
    this.canvas.addEventListener('touchmove', continueDraw, { passive: false });
    this.canvas.addEventListener('touchend', stopDraw);
  }

  clear() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setPenColor(color) {
    this.penColor = color;
  }

  setPenWidth(width) {
    this.penWidth = width;
  }

  /**
   * Saves signature data URL to localStorage
   */
  saveCurrentSignature() {
    if (!this.canvas) return;
    const dataUrl = this.canvas.toDataURL('image/png');
    this.savedSignatures.push({
      id: Date.now(),
      dataUrl: dataUrl,
      created: new Date().toLocaleDateString()
    });
    localStorage.setItem('pdf_studio_saved_signatures', JSON.stringify(this.savedSignatures));
    this.renderSavedSignaturesList();
    if (window.AndroidBridge) window.AndroidBridge.showToast('Signature saved locally');
  }

  loadSavedSignatures() {
    try {
      const raw = localStorage.getItem('pdf_studio_saved_signatures');
      this.savedSignatures = raw ? JSON.parse(raw) : [];
    } catch (_) {
      this.savedSignatures = [];
    }
  }

  deleteSavedSignature(id) {
    this.savedSignatures = this.savedSignatures.filter(s => s.id !== id);
    localStorage.setItem('pdf_studio_saved_signatures', JSON.stringify(this.savedSignatures));
    this.renderSavedSignaturesList();
  }

  renderSavedSignaturesList() {
    const container = document.getElementById('saved-signatures-list');
    if (!container) return;

    if (!this.savedSignatures.length) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px;">No saved signatures yet. Draw one above and click Save.</div>';
      return;
    }

    container.innerHTML = this.savedSignatures.map(sig => `
      <div style="display:inline-flex;flex-direction:column;align-items:center;background:rgba(255,255,255,0.06);border:1px solid var(--border-glass);border-radius:10px;padding:8px;margin:4px;">
        <img src="${sig.dataUrl}" style="height:48px;max-width:110px;object-fit:contain;background:#fff;border-radius:4px;padding:2px;cursor:pointer;" onclick="SmartSignatures.insertSignatureFromDataUrl('${sig.dataUrl}')">
        <div style="display:flex;gap:4px;margin-top:6px;">
          <button class="btn btn-secondary btn-sm" style="padding:2px 6px;font-size:10px;" onclick="SmartSignatures.insertSignatureFromDataUrl('${sig.dataUrl}')">Insert</button>
          <button class="btn btn-secondary btn-sm" style="padding:2px 6px;font-size:10px;color:var(--accent-red);" onclick="SmartSignatures.deleteSavedSignature(${sig.id})">Delete</button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Inserts the drawn or selected signature onto current document page
   */
  insertCurrentSignature() {
    if (!this.canvas) return;
    const dataUrl = this.canvas.toDataURL('image/png');
    this.insertSignatureFromDataUrl(dataUrl);
  }

  insertSignatureFromDataUrl(dataUrl) {
    const img = new Image();
    img.onload = () => {
      window.pdfEditor.addObject(window.pdfEditor.currentPage, {
        type: 'signature',
        imgElement: img,
        x: 100,
        y: 200,
        width: 160,
        height: 70
      });
      // Close signature modal
      const modal = document.getElementById('signature-modal');
      if (modal) modal.classList.remove('active');
    };
    img.src = dataUrl;
  }

  /**
   * Filters uploaded image to remove white background (chroma threshold)
   */
  processUploadedSignatureImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = img.width;
        off.height = img.height;
        const ctx = off.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, off.width, off.height);
        const d = imgData.data;

        // Turn near-white pixels transparent
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          if (r > 200 && g > 200 && b > 200) {
            d[i + 3] = 0; // Alpha 0
          }
        }
        ctx.putImageData(imgData, 0, 0);
        this.insertSignatureFromDataUrl(off.toDataURL('image/png'));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

window.SmartSignatures = new SmartSignatureStudio();
