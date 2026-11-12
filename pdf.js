(function (root) {
  const lib = typeof module !== 'undefined' ? require('./vendor/pdf-lib.min.js') : root.PDFLib;
  const core = typeof module !== 'undefined' ? require('./core.js') : root.Labels;
  const width = 288, height = 237.55;
  const brandLogos = { FSP: ['fsp', 382 / 315], HC: ['hc', 622 / 400], DT: ['dt', 608 / 163] };

  async function createEngine() {
    const pdf = await lib.PDFDocument.create();
    const regular = await pdf.embedFont(lib.StandardFonts.Helvetica);
    const bold = await pdf.embedFont(lib.StandardFonts.HelveticaBold);
    const measure = (text, size, strong) => (strong ? bold : regular).widthOfTextAtSize(text, size);
    const wrap = (key, value, size) => {
      const lines = [];
      let line = [{ text: key, bold: true }];
      let used = measure(key, size, true);
      const push = () => { lines.push(line); line = []; used = 0; };
      for (const word of value.trim().split(/\s+/u)) {
        let token = (line.length ? ' ' : '') + word;
        if (used + measure(token, size, false) > 216 && line.length) {
          push();
          token = word;
        }
        while (measure(token, size, false) > 216) {
          let end = 1;
          while (measure(token.slice(0, end + 1), size, false) <= 216) end++;
          line.push({ text: token.slice(0, end), bold: false });
          push();
          token = token.slice(end);
        }
        if (token) line.push({ text: token, bold: false });
        used += measure(token, size, false);
      }
      if (line.length) push();
      return lines;
    };

    function layout(label) {
      const equipment = label.equipment;
      const fields = equipment ? [
        ['EQUIPO:', equipment.equipo], ['MARCA:', equipment.marca],
        ['MODELO:', equipment.modelo], ['S/N:', equipment.serie],
      ] : [
        ['NOMBRE:', label.sender ? label.nombre : core.brands[label.marca] + ' - ' + label.nombre + ' (' + label.codigo + ')'],
        ['DIRECCIÓN:', label.direccion], ['COMUNA:', label.comuna], ['CIUDAD:', label.ciudad],
      ];
      const text = [];
      const center = (runs, size, y) => {
        let x = (width - runs.reduce((sum, run) => sum + measure(run.text, size, run.bold), 0)) / 2;
        for (const run of runs) {
          text.push({ ...run, size, x, y });
          x += measure(run.text, size, run.bold);
        }
      };
      const single = (value, size, y, strong = true) => center([{ text: value, bold: strong }], size, y);
      let size = 10.5, scale = 1, rows, extraHeight;
      do {
        rows = fields.map(([key, value]) => wrap(key, value, size));
        extraHeight = rows.reduce((sum, field) => sum + field.length - 1, 0) * (size + 1.7);
        if ((150.3 + extraHeight) * scale <= height - 10) break;
        size -= 0.5;
        scale = size / 10.5;
      } while (size >= 6);
      if (size < 6) throw new Error('El texto es demasiado largo para la etiqueta. Acórtalo en Editar.');
      const y = height / 2 - (59.9032 + extraHeight / 2) * scale;
      let logo;
      if (equipment) {
        const ratio = equipment.logoRatio;
        const w = Math.min(92, 45 * ratio) * scale;
        const h = w / ratio;
        logo = { src: equipment.logo, x: (width - w) / 2, y: y + 20 * scale - h, width: w, height: h };
        single('CONTENIDO DEL ENVÍO', 12 * scale, y + 41 * scale);
      } else {
        const [asset, ratio] = brandLogos[label.marca];
        const w = Math.min(112, 40 * ratio) * scale;
        const h = w / ratio;
        logo = { src: 'logos/' + asset + '.png', x: (width - w) / 2, y: y + 1 * scale - h / 2, width: w, height: h };
        single(label.sender ? 'REMITENTE' : 'DESTINATARIO', 12 * scale, y + 41 * scale);
      }
      let baseline = y + 67.5 * scale;
      rows.forEach((field) => {
        field.forEach((runs, index) => center(runs, size, baseline + index * (size + 1.7) * scale));
        baseline += 21.2 * scale + (field.length - 1) * (size + 1.7) * scale;
      });
      return { text, logo };
    }

    async function write(slots, loadLogo) {
      pdf.setTitle('Etiquetas de despacho');
      pdf.catalog.getOrCreateViewerPreferences().setPrintScaling(lib.PrintScaling.None);
      const pages = [];
      const logos = new Map();
      for (const slot of slots) {
        if (!pages[slot.page]) pages.push(pdf.addPage([612, 792]));
        if (!slot.label) continue;
        const page = pages[slot.page];
        const { text, logo } = layout(slot.label);
        if (logo) {
          if (!logos.has(logo.src)) logos.set(logo.src, await pdf.embedPng(await loadLogo(logo.src)));
          page.drawImage(logos.get(logo.src), {
            x: slot.x + logo.x, y: 792 - slot.y - logo.y - logo.height,
            width: logo.width, height: logo.height,
          });
        }
        for (const run of text) {
          page.drawText(run.text, { x: slot.x + run.x, y: 792 - slot.y - run.y,
            font: run.bold ? bold : regular, size: run.size, color: lib.rgb(0, 0, 0) });
        }
      }
      return pdf.save({ useObjectStreams: false });
    }
    return { layout, write };
  }
  if (typeof module !== 'undefined') module.exports = { createEngine };
  else root.LabelPDF = { createEngine };
})(globalThis);
