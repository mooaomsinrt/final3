const el = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 });
const currency = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('th-TH', { style: 'percent', maximumFractionDigits: 1 });
const thaiDate = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
const thaiTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
const narrow = matchMedia('(max-width: 820px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const normalize = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase();

const units = new Map([
  ['tablet', 'เม็ด'], ['capsule', 'แคปซูล'], ['bottle', 'ขวด'],
  ['tube', 'หลอด'], ['sachet', 'ซอง'], ['inhaler', 'อัน'],
]);
const statusLabels = new Map([
  ['drug_active', 'ใช้งาน'],
  ['drug_inactive', 'ปิดใช้งาน'],
  ['active', 'ใช้งาน'],
  ['written_off', 'ตัดออก'],
  ['quarantine', 'กักกัน'],
  ['dispense', 'จ่ายยา'],
  ['return', 'คืนยา'],
  ['void', 'ยกเลิก'],
]);
const kindLabels = { catalog: 'ทะเบียนยา', stock: 'สต็อก', events: 'ประวัติการจ่าย' };
const expected = {
  catalog: ['sku', 'generic_name', 'strength', 'dosage_form', 'unit', 'category', 'atc_code'],
  stock: ['sku', 'stock_id', 'lot', 'status'],
  events: ['sku', 'dispense_id', 'lot', 'datetime', 'type'],
};
const ids = { catalog: 'sku', stock: 'stock_id', events: 'dispense_id' };
const tables = {
  catalog: ['ชื่อสามัญ / SKU', 'ความแรง', 'รูปแบบยา', 'หมวดหมู่', 'ATC', 'คงเหลือใช้ได้ / จุดสั่งซื้อ'],
  stock: ['ยา / SKU', 'ล็อต', 'หมดอายุ', 'คงเหลือ', 'ต้นทุน/หน่วย', 'สถานะ'],
  events: ['ยา / SKU', 'รหัสรายการ / วันเวลา (ไทย)', 'ล็อต', 'ผู้ป่วย / เภสัชกร', 'จำนวน', 'ประเภท'],
};

const issueLabels = {
  'below-reorder': 'ต่ำกว่าจุดสั่งซื้อซ้ำ',
  'inactive-drug': 'ยาปิดใช้งาน',
  'unknown-sku': 'SKU ไม่พบในทะเบียน',
  'ambiguous-lot': 'คู่ SKU และล็อตซ้ำ',
  'missing-expiry': 'วันหมดอายุขาดหรือไม่ถูกต้อง',
  'expiry-before-received': 'วันหมดอายุก่อนวันรับเข้า',
  'expired-stock': 'ล็อตหมดอายุที่ยังมียอด',
  'near-expiry': 'ใกล้หมดอายุ (≤ 90 วัน)',
  'quarantine-stock': 'ล็อตถูกกักกัน (รอตรวจ)',
  'negative-stock': 'ยอดติดลบ',
  'missing-lot': 'หาล็อตในคลังไม่พบ',
  'invalid-time': 'วันเวลาไม่ถูกต้อง',
  'outside-period': 'วันที่อยู่นอกช่วงที่ระบุ',
  'after-as-of': 'วันที่จ่ายเลยวันอ้างอิง',
  'after-expiry': 'วันที่จ่ายหลังวันหมดอายุ',
  'fractional-qty': 'จำนวนเป็นทศนิยม',
  'nonpositive-issue': 'จำนวนไม่มากกว่า 0',
};

let datasets = {};
let model = {};
let view = 'catalog';
let page = 1;
let issueFilter = '';
let sourceMode = 'idle'; // 'idle' | 'supabase' | 'local'
let lastSyncedAt = null;
let catalogNotice = '';
let syncChart = () => {};
let chartObserver;
let generation = 0;
const pageSize = 12;
const metricAnimations = new Map();

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function daysBetween(startIso, endIso) {
  if (!validDate(startIso) || !validDate(endIso)) return NaN;
  const a = Date.parse(startIso + 'T00:00:00Z');
  const b = Date.parse(endIso + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

function dayLabel(value) {
  return validDate(value) ? thaiDate.format(new Date(value + 'T00:00:00Z')) : 'ไม่ระบุ';
}

// รองรับทั้ง ISO ที่มีเขตเวลา (เช่น +07:00, Z) และ timestamp จาก PostgreSQL/Supabase (ไม่มีเขตเวลา -> ตีความเป็น Asia/Bangkok +07:00)
function eventTime(value) {
  if (typeof value !== 'string') return NaN;
  const trimmed = value.trim();
  if (!validDate(trimmed.slice(0, 10))) return NaN;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) return Date.parse(trimmed);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(trimmed)) {
    return Date.parse(trimmed.replace(' ', 'T') + '+07:00');
  }
  return NaN;
}

function validateDataset(doc, forcedKind, name) {
  if (!Array.isArray(doc?.items)) throw Error('ต้องมี items เป็นรายการข้อมูล');
  const first = doc.items[0];
  const file = String(name ?? '').toLowerCase();
  const kind = forcedKind
    || (first?.stock_id !== undefined || /stock/.test(file) ? 'stock'
      : first?.dispense_id !== undefined || /dispense/.test(file) ? 'events'
      : first?.generic_name !== undefined || /drugs|catalog/.test(file) ? 'catalog' : '');
  if (!kind) throw Error('ระบุประเภทชุดข้อมูลไม่ได้');

  const seen = new Set();
  const quantityKey = { catalog: 'reorder_level', stock: 'qty_on_hand', events: 'qty' }[kind];
  const normalizedItems = doc.items.map((rawRow, i) => {
    if (!rawRow || typeof rawRow !== 'object') throw Error(`รายการ ${i + 1} รูปแบบไม่ถูกต้อง`);
    const invalid = expected[kind].find((key) => typeof rawRow[key] !== 'string' || !rawRow[key].trim());
    if (invalid) throw Error(`รายการ ${i + 1} ขาด ${invalid}`);
    const identity = kind === 'catalog' ? normalize(rawRow[ids[kind]]) : rawRow[ids[kind]];
    if (seen.has(identity)) throw Error(`พบ ${ids[kind]} ซ้ำที่รายการ ${i + 1}`);
    seen.add(identity);

    const qtyValue = toFiniteNumber(rawRow[quantityKey]);
    if (!Number.isFinite(qtyValue)) throw Error(`รายการ ${i + 1} มี ${quantityKey} ที่ไม่ใช่ตัวเลข`);
    if (kind === 'catalog' && (!Number.isSafeInteger(qtyValue) || qtyValue < 0)) {
      throw Error(`รายการ ${i + 1} มีจุดสั่งซื้อซ้ำไม่ถูกต้อง`);
    }

    const row = { ...rawRow, [quantityKey]: qtyValue };
    if (kind === 'stock' && rawRow.unit_cost !== undefined && rawRow.unit_cost !== null) {
      const cost = toFiniteNumber(rawRow.unit_cost);
      if (Number.isFinite(cost)) row.unit_cost = cost;
    }
    if (kind === 'catalog') {
      if (rawRow.lot_count !== undefined && rawRow.lot_count !== null) {
        const lotCount = toFiniteNumber(rawRow.lot_count);
        if (Number.isFinite(lotCount)) row.lot_count = lotCount;
      }
      if (rawRow.usable_qty !== undefined && rawRow.usable_qty !== null) {
        const usableQty = toFiniteNumber(rawRow.usable_qty);
        if (Number.isFinite(usableQty)) row.usable_qty = usableQty;
      }
      if (rawRow.quarantine_qty !== undefined && rawRow.quarantine_qty !== null) {
        const quarantineQty = toFiniteNumber(rawRow.quarantine_qty);
        if (Number.isFinite(quarantineQty)) row.quarantine_qty = quarantineQty;
      }
    }
    return row;
  });

  return { kind, name, items: normalizedItems, meta: doc.meta ?? {} };
}

function parseDataset(raw, name) {
  const doc = JSON.parse(raw.replace(/^\uFEFF/, ''));
  return validateDataset(doc, '', name);
}

const lotKey = (row) => JSON.stringify([normalize(row.sku), row.lot]);

function buildModel() {
  const catalog = datasets.catalog?.items ?? [];
  const materials = new Map(catalog.map((product) => [normalize(product.sku), product]));
  const stock = datasets.stock?.items ?? [];
  const lots = new Map();
  for (const row of stock) {
    const key = lotKey(row);
    const matches = lots.get(key) ?? [];
    matches.push(row);
    lots.set(key, matches);
  }

  const snapshot = datasets.stock?.meta.as_of ?? datasets.catalog?.meta.as_of ?? datasets.events?.meta.as_of;
  const period = String(datasets.events?.meta.period ?? '').match(/\d{4}-\d{2}-\d{2}/g) ?? [];

  // สรุปยอดใช้ได้และล็อตกักกันราย SKU ตามกฎเดียวกับ v_stock_by_sku / v_drug_catalog ใน Supabase
  const stockSummary = new Map();
  for (const row of stock) {
    const key = normalize(row.sku);
    const summary = stockSummary.get(key) ?? { lotCount: 0, usableQty: 0, quarantineQty: 0 };
    summary.lotCount += 1;
    if (row.status === 'active' && validDate(row.expiry) && (!validDate(snapshot) || row.expiry >= snapshot)) {
      summary.usableQty += row.qty_on_hand;
    }
    if (row.status === 'quarantine') {
      summary.quarantineQty += row.qty_on_hand;
    }
    stockSummary.set(key, summary);
  }

  const result = {
    snapshot,
    catalog: catalog.map((row) => {
      const issues = [];
      const computed = stockSummary.get(normalize(row.sku));
      const hasStockMetrics = typeof row.lot_count === 'number' || Boolean(datasets.stock);
      const lotCount = typeof row.lot_count === 'number' ? row.lot_count : (computed?.lotCount ?? 0);
      const usableQty = typeof row.usable_qty === 'number' ? row.usable_qty : (computed?.usableQty ?? 0);
      const quarantineQty = typeof row.quarantine_qty === 'number' ? row.quarantine_qty : (computed?.quarantineQty ?? 0);

      // ตรงกับ v_below_reorder ใน 01_schema.sql: นับเฉพาะยาที่มีล็อตในคลังและยอดใช้ได้ < reorder_level
      if (hasStockMetrics && lotCount > 0 && usableQty < row.reorder_level) {
        issues.push('below-reorder');
      }
      if (row.is_active === false) {
        issues.push('inactive-drug');
      }
      return {
        row,
        product: row,
        metrics: hasStockMetrics ? { lotCount, usableQty, quarantineQty } : null,
        issues,
      };
    }),
    stock: stock.map((row) => {
      const issues = [];
      const product = materials.get(normalize(row.sku));
      if (datasets.catalog && !product) issues.push('unknown-sku');
      if (lots.get(lotKey(row)).length > 1) issues.push('ambiguous-lot');
      if (row.status === 'quarantine') issues.push('quarantine-stock');
      if (!validDate(row.expiry)) {
        issues.push('missing-expiry');
      } else {
        if (validDate(row.received_date) && row.expiry <= row.received_date) {
          issues.push('expiry-before-received');
        }
        if (validDate(snapshot)) {
          if (row.expiry < snapshot && row.qty_on_hand > 0) {
            issues.push('expired-stock');
          } else if (row.status === 'active' && row.qty_on_hand > 0) {
            const daysLeft = daysBetween(snapshot, row.expiry);
            if (daysLeft >= 0 && daysLeft <= 90) issues.push('near-expiry');
          }
        }
      }
      if (row.qty_on_hand < 0) issues.push('negative-stock');
      return { row, product, issues };
    }),
    events: (datasets.events?.items ?? []).map((row) => {
      const issues = [];
      const product = materials.get(normalize(row.sku));
      const matches = lots.get(lotKey(row)) ?? [];
      const [lot] = matches;
      const timestamp = eventTime(row.datetime);
      if (datasets.catalog && !product) issues.push('unknown-sku');
      if (datasets.stock && !matches.length) issues.push('missing-lot');
      if (matches.length > 1) issues.push('ambiguous-lot');
      if (!Number.isFinite(timestamp)) {
        issues.push('invalid-time');
      } else {
        const eventDate = new Date(timestamp + 7 * 3600000).toISOString().slice(0, 10);
        if (period.length === 2) {
          if (eventDate < period[0] || eventDate > period[1]) issues.push('outside-period');
        } else if (validDate(snapshot) && eventDate > snapshot) {
          issues.push('after-as-of');
        }
        if (row.type === 'dispense' && matches.length === 1 && validDate(lot.expiry) && eventDate > lot.expiry) {
          issues.push('after-expiry');
        }
      }
      if ((row.type === 'dispense' || row.type === 'return') && !Number.isInteger(row.qty)) issues.push('fractional-qty');
      if ((row.type === 'dispense' || row.type === 'return') && row.qty <= 0) issues.push('nonpositive-issue');
      return { row, product, issues };
    }),
  };
  return result;
}

function statusOf(row) {
  if (view === 'catalog') {
    if (typeof row.is_active === 'boolean') return row.is_active ? 'drug_active' : 'drug_inactive';
    return '';
  }
  return view === 'stock' ? row.status : view === 'events' ? row.type : '';
}

function quantity(value, product) {
  return [number.format(value), units.get(product?.unit) ?? product?.unit].filter(Boolean).join(' ');
}

function cells({ row, product, metrics, issues }) {
  const name = product?.generic_name ?? row.sku;
  const identity = name === row.sku ? name : `${name} · ${row.sku}`;
  const alerts = issues.map((issue) => issueLabels[issue]).join(' · ');

  if (view === 'catalog') {
    let stockColumn = quantity(row.reorder_level, product);
    let extraNote = '';
    if (metrics) {
      stockColumn = metrics.lotCount > 0
        ? `${quantity(metrics.usableQty, product)} / ${quantity(row.reorder_level, product)}`
        : `ยังไม่มีล็อต / เกณฑ์ ${quantity(row.reorder_level, product)}`;
      if (metrics.quarantineQty > 0) {
        extraNote = `กักกัน ${quantity(metrics.quarantineQty, product)}`;
      }
    }
    return {
      values: [identity, row.strength, row.dosage_form, row.category, row.atc_code, stockColumn],
      notes: { 5: extraNote },
      summary: name,
      subtitle: `${row.sku} · ${row.strength}`,
      alerts,
    };
  }

  if (view === 'stock') {
    const costLabel = typeof row.unit_cost === 'number' ? `฿${currency.format(row.unit_cost)}` : '—';
    const daysLeft = validDate(model.snapshot) && validDate(row.expiry) ? daysBetween(model.snapshot, row.expiry) : NaN;
    let expiryNote = '';
    if (Number.isFinite(daysLeft)) {
      if (daysLeft < 0) expiryNote = `หมดอายุแล้ว ${number.format(Math.abs(daysLeft))} วัน`;
      else if (row.status === 'active' && row.qty_on_hand > 0 && daysLeft <= 90) expiryNote = `เหลือ ${number.format(daysLeft)} วัน`;
    }
    return {
      values: [
        identity,
        `${row.lot} (${row.stock_id})`,
        dayLabel(row.expiry),
        quantity(row.qty_on_hand, product),
        costLabel,
        statusLabels.get(row.status) ?? row.status,
      ],
      notes: { 2: expiryNote },
      summary: name,
      subtitle: `${row.lot} · ${quantity(row.qty_on_hand, product)}`,
      alerts,
    };
  }

  const dateTime = eventTime(row.datetime);
  const time = Number.isFinite(dateTime) ? thaiTime.format(new Date(dateTime)) : 'ไม่ระบุ';
  const actors = [row.patient_code, row.pharmacist_code].filter(Boolean).join(' · ') || '—';
  const refNotes = [
    row.ref_dispense_id ? `อ้างอิง ${row.ref_dispense_id}` : '',
    row.legacy_id ? `รหัสเดิม ${row.legacy_id}` : '',
  ].filter(Boolean).join(' · ');
  return {
    values: [
      identity,
      `${row.dispense_id} · ${time}`,
      row.lot,
      actors,
      quantity(row.qty, product),
      statusLabels.get(row.type) ?? row.type,
    ],
    notes: { 1: refNotes },
    summary: name,
    subtitle: `${row.dispense_id} · ${time}`,
    alerts,
  };
}

function makeTableRow(item) {
  const row = node('tr');
  const { values, notes, alerts } = cells(item);
  values.forEach((value, index) => {
    const cell = node('td', value);
    if (view === 'catalog' && index === 4) cell.classList.add('row-code');
    if (index === 0 && alerts) cell.append(node('span', alerts, 'row-issue'));
    if (notes?.[index]) cell.append(node('span', notes[index], 'row-meta'));
    row.append(cell);
  });
  return row;
}

function makeMobileRow(item) {
  const row = node('li');
  const details = node('details');
  const { values, notes, summary, subtitle, alerts } = cells(item);
  const title = node('summary', summary);
  title.append(node('small', subtitle));
  if (alerts) title.append(node('span', alerts, 'row-issue'));
  const body = node('dl');
  values.slice(1).forEach((value, i) => {
    const group = node('div');
    const dd = node('dd', value);
    if (notes?.[i + 1]) dd.append(node('span', notes[i + 1], 'row-meta'));
    group.append(node('dt', tables[view][i + 1]), dd);
    body.append(group);
  });
  details.append(title, body);
  row.append(details);
  return row;
}

function renderRecords() {
  const query = normalize(el('search').value);
  const category = el('category').value;
  const status = el('status').value;
  const matches = model[view].filter(({ row, product, issues }) => (
    (!category || product?.category === category)
    && (!status || statusOf(row) === status)
    && (!issueFilter || issues.includes(issueFilter))
    && (!query || [
      row.sku, row.lot, row.dispense_id, row.stock_id,
      row.patient_code, row.pharmacist_code, row.ref_dispense_id, row.legacy_id,
      product?.atc_code, product?.generic_name, product?.category,
    ].some((value) => normalize(value).includes(query)))
  ));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  page = Math.min(page, pages);
  const start = (page - 1) * pageSize;
  const visible = matches.slice(start, start + pageSize);
  const header = node('tr');
  for (const label of tables[view]) {
    const cell = node('th', label);
    cell.scope = 'col';
    header.append(cell);
  }
  el('table-head').replaceChildren(header);
  el('table-region').hidden = narrow.matches || !visible.length;
  el('mobile-records').hidden = !narrow.matches || !visible.length;
  el('table-body').replaceChildren(...(narrow.matches ? [] : visible.map(makeTableRow)));
  el('mobile-records').replaceChildren(...(narrow.matches ? visible.map(makeMobileRow) : []));
  el('empty-records').hidden = !!matches.length;
  el('empty-records').textContent = 'ไม่พบรายการที่ตรงกับตัวกรอง';
  const count = matches.length
    ? `แสดง ${number.format(start + 1)}–${number.format(start + visible.length)} จาก ${number.format(matches.length)} รายการ`
    : 'พบ 0 รายการ';
  el('result-count').textContent = issueFilter ? `${issueLabels[issueFilter]} · ${count}` : count;
  el('page-number').textContent = `${page} / ${pages}`;
  el('previous').disabled = page === 1;
  el('next').disabled = page >= pages;
  el('pagination').hidden = !matches.length;
  syncChart(category);
}

function setView(name, issue = '') {
  view = name;
  issueFilter = issue;
  page = 1;
  for (const button of el('view-choices').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
    button.disabled = !datasets[button.dataset.view];
  }
  for (const button of el('source-shortcuts').querySelectorAll('button')) {
    button.setAttribute('aria-current', String(button.dataset.source === name));
  }
  const statuses = [...new Set(model[view].map(({ row }) => statusOf(row)).filter(Boolean))];
  el('status').replaceChildren(new Option('ทุกสถานะ', ''), ...statuses.map((value) => new Option(statusLabels.get(value) ?? value, value)));
  el('status-field').hidden = !statuses.length;

  const dispenseCount = model.events.filter(({ row }) => row.type === 'dispense').length;
  const returnCount = model.events.filter(({ row }) => row.type === 'return').length;
  const voidCount = model.events.filter(({ row }) => row.type === 'void').length;
  const withLotCount = model.catalog.filter(({ metrics }) => (metrics?.lotCount ?? 0) > 0).length;

  const notes = {
    catalog: datasets.catalog?.meta.source === 'supabase'
      ? `บัญชียาจาก Supabase (${number.format(model.catalog.length)} SKU · มีล็อตในคลัง ${number.format(withLotCount)} SKU)`
      : datasets.catalog?.meta.version ? `ทะเบียนยาเวอร์ชัน ${datasets.catalog.meta.version}` : 'รายการอ้างอิงตาม SKU',
    stock: `ยอดคงเหลือ ณ ${dayLabel(model.snapshot)} (${sourceMode === 'supabase' ? 'ตาราง stock ใน Supabase' : 'ตามไฟล์สต็อก'})`,
    events: `จ่ายยา ${number.format(dispenseCount)} · คืนยา ${number.format(returnCount)} · ยกเลิก ${number.format(voidCount)} เหตุการณ์`,
  };
  el('view-note').textContent = notes[view];
  renderRecords();
}

function renderChecks() {
  const buttons = [];
  for (const kind of ['catalog', 'stock', 'events']) {
    const counts = new Map();
    for (const { issues } of model[kind]) {
      for (const issue of issues) counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
    for (const [issue, count] of counts) {
      const button = node('button', `${issueLabels[issue]} · ${kindLabels[kind]}`);
      button.type = 'button';
      button.prepend(node('strong', number.format(count)));
      button.addEventListener('click', () => {
        el('search').value = el('category').value = '';
        setView(kind, issue);
        el('result-count').focus();
      });
      buttons.push(button);
    }
  }
  el('check-list').replaceChildren(...(buttons.length ? buttons : [node('p', 'ไม่พบรายการผิดปกติจากชุดข้อมูลที่โหลด')]));
  const shortcut = el('review-shortcut');
  shortcut.hidden = !buttons.length;
  shortcut.textContent = buttons.length ? `ดู ${number.format(buttons.length)} ประเภทที่ควรตรวจ` : '';
}

function mountCharts() {
  chartObserver?.disconnect();
  const chart = el('bars');
  const ring = el('ring');
  chart.replaceChildren();
  for (const target of [ring, chart]) target.classList.remove('animate');
  const categories = new Map();
  for (const { row } of model.catalog) categories.set(row.category, (categories.get(row.category) ?? 0) + 1);
  const ranked = [...categories].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'));
  const palette = ['#1ed760', '#38bdf8', '#ff7b72', '#f5b942', '#a78bfa', '#34d399', '#fb923c', '#60a5fa',
    '#f472b6', '#2dd4bf', '#facc15', '#c084fc', '#4ade80', '#f87171', '#818cf8', '#94a3b8'];
  const total = model.catalog.length;
  let end = 0;
  let hovered = '';
  let selected = '';
  const slices = ranked.map(([label, count], index) => {
    const start = end;
    end += 360 * count / total;
    return { label, count, start, end, color: palette[index % palette.length] };
  });
  const buttons = new Map();
  el('replay').hidden = !total;
  el('chart-note').textContent = total ? 'เลือกหมวดจากวงแหวนหรือกราฟแท่งเพื่อกรองรายการ' : 'โหลดทะเบียนยาเพื่อดูกราฟตามหมวด';
  ring.style.removeProperty('--slices');

  function draw() {
    const current = slices.find(({ label }) => label === (hovered || selected));
    el('ring-number').textContent = total ? number.format(current?.count ?? total) : '—';
    el('ring-unit').textContent = current ? percent.format(current.count / total) : 'SKU';
    el('ring-caption').textContent = current ? current.label : total ? `รวม ${number.format(slices.length)} หมวด` : 'ยังไม่มีทะเบียนยา';
    if (!total) return;
    const spans = slices.flatMap((slice) => {
      const stop = slice.end - Math.min(.75, (slice.end - slice.start) * .12);
      const color = current && current !== slice ? slice.color + '60' : slice.color;
      return [`${color} ${slice.start}deg ${stop}deg`, `#181818 ${stop}deg ${slice.end}deg`];
    });
    ring.style.setProperty('--slices', `conic-gradient(${spans.join(',')})`);
  }

  function choose(label) {
    hovered = '';
    el('category').value = el('category').value === label ? '' : label;
    page = 1;
    renderRecords();
  }

  function hit(event) {
    const box = ring.getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height / 2;
    const radius = Math.hypot(x, y) / (box.width / 2);
    const angle = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
    return radius >= .64 && radius <= 1
      ? slices.find((slice) => angle >= slice.start && angle < slice.end)?.label : '';
  }

  ring.onclick = (event) => { const label = hit(event); if (label) choose(label); };
  ring.onpointermove = (event) => {
    if (event.pointerType !== 'mouse') return;
    const label = hit(event) ?? '';
    ring.style.cursor = label ? 'pointer' : '';
    if (hovered !== label) { hovered = label; draw(); }
  };
  ring.onpointerleave = () => { hovered = ''; draw(); };
  slices.forEach(({ label, color, count }, index) => {
    const button = node('button', undefined, 'bar');
    button.type = 'button';
    button.setAttribute('aria-label', `${label} ${number.format(count)} SKU (${percent.format(count / total)})`);
    button.style.setProperty('--color', color);
    button.style.setProperty('--delay', `${Math.min(index * 36, 450)}ms`);
    const heading = node('span', undefined, 'bar-label');
    heading.append(node('span', label), node('strong', number.format(count), 'mono'));
    const track = node('span', undefined, 'bar-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = node('span', undefined, 'bar-fill');
    fill.style.width = `${count / slices[0].count * 100}%`;
    track.append(fill);
    button.append(heading, track);
    button.addEventListener('click', () => choose(label));
    button.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') { hovered = label; draw(); }
    });
    button.addEventListener('pointerleave', () => { hovered = ''; draw(); });
    buttons.set(label, button);
    chart.append(button);
  });

  chartObserver = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) { target.classList.add('animate'); chartObserver.unobserve(target); }
    }
  }, { threshold: .12 });
  for (const target of [ring, chart]) if (total) chartObserver.observe(target);
  el('replay').onclick = () => {
    for (const target of [ring, chart]) {
      chartObserver.unobserve(target);
      target.classList.remove('animate');
      void target.offsetWidth;
      target.classList.add('animate');
    }
  };
  draw();
  return (category) => {
    selected = category;
    for (const [label, button] of buttons) button.setAttribute('aria-pressed', String(label === category));
    draw();
  };
}

