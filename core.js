(function (root) {
  const brands = { FSP: 'Fashion’s Park', HC: 'Holly Concept', DT: 'Dutties' };
  const equipmentLogoRatios = { lenovo: 1200 / 404, dell: 1, toshiba: 518 / 78 };
  const columns = ['codigo', 'marca', 'nombre', 'direccion', 'comuna', 'ciudad'];
  const sender = {
    marca: 'FSP', nombre: 'FSP - CASA MATRIZ', direccion: 'PANAMERICANA NORTE 5951',
    comuna: 'CONCHALÍ', ciudad: 'SANTIAGO', sender: true,
  };
  const normalize = (value) => value.trim().normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/\s+/g, ' ');
  const normalizeCode = (value) => value.trim().toUpperCase();

  function parseCatalog(source) {
    const text = source.replace(/^\uFEFF/, '').trim();
    const delimiter = text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
    const rows = [];
    let row = [], field = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch !== '"') field += ch;
        else if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else if (ch === delimiter || ch === '\r' || ch === '\n') {
        row.push(field.trim());
        field = '';
        closed = false;
        if (ch !== delimiter) {
          if (row.some(Boolean)) rows.push(row);
          row = [];
          if (ch === '\r' && text[i + 1] === '\n') i++;
        }
      } else if (ch === '"' && !field && !closed) quoted = true;
      else if (closed || ch === '"') throw new Error('Revisa las comillas del CSV.');
      else field += ch;
    }
    if (quoted) throw new Error('Falta cerrar una comilla en el CSV.');
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
    const headings = (rows.shift() || []).map(normalize);
    if (new Set(headings).size !== headings.length || !columns.every((key) => headings.includes(key))) {
      throw new Error('El CSV debe incluir código, marca, nombre, dirección, comuna y ciudad.');
    }
    if (!rows.length) throw new Error('El CSV no contiene tiendas.');
    return rows.map((values, index) => {
      if (values.length !== headings.length) throw new Error('Número de columnas incorrecto en fila ' + (index + 2) + '.');
      const store = Object.fromEntries(columns.map((key) => [key, values[headings.indexOf(key)]]));
      store.marca = store.marca.toUpperCase();
      if (!columns.every((key) => store[key]) || !Object.hasOwn(brands, store.marca)) {
        throw new Error('Revisa los campos y la marca en la fila ' + (index + 2) + '. Usa FSP, DT o HC.');
      }
      store.alias = (values[headings.indexOf('alias')] || '').split('|').map((value) => value.trim()).filter(Boolean);
      return store;
    });
  }

  function matchCode(catalog, code) {
    const key = normalizeCode(code);
    return key ? catalog.filter((store) => [store.codigo, ...store.alias].some((value) => normalizeCode(value) === key)) : [];
  }

  function search(catalog, query, brand) {
    const name = normalize(query);
    const codes = new Set(matchCode(catalog, query));
    return catalog.filter((store) => (!brand || brand === store.marca) &&
      (!name || normalize(store.nombre).includes(name) || codes.has(store)));
  }

  function positions(queue, senderCopies = 0) {
    const labels = [];
    const place = (label) => {
      const index = labels.length;
      labels.push({ label, page: Math.floor(index / 6), x: [12, 312][index % 2],
        y: [19.84, 277.22, 534.61][Math.floor(index % 6 / 2)] });
    };
    for (const item of queue) {
      if (!item.store) throw new Error('Resuelve o quita los códigos pendientes antes de descargar.');
      const equipment = item.equipments ?? (item.equipment ? [item.equipment] : []);
      for (let i = 0; i < item.copies; i++) {
        if (!equipment.length) place(item.store);
        for (const unit of equipment) {
          if (labels.length % 2) place(null);
          place(item.store);
          place({ equipment: unit });
        }
      }
    }
    for (let i = 0; i < senderCopies; i++) place(sender);
    return labels;
  }

  const api = { brands, equipmentLogoRatios, columns, parseCatalog, matchCode, search, positions };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Labels = api;
})(globalThis);
