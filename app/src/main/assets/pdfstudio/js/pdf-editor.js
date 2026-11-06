/**
 * PDF Studio Ultimate - Core Advanced PDF Editor Engine
 * Handles PDF rendering (PDF.js), interactive overlay canvas, object manipulation,
 * tool states, and PDF export (PDF-Lib).
 */

class PdfEditor {
  constructor() {
    this.pdfDoc = null; // PDF.js document
    this.rawBytes = null; // Original PDF bytes
    this.docName = 'Untitled.pdf';
    this.pageCount = 0;
    this.currentPage = 1;
    this.zoomScale = 1.0;
    this.currentTool = 'select'; // select, text, draw, highlighter, rect, circle, line, arrow, sticky, stamp, eraser, image, signature
    
    // Annotation / Object storage per page: pageNumber => [Object]
    this.pageObjects = {}; 
    this.selectedObject = null;
    this.selectedPageIndex = 1;

    // Drawing state
    this.isDrawing = false;
    this.drawingPoints = [];
    this.currentStrokeColor = '#ff3366';
    this.currentFillColor = 'transparent';
    this.currentStrokeWidth = 3;
    this.currentFontSize = 16;
    this.currentFontFamily = 'Helvetica';
    this.currentTextColor = '#111111';

    // Undo / Redo stacks
    this.undoStack = [];
    this.redoStack = [];

    // Interaction dragging/resizing
    this.dragStartPos = null;
    this.dragTarget = null;
    this.resizeHandle = null;

    // PDF.js worker setup
    if (window.pdfjsLib) {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      } catch (_) {}
    }
  }

  /**
   * Loads a PDF from Uint8Array or ArrayBuffer
   */
  async loadPdfBytes(bytes, filename = 'Document.pdf') {
    this.rawBytes = new Uint8Array(bytes);
    this.docName = filename;
    this.pageObjects = {};
    this.selectedObject = null;
    this.undoStack = [];
    this.redoStack = [];

    try {
      if (window.pdfjsLib) {
        const loadingTask = pdfjsLib.getDocument({
          data: this.rawBytes,
          isEvalSupported: false,
          useWorkerFetch: false
        });
        this.pdfDoc = await loadingTask.promise;
        this.pageCount = this.pdfDoc.numPages;
        this.currentPage = 1;

        for (let i = 1; i <= this.pageCount; i++) {
          this.pageObjects[i] = [];
        }

        await this.renderAllPages();
        this.renderThumbnails();
      }
    } catch (err) {
      console.warn('PDF.js rendering note:', err);
    }

    this.updateEditorUI();
    this.recordHistory('load');
  }

  /**
   * Sets current active tool
   */
  setTool(tool) {
    this.currentTool = tool;
    this.selectedObject = null;
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    const workspace = document.getElementById('pages-container');
    if (workspace) {
      workspace.querySelectorAll('.overlay-canvas').forEach(canvas => {
        canvas.className = `overlay-canvas tool-${tool}`;
      });
    }
    this.redrawAllOverlays();
    this.updateInspector();
  }

  /**
   * Sets Zoom Scale
   */
  async setZoom(scale) {
    this.zoomScale = Math.max(0.4, Math.min(3.0, scale));
    const label = document.getElementById('zoom-percentage');
    if (label) label.textContent = `${Math.round(this.zoomScale * 100)}%`;
    await this.renderAllPages();
  }

  /**
   * Renders all pages into the DOM workspace
   */
  async renderAllPages() {
    const container = document.getElementById('pages-container');
    if (!container || !this.pdfDoc) return;
    container.innerHTML = '';

    for (let pageNum = 1; pageNum <= this.pageCount; pageNum++) {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.zoomScale * 1.33 });

      const pageWrapper = document.createElement('div');
      pageWrapper.className = `pdf-page-wrapper ${pageNum === this.currentPage ? 'selected' : ''}`;
      pageWrapper.id = `page-wrapper-${pageNum}`;
      pageWrapper.style.width = `${viewport.width}px`;
      pageWrapper.style.height = `${viewport.height}px`;
      pageWrapper.dataset.page = pageNum;

      // Base PDF rendering canvas
      const pdfCanvas = document.createElement('canvas');
      pdfCanvas.className = 'pdf-page-canvas';
      pdfCanvas.width = viewport.width;
      pdfCanvas.height = viewport.height;
      const ctx = pdfCanvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      // Overlay canvas for annotations
      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.className = `overlay-canvas tool-${this.currentTool}`;
      overlayCanvas.id = `overlay-canvas-${pageNum}`;
      overlayCanvas.width = viewport.width;
      overlayCanvas.height = viewport.height;
      overlayCanvas.dataset.page = pageNum;

      this.bindCanvasEvents(overlayCanvas, pageNum, viewport);

      pageWrapper.appendChild(pdfCanvas);
      pageWrapper.appendChild(overlayCanvas);
      container.appendChild(pageWrapper);

      this.drawOverlayPage(pageNum);
    }
  }

  /**
   * Binds pointer, mouse, and touch events to an overlay canvas
   */
  bindCanvasEvents(canvas, pageNum, viewport) {
    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left),
        y: (clientY - rect.top)
      };
    };

    const onPointerDown = (e) => {
      e.preventDefault();
      const pos = getPos(e);
      this.currentPage = pageNum;
      this.selectedPageIndex = pageNum;

      if (this.currentTool === 'select') {
        const hit = this.hitTest(pageNum, pos.x, pos.y);
        this.selectedObject = hit;
        if (hit) {
          this.isDrawing = true;
          this.dragStartPos = pos;
          this.dragTarget = hit;
        }
        this.redrawAllOverlays();
        this.updateInspector();
      } else if (this.currentTool === 'text') {
        const text = prompt('Enter text to add to document:', 'Sample Text');
        if (text && text.trim()) {
          this.addObject(pageNum, {
            type: 'text',
            text: text,
            x: pos.x,
            y: pos.y,
            fontSize: this.currentFontSize * this.zoomScale,
            fontFamily: this.currentFontFamily,
            color: this.currentTextColor,
            bold: false,
            italic: false
          });
        }
      } else if (this.currentTool === 'draw' || this.currentTool === 'highlighter' || this.currentTool === 'eraser') {
        this.isDrawing = true;
        this.drawingPoints = [pos];
      } else if (['rect', 'circle', 'line', 'arrow'].includes(this.currentTool)) {
        this.isDrawing = true;
        this.dragStartPos = pos;
      } else if (this.currentTool === 'sticky') {
        const note = prompt('Enter sticky note comment:', 'Important revision needed here.');
        if (note) {
          this.addObject(pageNum, {
            type: 'sticky',
            note: note,
            x: pos.x,
            y: pos.y,
            width: 32,
            height: 32,
            color: '#ffc107'
          });
        }
      }
    };

    const onPointerMove = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);

      if (this.currentTool === 'select' && this.dragTarget) {
        const dx = pos.x - this.dragStartPos.x;
        const dy = pos.y - this.dragStartPos.y;
        this.dragTarget.x += dx;
        this.dragTarget.y += dy;
        this.dragStartPos = pos;
        this.drawOverlayPage(pageNum);
      } else if (this.currentTool === 'draw' || this.currentTool === 'highlighter' || this.currentTool === 'eraser') {
        this.drawingPoints.push(pos);
        this.drawLiveStroke(canvas, pageNum);
      } else if (['rect', 'circle', 'line', 'arrow'].includes(this.currentTool)) {
        this.drawLiveShape(canvas, pageNum, this.dragStartPos, pos);
      }
    };

    const onPointerUp = (e) => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      const pos = e.changedTouches ? {
        x: e.changedTouches[0].clientX - canvas.getBoundingClientRect().left,
        y: e.changedTouches[0].clientY - canvas.getBoundingClientRect().top
      } : getPos(e);

      if (this.currentTool === 'draw') {
        if (this.drawingPoints.length > 1) {
          this.addObject(pageNum, {
            type: 'path',
            points: [...this.drawingPoints],
            color: this.currentStrokeColor,
            width: this.currentStrokeWidth * this.zoomScale
          });
        }
        this.drawingPoints = [];
      } else if (this.currentTool === 'highlighter') {
        if (this.drawingPoints.length > 1) {
          this.addObject(pageNum, {
            type: 'highlight',
            points: [...this.drawingPoints],
            color: 'rgba(255, 235, 59, 0.45)',
            width: 20 * this.zoomScale
          });
        }
        this.drawingPoints = [];
      } else if (this.currentTool === 'eraser') {
        if (this.drawingPoints.length > 1) {
          this.addObject(pageNum, {
            type: 'whiteout',
            points: [...this.drawingPoints],
            color: '#ffffff',
            width: 24 * this.zoomScale
          });
        }
        this.drawingPoints = [];
      } else if (['rect', 'circle', 'line', 'arrow'].includes(this.currentTool)) {
        if (this.dragStartPos) {
          const w = pos.x - this.dragStartPos.x;
          const h = pos.y - this.dragStartPos.y;
          if (Math.hypot(w, h) > 5) {
            this.addObject(pageNum, {
              type: this.currentTool,
              x: Math.min(this.dragStartPos.x, pos.x),
              y: Math.min(this.dragStartPos.y, pos.y),
              width: Math.abs(w),
              height: Math.abs(h),
              startX: this.dragStartPos.x,
              startY: this.dragStartPos.y,
              endX: pos.x,
              endY: pos.y,
              strokeColor: this.currentStrokeColor,
              fillColor: this.currentFillColor,
              strokeWidth: this.currentStrokeWidth * this.zoomScale
            });
          }
          this.dragStartPos = null;
        }
      } else if (this.currentTool === 'select' && this.dragTarget) {
        this.recordHistory('move');
        this.dragTarget = null;
      }
      this.drawOverlayPage(pageNum);
    };

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    canvas.addEventListener('touchmove', onPointerMove, { passive: false });
    canvas.addEventListener('touchend', onPointerUp);
  }

  /**
   * Adds an object to page annotations
   */
  addObject(pageNum, obj) {
    if (!this.pageObjects[pageNum]) this.pageObjects[pageNum] = [];
    obj.id = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    this.pageObjects[pageNum].push(obj);
    this.selectedObject = obj;
    this.selectedPageIndex = pageNum;
    this.drawOverlayPage(pageNum);
    this.updateInspector();
    this.recordHistory('add');
    if (window.AndroidBridge) window.AndroidBridge.vibrate(20);
  }

  /**
   * Hit test to find selected object
   */
  hitTest(pageNum, x, y) {
    const list = this.pageObjects[pageNum] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const obj = list[i];
      if (obj.type === 'text') {
        const textWidth = (obj.text.length * (obj.fontSize || 16) * 0.6);
        const textHeight = (obj.fontSize || 16);
        if (x >= obj.x && x <= obj.x + textWidth && y >= obj.y - textHeight && y <= obj.y + 10) {
          return obj;
        }
      } else if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'stamp' || obj.type === 'signature') {
        if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) {
          return obj;
        }
      } else if (obj.type === 'circle') {
        const rx = obj.width / 2;
        const ry = obj.height / 2;
        const cx = obj.x + rx;
        const cy = obj.y + ry;
        if (Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2) <= 1) {
          return obj;
        }
      } else if (obj.type === 'sticky') {
        if (x >= obj.x && x <= obj.x + 36 && y >= obj.y && y <= obj.y + 36) {
          alert('Sticky Note:\n' + obj.note);
          return obj;
        }
      }
    }
    return null;
  }

  /**
   * Draws all overlay elements onto a specific page's canvas
   */
  drawOverlayPage(pageNum) {
    const canvas = document.getElementById(`overlay-canvas-${pageNum}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const objects = this.pageObjects[pageNum] || [];
    objects.forEach(obj => {
      ctx.save();
      if (obj.type === 'text') {
        ctx.font = `${obj.bold ? 'bold ' : ''}${obj.italic ? 'italic ' : ''}${obj.fontSize || 16}px ${obj.fontFamily || 'Helvetica'}`;
        ctx.fillStyle = obj.color || '#000000';
        ctx.fillText(obj.text, obj.x, obj.y);
      } else if (obj.type === 'path') {
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = obj.width || 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        obj.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      } else if (obj.type === 'highlight') {
        ctx.strokeStyle = obj.color || 'rgba(255, 235, 59, 0.45)';
        ctx.lineWidth = obj.width || 20;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'multiply';
        ctx.beginPath();
        obj.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      } else if (obj.type === 'whiteout') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = obj.width || 24;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        obj.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      } else if (obj.type === 'rect') {
        if (obj.fillColor && obj.fillColor !== 'transparent') {
          ctx.fillStyle = obj.fillColor;
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
        }
        ctx.strokeStyle = obj.strokeColor || '#ff3366';
        ctx.lineWidth = obj.strokeWidth || 2;
        ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
      } else if (obj.type === 'circle') {
        ctx.beginPath();
        ctx.ellipse(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width / 2, obj.height / 2, 0, 0, Math.PI * 2);
        if (obj.fillColor && obj.fillColor !== 'transparent') {
          ctx.fillStyle = obj.fillColor;
          ctx.fill();
        }
        ctx.strokeStyle = obj.strokeColor || '#ff3366';
        ctx.lineWidth = obj.strokeWidth || 2;
        ctx.stroke();
      } else if (obj.type === 'line') {
        ctx.strokeStyle = obj.strokeColor || '#ff3366';
        ctx.lineWidth = obj.strokeWidth || 2;
        ctx.beginPath();
        ctx.moveTo(obj.startX, obj.startY);
        ctx.lineTo(obj.endX, obj.endY);
        ctx.stroke();
      } else if (obj.type === 'arrow') {
        ctx.strokeStyle = obj.strokeColor || '#ff3366';
        ctx.fillStyle = obj.strokeColor || '#ff3366';
        ctx.lineWidth = obj.strokeWidth || 2;
        ctx.beginPath();
        ctx.moveTo(obj.startX, obj.startY);
        ctx.lineTo(obj.endX, obj.endY);
        ctx.stroke();

        const angle = Math.atan2(obj.endY - obj.startY, obj.endX - obj.startX);
        const headLen = 12;
        ctx.beginPath();
        ctx.moveTo(obj.endX, obj.endY);
        ctx.lineTo(obj.endX - headLen * Math.cos(angle - Math.PI / 6), obj.endY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(obj.endX - headLen * Math.cos(angle + Math.PI / 6), obj.endY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (obj.type === 'sticky') {
        ctx.fillStyle = '#ffc107';
        ctx.beginPath();
        ctx.arc(obj.x + 16, obj.y + 16, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('?', obj.x + 12, obj.y + 21);
      } else if (obj.type === 'stamp') {
        ctx.save();
        ctx.translate(obj.x + obj.width / 2, obj.y + obj.height / 2);
        ctx.rotate(-0.15);
        ctx.strokeStyle = obj.color || '#ff3366';
        ctx.lineWidth = 3;
        ctx.strokeRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
        ctx.font = `bold ${obj.fontSize || 18}px sans-serif`;
        ctx.fillStyle = obj.color || '#ff3366';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.text, 0, 0);
        ctx.restore();
      } else if (obj.type === 'image' || obj.type === 'signature') {
        if (obj.imgElement) {
          ctx.drawImage(obj.imgElement, obj.x, obj.y, obj.width, obj.height);
        }
      }

      // Draw selection bounding box if selected
      if (this.selectedObject && this.selectedObject.id === obj.id) {
        ctx.strokeStyle = '#00d2fc';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        const pad = 4;
        let bounds = { x: obj.x, y: obj.y, w: obj.width || 80, h: obj.height || 30 };
        if (obj.type === 'text') {
          bounds.w = (obj.text.length * (obj.fontSize || 16) * 0.6) + pad * 2;
          bounds.h = (obj.fontSize || 16) + pad * 2;
          bounds.y -= (obj.fontSize || 16);
        }
        ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2);
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
  }

  redrawAllOverlays() {
    for (let p = 1; p <= this.pageCount; p++) {
      this.drawOverlayPage(p);
    }
  }

  drawLiveStroke(canvas, pageNum) {
    const ctx = canvas.getContext('2d');
    this.drawOverlayPage(pageNum);
    if (this.drawingPoints.length < 2) return;
    ctx.save();
    ctx.strokeStyle = this.currentTool === 'eraser' ? '#ffffff' : (this.currentTool === 'highlighter' ? 'rgba(255, 235, 59, 0.45)' : this.currentStrokeColor);
    ctx.lineWidth = (this.currentTool === 'eraser' ? 24 : (this.currentTool === 'highlighter' ? 20 : this.currentStrokeWidth)) * this.zoomScale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (this.currentTool === 'highlighter') ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    this.drawingPoints.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawLiveShape(canvas, pageNum, start, current) {
    const ctx = canvas.getContext('2d');
    this.drawOverlayPage(pageNum);
    ctx.save();
    ctx.strokeStyle = this.currentStrokeColor;
    ctx.lineWidth = this.currentStrokeWidth * this.zoomScale;
    const w = current.x - start.x;
    const h = current.y - start.y;
    if (this.currentTool === 'rect') {
      ctx.strokeRect(Math.min(start.x, current.x), Math.min(start.y, current.y), Math.abs(w), Math.abs(h));
    } else if (this.currentTool === 'circle') {
      ctx.beginPath();
      ctx.ellipse(start.x + w / 2, start.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.currentTool === 'line' || this.currentTool === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Renders small thumbnails for the left sidebar navigation
   */
  async renderThumbnails() {
    const pane = document.getElementById('thumbnails-pane');
    if (!pane || !this.pdfDoc) return;
    pane.innerHTML = '';

    for (let i = 1; i <= this.pageCount; i++) {
      const page = await this.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 0.22 });

      const item = document.createElement('div');
      item.className = `thumb-item ${i === this.currentPage ? 'active' : ''}`;
      item.id = `thumb-${i}`;
      item.onclick = () => this.scrollToPage(i);

      const canvasBox = document.createElement('div');
      canvasBox.className = 'thumb-canvas-box';

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      canvasBox.appendChild(canvas);
      const label = document.createElement('div');
      label.className = 'thumb-label';
      label.textContent = `Page ${i}`;

      item.appendChild(canvasBox);
      item.appendChild(label);
      pane.appendChild(item);
    }
  }

  scrollToPage(pageNum) {
    this.currentPage = pageNum;
    document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
    const targetThumb = document.getElementById(`thumb-${pageNum}`);
    if (targetThumb) targetThumb.classList.add('active');

    const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
    if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  updateEditorUI() {
    const title = document.getElementById('editor-doc-title');
    if (title) title.textContent = this.docName;
    const countLabel = document.getElementById('editor-page-indicator');
    if (countLabel) countLabel.textContent = `Page ${this.currentPage} of ${this.pageCount}`;
  }

  updateInspector() {
    const propPanel = document.getElementById('inspector-properties');
    if (!propPanel) return;

    if (!this.selectedObject) {
      propPanel.innerHTML = `
        <div style="color:var(--text-muted);font-size:12px;text-align:center;padding:24px 0;">
          Select any text, shape, image, or annotation on a page to inspect and edit its properties.
        </div>`;
      return;
    }

    const obj = this.selectedObject;
    let html = `<div class="prop-title">${obj.type.toUpperCase()} PROPERTIES</div>`;

    if (obj.type === 'text') {
      html += `
        <div class="prop-row">
          <label class="prop-label">Content</label>
          <input class="prop-input" type="text" id="prop-text-val" value="${obj.text}" style="width:140px;">
        </div>
        <div class="prop-row">
          <label class="prop-label">Font Size</label>
          <input class="prop-input" type="number" id="prop-font-size" value="${Math.round(obj.fontSize || 16)}" min="8" max="72" style="width:70px;">
        </div>
        <div class="prop-row">
          <label class="prop-label">Color</label>
          <input class="prop-input" type="color" id="prop-font-color" value="${obj.color || '#000000'}" style="width:50px;height:32px;padding:2px;">
        </div>
        <div class="prop-row">
          <button class="btn btn-secondary btn-sm" id="prop-bold-btn">Bold: ${obj.bold ? 'ON' : 'OFF'}</button>
          <button class="btn btn-secondary btn-sm" id="prop-italic-btn">Italic: ${obj.italic ? 'ON' : 'OFF'}</button>
        </div>`;
    } else if (['rect', 'circle', 'line', 'arrow'].includes(obj.type)) {
      html += `
        <div class="prop-row">
          <label class="prop-label">Border Color</label>
          <input class="prop-input" type="color" id="prop-stroke-color" value="${obj.strokeColor || '#ff3366'}" style="width:50px;height:32px;padding:2px;">
        </div>
        <div class="prop-row">
          <label class="prop-label">Thickness</label>
          <input class="prop-input" type="number" id="prop-stroke-width" value="${obj.strokeWidth || 2}" min="1" max="20" style="width:70px;">
        </div>`;
      if (obj.type === 'rect' || obj.type === 'circle') {
        html += `
          <div class="prop-row">
            <label class="prop-label">Fill Color</label>
            <input class="prop-input" type="color" id="prop-fill-color" value="${obj.fillColor && obj.fillColor !== 'transparent' ? obj.fillColor : '#ffffff'}" style="width:50px;height:32px;padding:2px;">
          </div>`;
      }
    }

    html += `
      <div style="margin-top:16px;">
        <button class="btn btn-secondary btn-sm" id="prop-delete-btn" style="width:100%;color:var(--accent-red);border-color:var(--accent-red);">
          Delete Object
        </button>
      </div>`;

    propPanel.innerHTML = html;

    // Attach listeners
    if (document.getElementById('prop-text-val')) {
      document.getElementById('prop-text-val').oninput = (e) => {
        obj.text = e.target.value;
        this.drawOverlayPage(this.selectedPageIndex);
      };
    }
    if (document.getElementById('prop-font-size')) {
      document.getElementById('prop-font-size').oninput = (e) => {
        obj.fontSize = parseFloat(e.target.value) || 16;
        this.drawOverlayPage(this.selectedPageIndex);
      };
    }
    if (document.getElementById('prop-font-color')) {
      document.getElementById('prop-font-color').oninput = (e) => {
        obj.color = e.target.value;
        this.drawOverlayPage(this.selectedPageIndex);
      };
    }
    if (document.getElementById('prop-bold-btn')) {
      document.getElementById('prop-bold-btn').onclick = () => {
        obj.bold = !obj.bold;
        this.updateInspector();
        this.drawOverlayPage(this.selectedPageIndex);
      };
    }
    if (document.getElementById('prop-italic-btn')) {
      document.getElementById('prop-italic-btn').onclick = () => {
        obj.italic = !obj.italic;
        this.updateInspector();
        this.drawOverlayPage(this.selectedPageIndex);
      };
    }
    if (document.getElementById('prop-stroke-color')) {
      document.getElementById('prop-stroke-color').oninput = (e) => {
        obj.strokeColor = e.target.value;
        this.drawOverlayPage(this.selectedPageIndex);
      };
    }
    if (document.getElementById('prop-fill-color')) {
      document.getElementById('prop-fill-color').oninput = (e) => {
        obj.fillColor = e.target.value;
        this.drawOverlayPage(this.selectedPageIndex);
      };
    }
    if (document.getElementById('prop-delete-btn')) {
      document.getElementById('prop-delete-btn').onclick = () => {
        this.deleteSelectedObject();
      };
    }
  }

  deleteSelectedObject() {
    if (!this.selectedObject) return;
    const pageNum = this.selectedPageIndex;
    this.pageObjects[pageNum] = (this.pageObjects[pageNum] || []).filter(o => o.id !== this.selectedObject.id);
    this.selectedObject = null;
    this.drawOverlayPage(pageNum);
    this.updateInspector();
    this.recordHistory('delete');
  }

  recordHistory(action) {
    const snapshot = JSON.stringify(this.pageObjects);
    this.undoStack.push(snapshot);
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length <= 1) return;
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    const prev = this.undoStack[this.undoStack.length - 1];
    this.pageObjects = JSON.parse(prev);
    this.redrawAllOverlays();
    this.updateInspector();
  }

  redo() {
    if (!this.redoStack.length) return;
    const next = this.redoStack.pop();
    this.undoStack.push(next);
    this.pageObjects = JSON.parse(next);
    this.redrawAllOverlays();
    this.updateInspector();
  }

  /**
   * Adds an official stamp on the current page
   */
  addStamp(stampType) {
    const text = stampType.toUpperCase();
    const colors = {
      'APPROVED': '#00e676',
      'CONFIDENTIAL': '#ff3366',
      'VOID': '#ff5252',
      'DRAFT': '#ffb300',
      'COMPLETED': '#00d2fc',
      'REVISED': '#9b51e0'
    };
    this.addObject(this.currentPage, {
      type: 'stamp',
      text: text,
      color: colors[text] || '#ff3366',
      x: 150,
      y: 180,
      width: 160,
      height: 50,
      fontSize: 20
    });
  }

  /**
   * Adds watermark to active page or all pages
   */
  addWatermark(text, allPages = true) {
    const applyTo = allPages ? Array.from({ length: this.pageCount }, (_, i) => i + 1) : [this.currentPage];
    applyTo.forEach(pageNum => {
      this.addObject(pageNum, {
        type: 'stamp',
        text: text.toUpperCase(),
        color: 'rgba(150, 150, 150, 0.28)',
        x: 100,
        y: 280,
        width: 300,
        height: 70,
        fontSize: 32
      });
    });
  }

  /**
   * Inserts an image or signature bitmap
   */
  insertImageElement(imgElement, width = 140, height = 80) {
    this.addObject(this.currentPage, {
      type: 'image',
      imgElement: imgElement,
      x: 120,
      y: 160,
      width: width,
      height: height
    });
  }

  /**
   * Exports document baking all overlays, drawings, stamps, and shapes into a downloadable PDF
   */
  async exportPdf(download = true) {
    if (!this.rawBytes) return null;
    const pdfDoc = await PDFLib.PDFDocument.load(this.rawBytes);
    const pages = pdfDoc.getPages();

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const pageNum = pageIdx + 1;
      const pdfPage = pages[pageIdx];
      const { width: pageWidth, height: pageHeight } = pdfPage.getSize();
      const objects = this.pageObjects[pageNum] || [];

      // Calculate scale factor between rendered canvas and actual PDF points
      const canvas = document.getElementById(`overlay-canvas-${pageNum}`);
      const scaleX = canvas ? pageWidth / canvas.width : 1;
      const scaleY = canvas ? pageHeight / canvas.height : 1;

      // Draw all overlays into the PDF
      for (const obj of objects) {
        if (obj.type === 'text') {
          const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
          const pdfY = pageHeight - (obj.y * scaleY);
          pdfPage.drawText(obj.text, {
            x: obj.x * scaleX,
            y: Math.max(10, pdfY),
            size: (obj.fontSize || 16) * scaleX,
            font: font,
            color: this.hexToPdfRgb(obj.color || '#000000')
          });
        } else if (obj.type === 'rect') {
          const pdfY = pageHeight - ((obj.y + obj.height) * scaleY);
          pdfPage.drawRectangle({
            x: obj.x * scaleX,
            y: pdfY,
            width: obj.width * scaleX,
            height: obj.height * scaleY,
            borderColor: this.hexToPdfRgb(obj.strokeColor || '#ff3366'),
            borderWidth: (obj.strokeWidth || 2) * scaleX,
            color: (obj.fillColor && obj.fillColor !== 'transparent') ? this.hexToPdfRgb(obj.fillColor) : undefined
          });
        } else if (obj.type === 'circle') {
          const pdfY = pageHeight - ((obj.y + obj.height / 2) * scaleY);
          pdfPage.drawEllipse({
            x: (obj.x + obj.width / 2) * scaleX,
            y: pdfY,
            xScale: (obj.width / 2) * scaleX,
            yScale: (obj.height / 2) * scaleY,
            borderColor: this.hexToPdfRgb(obj.strokeColor || '#ff3366'),
            borderWidth: (obj.strokeWidth || 2) * scaleX
          });
        } else if (obj.type === 'line' || obj.type === 'arrow') {
          pdfPage.drawLine({
            start: { x: obj.startX * scaleX, y: pageHeight - (obj.startY * scaleY) },
            end: { x: obj.endX * scaleX, y: pageHeight - (obj.endY * scaleY) },
            color: this.hexToPdfRgb(obj.strokeColor || '#ff3366'),
            thickness: (obj.strokeWidth || 2) * scaleX
          });
        } else if (obj.type === 'stamp') {
          const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
          const pdfY = pageHeight - (obj.y * scaleY);
          pdfPage.drawText(obj.text, {
            x: obj.x * scaleX,
            y: pdfY,
            size: (obj.fontSize || 20) * scaleX,
            font: font,
            color: this.hexToPdfRgb(obj.color || '#ff3366'),
            rotate: PDFLib.degrees(-8)
          });
        } else if (obj.type === 'image' || obj.type === 'signature') {
          if (obj.imgElement) {
            const pngImage = await pdfDoc.embedPng(obj.imgElement.src);
            const pdfY = pageHeight - ((obj.y + obj.height) * scaleY);
            pdfPage.drawImage(pngImage, {
              x: obj.x * scaleX,
              y: pdfY,
              width: obj.width * scaleX,
              height: obj.height * scaleY
            });
          }
        }
      }

      // If page had freehand drawings, whiteouts, or highlighters, bake high-res canvas layer
      const hasRasterDrawings = objects.some(o => o.type === 'path' || o.type === 'highlight' || o.type === 'whiteout');
      if (hasRasterDrawings && canvas) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = canvas.width;
        offCanvas.height = canvas.height;
        const offCtx = offCanvas.getContext('2d');
        
        objects.filter(o => o.type === 'path' || o.type === 'highlight' || o.type === 'whiteout').forEach(o => {
          offCtx.save();
          offCtx.strokeStyle = o.color || '#ff3366';
          offCtx.lineWidth = o.width || 3;
          offCtx.lineCap = 'round';
          offCtx.lineJoin = 'round';
          offCtx.beginPath();
          o.points.forEach((pt, i) => {
            if (i === 0) offCtx.moveTo(pt.x, pt.y);
            else offCtx.lineTo(pt.x, pt.y);
          });
          offCtx.stroke();
          offCtx.restore();
        });

        const dataUrl = offCanvas.toDataURL('image/png');
        const embeddedLayer = await pdfDoc.embedPng(dataUrl);
        pdfPage.drawImage(embeddedLayer, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight
        });
      }
    }

    const exportedBytes = await pdfDoc.save();
    const exportFilename = this.docName.replace(/\.pdf$/i, '') + '_edited.pdf';

    if (download) {
      if (window.AndroidBridge) {
        const base64 = this.uint8ArrayToBase64(exportedBytes);
        window.AndroidBridge.saveFile(base64, exportFilename, 'application/pdf');
      } else {
        const blob = new Blob([exportedBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportFilename;
        a.click();
        URL.revokeObjectURL(url);
      }
    }

    return exportedBytes;
  }

  hexToPdfRgb(hex) {
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
      const parts = hex.match(/\d+/g);
      if (parts && parts.length >= 3) {
        return PDFLib.rgb(parts[0] / 255, parts[1] / 255, parts[2] / 255);
      }
    }
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255 || 0;
    const g = parseInt(clean.substring(2, 4), 16) / 255 || 0;
    const b = parseInt(clean.substring(4, 6), 16) / 255 || 0;
    return PDFLib.rgb(r, g, b);
  }

  uint8ArrayToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

window.pdfEditor = new PdfEditor();