function setMetric(id, value) {
  const metric = el(id);
  const display = metric.firstElementChild;
  const finalText = value === undefined ? '—' : number.format(value);
  metric.lastElementChild.textContent = finalText;
  const pending = metricAnimations.get(id);
  if (pending) {
    cancelAnimationFrame(pending.frame);
    clearTimeout(pending.timer);
    metricAnimations.delete(id);
  }
  const previous = Number(display.dataset.count || 0);
  if (value === undefined || previous === value || reducedMotion.matches || document.hidden) {
    display.textContent = finalText;
    display.dataset.count = value ?? 0;
    return;
  }
  const start = performance.now();
  const animation = {};
  const finish = () => {
    cancelAnimationFrame(animation.frame);
    clearTimeout(animation.timer);
    display.textContent = finalText;
    display.dataset.count = value;
    metricAnimations.delete(id);
  };
  const draw = (now) => {
    const progress = Math.min(1, Math.max(0, (now - start) / 700));
    const count = Math.round(previous + (value - previous) * (1 - (1 - progress) ** 3));
    display.textContent = number.format(count);
    display.dataset.count = count;
    if (progress < 1) animation.frame = requestAnimationFrame(draw);
    else finish();
  };
  animation.frame = requestAnimationFrame(draw);
  animation.timer = setTimeout(finish, 800);
  metricAnimations.set(id, animation);
}

