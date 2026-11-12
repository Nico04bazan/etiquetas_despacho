const $ = (id) => document.getElementById(id);
const { columns, parseCatalog, matchCode, search, positions } = Labels;
const storageKey = 'etiquetas.catalogo.v1';
const queue = [];
let catalog = [], catalogName = '', editing = null;
let equipmentIndex = null;
const engine = LabelPDF.createEngine();
const fieldLabels = {
  codigo: 'Código', marca: 'Marca', nombre: 'Nombre de tienda',
  direccion: 'Dirección completa', comuna: 'Comuna', ciudad: 'Ciudad',
};

function node(tag, content, className) {
  const el = document.createElement(tag);
  if (content) el.textContent = content;
  if (className) el.className = className;
  return el;
}

function button(label, action, title = label) {
  const el = node('button', label, 'secondary');
  el.type = 'button';
  el.title = title;
  el.setAttribute('aria-label', title);
  el.addEventListener('click', action);
  return el;
}

function newItem(store, query) {
  return { source: store, store: store ? { ...store } : null, query, copies: 1, equipments: [] };
}

function resolve(item, query) {
  const matches = matchCode(catalog, query);
  item.query = query;
  item.source = matches.length === 1 ? matches[0] : null;
  item.store = item.source ? { ...item.source } : null;
}

function removeItem(item) {
  queue.splice(queue.indexOf(item), 1);
  render();
}

function renderMatches() {
  const list = $('matches');
  const found = search(catalog, $('search').value, $('brand').value);
  $('searchCount').textContent = found.length + (found.length === 1 ? ' tienda' : ' tiendas');
  list.replaceChildren();
  for (const store of found) {
    const label = node('label', null, 'match');
    const box = node('input');
    box.type = 'checkbox';
    box.checked = queue.some((item) => item.source === store);
    box.addEventListener('change', () => {
      if (box.checked) queue.push(newItem(store, store.codigo));
      else {
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i].source === store) queue.splice(i, 1);
        }
      }
      renderQueue();
    });
    const info = node('span', store.nombre);
    info.append(node('small', store.marca + ' · ' + store.codigo + ' · ' + store.comuna));
    label.append(box, info);
    list.append(label);
  }
}

function pendingEditor(item) {
  const matches = matchCode(catalog, item.query);
  const el = node('div', null, 'pending');
  el.append(node('strong', '«' + item.query + '» · ' + (matches.length ? 'Varias coincidencias' : 'Código desconocido')));
  const actions = node('div', null, 'itemActions');
  if (matches.length) {
    const select = node('select');
    select.setAttribute('aria-label', 'Elige la tienda de ' + item.query);
    const placeholder = node('option', 'Elige la tienda');
    placeholder.value = '';
    select.append(placeholder);
    matches.forEach((store, i) => {
      const option = node('option', store.marca + ' · ' + store.codigo + ' · ' + store.nombre + ' · ' + store.direccion);
      option.value = String(i);
      select.append(option);
    });
    select.addEventListener('change', () => {
      if (select.value === '') return;
      item.source = matches[Number(select.value)];
      item.store = { ...item.source };
      render();
    });
    actions.append(select);
  }
  const retry = node('input');
  retry.value = item.query;
  retry.setAttribute('aria-label', 'Corregir código');
  const update = () => {
    if (retry.value.trim()) { resolve(item, retry.value.trim()); render(); }
  };
  retry.addEventListener('keydown', (event) => { if (event.key === 'Enter') update(); });
  actions.append(retry, button('Buscar', update), button('Quitar', () => removeItem(item)));
  el.append(actions);
  return el;
}

function countInput(input, min) {
  const value = input.valueAsNumber;
  return Number.isInteger(value) && value >= min && value <= 100 ? value : null;
}

function updateActions() {
  const senders = countInput($('senderCopies'), 0);
  const count = queue.reduce((total, item) => total + (item.store ? (item.copies || 0) * (item.equipments.length * 2 || 1) : 0), senders ?? 0);
  $('queueCount').textContent = count + (count === 1 ? ' etiqueta' : ' etiquetas');
  const ready = count > 0 && senders !== null && queue.every((item) => item.store && item.copies !== null);
  $('download').disabled = $('previewButton').disabled = !ready;
}

