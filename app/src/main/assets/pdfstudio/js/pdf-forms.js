/**
 * PDF Studio Ultimate - PDF Form Designer and Interactive Form Filler
 * Adds Text Fields, Checkboxes, Dropdowns, Date fields and exports interactive AcroForms
 */

const PdfForms = {
  formFields: {}, // pageNum => [fieldObj]

  /**
   * Adds an interactive form field to the active page
   */
  addField(type = 'text', label = 'Input Field') {
    if (!window.pdfEditor || !window.pdfEditor.pdfDoc) return;
    const pageNum = window.pdfEditor.currentPage;
    if (!this.formFields[pageNum]) this.formFields[pageNum] = [];

    const field = {
      id: 'field_' + Date.now(),
      type: type, // 'text', 'checkbox', 'dropdown', 'date'
      label: label,
      x: 100,
      y: 150,
      width: type === 'checkbox' ? 24 : 180,
      height: type === 'checkbox' ? 24 : 32,
      value: type === 'checkbox' ? false : '',
      options: type === 'dropdown' ? ['Option 1', 'Option 2', 'Option 3'] : []
    };

    this.formFields[pageNum].push(field);
    this.renderFormOverlays();
    if (window.AndroidBridge) window.AndroidBridge.showToast(`Form ${type} field added`);
  },

  /**
   * Renders DOM form widgets over the PDF canvas for direct interactive typing and clicking
   */
  renderFormOverlays() {
    document.querySelectorAll('.form-field-widget').forEach(el => el.remove());

    Object.entries(this.formFields).forEach(([pageNum, fields]) => {
      const pageWrapper = document.getElementById(`page-wrapper-${pageNum}`);
      if (!pageWrapper) return;

      fields.forEach(field => {
        const widget = document.createElement('div');
        widget.className = 'form-field-widget';
        widget.style.position = 'absolute';
        widget.style.left = `${field.x}px`;
        widget.style.top = `${field.y}px`;
        widget.style.width = `${field.width}px`;
        widget.style.height = `${field.height}px`;
        widget.style.zIndex = '50';
        widget.style.display = 'flex';
        widget.style.alignItems = 'center';

        if (field.type === 'text') {
          const input = document.createElement('input');
          input.type = 'text';
          input.placeholder = field.label;
          input.value = field.value || '';
          input.className = 'prop-input';
          input.style.width = '100%';
          input.style.height = '100%';
          input.style.background = 'rgba(255,255,255,0.95)';
          input.style.color = '#111';
          input.style.border = '1.5px solid #00d2fc';
          input.oninput = (e) => { field.value = e.target.value; };
          widget.appendChild(input);
        } else if (field.type === 'checkbox') {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = !!field.value;
          cb.style.width = '22px';
          cb.style.height = '22px';
          cb.style.accentColor = '#ff3366';
          cb.onchange = (e) => { field.value = e.target.checked; };
          widget.appendChild(cb);
        } else if (field.type === 'date') {
          const dt = document.createElement('input');
          dt.type = 'date';
          dt.value = field.value || '';
          dt.className = 'prop-input';
          dt.style.width = '100%';
          dt.style.height = '100%';
          dt.style.background = 'rgba(255,255,255,0.95)';
          dt.style.color = '#111';
          dt.onchange = (e) => { field.value = e.target.value; };
          widget.appendChild(dt);
        } else if (field.type === 'dropdown') {
          const sel = document.createElement('select');
          sel.className = 'prop-input';
          sel.style.width = '100%';
          sel.style.height = '100%';
          sel.style.background = 'rgba(255,255,255,0.95)';
          sel.style.color = '#111';
          field.options.forEach(opt => {
            const op = document.createElement('option');
            op.value = opt;
            op.textContent = opt;
            sel.appendChild(op);
          });
          sel.value = field.value || field.options[0];
          sel.onchange = (e) => { field.value = e.target.value; };
          widget.appendChild(sel);
        }

        pageWrapper.appendChild(widget);
      });
    });
  },

  /**
   * Bakes filled form fields into the PDF and saves as interactive AcroForm
   */
  async exportFilledFormPdf() {
    if (!window.pdfEditor || !window.pdfEditor.rawBytes) return;
    const pdfDoc = await PDFLib.PDFDocument.load(window.pdfEditor.rawBytes);
    const form = pdfDoc.getForm();
    const pages = pdfDoc.getPages();

    Object.entries(this.formFields).forEach(([pageNumStr, fields]) => {
      const pageIndex = parseInt(pageNumStr) - 1;
      const page = pages[pageIndex];
      const { height } = page.getSize();

      fields.forEach(f => {
        const fieldName = `${f.type}_${f.id}`;
        if (f.type === 'text' || f.type === 'date') {
          const tf = form.createTextField(fieldName);
          tf.setText(String(f.value || ''));
          tf.addToPage(page, {
            x: f.x,
            y: height - (f.y + f.height),
            width: f.width,
            height: f.height
          });
        } else if (f.type === 'checkbox') {
          const cb = form.createCheckBox(fieldName);
          if (f.value) cb.check();
          else cb.uncheck();
          cb.addToPage(page, {
            x: f.x,
            y: height - (f.y + f.height),
            width: f.width,
            height: f.height
          });
        } else if (f.type === 'dropdown') {
          const dd = form.createDropdown(fieldName);
          dd.setOptions(f.options);
          if (f.value) dd.select(f.value);
          dd.addToPage(page, {
            x: f.x,
            y: height - (f.y + f.height),
            width: f.width,
            height: f.height
          });
        }
      });
    });

    const formPdfBytes = await pdfDoc.save();
    const filename = window.pdfEditor.docName.replace(/\.pdf$/i, '') + '_form_filled.pdf';

    if (window.AndroidBridge) {
      const b64 = window.pdfEditor.uint8ArrayToBase64(formPdfBytes);
      window.AndroidBridge.saveFile(b64, filename, 'application/pdf');
    } else {
      const blob = new Blob([formPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  }
};