function updateConnectionBanner(state, title, subtitle) {
  const panel = el('db-panel');
  const badge = el('dataset-label');
  panel.classList.toggle('is-live', state === 'live');
  panel.classList.toggle('is-error', state === 'error');
  badge.classList.toggle('is-live', state === 'live');
  badge.classList.toggle('is-error', state === 'error');
  el('db-title').textContent = title;
  el('db-subtitle').textContent = subtitle;
  if (state === 'live') badge.textContent = 'Supabase · ออนไลน์';
  else if (state === 'local') badge.textContent = 'ไฟล์ JSON (ออฟไลน์)';
  else if (state === 'loading') badge.textContent = 'กำลังเชื่อมต่อ…';
  else badge.textContent = 'ยังไม่เชื่อมต่อ Supabase';
}

function showData() {
  model = buildModel();
  const categories = [...new Set(model.catalog.map(({ row }) => row.category))].sort((a, b) => a.localeCompare(b, 'th'));
  for (const [id, value] of [
    ['metric-skus', datasets.catalog && model.catalog.length],
    ['metric-categories', datasets.catalog && categories.length],
    ['metric-lots', datasets.stock && model.stock.length],
    ['metric-events', datasets.events && model.events.length],
  ]) setMetric(id, value);

  const syncedText = lastSyncedAt ? ` · อัปเดตเมื่อ ${thaiTime.format(lastSyncedAt)}` : '';
  if (sourceMode === 'supabase') {
    el('snapshot').textContent = `วันอ้างอิง (as_of): ${dayLabel(model.snapshot)} · ข้อมูลสดจาก Supabase${syncedText}`;
  } else {
    el('snapshot').textContent = datasets.stock
      ? `สต็อก ณ ${dayLabel(model.snapshot)} · โหมดไฟล์ JSON ออฟไลน์`
      : 'เพิ่มไฟล์สต็อกเพื่อดูยอดคงเหลือตามวันที่ในไฟล์';
  }

  el('sources').replaceChildren(...Object.values(datasets).map(({ name, items }) =>
    node('li', `${name} · ${number.format(items.length)} รายการ`)));
  el('sources').hidden = false;

  const count = Object.keys(datasets).length;
  el('source-status').textContent = sourceMode === 'supabase'
    ? `เชื่อมต่อ Supabase · ${number.format(count)} / 3 ตาราง`
    : `โหลดไฟล์แล้ว ${number.format(count)} / 3 ประเภท`;
  el('source-status').parentElement.classList.toggle('is-ready', count > 0);
  for (const button of el('source-shortcuts').querySelectorAll('button')) {
    button.disabled = !datasets[button.dataset.source];
  }

  el('category').replaceChildren(new Option('ทุกหมวด', ''), ...categories.map((name) => new Option(name, name)));
  el('category').disabled = !categories.length;
  el('search').value = '';
  el('dashboard').hidden = el('navigation').hidden = false;
  syncChart = mountCharts();
  setView(datasets[view] ? view : Object.keys(datasets)[0]);
  renderChecks();
}