function renderQueue() {
  const list = $('queue');
  list.replaceChildren();
  $('feedback').textContent = '';
  if (!queue.length) list.append(node('p', 'Agrega una tienda para preparar el envío.', 'empty'));
  queue.forEach((item, index) => {
    if (!item.store) { list.append(pendingEditor(item)); return; }
    const store = item.store;
    const entry = node('article', null, 'item');
    const info = node('div', store.marca + ' · ' + store.codigo + ' · ' + store.nombre, 'itemInfo');
    info.append(node('small', store.direccion + ' · ' + store.comuna + ' · ' + store.ciudad));
    const controls = node('div', null, 'itemActions');
    const copies = node('input');
    copies.type = 'number';
    copies.min = '1';
    copies.max = '100';
    copies.value = item.copies ?? '';
    copies.setAttribute('aria-label', 'Copias de ' + store.nombre);
    copies.addEventListener('input', () => { item.copies = countInput(copies, 1); updateActions(); });
    const move = (direction) => {
      const to = index + direction;
      [queue[index], queue[to]] = [queue[to], queue[index]];
      renderQueue();
    };
    const up = button('↑', () => move(-1), 'Subir ' + store.nombre);
    const down = button('↓', () => move(1), 'Bajar ' + store.nombre);
    up.disabled = index === 0;
    down.disabled = index === queue.length - 1;
    controls.append(node('label', item.equipments.length ? 'Copias del conjunto' : 'Copias'), copies, up, down, button('Editar', () => edit(item)),
      button(item.equipments.length ? '+ Otro equipo' : '+ Agregar equipo', () => editEquipment(item)),
      button('Quitar', () => removeItem(item)));
    entry.append(info, controls);
    if (item.equipments.length) {
      const list = node('ul', null, 'equipments');
      item.equipments.forEach((unit, i) => {
        const li = node('li', null, 'equipmentRow');
        const summary = node('span', unit.equipo + ' · ' + unit.marca + ' ' + unit.modelo + ' · S/N ' + unit.serie);
        li.append(summary, button('Editar equipo', () => editEquipment(item, i), 'Editar equipo ' + unit.equipo));
        list.append(li);
      });
      entry.append(list);
    }
    list.append(entry);
  });
  updateActions();
}

function render() {
  $('catalogStatus').textContent = catalogName + ' · ' + catalog.length + ' tiendas';
  renderMatches();
  renderQueue();
}

function edit(item) {
  editing = item;
  $('editFields').replaceChildren();
  for (const key of columns) {
    const label = node('label', fieldLabels[key]);
    const input = node(key === 'marca' ? 'select' : key === 'direccion' ? 'textarea' : 'input');
    if (key === 'marca') Object.keys(Labels.brands).forEach((brand) => input.append(node('option', brand)));
    input.name = key;
    input.value = item.store[key];
    input.required = true;
    label.append(input);
    $('editFields').append(label);
  }
  $('editDialog').showModal();
}

function editEquipment(item, index = null) {
  editing = item;
  equipmentIndex = index;
  const unit = item.equipments[index];
  const form = $('equipmentForm');
  form.reset();
  for (const key of ['equipo', 'marca', 'modelo', 'serie', 'logoOption']) {
    if (unit) form.elements[key].value = unit[key];
  }
  $('logoUpload').hidden = form.elements.logoOption.value !== 'custom';
  $('equipmentError').textContent = '';
  $('removeEquipment').hidden = !unit;
  $('equipmentDialog').showModal();
}

async function convertLogo(file) {
  const image = await createImageBitmap(file);
  try {
    const ratio = image.width / image.height;
    const canvas = node('canvas');
    const scale = Math.min(1, 800 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = Math.round(0.21 * pixels.data[i] + 0.72 * pixels.data[i + 1] + 0.07 * pixels.data[i + 2]);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
    }
    context.putImageData(pixels, 0, 0);
    return { logo: canvas.toDataURL('image/png'), logoRatio: ratio };
  } finally { image.close(); }
}

const svg = (tag, attributes) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  return el;
};
const currentSlots = () => positions(queue, countInput($('senderCopies'), 0));

async function preview() {
  const { layout } = await engine;
  const container = $('pages');
  container.replaceChildren();
  const sheets = [];
  for (const slot of currentSlots()) {
    if (!sheets[slot.page]) {
      const sheet = svg('svg', { viewBox: '0 0 612 792', class: 'sheet', role: 'img',
        'aria-label': 'Hoja Carta ' + (slot.page + 1) });
      sheets.push(sheet);
      container.append(sheet);
    }
    if (!slot.label) continue;
    const { logo, text } = layout(slot.label);
    const label = svg('g', { transform: 'translate(' + slot.x + ' ' + slot.y + ')' });
    if (logo) label.append(svg('image', { href: logo.src, x: logo.x, y: logo.y, width: logo.width, height: logo.height }));
    for (const run of text) {
      const el = svg('text', { x: run.x, y: run.y, 'font-size': run.size, 'font-weight': run.bold ? 'bold' : 'normal' });
      el.textContent = run.text;
      label.append(el);
    }
    sheets[slot.page].append(label);
  }
  $('previewDialog').showModal();
}