async function loadSupabase() {
  const attempt = ++generation;
  const reloadButton = el('reload-supabase');
  reloadButton.disabled = true;
  el('load-error').hidden = true;
  el('load-status').textContent = 'กำลังดึงข้อมูลจาก Supabase ผ่าน /api/data…';
  el('source-status').textContent = 'กำลังเชื่อมต่อ Supabase…';
  updateConnectionBanner('loading', 'กำลังเชื่อมต่อ Supabase…', 'กำลังอ่าน drugs · stock · dispense_log · v_drug_catalog');

  try {
    const response = await fetch('/api/data', { cache: 'no-store' });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { /* handled below */ }
    const isHtml = !payload && /<html|<!doctype/i.test(text);

    if (!response.ok) {
      if (response.status === 404 || isHtml) {
        const host = location.hostname;
        if (host.endsWith('github.io')) {
          throw Error('GitHub Pages ไม่รัน /api/data กรุณาเปิดผ่านลิงก์ vercel.app ของโปรเจกต์ หรืออัปโหลดไฟล์ JSON ด้านล่าง');
        }
        if (host === 'localhost' || host === '127.0.0.1') {
          throw Error('ไม่พบ /api/data บนเซิร์ฟเวอร์นี้ (Live Server ไม่รัน API) ให้เปิดผ่านลิงก์ vercel.app หรือใช้ vercel dev');
        }
        throw Error('ไม่พบ /api/data ตรวจว่าโฟลเดอร์ api/ อยู่ที่รากของ repo และ deploy บน Vercel แล้ว');
      }
      if (response.status === 500) {
        throw Error(payload?.error || 'ยังไม่ได้ตั้ง SUPABASE_URL หรือ SUPABASE_PUBLISHABLE_KEY ใน Vercel แล้ว Redeploy');
      }
      if (response.status === 502) {
        throw Error(payload?.error || 'Supabase ตอบผิดปกติ ตรวจค่า key, นโยบาย RLS หรือรัน schema → seed → sell_drug → crud');
      }
      throw Error(payload?.error || `เชื่อมต่อ /api/data ไม่สำเร็จ (HTTP ${response.status})`);
    }

    if (!payload?.drugs || !payload?.stock || !payload?.dispense_log) {
      throw Error('ผลลัพธ์จาก /api/data ไม่ครบ (ต้องมี drugs, stock และ dispense_log)');
    }

    // ใช้ v_drug_catalog (มี is_active, lot_count, usable_qty) ถ้ามี ไม่อย่างนั้นใช้ตาราง drugs เดิม
    const hasCatalogView = Array.isArray(payload.catalog?.items);
    const incoming = {
      catalog: validateDataset(hasCatalogView ? payload.catalog : payload.drugs, 'catalog', hasCatalogView ? 'Supabase: v_drug_catalog' : 'Supabase: drugs'),
      stock: validateDataset(payload.stock, 'stock', 'Supabase: stock'),
      events: validateDataset(payload.dispense_log, 'events', 'Supabase: dispense_log'),
    };

    if (generation !== attempt) return;
    datasets = incoming;
    sourceMode = 'supabase';
    lastSyncedAt = new Date();
    catalogNotice = payload.catalog_error || '';
    showData();

    const asOfText = dayLabel(model.snapshot);
    updateConnectionBanner(
      'live',
      `เชื่อมต่อ Supabase แล้ว (ณ ${asOfText})`,
      hasCatalogView
        ? 'ซิงก์ครบ drugs (v_drug_catalog) · stock · dispense_log'
        : 'ซิงก์ drugs · stock · dispense_log แล้ว (ยังไม่มี v_drug_catalog — รัน crud.sql เพิ่มได้)',
    );
    el('load-status').textContent = catalogNotice
      ? `โหลดข้อมูลจาก Supabase แล้ว · หมายเหตุ: ${catalogNotice}`
      : `เชื่อมต่อ Supabase สำเร็จ · อัปเดตล่าสุด ${thaiTime.format(lastSyncedAt)}`;
  } catch (error) {
    if (generation !== attempt) return;
    const message = error instanceof TypeError
      ? 'ไม่สามารถเรียก /api/data ได้ กรุณาเปิดผ่านลิงก์ vercel.app หรือตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'
      : error.message;
    el('load-error').textContent = message;
    el('load-error').hidden = false;
    el('load-status').textContent = '';
    if (sourceMode !== 'local') {
      el('source-status').textContent = 'เชื่อมต่อ Supabase ไม่สำเร็จ';
      el('source-status').parentElement.classList.remove('is-ready');
      updateConnectionBanner('error', 'เชื่อมต่อ Supabase ไม่สำเร็จ', 'ตรวจการตั้งค่าใน status.html หรือเลือกไฟล์ JSON ด้านล่างแทน');
    }
  } finally {
    if (generation === attempt) reloadButton.disabled = false;
  }
}

async function load(sources, replace = false) {
  const attempt = ++generation;
  el('load-error').hidden = true;
  el('load-status').textContent = 'กำลังอ่านไฟล์ JSON…';
  try {
    const files = await Promise.all(sources.map(async ({ name, read }) => {
      try { return parseDataset(await read(), name); } catch (error) { throw Error(`${name} · ${error.message}`); }
    }));
    const incoming = {};
    for (const data of files) {
      const existing = incoming[data.kind];
      if (existing) {
        if (data.kind !== 'catalog') throw Error(`เลือกไฟล์${kindLabels[data.kind]}ครั้งละหนึ่งไฟล์`);
        if (existing.items.length > data.items.length) continue;
      }
      incoming[data.kind] = data;
    }
    if (generation !== attempt) return;
    datasets = replace || sourceMode === 'supabase' ? incoming : { ...datasets, ...incoming };
    sourceMode = 'local';
    lastSyncedAt = null;
    catalogNotice = '';
    showData();
    updateConnectionBanner('local', 'กำลังดูข้อมูลจากไฟล์ JSON (ออฟไลน์)', 'กด "รีเฟรชข้อมูล" เพื่อกลับไปดึงข้อมูลสดจาก Supabase');
    el('load-status').textContent = 'โหลดไฟล์ JSON แล้ว';
  } catch (error) {
    if (generation !== attempt) return;
    el('load-error').textContent = error.message;
    el('load-error').hidden = false;
    el('load-status').textContent = '';
  }
}