function showError(error) {
  $('feedback').textContent = error.message.includes('WinAnsi') ?
    'La etiqueta contiene un carácter incompatible con la fuente del PDF. Revísalo en Editar.' : error.message;
}

$('batch').addEventListener('submit', (event) => {
  event.preventDefault();
  for (const code of $('codes').value.trim().split(/[,\s]+/).filter(Boolean)) {
    const item = newItem(null, code);
    resolve(item, code);
    queue.push(item);
  }
  $('codes').value = '';
  render();
});
$('search').addEventListener('input', renderMatches);
$('brand').addEventListener('change', renderMatches);
$('senderCopies').addEventListener('input', updateActions);
$('openCatalog').addEventListener('click', () => $('catalogDialog').showModal());
document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => el.closest('dialog').close()));
$('catalogForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const file = $('catalogFile').files[0];
    const imported = parseCatalog(await file.text());
    localStorage.setItem(storageKey, JSON.stringify({ name: file.name, stores: imported }));
    catalog = imported;
    catalogName = file.name;
    queue.forEach((item) => { if (!item.store) resolve(item, item.query); });
    $('catalogForm').reset();
    $('catalogError').textContent = '';
    $('catalogDialog').close();
    render();
  } catch (error) { $('catalogError').textContent = error.message; }
});
$('editForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  const invalid = columns.find((key) => !fields[key].trim());
  if (invalid) { event.currentTarget.elements[invalid].value = ''; event.currentTarget.reportValidity(); return; }
  editing.store = { ...editing.store, ...Object.fromEntries(columns.map((key) => [key, fields[key].trim()])) };
  $('editDialog').close();
  renderQueue();
});
$('equipmentForm').elements.logoOption.addEventListener('change', (event) => {
  $('logoUpload').hidden = event.target.value !== 'custom';
});
$('removeEquipment').addEventListener('click', () => {
  if (equipmentIndex !== null) editing.equipments.splice(equipmentIndex, 1);
  $('equipmentDialog').close();
  renderQueue();
});
$('equipmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const item = editing;
  const index = equipmentIndex;
  const previous = item.equipments[index];
  try {
    const equipment = Object.fromEntries(['equipo', 'marca', 'modelo', 'serie', 'logoOption'].map((key) => [key, fields.get(key).trim()]));
    if (Object.values(equipment).some((value) => !value)) throw new Error('Completa los datos del equipo.');
    if (equipment.logoOption === 'custom') {
      const file = fields.get('file');
      if (file?.size) Object.assign(equipment, await convertLogo(file));
      else if (previous?.logoOption === 'custom') {
        equipment.logo = previous.logo;
        equipment.logoRatio = previous.logoRatio;
      } else throw new Error('Selecciona una imagen para el logo.');
    } else {
      equipment.logo = 'logos/' + equipment.logoOption + '.png';
      equipment.logoRatio = Labels.equipmentLogoRatios[equipment.logoOption];
    }
    if (index === null) item.equipments.push(equipment);
    else item.equipments[index] = equipment;
    $('equipmentDialog').close();
    renderQueue();
  } catch (error) { $('equipmentError').textContent = error.message; }
});
$('previewButton').addEventListener('click', () => preview().catch(showError));
$('download').addEventListener('click', async () => {
  const slots = currentSlots();
  $('download').disabled = true;
  $('feedback').textContent = '';
  try {
    const writer = await LabelPDF.createEngine();
    const bytes = await writer.write(slots, async (url) => {
      const result = await fetch(url);
      if (!result.ok) throw new Error('No se pudo cargar el logo.');
      return result.arrayBuffer();
    });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = node('a');
    link.href = url;
    link.download = 'etiquetas-despacho.pdf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (error) { showError(error); }
  finally { updateActions(); }
});

async function start() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (saved) {
    catalog = saved.stores;
    catalogName = saved.name;
  } else {
    const response = await fetch('catalogo-ficticio.csv');
    if (!response.ok) throw new Error('No se pudo cargar el catálogo de ejemplo.');
    catalog = parseCatalog(await response.text());
    catalogName = 'Catálogo ficticio de demostración';
  }
  render();
}
start().catch(showError);