function loadLocalFiles(files) {
  if (files.length) {
    load(files.map((file) => ({
      name: file.name,
      read: () => (file.size <= 10_000_000 ? file.text() : Promise.reject(Error('ไฟล์ใหญ่เกิน 10 MB'))),
    })));
  }
}

el('reload-supabase').addEventListener('click', loadSupabase);

el('file-input').addEventListener('change', (event) => {
  const files = Array.from(event.target.files);
  event.target.value = '';
  loadLocalFiles(files);
});

const dropZone = el('drop-zone');
let dragDepth = 0;
function setDragging(active) {
  dropZone.classList.toggle('is-dragging', active);
  el('drop-title').textContent = active ? 'วางไฟล์เพื่อโหลดข้อมูล' : 'หรือลากไฟล์ JSON มาวาง';
}

dropZone.addEventListener('dragenter', (event) => {
  if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
  event.preventDefault();
  dragDepth += 1;
  setDragging(true);
});
dropZone.addEventListener('dragover', (event) => {
  if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});
dropZone.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) setDragging(false);
});
dropZone.addEventListener('drop', (event) => {
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length) event.preventDefault();
  dragDepth = 0;
  setDragging(false);
  loadLocalFiles(files);
});

el('source-shortcuts').addEventListener('click', (event) => {
  const name = event.target.dataset.source;
  if (!name || !datasets[name]) return;
  el('search').value = el('category').value = '';
  setView(name);
  el('result-count').focus();
});

el('view-choices').addEventListener('click', (event) => {
  const name = event.target.dataset.view;
  if (name && datasets[name]) setView(name);
});

el('filters').addEventListener('submit', (event) => event.preventDefault());
el('filters').addEventListener('reset', (event) => {
  event.preventDefault();
  el('search').value = el('category').value = el('status').value = '';
  issueFilter = '';
  page = 1;
  renderRecords();
  el('search').focus();
});

for (const [id, event] of [['search', 'input'], ['category', 'change'], ['status', 'change']]) {
  el(id).addEventListener(event, () => { page = 1; renderRecords(); });
}

el('previous').addEventListener('click', () => { page -= 1; renderRecords(); });
el('next').addEventListener('click', () => { page += 1; renderRecords(); });
narrow.addEventListener('change', () => { if (model[view]) renderRecords(); });

if (location.protocol === 'http:' || location.protocol === 'https:') {
  loadSupabase();
} else {
  el('source-status').textContent = 'เปิดจากไฟล์ในเครื่อง (ออฟไลน์)';
  updateConnectionBanner(
    'error',
    'เปิดจากไฟล์ในเครื่อง เชื่อม /api/data ไม่ได้',
    'push ขึ้น GitHub แล้วเปิดผ่านลิงก์ vercel.app เพื่อเชื่อม Supabase หรือเลือกไฟล์ JSON ด้านล่าง',
  );
  el('load-status').textContent = 'สามารถเลือกไฟล์ JSON เพื่อทดลองดูข้อมูลแบบออฟไลน์ได้';
}
