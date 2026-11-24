/* BUNNAR Export — 수출 실무 관리 시스템 v0.1
 * 독립 정적 웹앱. 모든 데이터는 이 브라우저(localStorage + IndexedDB)에만 저장됩니다.
 * 저장소에는 민감정보(고객·은행·송금증)를 포함하지 않습니다.
 */
'use strict';
const APP_VERSION = '0.1.0';
const SCHEMA = 'bunnar.export/1';
const LS_KEY = 'bunnar-export-v1';

/* ============================== utils ============================== */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
const sum = (a, f = x => x) => r2(a.reduce((s, x) => s + num(f(x)), 0));
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = n => num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const krw = n => '₩' + Math.round(num(n)).toLocaleString('ko-KR');
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const ymd = s => (s || today()).replace(/-/g, '');
const nowStr = () => { const d = new Date(); return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const kg = n => (Math.round(num(n) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

const COUNTRY_CC = { australia: 'AU', taiwan: 'TW', japan: 'JP', 'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', canada: 'CA', singapore: 'SG', 'hong kong': 'HK', china: 'CN', germany: 'DE', france: 'FR', 'new zealand': 'NZ', netherlands: 'NL', thailand: 'TH', vietnam: 'VN', malaysia: 'MY', philippines: 'PH', indonesia: 'ID', korea: 'KR', '호주': 'AU', '대만': 'TW', '일본': 'JP', '미국': 'US', '영국': 'GB', '캐나다': 'CA', '싱가포르': 'SG', '홍콩': 'HK', '중국': 'CN', '독일': 'DE', '프랑스': 'FR', '뉴질랜드': 'NZ' };

/* ============================== defaults ============================== */
function defaultSettings() {
  return {
    seller: { company: 'BETTERHAND (BUNNAR)', address: '', regNo: '', email: '', web: 'www.bunnar.com', phone: '', signer: '' },
    bank: { bank: '', swift: '', beneficiary: '', account: '', note: '' },
    pricing: {
      tiers: [
        { min: 30, max: 99, discount: 25, negotiable: false, note: '' },
        { min: 100, max: 299, discount: 30, negotiable: false, note: '' },
        { min: 300, max: null, discount: 33, negotiable: true, note: '33~35% 개별 협의' },
      ],
      vatRate: 10, vatMode: 'included', fxRate: 1400, fxDate: today(),
      moqNote: '최소 주문 수량 산정 방식·제품별 최소 수량은 추후 확정 (확인 필요)',
    },
    defaults: { incoterms: '', origin: 'Republic of Korea', dimDivisor: 5000, shipRequires: 'full' },
    logo: '',
  };
}
const P = (sku, nameEn, nameKo) => ({ id: 'p_' + sku, sku, nameEn, nameKo, priceKrw: 0, piecesPerSet: 2, weightKg: 0, stock: 0, hsCode: '', hsStatus: 'pending' });
function defaultProducts() {
  return [
    P('ESP-CS', 'Espresso Cup 75ml & Saucer', '에스프레소 컵 75ml & 소서'),
    P('FW-CS', 'Flat White Cup 190ml & Saucer', '플랫화이트 컵 190ml & 소서'),
    P('CAP-CS', 'Cappuccino Cup 190ml & Saucer', '카푸치노 컵 190ml & 소서'),
    P('AME-CS', 'Americano Cup 300ml & Saucer', '아메리카노 컵 300ml & 소서'),
    P('LAT-CS', 'Caffè Latte Cup 270ml & Saucer', '카페라떼 컵 270ml & 소서'),
  ];
}
function defaultVerify() {
  return [
    { key: 'hs', label: 'HS코드 확인 (HS code)', status: 'pending', note: '' },
    { key: 'zero', label: '영세율 적용 여부 (Zero-rated VAT)', status: 'pending', note: '' },
    { key: 'perf', label: '직접 수출실적 인정 여부 (Export record)', status: 'pending', note: '' },
    { key: 'inco', label: '인코텀즈·운임 부담 조건 (Incoterms)', status: 'pending', note: '' },
  ];
}

/* ============================== storage ============================== */
let state = null;
const ui = { view: 'home', dealId: null, drawer: null, modal: null, filter: 'active', payForm: null, payFile: null, newLog: '', email: { key: 'pi', subject: '', body: '' } };

function freshState() { return { schema: SCHEMA, version: APP_VERSION, settings: defaultSettings(), products: defaultProducts(), deals: [] }; }
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.schema === SCHEMA) return migrate(s); }
  } catch (e) { console.warn(e); }
  return freshState();
}
function migrate(s) {
  const d = defaultSettings();
  s.settings = Object.assign(d, s.settings || {});
  for (const k of ['seller', 'bank', 'pricing', 'defaults']) s.settings[k] = Object.assign(defaultSettings()[k], s.settings[k] || {});
  s.products = s.products || [];
  s.deals = (s.deals || []).map(normDeal);
  return s;
}
function normDeal(d) {
  return Object.assign({ items: [], charges: [], payments: [], shipments: [], docs: [], files: [], logs: [], checks: {}, verify: defaultVerify(), settlement: { costs: [], note: '' }, todo: '', archived: false }, d);
}
let saveTimer = null;
function save() {
  state.version = APP_VERSION;
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { toast('저장 실패: 브라우저 저장 공간을 확인하세요'); console.error(e); }
}

/* IndexedDB for attachments */
const FileDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const rq = indexedDB.open('bunnar-export-files', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('files');
      rq.onsuccess = () => { this.db = rq.result; res(this.db); };
      rq.onerror = () => rej(rq.error);
    });
  },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('files', mode); const st = t.objectStore('files'); const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); },
  put(id, blob) { return this.tx('readwrite', s => s.put(blob, id)); },
  get(id) { return this.tx('readonly', s => s.get(id)); },
  del(id) { return this.tx('readwrite', s => s.delete(id)); },
  clear() { return this.tx('readwrite', s => s.clear()); },
};

/* ============================== pricing / calc ============================== */
function dealQty(d) { return d.items.reduce((s, i) => s + num(i.qty), 0); }
function tierFor(tiers, qty) { return (tiers || []).find(t => qty >= num(t.min) && (t.max == null || t.max === '' || qty <= num(t.max))) || null; }
function dealDiscount(d) {
  if (!d.pricing.discountAuto) return num(d.pricing.discount);
  const t = tierFor(d.pricing.tiers, dealQty(d));
  return t ? num(t.discount) : 0;
}
function calcUnit(priceKrw, disc, fx, vatMode, vatRate) {
  if (!num(priceKrw) || !num(fx)) return 0;
  let v = num(priceKrw) * (1 - num(disc) / 100);
  if (vatMode === 'deductOnce') v = v / (1 + num(vatRate) / 100); // VAT는 최대 1회만 차감
  return r2(v / num(fx));
}
function unitOf(d, it) {
  if (it.manual) return r2(it.unitUsd);
  return calcUnit(it.priceKrw, dealDiscount(d), d.pricing.fxRate, d.pricing.vatMode, d.pricing.vatRate);
}
function totals(d) {
  const lines = d.items.map(it => { const unit = unitOf(d, it); return { id: it.id, desc: it.desc, qty: num(it.qty), unit, amount: r2(num(it.qty) * unit), backorder: !!it.backorder, pieces: num(it.qty) * (num(it.piecesPerSet) || 1), hs: it.hsCode || productOf(it.productId)?.hsCode || '', manual: !!it.manual, priceKrw: num(it.priceKrw) }; });
  const goods = sum(lines, l => l.amount);
  const charges = sum(d.charges, c => c.amount);
  const total = r2(goods + charges);
  const sets = lines.reduce((s, l) => s + l.qty, 0);
  const pieces = lines.reduce((s, l) => s + l.pieces, 0);
  const deposit = d.terms.type === 'deposit' ? r2(goods * num(d.terms.depositPct) / 100) : total;
  const receipts = sum(d.payments.filter(p => p.kind === 'receipt'), p => p.amount);
  const credited = sum(d.payments.filter(p => p.kind === 'credited'), p => p.amount);
  const creditedKrw = Math.round(d.payments.filter(p => p.kind === 'credited').reduce((s, p) => s + num(p.krw), 0));
  const balance = r2(total - credited);
  const needForShip = d.terms.shipRequires === 'deposit' && d.terms.type === 'deposit' ? deposit : total;
  return { lines, goods, charges, total, sets, pieces, deposit, receipts, credited, creditedKrw, balance, needForShip };
}
function payStatus(d, t = totals(d)) {
  if (t.total <= 0) return { label: '금액 미정', cls: '' };
  if (t.credited >= t.total - 0.004) return { label: '입금 완료', cls: 'green' };
  if (t.credited > 0) return { label: d.terms.type === 'deposit' && t.credited >= t.deposit - 0.004 ? '선금 입금' : '부분 입금', cls: 'blue' };
  if (t.receipts > 0) return { label: '송금증만 수령 · 입금 미확인', cls: 'amber' };
  return { label: '미입금', cls: '' };
}
function sigOf(d) { const t = totals(d); return JSON.stringify([t.lines.map(l => [l.desc, l.qty, l.unit]), d.charges.map(c => [c.label, num(c.amount)])]); }
function productOf(id) { return state.products.find(p => p.id === id); }

/* shipments */
function allocated(d, itemId, exceptSid) { return d.shipments.filter(s => s.id !== exceptSid).reduce((a, s) => a + num(s.alloc?.[itemId]), 0); }
function shipLines(d, s) {
  const t = totals(d);
  return t.lines.filter(l => num(s.alloc?.[l.id]) > 0).map(l => { const q = num(s.alloc[l.id]); return { ...l, qty: q, amount: r2(q * l.unit), pieces: q * (num(d.items.find(i => i.id === l.id)?.piecesPerSet) || 1) }; });
}
function boxCalc(b) {
  const div = num(state.settings.defaults.dimDivisor) || 5000;
  const vol = r2(num(b.l) * num(b.w) * num(b.h) / div);
  const charge = Math.ceil(Math.max(num(b.gw), vol) * 2) / 2;
  return { vol, charge };
}
function shipSummary(d, s) {
  const lines = shipLines(d, s);
  return {
    lines, value: sum(lines, l => l.amount), sets: lines.reduce((a, l) => a + l.qty, 0), pieces: lines.reduce((a, l) => a + l.pieces, 0),
    gw: r2(s.boxes.reduce((a, b) => a + num(b.gw), 0)), nw: r2(s.boxes.reduce((a, b) => a + num(b.nw), 0)),
    vol: r2(s.boxes.reduce((a, b) => a + boxCalc(b).vol, 0)), charge: s.boxes.reduce((a, b) => a + boxCalc(b).charge, 0),
  };
}
const METHOD = { DHL: 'DHL Express', EMS: 'EMS', forwarder: '국내 지정 물류업체 인도', other: '기타 운송' };
const DECL = { unset: '확인 필요', formal: '정식 수출신고 (필증)', courier: '특송 간이·목록 신고', none: '신고 대상 아님 / 물류업체 처리' };
const isIntl = s => s.method === 'DHL' || s.method === 'EMS';

/* 출고 조건 (Shipping gate) */
function shipGate(d, s) {
  const t = totals(d), ss = shipSummary(d, s), g = [];
  const needLabel = num(t.needForShip) >= t.total ? '전액' : '선금';
  g.push({ ok: t.credited >= t.needForShip - 0.004 && t.needForShip > 0, t: `실입금 확인 (${needLabel} USD ${usd(t.needForShip)} · 현재 ${usd(t.credited)})` });
  g.push({ ok: ss.lines.length > 0, t: '배송 품목·수량 배정' });
  const over = d.items.filter(i => allocated(d, i.id) > num(i.qty));
  g.push({ ok: over.length === 0, t: over.length ? `배정 수량 초과: ${over.map(i => i.desc).join(', ')}` : '주문 수량 초과 배정 없음' });
  const bo = ss.lines.filter(l => l.backorder);
  if (bo.length) g.push({ ok: false, t: `백오더 품목 입고 확인 필요: ${bo.map(l => l.desc).join(', ')}` });
  g.push({ ok: !!s.inspected, t: '검수 완료' });
  g.push({ ok: s.boxes.length > 0 && s.boxes.every(b => num(b.gw) > 0), t: '박스 크기·중량 입력' });
  if (isIntl(s)) {
    g.push({ ok: hasIssued(d, 'CI', s.id) && hasIssued(d, 'PL', s.id), t: '이 배송의 CI·PL 발행' });
    g.push({ ok: !!(s.awb || '').trim(), t: '운송장(AWB) 번호 입력' });
  }
  if (s.method === 'DHL' && s.account === 'buyer') g.push({ ok: !!s.accountApproved && !!(s.approvalRef || '').trim(), t: 'DHL 고객 계정 사용 승인 확인 + 승인 근거 입력' });
  g.push({ ok: s.declMode && s.declMode !== 'unset', t: `수출신고 방식 결정 (${DECL[s.declMode || 'unset']})` });
  return g;
}
const gateOk = (d, s) => shipGate(d, s).every(x => x.ok);

/* ============================== stages ============================== */
const hasIssued = (d, type, sid) => d.docs.some(x => x.type === type && x.status === 'issued' && (!sid || x.shipmentId === sid));
const latestIssued = (d, type, sid) => d.docs.filter(x => x.type === type && x.status === 'issued' && (!sid || x.shipmentId === sid)).sort((a, b) => (b.issuedAt || '').localeCompare(a.issuedAt || ''))[0];
const activeShips = d => d.shipments.filter(s => shipLines(d, s).length > 0);
const allShips = (d, f) => { const a = activeShips(d); return a.length > 0 && a.every(f); };
function piMatches(d) { const p = latestIssued(d, 'PI'); return !!p && p.snapshot?.sig === sigOf(d); }

const STAGES = [
  { key: 'inquiry', no: '01', ko: '고객 문의', en: 'Inquiry', kind: 'other',
    desc: '문의 내용과 고객 정보를 기록하고 요청 제품·수량·일정을 확인한 뒤 영문으로 답변합니다.',
    checks: [
      { k: 'customer', t: '고객 정보 입력 (이름·국가·이메일)', auto: d => !!(d.customer.name && d.customer.country && d.customer.email) },
      { k: 'address', t: '배송지 주소·연락처 확인', auto: d => !!(d.customer.shipAddress || '').trim() },
      { k: 'request', t: '요청 제품·수량·희망 일정 기록' },
      { k: 'reply', t: '문의 답변 이메일 발송' },
    ], next: '제품과 수량이 정해지면 02 견적에서 품목을 입력합니다.' },
  { key: 'quotation', no: '02', ko: '견적', en: 'Quotation', kind: 'other',
    desc: '수량 구간 할인과 환율로 USD 단가를 계산합니다. 재고·입고 예정과 별도 비용(배송·인쇄)을 확인합니다.',
    checks: [
      { k: 'items', t: '제품·수량 입력', auto: d => d.items.length > 0 && d.items.every(i => num(i.qty) > 0) },
      { k: 'price', t: '모든 품목 단가 산정 (0원 없음)', auto: d => d.items.length > 0 && totals(d).lines.every(l => l.unit > 0) },
      { k: 'stock', t: '재고·입고 예정 확인' },
      { k: 'extra', t: '배송비·인쇄비 별도 안내' },
      { k: 'qt', t: '견적서(QT) 발행·발송', auto: d => hasIssued(d, 'QT'), optional: true },
    ], next: '고객이 견적을 수락하면 03 인보이스에서 PI를 발행합니다.' },
  { key: 'invoice', no: '03', ko: '인보이스', en: 'Invoice', kind: 'other',
    desc: '결제 요청용 PI를 발행합니다. 주문이 바뀌면 기존 PI는 잠긴 채로 두고 수정본(R1…)을 발행합니다.',
    checks: [
      { k: 'pi', t: 'PI 발행', auto: d => hasIssued(d, 'PI') },
      { k: 'match', t: '최신 PI = 현재 주문 내용', auto: piMatches },
      { k: 'sent', t: '고객에게 PI 발송' },
      { k: 'confirm', t: '고객 주문 확정 회신 받음' },
    ], next: '04 결제 확인에서 송금증과 실제 입금을 확인합니다.' },
  { key: 'payment', no: '04', ko: '결제 확인', en: 'Payment', kind: 'remittance',
    desc: '송금증 수령과 실제 입금은 다른 단계입니다. 은행에서 입금이 확인된 금액만 출고 조건에 반영됩니다.',
    checks: [
      { k: 'receipt', t: '송금증 수령', auto: d => d.payments.some(p => p.kind === 'receipt') || d.payments.some(p => p.kind === 'credited') },
      { k: 'credited', t: '실제 입금 확인 (출고 필요액 이상)', auto: d => { const t = totals(d); return t.needForShip > 0 && t.credited >= t.needForShip - 0.004; } },
      { k: 'fee', t: '수수료·환차 차액 확인' },
    ], next: '입금이 확인되면 05 검수·포장을 진행합니다. 검수·포장은 입금 확인과 동시에 진행할 수 있습니다.' },
  { key: 'packing', no: '05', ko: '검수·포장', en: 'Packing', kind: 'other',
    desc: '배송(분할 배송 포함)별로 품목을 배정하고, 검수 후 박스 크기·중량을 입력합니다. 부피무게는 자동 계산합니다.',
    checks: [
      { k: 'alloc', t: '배송별 품목 배정 (주문 수량 전부)', auto: d => d.items.length > 0 && d.items.every(i => allocated(d, i.id) === num(i.qty)) },
      { k: 'inspect', t: '검수 완료', auto: d => allShips(d, s => s.inspected) },
      { k: 'boxes', t: '박스 크기·중량 입력', auto: d => allShips(d, s => s.boxes.length > 0 && s.boxes.every(b => num(b.gw) > 0)) },
      { k: 'date', t: '출고 예정일 확정', auto: d => allShips(d, s => !!s.plannedDate) },
      { k: 'mark', t: '배송 라벨(Shipping Mark) 출력', auto: d => allShips(d, s => hasIssued(d, 'MARK', s.id)) },
    ], next: '포장이 끝나면 06 수출신고에서 CI·PL을 발행합니다.' },
  { key: 'declaration', no: '06', ko: '수출신고', en: 'Declaration', kind: 'declaration',
    desc: '배송별 상업송장(CI)·포장명세서(PL)를 발행하고, 신고 방식을 정해 공식 수출신고필증을 첨부합니다.',
    checks: [
      { k: 'cipl', t: '배송별 CI·PL 발행', auto: d => allShips(d, s => !isIntl(s) || (hasIssued(d, 'CI', s.id) && hasIssued(d, 'PL', s.id))) },
      { k: 'hs', t: 'HS코드 확인', auto: d => d.verify.find(v => v.key === 'hs')?.status === 'ok' },
      { k: 'mode', t: '수출신고 방식 결정', auto: d => allShips(d, s => s.declMode && s.declMode !== 'unset') },
      { k: 'cert', t: '정식 신고 건: 신고번호·필증 첨부', auto: d => allShips(d, s => s.declMode !== 'formal' || (!!(s.declNo || '').trim() && d.files.some(f => f.kind === 'declaration' && f.shipmentId === s.id))) },
    ], next: '07 배송에서 픽업을 예약하고 출고 조건을 확인합니다.' },
  { key: 'shipping', no: '07', ko: '배송', en: 'Shipping', kind: 'awb',
    desc: '배송 예약, 운송장 등록, 출고 완료 처리를 합니다. 조건이 모두 충족되어야 출고 완료 버튼이 활성화됩니다.',
    checks: [
      { k: 'acct', t: 'DHL 고객 계정 사용 승인 확인 (해당 시)', auto: d => allShips(d, s => !(s.method === 'DHL' && s.account === 'buyer') || (s.accountApproved && !!(s.approvalRef || '').trim())) },
      { k: 'book', t: '픽업·인도 예약', auto: d => allShips(d, s => !!s.pickupBooked) },
      { k: 'awb', t: '운송장 번호 입력', auto: d => allShips(d, s => !isIntl(s) || !!(s.awb || '').trim()) },
      { k: 'shipped', t: '모든 배송 출고 완료', auto: d => allShips(d, s => !!s.shippedAt) },
      { k: 'notify', t: '고객에게 운송장·출고 안내' },
    ], next: '출고 후 08 정산에서 잔금·수출이행·증빙을 정리합니다.' },
  { key: 'settlement', no: '08', ko: '정산', en: 'Settlement', kind: 'other',
    desc: '잔금(FI)과 원화 입금액, 비용, 수익을 정리하고 수출이행·수출실적·증빙 보관을 확인합니다.',
    checks: [
      { k: 'balance', t: '잔금 0 (최종 입금 완료)', auto: d => { const t = totals(d); return t.total > 0 && t.balance <= 0.004; } },
      { k: 'export', t: '수출이행(선적) 완료 확인', auto: d => allShips(d, s => !!s.exportDone) },
      { k: 'verify', t: '확인 필요 항목 정리', auto: d => d.verify.every(v => v.status !== 'pending') },
      { k: 'archive', t: '증빙 보관 완료 (송금증·필증·운송장)' },
    ], next: '모든 항목이 끝나면 이 수출 건을 보관 처리합니다.' },
];
function stageChecks(d, st) { return st.checks.map(c => ({ ...c, done: c.auto ? !!c.auto(d) : !!d.checks[st.key + '_' + c.k] })); }
function stageStatus(d, st) {
  const cs = stageChecks(d, st), req = cs.filter(c => !c.optional);
  if (req.every(c => c.done)) return 'done';
  if (cs.some(c => c.done)) return 'doing';
  return 'todo';
}
function currentStage(d) { return STAGES.find(st => stageStatus(d, st) !== 'done') || null; }
function nextTodo(d) {
  const st = currentStage(d);
  if (!st) return { st: null, t: '모든 단계 완료 — 보관 처리 가능' };
  const c = stageChecks(d, st).find(c => !c.done && !c.optional);
  return { st, t: c ? c.t : st.next };
}
const STATUS_PILL = { done: '<span class="pill green">완료</span>', doing: '<span class="pill amber">진행 중</span>', todo: '<span class="pill">대기</span>' };

/* ============================== deals ============================== */
function newDeal() {
  const S = state.settings;
  const seq = state.deals.filter(d => (d.code || '').includes(ymd())).length + 1;
  const d = normDeal({
    id: uid(), code: `EX-${ymd()}-${pad(seq)}`, createdAt: nowStr(), updatedAt: nowStr(),
    customer: { name: '', contact: '', country: '', cc: '', email: '', phone: '', billAddress: '', shipAddress: '', notes: '' },
    pricing: { fxRate: S.pricing.fxRate, fxDate: S.pricing.fxDate, vatMode: S.pricing.vatMode, vatRate: S.pricing.vatRate, tiers: clone(S.pricing.tiers), discountAuto: true, discount: 0 },
    terms: { type: 'full', depositPct: 50, shipRequires: S.defaults.shipRequires || 'full' },
  });
  d.logs.push({ id: uid(), at: nowStr(), kind: 'system', text: '수출 건 생성' });
  return d;
}
function newShipment(d) {
  const no = (d.shipments.reduce((m, s) => Math.max(m, s.no), 0) || 0) + 1;
  return { id: uid(), no, method: 'DHL', account: 'buyer', accountNo: '', accountApproved: false, approvalRef: '', alloc: {}, boxes: [], inspected: false, plannedDate: '', pickupBooked: false, awb: '', shippedAt: '', shipTo: '', declMode: 'unset', declNo: '', declAccepted: false, exportDone: false, note: '' };
}
const deal = () => state.deals.find(d => d.id === ui.dealId);
function log(d, text, kind = 'system') { d.logs.push({ id: uid(), at: nowStr(), kind, text }); d.updatedAt = nowStr(); }

/* ============================== documents ============================== */
const DOC = {
  QT: { title: 'QUOTATION', ko: '견적서', perShip: false },
  PI: { title: 'PROFORMA INVOICE', ko: '결제 요청 인보이스', perShip: false },
  FI: { title: 'FINAL INVOICE', ko: '최종 잔금 청구서', perShip: false },
  CI: { title: 'COMMERCIAL INVOICE', ko: '상업송장', perShip: true },
  PL: { title: 'PACKING LIST', ko: '포장명세서', perShip: true },
  MARK: { title: 'SHIPPING MARK', ko: '배송 라벨', perShip: true },
  KR: { title: '내부 검토용 인보이스', ko: '내부용 (한글·원화)', perShip: false },
};
const DOC_STATUS = { draft: '<span class="pill amber">초안</span>', issued: '<span class="pill green">발행</span>', superseded: '<span class="pill">대체됨</span>', void: '<span class="pill red">무효</span>' };

function docNo(d, type, seq, rev, s) {
  const cc = (d.customer.cc || 'XX').toUpperCase();
  return `${type}-${cc}-${ymd()}-${pad(seq)}A${s ? '-S' + s.no : ''}${rev ? '-R' + rev : ''}`;
}
function nextSeq(type, cc) {
  const key = `${type}-${(cc || 'XX').toUpperCase()}-${ymd()}-`;
  let max = 0;
  for (const dd of state.deals) for (const x of dd.docs) if (x.no.startsWith(key)) max = Math.max(max, parseInt(x.no.slice(key.length), 10) || 0);
  return max + 1;
}
function defaultEdits(d, type, s) {
  const t = totals(d), e = { date: today(), option: '', notes: '', sched: [], validUntil: '', incoterms: state.settings.defaults.incoterms || '' };
  const ships = activeShips(d), lines = [];
  if (type === 'QT') {
    e.validUntil = addDays(today(), 14);
    lines.push('Prices are based on the total quantity above; a change in quantity may change the discount tier.');
    lines.push('International shipping and printing services are quoted separately.');
    lines.push('Stock availability is confirmed at the time of order.');
    lines.push("Import duties, local taxes and destination customs charges are the buyer's responsibility.");
  }
  if (type === 'PI') {
    e.sched = d.terms.type === 'deposit' ? [`Deposit (${num(d.terms.depositPct)}%) upon confirmation`, 'Balance before dispatch'] : ['100% payment upon confirmation, before preparation'];
    if (ships.length > 1) ships.forEach(sh => { const ss = shipSummary(d, sh); const bo = ss.lines.some(l => l.backorder); lines.push(`Shipment ${sh.no}: ${ss.sets} sets (${ss.pieces} pieces)${bo ? ', following expected restock.' : ', subject to payment, availability and courier booking.'}`); });
    const buyerDhl = d.shipments.some(sh => sh.method === 'DHL' && sh.account === 'buyer');
    if (buyerDhl) lines.push(ships.length > 1 ? 'Shipments billed separately to buyer DHL account; arrival dates cannot be guaranteed.' : 'Freight billed to buyer DHL account; delivery date is not guaranteed.');
    lines.push('Goods will be prepared for dispatch after payment is credited and details are confirmed.');
    lines.push("Import duties, local taxes and destination clearance charges are the buyer's responsibility.");
  }
  if (type === 'FI') {
    e.sched = ['Balance due before dispatch'];
    lines.push('This final invoice reflects the payment received and additional charges.');
    lines.push('Please transfer the balance due; bank charges are borne by the sender.');
  }
  if (type === 'CI') {
    const n = d.shipments.length;
    if (n > 1) lines.push(`Partial shipment ${s.no} of ${n}. Values shown are for the goods in this shipment only.`);
    lines.push('We certify that this invoice is true and correct and that the contents of this shipment are as stated above.');
  }
  e.notes = lines.join('\n');
  return e;
}
function findDraft(d, type, sid) { return d.docs.find(x => x.type === type && x.status === 'draft' && (x.shipmentId || null) === (sid || null)); }
function createDoc(d, type, sid) {
  const ex = findDraft(d, type, sid); if (ex) return ex;
  const s = sid ? d.shipments.find(x => x.id === sid) : null;
  const prev = latestIssued(d, type, sid);
  let doc;
  if (prev) {
    const rev = (prev.rev || 0) + 1;
    doc = { id: uid(), type, seq: prev.seq, rev, originalNo: prev.originalNo || prev.no, shipmentId: sid || null, status: 'draft', createdAt: nowStr(), edits: Object.assign(clone(prev.edits), { date: today() }) };
    const rl = `One revised invoice replaces ${doc.originalNo}; please pay only this revised amount.`;
    if (type === 'PI' && !(doc.edits.notes || '').includes(rl)) doc.edits.notes = (doc.edits.notes ? doc.edits.notes + '\n' : '') + rl;
    doc.no = docNo(d, type, prev.seq, rev, s);
  } else {
    const seq = nextSeq(type, d.customer.cc);
    doc = { id: uid(), type, seq, rev: 0, originalNo: '', shipmentId: sid || null, status: 'draft', createdAt: nowStr(), edits: defaultEdits(d, type, s) };
    doc.no = docNo(d, type, seq, 0, s);
  }
  d.docs.push(doc);
  log(d, `${type} 초안 생성: ${doc.no}`);
  return doc;
}

function buildSnap(d, doc) {
  const S = state.settings, t = totals(d), e = doc.edits;
  const s = doc.shipmentId ? d.shipments.find(x => x.id === doc.shipmentId) : null;
  const snap = {
    type: doc.type, title: DOC[doc.type].title, no: doc.no, rev: doc.rev, originalNo: doc.originalNo, date: e.date, option: e.option, notes: e.notes,
    seller: clone(S.seller), logo: S.logo || '', bank: clone(S.bank), customer: clone(d.customer), currency: 'USD', sig: sigOf(d),
    fx: num(d.pricing.fxRate), discount: dealDiscount(d), vatMode: d.pricing.vatMode, validUntil: e.validUntil, incoterms: e.incoterms,
  };
  const qt = latestIssued(d, 'QT'), pi = latestIssued(d, 'PI');
  snap.quoteRef = qt?.no || ''; snap.piRef = pi?.no || '';
  if (['QT', 'PI', 'FI', 'KR'].includes(doc.type)) {
    snap.lines = t.lines.map(l => ({ desc: l.desc + (l.backorder ? ' (backorder)' : ''), qty: l.qty, unit: l.unit, amount: l.amount, priceKrw: l.priceKrw, manual: l.manual, backorder: l.backorder }));
    snap.backorderNote = t.lines.filter(l => l.backorder).map(l => `* ${l.desc}: on backorder; ships after restock.`).join('\n');
    snap.goods = t.goods; snap.charges = d.charges.map(c => ({ label: c.label, amount: r2(c.amount) })); snap.total = t.total;
    snap.sets = t.sets; snap.pieces = t.pieces;
    snap.shipNote = d.shipments.some(x => x.method === 'DHL' && x.account === 'buyer') ? 'Buyer DHL account' : (d.shipments.some(x => x.method === 'forwarder') ? 'Delivery to designated forwarder (Korea)' : 'Quoted separately');
    if (doc.type === 'PI') {
      snap.sched = d.terms.type === 'deposit'
        ? [{ label: e.sched[0] || 'Deposit', amount: t.deposit }, { label: e.sched[1] || 'Balance', amount: r2(t.total - t.deposit) }]
        : [{ label: e.sched[0] || '100% payment', amount: t.total }];
    }
    if (doc.type === 'FI') {
      snap.received = t.credited; snap.balance = t.balance;
      snap.paymentsList = d.payments.filter(p => p.kind === 'credited').map(p => ({ date: p.date, amount: r2(p.amount) }));
      snap.sched = [{ label: e.sched[0] || 'Balance due', amount: t.balance }];
    }
    if (doc.type === 'KR') {
      snap.credited = t.credited; snap.receipts = t.receipts; snap.creditedKrw = t.creditedKrw; snap.balance = t.balance; snap.deposit = t.deposit; snap.terms = clone(d.terms);
      snap.ships = d.shipments.map(x => { const ss = shipSummary(d, x); return { no: x.no, method: METHOD[x.method], sets: ss.sets, value: ss.value, shipped: x.shippedAt, decl: DECL[x.declMode || 'unset'], exportDone: x.exportDone }; });
      snap.verify = d.verify.map(v => ({ label: v.label, status: v.status }));
    }
  }
  if (s) {
    const ss = shipSummary(d, s);
    snap.ship = { no: s.no, count: d.shipments.length, method: METHOD[s.method], account: s.account, awb: s.awb, shipTo: s.shipTo, planned: s.plannedDate };
    snap.lines = ss.lines.map(l => ({ desc: l.desc, qty: l.qty, unit: l.unit, amount: l.amount, hs: l.hs, pieces: l.pieces }));
    snap.value = ss.value; snap.orderTotal = t.total; snap.sets = ss.sets; snap.pieces = ss.pieces;
    snap.boxes = s.boxes.map((b, i) => ({ cno: i + 1, l: num(b.l), w: num(b.w), h: num(b.h), gw: num(b.gw), nw: num(b.nw), contents: b.contents || '', vol: boxCalc(b).vol }));
    snap.gw = ss.gw; snap.nw = ss.nw; snap.vol = ss.vol; snap.origin = S.defaults.origin;
    snap.ciRef = latestIssued(d, 'CI', s.id)?.no || '';
  }
  return snap;
}
const snapOf = (d, doc) => doc.snapshot || buildSnap(d, doc);

/* 자동 검산 */
function verifyMath(sn) {
  const errs = [];
  (sn.lines || []).forEach(l => { if (r2(l.qty * l.unit) !== r2(l.amount)) errs.push(`${l.desc}: ${l.qty} × ${usd(l.unit)} ≠ ${usd(l.amount)}`); });
  if (sn.goods != null && r2(sum(sn.lines, l => l.amount)) !== r2(sn.goods)) errs.push('상품 소계 불일치');
  if (sn.total != null && r2(sn.goods + sum(sn.charges || [], c => c.amount)) !== r2(sn.total)) errs.push('총액 불일치');
  if (sn.sched && sn.type === 'PI' && r2(sum(sn.sched, x => x.amount)) !== r2(sn.total)) errs.push('결제 일정 합계 ≠ 총액');
  if (sn.type === 'FI' && r2(sn.total - sn.received) !== r2(sn.balance)) errs.push('잔금 계산 불일치');
  if (sn.value != null && r2(sum(sn.lines, l => l.amount)) !== r2(sn.value)) errs.push('통관 가액 합계 불일치');
  return errs;
}
function docWarnings(d, doc, sn) {
  const w = [];
  if (!sn.customer.name) w.push('고객명이 비어 있습니다.');
  if (['QT', 'PI', 'FI', 'CI', 'PL'].includes(doc.type) && !(sn.customer.shipAddress || '').trim() && !(sn.ship?.shipTo || '').trim()) w.push('배송지 주소가 비어 있습니다.');
  if (!sn.seller.address) w.push('판매자 주소가 비어 있습니다 (설정).');
  if (['PI', 'FI'].includes(doc.type) && !(sn.bank.account || '').trim()) w.push('은행 정보가 비어 있습니다 (설정 → 은행 정보, 이 브라우저에만 저장).');
  if ((sn.lines || []).some(l => !(l.unit > 0))) w.push('단가가 0인 품목이 있습니다.');
  if (!(sn.lines || []).length && doc.type !== 'MARK') w.push('품목이 없습니다.');
  if (doc.type === 'CI') {
    if ((sn.lines || []).some(l => !l.hs)) w.push('HS코드가 없는 품목이 있습니다 (문서에 TBC로 표시).');
    if (d.verify.find(v => v.key === 'hs')?.status !== 'ok') w.push('HS코드가 아직 "확인 필요" 상태입니다.');
    if (!sn.incoterms) w.push('Incoterms가 비어 있습니다.');
  }
  if (['CI', 'PL', 'MARK'].includes(doc.type) && !(sn.boxes || []).length) w.push('박스 정보가 없습니다.');
  if (doc.type === 'FI' && sn.balance <= 0) w.push('잔금이 0 이하입니다.');
  if (doc.type === 'PI' && (sn.lines || []).some(l => l.backorder) && d.shipments.length < 2) w.push('백오더 품목이 있지만 분할 배송이 설정되지 않았습니다.');
  return w;
}

/* ---------- document rendering (BUNNAR invoice layout) ---------- */
function dLogo(sn) { return sn.logo ? `<div class="d-logo"><img src="${esc(sn.logo)}" alt="bunnar"></div>` : '<div class="d-logo">bunnar</div>'; }
function dSeller(sn) {
  const s = sn.seller;
  return `<div><div class="d-lbl">Seller / Exporter</div><div class="d-co">${esc(s.company)}</div>
  ${s.address ? `<div>${nl2br(s.address)}</div>` : ''}${s.regNo ? `<div>Business Reg. No. ${esc(s.regNo)}</div>` : ''}
  <div>${[s.email, s.web].filter(Boolean).map(esc).join(' | ')}</div>${s.phone ? `<div>Tel. ${esc(s.phone)}</div>` : ''}</div>`;
}
function dMeta(label, rows) { return `<div><div class="d-lbl">${label}</div><div class="d-meta">${rows.filter(r => r[1] !== undefined && r[1] !== null && r[1] !== '').map(r => `<span class="k">${esc(r[0])}</span><span>${esc(r[1])}</span>`).join('')}</div></div>`; }
function dBill(sn, label = 'Bill To / Buyer') {
  const c = sn.customer;
  return `<div><div class="d-lbl">${label}</div><div>${esc(c.name)}</div>${c.contact ? `<div>Attn: ${esc(c.contact)}</div>` : ''}
  ${c.billAddress ? `<div>${nl2br(c.billAddress)}</div>` : ''}${c.email && label !== 'Bill To / Buyer' ? `<div>${esc(c.email)}</div>` : ''}${sn.option ? `<div><b>${esc(sn.option)}</b></div>` : ''}</div>`;
}
function dShip(sn, label = 'Ship To / Consignee') {
  const c = sn.customer, to = sn.ship?.shipTo;
  if (to) return `<div><div class="d-lbl">${label}</div><div>${nl2br(to)}</div></div>`;
  return `<div><div class="d-lbl">${label}</div><div>${esc([c.contact, c.name].filter(Boolean).join(' / '))}</div>${c.shipAddress ? `<div>${nl2br(c.shipAddress)}</div>` : ''}${c.phone ? `<div>Tel. ${esc(c.phone)}</div>` : ''}</div>`;
}
function dBank(sn) {
  const b = sn.bank;
  if (!b.bank && !b.account) return `<div class="d-sec"><div class="d-hr"></div><h4 style="margin-top:12px">BANK TRANSFER DETAILS</h4><div class="d-small" style="color:#999">[Bank details — enter in Settings]</div></div>`;
  return `<div class="d-hr"></div><div class="d-sec" style="margin-top:12px"><h4>BANK TRANSFER DETAILS</h4><div class="d-bank">
  <div>Bank: ${esc(b.bank)}</div><div>SWIFT/BIC: ${esc(b.swift)}</div><div>Beneficiary: ${esc(b.beneficiary)}</div><div>Account: ${esc(b.account)}</div>
  ${b.note ? `<div style="grid-column:1/-1">${esc(b.note)}</div>` : ''}</div></div>`;
}
function dNotes(text, title = 'NOTES') { return text && text.trim() ? `<div class="d-hr"></div><div class="d-sec" style="margin-top:12px"><h4>${title}</h4><div class="d-notes">${esc(text)}</div></div>` : ''; }
function dFooter() { return '<div class="d-footer">BUNNAR | BETTERHAND</div>'; }
function paper(sn, inner, draft, cls = '') { return `<div class="paper ${cls}">${draft ? '<div class="d-draft">DRAFT</div>' : ''}${inner}</div>`; }

function renderDoc(sn, draft) {
  const T = sn.type;
  if (T === 'MARK') return renderMarks(sn, draft);
  if (T === 'KR') return renderKR(sn, draft);
  const top = `<div class="d-top">${dLogo(sn)}<div class="d-title">${sn.title}</div></div>`;
  let meta;
  if (T === 'QT') meta = [['Quotation No.', sn.no], ['Issue Date', sn.date], ['Valid Until', sn.validUntil], ['Currency', 'USD'], ['Price Basis', 'Goods only; shipping quoted separately']];
  if (T === 'PI') meta = [['Invoice No.', sn.no], ['Issue Date', sn.date], sn.originalNo ? ['Original PI', sn.originalNo] : ['Quotation', sn.quoteRef], ['Currency', 'USD'], ['Payment', 'Bank Transfer']];
  if (T === 'FI') meta = [['Invoice No.', sn.no], ['Issue Date', sn.date], ['Proforma Ref.', sn.piRef], sn.originalNo ? ['Original FI', sn.originalNo] : null, ['Currency', 'USD'], ['Payment', 'Bank Transfer']].filter(Boolean);
  if (T === 'CI') meta = [['Invoice No.', sn.no], ['Date', sn.date], ['Order Ref.', sn.piRef], ['Shipment', `${sn.ship.no} of ${sn.ship.count}`], ['Carrier', sn.ship.method], ['AWB No.', sn.ship.awb || 'TBC'], ['Incoterms', sn.incoterms || 'TBC'], ['Currency', 'USD'], ['Country of Origin', sn.origin]];
  if (T === 'PL') meta = [['Packing List No.', sn.no], ['Date', sn.date], ['Invoice Ref.', sn.ciRef || sn.piRef], ['Shipment', `${sn.ship.no} of ${sn.ship.count}`], ['Carrier', sn.ship.method], ['AWB No.', sn.ship.awb || 'TBC'], ['Packages', `${sn.boxes.length} carton(s)`]];
  const head = `${top}<div class="d-2col">${dSeller(sn)}${dMeta('Invoice Details', meta)}</div>`;
  const parties = (T === 'CI' || T === 'PL') ? `<div class="d-2col">${dShip(sn, 'Consignee')}${dBill(sn, 'Buyer')}</div>` : `<div class="d-2col">${dBill(sn)}${dShip(sn)}</div>`;

  if (T === 'PL') {
    const rows = sn.boxes.map(b => `<tr><td>${b.cno}</td><td>${nl2br(b.contents || '-')}</td><td class="c">${b.l}×${b.w}×${b.h}</td><td class="r">${kg(b.nw)}</td><td class="r">${kg(b.gw)}</td></tr>`).join('');
    const items = sn.lines.map(l => `<tr><td>${esc(l.desc)}</td><td class="r">${l.qty}</td><td class="r">${l.pieces}</td></tr>`).join('');
    return paper(sn, `${head}${parties}
      <table class="d-tbl"><thead><tr><th>DESCRIPTION OF GOODS</th><th class="r">QTY (SETS)</th><th class="r">PIECES</th></tr></thead><tbody>${items}</tbody></table>
      <table class="d-tbl"><thead><tr><th style="width:16mm">C/NO.</th><th>CONTENTS</th><th class="c">DIMENSIONS (CM)</th><th class="r">N.W. (KG)</th><th class="r">G.W. (KG)</th></tr></thead><tbody>${rows || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
      <div class="d-total"><span>TOTAL ${sn.boxes.length} CARTON(S) · ${sn.sets} SETS (${sn.pieces} PCS)</span><span>N.W. ${kg(sn.nw)} KG · G.W. ${kg(sn.gw)} KG</span></div>
      ${dNotes(sn.notes)}<div class="d-sig"><div>Authorized signature · ${esc(sn.seller.company)}</div></div>${dFooter()}`, draft);
  }

  const isCI = T === 'CI';
  const th = isCI ? '<th>DESCRIPTION</th><th>HS CODE</th><th class="c">QTY</th><th class="c">UNIT USD</th><th class="r">AMOUNT USD</th>' : '<th>DESCRIPTION</th><th class="c">QTY</th><th class="c">UNIT USD</th><th class="r">AMOUNT USD</th>';
  const rows = sn.lines.map(l => `<tr><td>${esc(l.desc)}</td>${isCI ? `<td>${esc(l.hs || 'TBC')}</td>` : ''}<td class="c">${l.qty}</td><td class="c">${usd(l.unit)}</td><td class="r">${usd(l.amount)}</td></tr>`).join('');
  let sumHtml = '';
  if (isCI) {
    sumHtml = `<div class="d-sum"><span>Total: ${sn.sets} sets (${sn.pieces} pieces) · ${sn.boxes.length} carton(s) · G.W. ${kg(sn.gw)} kg</span><span>This shipment value</span><span class="r">${usd(sn.value)}</span>
      ${sn.ship.count > 1 ? `<span></span><span>Order total (all shipments)</span><span class="r">${usd(sn.orderTotal)}</span>` : ''}</div>
      <div class="d-total"><span>TOTAL CUSTOMS VALUE (THIS SHIPMENT)</span><span>USD ${usd(sn.value)}</span></div>`;
  } else {
    sumHtml = `<div class="d-sum"><span>Total quantity: ${sn.sets} sets (${sn.pieces} pieces)</span><span>Goods subtotal</span><span class="r">${usd(sn.goods)}</span>
      ${sn.charges.map(c => `<span></span><span>${esc(c.label)}</span><span class="r">${usd(c.amount)}</span>`).join('')}
      ${!sn.charges.length || T !== 'FI' ? `<span></span><span>International shipping</span><span class="r">${esc(sn.shipNote)}</span>` : ''}
      ${T === 'FI' ? `<span></span><span>Less: payment received</span><span class="r">−${usd(sn.received)}</span>` : ''}</div>
      <div class="d-total"><span>${T === 'FI' ? 'BALANCE DUE' : (T === 'QT' ? 'TOTAL QUOTED VALUE' : 'TOTAL GOODS VALUE')}</span><span>USD ${usd(T === 'FI' ? sn.balance : sn.total)}</span></div>`;
  }
  const sched = sn.sched ? `<div class="d-sec"><h4>PAYMENT SCHEDULE</h4>${sn.sched.map(x => `<div class="d-sched"><span>${esc(x.label)}</span><b>USD ${usd(x.amount)}</b></div>`).join('')}
    ${T === 'FI' && sn.paymentsList?.length ? `<div class="d-small" style="color:#666;margin-top:4px">Received: ${sn.paymentsList.map(p => `${esc(p.date)} USD ${usd(p.amount)}`).join(' · ')}</div>` : ''}</div>` : '';
  const body = `${head}${parties}<table class="d-tbl"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>
    ${sn.backorderNote ? `<div class="d-foot-note">${nl2br(sn.backorderNote)}</div>` : ''}${sumHtml}${sched}
    ${(T === 'PI' || T === 'FI') ? dBank(sn) : ''}${dNotes(sn.notes)}${isCI ? `<div class="d-sig"><div>Authorized signature · ${esc(sn.seller.signer || sn.seller.company)}</div></div>` : ''}${dFooter()}`;
  return paper(sn, body, draft);
}
function renderMarks(sn, draft) {
  const n = sn.boxes.length || 1, c = sn.customer;
  const to = sn.ship?.shipTo || [c.name, c.shipAddress].filter(Boolean).join('\n');
  const one = (b, i) => `<div class="mark"><div class="mk-brand">BUNNAR</div><div class="mk-to">${nl2br(to)}</div>
    <div class="mk-grid"><span class="k">C/NO.</span><span class="mk-cno">${i + 1} / ${n}</span><span class="k">ORDER REF.</span><span>${esc(sn.piRef || sn.no)}</span>
    <span class="k">SHIPMENT</span><span>${sn.ship.no} of ${sn.ship.count}</span><span class="k">G.W.</span><span>${b ? kg(b.gw) + ' KG' : '—'}</span>
    ${b && b.l ? `<span class="k">DIMENSIONS</span><span>${b.l} × ${b.w} × ${b.h} CM</span>` : ''}<span class="k">ORIGIN</span><span>MADE IN KOREA</span></div></div>`;
  const list = sn.boxes.length ? sn.boxes : [null];
  const pages = [];
  for (let i = 0; i < list.length; i += 2) pages.push(paper(sn, `<div class="marks">${one(list[i], i)}${list[i + 1] !== undefined ? one(list[i + 1], i + 1) : '<div></div>'}</div>`, draft));
  return pages.join('');
}
function renderKR(sn, draft) {
  const fx = sn.fx;
  const rows = sn.lines.map(l => `<tr><td>${esc(l.desc)}${l.manual ? ' <span style="color:#999">(수동 단가)</span>' : ''}</td><td class="c">${l.qty}</td><td class="r">${l.priceKrw ? krw(l.priceKrw) : '—'}</td><td class="r">${usd(l.unit)}</td><td class="r">${usd(l.amount)}</td><td class="r">${krw(l.amount * fx)}</td></tr>`).join('');
  const body = `<div class="d-top">${dLogo(sn)}<div class="d-title">내부 검토용 인보이스 (원화)</div></div>
  <div class="d-2col">${dMeta('문서 정보', [['문서번호', sn.no], ['작성일', sn.date], ['고객', sn.customer.name], ['국가', sn.customer.country], ['PI', sn.piRef || '미발행']])}
  ${dMeta('가격 기준', [['적용 환율', `₩${num(fx).toLocaleString('ko-KR')} / USD`], ['할인율', `${sn.discount}%`], ['VAT 처리', sn.vatMode === 'deductOnce' ? 'VAT 1회 차감' : 'VAT 포함가 기준 (별도 차감 없음)'], ['결제 조건', sn.terms.type === 'deposit' ? `선금 ${sn.terms.depositPct}% / 잔금` : '전액 선결제']])}</div>
  <table class="d-tbl"><thead><tr><th>품목</th><th class="c">수량</th><th class="r">기준가(VAT포함)</th><th class="r">단가 USD</th><th class="r">금액 USD</th><th class="r">원화 환산</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="d-sum"><span>총 ${sn.sets}세트 (${sn.pieces}피스)</span><span>상품 소계</span><span class="r">USD ${usd(sn.goods)} · ${krw(sn.goods * fx)}</span>
  ${sn.charges.map(c => `<span></span><span>${esc(c.label)}</span><span class="r">USD ${usd(c.amount)}</span>`).join('')}</div>
  <div class="d-total"><span>청구 총액</span><span>USD ${usd(sn.total)} · ${krw(sn.total * fx)}</span></div>
  <div class="d-sec"><h4>결제 현황</h4><div class="d-meta" style="grid-template-columns:40mm 1fr">
  <span class="k">송금증 기준 합계</span><span>USD ${usd(sn.receipts)} (입금 확인 전 금액 — 매출 인식 금지)</span>
  <span class="k">실입금 확인 합계</span><span>USD ${usd(sn.credited)} · 원화 입금액 ${krw(sn.creditedKrw)}</span>
  <span class="k">선금 기준액</span><span>USD ${usd(sn.deposit)}</span><span class="k">잔액</span><span><b>USD ${usd(sn.balance)}</b></span></div></div>
  <div class="d-sec"><h4>배송·신고</h4>${sn.ships.length ? sn.ships.map(x => `<div class="d-small">${x.no}차 · ${esc(x.method)} · ${x.sets}세트 · 통관가액 USD ${usd(x.value)} · ${x.shipped ? '출고 ' + esc(x.shipped) : '미출고'} · ${esc(x.decl)} · ${x.exportDone ? '수출이행 완료' : '수출이행 미확인'}</div>`).join('') : '<div class="d-small">배송 미설정</div>'}</div>
  <div class="d-sec"><h4>확인 필요 항목</h4>${sn.verify.map(v => `<div class="d-small">${v.status === 'ok' ? '✓' : v.status === 'na' ? '–' : '□'} ${esc(v.label)} ${v.status === 'pending' ? '(확인 필요)' : ''}</div>`).join('')}</div>
  ${dNotes(sn.notes, '메모')}<div class="d-footer">BUNNAR | 내부용 — 고객 발송 금지</div>`;
  return paper(sn, body, draft, 'kr');
}

/* ============================== emails ============================== */
const EMAILS = {
  inquiry: '문의 답변 (Inquiry reply)', quote: '견적 발송 (Quotation)', pi: 'PI 발송 (Proforma invoice)', dhl: 'DHL 계정 확인 요청 (Buyer DHL account)',
  paid: '입금 확인 (Payment received)', shipped: '출고·운송장 안내 (Dispatched)', balance: '잔금 청구 (Final invoice)',
};
function emailTpl(d, key) {
  const t = totals(d), c = d.customer, S = state.settings;
  const hi = `Hi ${c.contact || c.name || 'there'},`;
  const sign = `\n\nBest regards,\n${S.seller.signer || 'BUNNAR'}\n${S.seller.company}\n${[S.seller.email, S.seller.web].filter(Boolean).join(' | ')}`;
  const qt = latestIssued(d, 'QT'), pi = latestIssued(d, 'PI'), fi = latestIssued(d, 'FI');
  const ships = activeShips(d);
  const shipLinesTxt = ships.map(s => { const ss = shipSummary(d, s); return `- Shipment ${s.no}: ${ss.sets} sets (${ss.pieces} pieces)${s.awb ? ` — ${METHOD[s.method]} AWB ${s.awb}` : ''}`; }).join('\n');
  const T = {
    inquiry: [`BUNNAR wholesale inquiry`, `${hi}\n\nThank you for your interest in BUNNAR porcelain.\n\nTo prepare a quotation, could you please confirm:\n- the items and quantities you need\n- the delivery address and preferred shipping method (e.g. your own DHL account)\n- your preferred timing\n\nOur wholesale pricing is tiered by total quantity, and shipping is quoted separately.`],
    quote: [`BUNNAR quotation ${qt?.no || ''}`.trim(), `${hi}\n\nPlease find attached our quotation${qt ? ' ' + qt.no : ''} for ${t.sets} sets, totalling USD ${usd(t.goods)} (goods only).\n\nShipping and any printing services are quoted separately. Stock is confirmed at the time of order.\n\nPlease let us know if you would like to proceed or adjust the selection.`],
    pi: [`Proforma invoice ${pi?.no || ''}`.trim(), `${hi}\n\nPlease find attached proforma invoice ${pi?.no || '[PI no.]'} for USD ${usd(t.total)}.${pi?.originalNo ? `\nThis revised invoice replaces ${pi.originalNo}; please pay only the revised amount.` : ''}\n\n${d.terms.type === 'deposit' ? `Deposit due upon confirmation: USD ${usd(t.deposit)}.` : 'Payment is due in full upon confirmation, before preparation.'}\n${ships.length > 1 ? '\nThe order will be shipped in parts:\n' + shipLinesTxt + '\n' : ''}\nGoods will be prepared for dispatch once the payment has been credited to our account. Please send us the remittance slip after the transfer.`],
    dhl: [`DHL account for your shipment`, `${hi}\n\nAs agreed, we will ship using your DHL account.\n\nCould you please confirm:\n- your DHL account number\n- that you authorise BUNNAR to book the shipment on this account (duties and taxes billed to the receiver)\n\nWe will only book the pickup after your written confirmation.`],
    paid: [`Payment received — thank you`, `${hi}\n\nWe confirm that your payment of USD ${usd(t.credited)} has been credited to our account. Thank you.\n\nWe are now preparing your order and will send the tracking details once it has been dispatched.`],
    shipped: [`Your BUNNAR order has been dispatched`, `${hi}\n\nYour order has been dispatched.\n\n${shipLinesTxt || '- [shipment details]'}\n\nArrival dates depend on the carrier and customs clearance and cannot be guaranteed. Import duties and local taxes are the buyer's responsibility.`],
    balance: [`Final invoice ${fi?.no || ''}`.trim(), `${hi}\n\nPlease find attached final invoice ${fi?.no || '[FI no.]'}.\n\nGoods total: USD ${usd(t.goods)}\n${d.charges.map(ch => `${ch.label}: USD ${usd(ch.amount)}`).join('\n')}${d.charges.length ? '\n' : ''}Less payment received: USD ${usd(t.credited)}\nBalance due: USD ${usd(t.balance)}\n\nPlease let us know once the transfer has been made.`],
  }[key];
  return { subject: T[0], body: T[1] + sign };
}

/* ============================== render ============================== */
function render() {
  const ae = document.activeElement, focusKey = ae && ae.dataset ? ae.dataset.bind : null;
  const sel = ae && 'selectionStart' in ae ? [ae.selectionStart, ae.selectionEnd] : null;
  const scroll = { strip: $('.strip')?.scrollLeft, drawer: $('.drawer-b')?.scrollTop, side: $('.modal-side')?.scrollTop, prev: $('.modal-prev')?.scrollTop, win: window.scrollY };
  let html = header();
  html += '<main class="main">';
  if (ui.view === 'settings') html += viewSettings();
  else if (ui.view === 'deal' && deal()) html += viewDeal(deal());
  else { ui.view = 'home'; html += viewHome(); }
  html += '</main>';
  if (ui.drawer && deal()) html += `<div class="overlay" data-act="closeDrawer"></div>${drawerHtml(deal())}`;
  if (ui.modal) html += modalHtml();
  $('#app').innerHTML = html;
  if (scroll.strip != null && $('.strip')) $('.strip').scrollLeft = scroll.strip;
  if (scroll.drawer != null && $('.drawer-b')) $('.drawer-b').scrollTop = scroll.drawer;
  if (scroll.side != null && $('.modal-side')) $('.modal-side').scrollTop = scroll.side;
  if (scroll.prev != null && $('.modal-prev')) $('.modal-prev').scrollTop = scroll.prev;
  window.scrollTo(0, scroll.win || 0);
  if (focusKey) { const el = document.querySelector(`[data-bind="${CSS.escape(focusKey)}"]`); if (el) { el.focus(); try { if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch (e) { } } }
}
function header() {
  return `<header class="hdr"><div class="logo" data-act="home">BUNNAR Export<span>수출 실무 관리</span><small>v${APP_VERSION}</small></div>
  <nav class="nav"><button class="${ui.view !== 'settings' ? 'on' : ''}" data-act="home">수출 현황 (Overview)</button><button class="${ui.view === 'settings' ? 'on' : ''}" data-act="settings">설정·제품·데이터 (Settings)</button></nav></header>`;
}

/* ---------- home ---------- */
function viewHome() {
  const deals = state.deals.filter(d => ui.filter === 'archived' ? d.archived : !d.archived);
  const counts = STAGES.map(st => state.deals.filter(d => !d.archived && currentStage(d)?.key === st.key));
  let h = `<div class="row" style="margin-bottom:12px"><h2 style="font-size:20px">수출 현황 <span class="faint" style="font-weight:400;font-size:14px">Export Overview</span></h2><span class="spacer"></span>
    <button class="btn pri" data-act="newDeal">+ 새 수출 건 (New export)</button></div>`;
  h += '<div class="sec-title">업무 흐름 (Workflow) · 단계별 진행 건수</div><div class="flow">';
  STAGES.forEach((st, i) => {
    h += `<div class="flow-item"><div class="mini"><div class="n">${st.no}</div><div class="t">${st.ko}</div><div class="e">${st.en}</div><div class="c">${counts[i].length}</div>
    <div class="d">${counts[i].map(d => esc(d.customer.name || d.code)).join(', ') || '&nbsp;'}</div></div></div>${i < STAGES.length - 1 ? '<div class="flow-arrow">→</div>' : ''}`;
  });
  h += '</div>';
  h += `<div class="row" style="margin-top:14px"><div class="sec-title" style="margin:0">거래처별 수출 건 (Exports by customer)</div><span class="spacer"></span>
    <button class="btn sm ${ui.filter === 'active' ? 'pri' : ''}" data-act="filter" data-v="active">진행 중</button><button class="btn sm ${ui.filter === 'archived' ? 'pri' : ''}" data-act="filter" data-v="archived">보관</button></div>`;
  if (!deals.length) {
    h += `<div class="panel" style="margin-top:10px"><p style="margin-bottom:8px"><b>${ui.filter === 'archived' ? '보관된 수출 건이 없습니다.' : '진행 중인 수출 건이 없습니다.'}</b></p>
    <p class="muted small">새 문의가 오면 <b>새 수출 건</b>을 만듭니다. 처음 사용한다면 설정에서 판매자·은행 정보와 제품 기준가를 입력하고, <b>예시 데이터</b>(호주 분할 배송 / 대만 선금·잔금)로 흐름을 먼저 확인해 보세요.</p>
    <div class="row" style="margin-top:10px"><button class="btn" data-act="loadSample">예시 데이터 불러오기</button><button class="btn" data-act="settings">설정 열기</button></div></div>`;
    return h;
  }
  h += '<div class="deals"><div class="deal-head-row"><span>고객 · 진행</span><span>국가</span><span class="num">주문 총액</span><span>결제</span><span>현재 단계 · 다음 할 일</span><span>출고 예정</span><span></span></div>';
  for (const d of deals) {
    const t = totals(d), ps = payStatus(d, t), nt = nextTodo(d);
    const planned = d.shipments.map(s => s.plannedDate).filter(Boolean).sort()[0] || '—';
    h += `<div class="deal-row" data-act="openDeal" data-id="${d.id}">
      <div><div class="nm">${esc(d.customer.name || '(고객명 미입력)')}</div><div class="code">${esc(d.code)} · ${d.shipments.length ? d.shipments.map(s => METHOD[s.method]).filter((v, i, a) => a.indexOf(v) === i).join(', ') : '배송 미정'}</div>
      <div class="dots">${STAGES.map(st => `<i class="${stageStatus(d, st)}" title="${st.ko}"></i>`).join('')}</div></div>
      <div>${esc(d.customer.country || '—')}</div><div class="num">USD ${usd(t.total)}</div><div><span class="pill ${ps.cls}">${ps.label}</span></div>
      <div class="small"><b>${nt.st ? nt.st.no + ' ' + nt.st.ko : '완료'}</b><div class="muted">${esc(d.todo || nt.t)}</div></div><div class="small num">${esc(planned)}</div><div class="faint">›</div></div>`;
  }
  return h + '</div>';
}

/* ---------- deal workspace ---------- */
function viewDeal(d) {
  const t = totals(d), ps = payStatus(d, t), nt = nextTodo(d), cur = currentStage(d);
  let h = `<div class="row" style="margin-bottom:10px"><button class="btn ghost" data-act="home">← 목록</button><span class="faint small">${esc(d.code)} · 생성 ${esc(d.createdAt)} · 수정 ${esc(d.updatedAt)}</span><span class="spacer"></span>
    <button class="btn sm" data-act="drawer" data-k="email">✉ 이메일 작성</button><button class="btn sm" data-act="exportDeal">JSON 내보내기</button>
    <button class="btn sm" data-act="archive">${d.archived ? '보관 해제' : '보관'}</button><button class="btn sm danger" data-act="deleteDeal">삭제</button></div>`;
  h += `<div class="ws-head"><div class="who"><div class="faint tiny">거래처 (Customer)</div><div class="nm">${esc(d.customer.name || '(고객명 미입력)')}</div>
    <div class="small muted">${esc([d.customer.contact, d.customer.country, d.customer.email].filter(Boolean).join(' · ') || '고객 정보를 입력하세요')}</div>
    <button class="btn sm" style="margin-top:6px" data-act="drawer" data-k="customer">고객 정보 편집</button></div>
    <div class="kv"><span class="k">주문 수량</span><span class="v">${t.sets}세트 · ${t.pieces}pcs</span></div>
    <div class="kv"><span class="k">주문 총액</span><span class="v">USD ${usd(t.total)}</span></div>
    <div class="kv"><span class="k">실입금 (Credited)</span><span class="v">USD ${usd(t.credited)}</span></div>
    <div class="kv"><span class="k">잔액 (Balance)</span><span class="v">USD ${usd(t.balance)}</span></div>
    <div class="kv"><span class="k">결제 상태</span><span><span class="pill ${ps.cls}">${ps.label}</span></span></div>
    <div class="todo-box"><b>다음 할 일 (Next)</b>${nt.st ? `<b style="display:inline;color:var(--text)">${nt.st.no} ${nt.st.ko}</b> — ` : ''}${esc(nt.t)}
      <input class="inp" style="margin-top:6px" placeholder="메모: 직접 적는 다음 할 일 (선택)" data-bind="deal:todo" value="${esc(d.todo)}"></div></div>`;
  h += '<div class="strip-wrap"><div class="strip">';
  STAGES.forEach((st, i) => { h += card(d, st, cur && cur.key === st.key) + (i < STAGES.length - 1 ? '<div class="flow-arrow">→</div>' : ''); });
  h += '</div></div>';
  h += `<div class="lower"><div class="panel"><div class="row"><div class="sec-title" style="margin:0">상담 기록 · 이력 (Notes & history)</div></div>
    <div class="row" style="margin:8px 0"><textarea class="inp" style="min-height:44px;flex:1" placeholder="고객 상담 내용, 협의 사항(예: 인쇄 서비스 단가 협의)…" data-bind="ui:newLog">${esc(ui.newLog)}</textarea><button class="btn pri" data-act="addLog">기록</button></div>
    <div class="timeline">${d.logs.slice().reverse().map(l => `<div class="tl ${l.kind}"><span class="at">${esc(l.at)}</span><span class="tx">${l.kind === 'email' ? '✉ ' : l.kind === 'note' ? '💬 ' : ''}${esc(l.text)}</span>${l.kind !== 'system' ? `<button class="btn sm ghost" data-act="delLog" data-id="${l.id}">×</button>` : '<span></span>'}</div>`).join('')}</div></div>
    <div class="panel"><div class="sec-title" style="margin:0 0 8px">문서 · 버전 (Documents)</div>${docTable(d)}
    <div class="sec-title" style="margin:16px 0 8px">확인 필요 항목 (To verify — 세무·통관)</div>${verifyTable(d)}</div></div>`;
  return h;
}
function docTable(d) {
  if (!d.docs.length) return '<div class="empty">아직 생성된 문서가 없습니다. 각 단계 카드에서 문서를 생성하세요.</div>';
  const rows = d.docs.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map(x => {
    const s = x.shipmentId ? d.shipments.find(y => y.id === x.shipmentId) : null;
    return `<tr data-act="openDoc" data-id="${x.id}" style="cursor:pointer"><td>${x.type}</td><td class="num">${esc(x.no)}</td><td>${s ? s.no + '차 배송' : ''}</td><td>${DOC_STATUS[x.status]}</td><td class="small faint">${esc(x.issuedAt || x.createdAt)}</td></tr>`;
  }).join('');
  return `<table class="t"><thead><tr><th>유형</th><th>문서 번호</th><th>배송</th><th>상태</th><th>일시</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function verifyTable(d) {
  return `<table class="t"><tbody>${d.verify.map(v => `<tr><td>${esc(v.label)}</td><td style="width:120px"><select data-bind="deal:verify.#${v.key}.status" data-key="1">
    <option value="pending" ${v.status === 'pending' ? 'selected' : ''}>확인 필요</option><option value="ok" ${v.status === 'ok' ? 'selected' : ''}>확인됨</option><option value="na" ${v.status === 'na' ? 'selected' : ''}>해당 없음</option></select></td>
    <td><input placeholder="근거·메모" data-bind="deal:verify.#${v.key}.note" value="${esc(v.note)}"></td></tr>`).join('')}</tbody></table>
    <div class="row" style="margin-top:6px"><input class="inp" style="flex:1" placeholder="확인 필요 항목 추가" data-bind="ui:newVerify" value="${esc(ui.newVerify || '')}"><button class="btn sm" data-act="addVerify">추가</button></div>`;
}

function card(d, st, isCur) {
  const status = stageStatus(d, st), cs = stageChecks(d, st);
  const nextC = cs.find(c => !c.done && !c.optional);
  const files = d.files.filter(f => f.stage === st.key);
  return `<section class="card ${status} ${isCur ? 'current' : ''}" id="card-${st.key}">
  <div class="card-h"><span class="no">${st.no}</span><div class="tt">${st.ko}<small>${st.en}</small></div>${STATUS_PILL[status]}</div>
  <div class="card-b"><div class="desc">${st.desc}</div>
  <div class="blk"><div class="blk-t">체크리스트 (Checklist)</div><ul class="checks">${cs.map(c => {
    const id = `deal:checks.${st.key}_${c.k}`;
    return `<li><label class="${c.auto ? 'disabled' : ''} ${c.done ? 'isdone' : ''}"><input type="checkbox" ${c.done ? 'checked' : ''} ${c.auto ? 'disabled' : `data-bind="${id}" data-t="b"`}><span><span class="txt">${esc(c.t)}</span>${c.auto ? '<span class="auto" title="데이터로 자동 판정됩니다">자동</span>' : ''}${c.optional ? ' <span class="opt">(선택)</span>' : ''}</span></label></li>`;
  }).join('')}</ul></div>
  ${cardBody(d, st)}
  <div class="blk"><div class="blk-t">첨부 (Files)<span class="spacer"></span><button class="btn sm" data-act="attach" data-stage="${st.key}" data-kind="${st.kind}">+ 첨부</button></div>
  ${files.length ? `<div class="files">${files.map(fileRow).join('')}</div>` : '<div class="empty">첨부 없음</div>'}</div>
  </div><div class="next"><b>다음 업무 (Next)</b>${esc(nextC ? nextC.t : st.next)}</div></section>`;
}
const FILE_KIND = { remittance: '송금증', declaration: '수출신고필증', awb: '운송장', dhl: 'DHL 승인', other: '기타' };
function fileRow(f) { return `<div class="file"><span class="pill">${FILE_KIND[f.kind] || f.kind}</span><a data-act="openFile" data-id="${f.id}" title="${esc(f.name)}">${esc(f.name)}</a><button class="btn sm ghost" data-act="delFile" data-id="${f.id}">×</button></div>`; }
function docButtons(d, types, sid) {
  return types.map(type => {
    const draft = findDraft(d, type, sid), last = latestIssued(d, type, sid);
    const label = draft ? `${type} 초안 열기` : last ? `${type} 수정본 (R${(last.rev || 0) + 1})` : `${type} 생성`;
    return `<button class="btn sm ${draft ? 'pri' : ''}" data-act="newDoc" data-type="${type}" ${sid ? `data-sid="${sid}"` : ''}>${label}</button>`;
  }).join('');
}
function docMini(d, types, sid) {
  const list = d.docs.filter(x => types.includes(x.type) && (!sid || x.shipmentId === sid)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (!list.length) return '';
  return `<div class="doclist">${list.slice(0, 4).map(x => `<div class="docitem ${x.status}" data-act="openDoc" data-id="${x.id}"><span class="no">${esc(x.no)}</span>${DOC_STATUS[x.status]}</div>`).join('')}${list.length > 4 ? `<div class="tiny faint">외 ${list.length - 4}건 — 아래 문서 목록 참조</div>` : ''}</div>`;
}
function cardBody(d, st) {
  const t = totals(d);
  const B = (title, inner) => `<div class="blk"><div class="blk-t">${title}</div>${inner}</div>`;
  switch (st.key) {
    case 'inquiry': {
      const notes = d.logs.filter(l => l.kind === 'note').slice(-2).reverse();
      return B('고객 (Customer)', `<div class="stat"><span class="k">고객</span><span class="v">${esc(d.customer.name || '—')}</span><span class="k">국가</span><span class="v">${esc(d.customer.country || '—')} ${d.customer.cc ? `(${esc(d.customer.cc)})` : ''}</span><span class="k">이메일</span><span class="v">${esc(d.customer.email || '—')}</span></div>
        ${notes.length ? `<div class="small muted" style="margin-top:6px">${notes.map(n => '💬 ' + esc(n.text.slice(0, 80))).join('<br>')}</div>` : ''}
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="drawer" data-k="customer">고객 정보 편집</button><button class="btn sm" data-act="emailKey" data-key="inquiry">✉ 답변 이메일</button></div>`);
    }
    case 'quotation': {
      const disc = dealDiscount(d), tier = tierFor(d.pricing.tiers, t.sets);
      const low = t.sets > 0 && !tier;
      const stockWarn = d.items.filter(i => { const p = productOf(i.productId); return p && num(p.stock) > 0 && num(i.qty) > num(p.stock); });
      return B('가격 (Pricing)', `<div class="stat"><span class="k">품목 / 수량</span><span class="v">${d.items.length}종 · ${t.sets}세트</span>
        <span class="k">할인율 ${d.pricing.discountAuto ? '(구간 자동)' : '(수동)'}</span><span class="v">${disc}%${tier?.negotiable ? ' · 협의' : ''}</span>
        <span class="k">환율</span><span class="v">₩${num(d.pricing.fxRate).toLocaleString('ko-KR')} / USD</span>
        <span class="k">상품 금액</span><span class="v strong">USD ${usd(t.goods)}</span>${d.charges.length ? `<span class="k">별도 비용</span><span class="v">USD ${usd(t.charges)}</span>` : ''}</div>
        ${low ? `<div class="warn">수량 ${t.sets}세트는 할인 구간 미만입니다. 최소 주문 수량 기준은 확인 필요.</div>` : ''}
        ${stockWarn.length ? `<div class="warn">재고 초과: ${stockWarn.map(i => esc(i.desc)).join(', ')}</div>` : ''}
        ${d.items.some(i => i.backorder) ? `<div class="warn">백오더: ${d.items.filter(i => i.backorder).map(i => esc(i.desc)).join(', ')}</div>` : ''}
        <div class="row" style="margin-top:8px"><button class="btn sm pri" data-act="drawer" data-k="items">품목·가격 편집</button>${docButtons(d, ['QT'])}<button class="btn sm" data-act="emailKey" data-key="quote">✉</button></div>`) + (docMini(d, ['QT']) ? B('견적서', docMini(d, ['QT'])) : '');
    }
    case 'invoice': {
      const pi = latestIssued(d, 'PI'), mismatch = pi && !piMatches(d);
      return B('인보이스 (PI)', `<div class="stat"><span class="k">청구 총액</span><span class="v strong">USD ${usd(t.total)}</span><span class="k">결제 조건</span><span class="v">${d.terms.type === 'deposit' ? `선금 ${d.terms.depositPct}% (USD ${usd(t.deposit)})` : '전액 선결제'}</span>
        <span class="k">최신 PI</span><span class="v">${pi ? esc(pi.no) : '미발행'}</span></div>
        ${mismatch ? `<div class="err">현재 주문 내용이 최신 PI(${esc(pi.no)})와 다릅니다. 수정본을 발행하세요.</div>` : ''}
        <div class="row" style="margin-top:8px">${docButtons(d, ['PI'])}<button class="btn sm" data-act="newDoc" data-type="KR">내부용(한글·원화)</button><button class="btn sm" data-act="emailKey" data-key="pi">✉</button></div>
        <div style="margin-top:8px">${docMini(d, ['PI', 'KR'])}</div>`);
    }
    case 'payment': {
      const list = d.payments.slice(-4).reverse();
      return B('입금 (Payments)', `<div class="stat"><span class="k">출고 필요 입금액</span><span class="v">USD ${usd(t.needForShip)}</span>
        <span class="k">송금증 기준 (미확정)</span><span class="v">USD ${usd(t.receipts)}</span><span class="k">실입금 확인</span><span class="v strong">USD ${usd(t.credited)}</span>
        <span class="k">원화 입금액</span><span class="v">${krw(t.creditedKrw)}</span><span class="k">잔액</span><span class="v strong">USD ${usd(t.balance)}</span></div>
        ${t.receipts > 0 && t.credited < t.receipts - 0.004 ? '<div class="warn">송금증은 받았지만 실입금 확인이 안 된 금액이 있습니다. 은행에서 입금을 확인하세요.</div>' : ''}
        ${list.length ? `<div class="files" style="margin-top:6px">${list.map(p => `<div class="file"><span class="pill ${p.kind === 'credited' ? 'green' : 'amber'}">${p.kind === 'credited' ? '실입금' : '송금증'}</span><span class="num">${esc(p.date)} · USD ${usd(p.amount)}</span></div>`).join('')}</div>` : ''}
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="payForm" data-kind="receipt">+ 송금증 수령</button><button class="btn sm pri" data-act="payForm" data-kind="credited">+ 실입금 확인</button><button class="btn sm" data-act="emailKey" data-key="paid">✉</button></div>`);
    }
    case 'packing': {
      const html = d.shipments.map(s => { const ss = shipSummary(d, s); return `<div class="ship"><div class="ship-h">${s.no}차 배송 <span class="pill">${METHOD[s.method]}</span>${s.shippedAt ? '<span class="pill green">출고</span>' : ''}</div>
        <div class="stat"><span class="k">품목</span><span class="v">${ss.sets}세트 · ${ss.pieces}pcs</span><span class="k">박스</span><span class="v">${s.boxes.length}개 · G.W. ${kg(ss.gw)}kg</span>
        <span class="k">부피무게 / 청구중량</span><span class="v">${kg(ss.vol)} / ${kg(ss.charge)}kg</span><span class="k">출고 예정</span><span class="v">${esc(s.plannedDate || '—')}</span><span class="k">검수</span><span class="v">${s.inspected ? '완료' : '미완료'}</span></div>
        <div class="row"><button class="btn sm" data-act="drawer" data-k="ship" data-sid="${s.id}">배송 구성 편집</button>${docButtons(d, ['MARK'], s.id)}</div></div>`; }).join('');
      const unalloc = d.items.filter(i => allocated(d, i.id) < num(i.qty));
      return B('배송 구성 (Shipments)', `${html || '<div class="empty">배송이 없습니다. 배송을 추가해 품목을 배정하세요.</div>'}
        ${unalloc.length && d.shipments.length ? `<div class="warn">미배정: ${unalloc.map(i => `${esc(i.desc)} ${num(i.qty) - allocated(d, i.id)}`).join(', ')}</div>` : ''}
        <div class="row" style="margin-top:8px"><button class="btn sm pri" data-act="addShip">+ 배송 추가 (분할 배송)</button></div>`);
    }
    case 'declaration': {
      const html = d.shipments.map(s => { const ss = shipSummary(d, s); return `<div class="ship"><div class="ship-h">${s.no}차 배송 <span class="pill">${DECL[s.declMode || 'unset']}</span></div>
        <div class="stat"><span class="k">이번 배송 통관가액</span><span class="v strong">USD ${usd(ss.value)}</span><span class="k">주문 전체 금액</span><span class="v">USD ${usd(t.total)}</span>
        <span class="k">신고번호</span><span class="v">${esc(s.declNo || '—')}</span><span class="k">신고 수리</span><span class="v">${s.declAccepted ? '수리됨' : '—'}</span></div>
        <div class="row">${docButtons(d, ['CI', 'PL'], s.id)}<button class="btn sm" data-act="drawer" data-k="ship" data-sid="${s.id}">신고 정보</button><button class="btn sm" data-act="attach" data-stage="declaration" data-kind="declaration" data-sid="${s.id}">필증 첨부</button></div>
        ${docMini(d, ['CI', 'PL'], s.id)}</div>`; }).join('');
      return B('배송별 서류 (Per shipment)', (html || '<div class="empty">05 검수·포장에서 배송을 먼저 추가하세요.</div>') + '<div class="tiny faint" style="margin-top:6px">수출신고필증은 공식 발급 문서를 첨부만 합니다. 앱이 생성하지 않습니다.</div>');
    }
    case 'shipping': {
      const html = d.shipments.map(s => { const g = shipGate(d, s), ok = g.every(x => x.ok); return `<div class="ship"><div class="ship-h">${s.no}차 · ${METHOD[s.method]}${s.method === 'DHL' ? ` <span class="pill">${s.account === 'buyer' ? '고객 계정' : '당사 계정'}</span>` : ''}${s.shippedAt ? `<span class="pill green">출고 ${esc(s.shippedAt)}</span>` : ''}${s.exportDone ? '<span class="pill blue">수출이행</span>' : ''}</div>
        <div class="stat"><span class="k">운송장</span><span class="v">${esc(s.awb || '—')}</span><span class="k">픽업 예약</span><span class="v">${s.pickupBooked ? '완료' : '—'}</span></div>
        ${s.shippedAt ? '' : `<ul class="gate">${g.map(x => `<li class="${x.ok ? 'yes' : 'no'}">${esc(x.t)}</li>`).join('')}</ul>`}
        <div class="row"><button class="btn sm" data-act="drawer" data-k="ship" data-sid="${s.id}">배송 정보</button>
        ${s.shippedAt ? `<button class="btn sm" data-act="unship" data-sid="${s.id}">출고 취소</button>` : `<button class="btn sm pri" data-act="ship" data-sid="${s.id}" ${ok ? '' : 'disabled title="출고 조건 미충족"'}>출고 완료</button>`}
        <button class="btn sm" data-act="attach" data-stage="shipping" data-kind="awb" data-sid="${s.id}">운송장 첨부</button></div></div>`; }).join('');
      return B('출고 (Dispatch)', (html || '<div class="empty">배송이 없습니다.</div>') + `<div class="row" style="margin-top:8px"><button class="btn sm" data-act="emailKey" data-key="dhl">✉ DHL 계정 확인</button><button class="btn sm" data-act="emailKey" data-key="shipped">✉ 출고 안내</button></div>`);
    }
    case 'settlement': {
      const costs = sum(d.settlement.costs, c => c.krw), margin = t.creditedKrw - costs;
      return B('정산 (Settlement)', `<div class="stat"><span class="k">청구 총액</span><span class="v">USD ${usd(t.total)}</span><span class="k">실입금 합계</span><span class="v">USD ${usd(t.credited)}</span>
        <span class="k">잔금 (FI 대상)</span><span class="v strong">USD ${usd(t.balance)}</span><span class="k">원화 입금액</span><span class="v">${krw(t.creditedKrw)}</span>
        <span class="k">비용 합계</span><span class="v">${krw(costs)}</span><span class="k">수익 (입금−비용)</span><span class="v strong">${krw(margin)}</span>
        <span class="k">수출이행</span><span class="v">${d.shipments.filter(s => s.exportDone).length} / ${activeShips(d).length} 배송</span>
        <span class="k">확인 필요</span><span class="v">${d.verify.filter(v => v.status === 'pending').length}건</span></div>
        <div class="row" style="margin-top:8px">${docButtons(d, ['FI'])}<button class="btn sm" data-act="drawer" data-k="settle">비용·수익 입력</button><button class="btn sm" data-act="emailKey" data-key="balance">✉</button></div>
        <div style="margin-top:8px">${docMini(d, ['FI'])}</div>`);
    }
  }
  return '';
}

/* ---------- drawers ---------- */
function drawerHtml(d) {
  const k = ui.drawer.kind;
  const titles = { customer: '고객 정보 (Customer)', items: '품목·가격 (Items & pricing)', ship: '배송 (Shipment)', pay: '결제 기록 (Payments)', email: '고객 응대 이메일 (Email)', settle: '정산 (Settlement)' };
  let b = '';
  if (k === 'customer') b = drCustomer(d);
  if (k === 'items') b = drItems(d);
  if (k === 'ship') b = drShip(d, d.shipments.find(s => s.id === ui.drawer.sid));
  if (k === 'pay') b = drPay(d);
  if (k === 'email') b = drEmail(d);
  if (k === 'settle') b = drSettle(d);
  return `<aside class="drawer"><div class="drawer-h"><h3>${titles[k]}</h3><span class="faint small">${esc(d.customer.name || d.code)}</span><span class="spacer"></span><button class="btn" data-act="closeDrawer">닫기</button></div><div class="drawer-b">${b}</div></aside>`;
}
const F = (label, bind, val, opts = {}) => {
  const attrs = `data-bind="${bind}" ${opts.t ? `data-t="${opts.t}"` : ''} ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''}`;
  if (opts.area) return `<label class="f ${opts.cls || ''}"><span>${label}</span><textarea ${attrs} ${opts.live ? 'data-live="1"' : ''}>${esc(val)}</textarea></label>`;
  if (opts.options) return `<label class="f ${opts.cls || ''}"><span>${label}</span><select ${attrs}>${Object.entries(opts.options).map(([v, l]) => `<option value="${esc(v)}" ${String(val) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `<label class="f ${opts.cls || ''}"><span>${label}</span><input ${attrs} ${opts.live ? 'data-live="1"' : ''} type="${opts.type || 'text'}" ${opts.t === 'n' ? 'class="n" inputmode="decimal"' : ''} value="${esc(val)}"></label>`;
};
const CB = (label, bind, val) => `<label class="chk"><input type="checkbox" data-bind="${bind}" data-t="b" ${val ? 'checked' : ''}>${label}</label>`;

function drCustomer(d) {
  const c = d.customer, p = 'deal:customer.';
  return `<div class="grid2">${F('고객/업체명 (Company)', p + 'name', c.name)}${F('담당자 (Contact)', p + 'contact', c.contact)}
    ${F('국가 (Country, 영문)', p + 'country', c.country, { ph: 'Australia' })}${F('국가 코드 (문서번호용, 2자리)', p + 'cc', c.cc, { ph: 'AU' })}
    ${F('이메일', p + 'email', c.email, { type: 'email' })}${F('전화', p + 'phone', c.phone)}
    ${F('청구지 주소 (Bill to)', p + 'billAddress', c.billAddress, { area: true })}${F('배송지 주소 (Ship to)', p + 'shipAddress', c.shipAddress, { area: true })}
    ${F('고객 메모 (내부)', p + 'notes', c.notes, { area: true, cls: 'full' })}</div>
    <p class="tiny faint">고객 정보는 이 브라우저에만 저장됩니다. 고객 발송 문서에는 영문으로 입력하세요.</p>`;
}
function drItems(d) {
  const t = totals(d), disc = dealDiscount(d), tier = tierFor(d.pricing.tiers, t.sets);
  const prodOpts = `<option value="">직접 입력</option>` + state.products.map(p => `<option value="${p.id}">${esc(p.nameEn)}</option>`).join('');
  const rows = d.items.map(it => {
    const u = unitOf(d, it), b = `deal:items.#${it.id}.`;
    return `<tr><td><select data-bind="${b}productId">${prodOpts.replace(`value="${it.productId}"`, `value="${it.productId}" selected`)}</select>
      <input style="margin-top:3px" data-bind="${b}desc" value="${esc(it.desc)}" placeholder="영문 품목명"></td>
      <td style="width:62px"><input class="n" data-bind="${b}qty" data-t="n" value="${num(it.qty)}"></td>
      <td style="width:92px"><input class="n" data-bind="${b}priceKrw" data-t="n" value="${num(it.priceKrw)}" ${it.manual ? 'disabled' : ''}></td>
      <td style="width:88px">${it.manual ? `<input class="n" data-bind="${b}unitUsd" data-t="n" value="${num(it.unitUsd)}">` : `<div class="num" style="text-align:right;padding:4px 6px">${usd(u)}</div>`}
        <label class="chk tiny" style="justify-content:flex-end"><input type="checkbox" data-bind="${b}manual" data-t="b" ${it.manual ? 'checked' : ''}>수동</label></td>
      <td class="r num" style="width:84px">${usd(r2(num(it.qty) * u))}</td>
      <td style="width:54px;text-align:center"><input type="checkbox" data-bind="${b}backorder" data-t="b" ${it.backorder ? 'checked' : ''} title="백오더"></td>
      <td style="width:30px"><button class="btn sm ghost" data-act="delItem" data-id="${it.id}">×</button></td></tr>`;
  }).join('');
  const pr = 'deal:pricing.';
  return `<fieldset><legend>가격 기준 (이 수출 건에만 적용 · 생성 시점 정책 복사본)</legend>
    <div class="grid4">${F('환율 (KRW/USD)', pr + 'fxRate', d.pricing.fxRate, { t: 'n' })}${F('환율 기준일', pr + 'fxDate', d.pricing.fxDate, { type: 'date' })}
    ${F('VAT 처리', pr + 'vatMode', d.pricing.vatMode, { options: { included: 'VAT 포함가 기준 (차감 없음)', deductOnce: 'VAT 1회 차감 (÷1.1)' } })}
    <label class="f"><span>할인율 (%)</span><input class="n" data-bind="${pr}discount" data-t="n" value="${d.pricing.discountAuto ? disc : num(d.pricing.discount)}" ${d.pricing.discountAuto ? 'disabled' : ''}></label></div>
    <div class="row">${CB('수량 구간 할인 자동 적용', pr + 'discountAuto', d.pricing.discountAuto)}<span class="small muted">· 총 ${t.sets}세트 → ${tier ? `${tier.min}${tier.max ? '–' + tier.max : '+'}개 구간 ${tier.discount}%${tier.negotiable ? ' (개별 협의: ' + esc(tier.note) + ')' : ''}` : '할인 구간 미만'}</span>
    <span class="spacer"></span><button class="btn sm" data-act="reapplyPolicy">현재 설정 정책 다시 적용</button></div>
    <div class="tiny faint">단가 = 기준가(VAT 포함 소비자가) × (1 − 할인율)${d.pricing.vatMode === 'deductOnce' ? ' ÷ 1.1' : ''} ÷ 환율 → 소수 둘째 자리 반올림. 발행된 문서에는 영향이 없습니다.</div></fieldset>
    <fieldset><legend>품목 (Items)</legend><div style="overflow-x:auto"><table class="t"><thead><tr><th>품목</th><th class="r">수량(세트)</th><th class="r">기준가 ₩</th><th class="r">단가 USD</th><th class="r">금액 USD</th><th>백오더</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="empty">품목을 추가하세요</td></tr>'}</tbody>
    <tfoot><tr><td>합계 ${t.sets}세트 · ${t.pieces}pcs</td><td></td><td></td><td></td><td class="r num">${usd(t.goods)}</td><td colspan="2"></td></tr></tfoot></table></div>
    <div class="row"><button class="btn sm" data-act="addItem">+ 품목 추가</button></div></fieldset>
    <fieldset><legend>별도 비용 (Charges: 배송비·인쇄비 등)</legend>${d.charges.map(c => `<div class="row"><input class="inp" style="flex:1" data-bind="deal:charges.#${c.id}.label" value="${esc(c.label)}" placeholder="영문 항목명 (예: Domestic shipping to forwarder)"><input class="inp n" style="width:110px" data-bind="deal:charges.#${c.id}.amount" data-t="n" value="${num(c.amount)}"><button class="btn sm ghost" data-act="delCharge" data-id="${c.id}">×</button></div>`).join('') || '<div class="empty">없음</div>'}
    <div class="row"><button class="btn sm" data-act="addCharge">+ 비용 추가</button><span class="spacer"></span><b class="num">합계 USD ${usd(t.charges)}</b></div></fieldset>
    <fieldset><legend>결제 조건 (Payment terms)</legend><div class="grid3">
    ${F('결제 방식', 'deal:terms.type', d.terms.type, { options: { full: '전액 선결제 (100%)', deposit: '선금 + 잔금' } })}
    ${d.terms.type === 'deposit' ? F('선금 비율 (%)', 'deal:terms.depositPct', d.terms.depositPct, { t: 'n' }) : '<span></span>'}
    ${F('출고 전 필요 입금', 'deal:terms.shipRequires', d.terms.shipRequires, { options: { full: '전액 실입금 후 출고', deposit: '선금 실입금 후 출고' } })}</div>
    <div class="stat"><span class="k">청구 총액</span><span class="v strong">USD ${usd(t.total)}</span>${d.terms.type === 'deposit' ? `<span class="k">선금 (상품대금 × ${num(d.terms.depositPct)}%)</span><span class="v">USD ${usd(t.deposit)}</span><span class="k">잔금 (총액 − 선금)</span><span class="v">USD ${usd(r2(t.total - t.deposit))}</span>` : ''}</div></fieldset>`;
}
function drShip(d, s) {
  if (!s) return '<div class="empty">배송을 찾을 수 없습니다.</div>';
  const b = `deal:shipments.#${s.id}.`, ss = shipSummary(d, s), g = shipGate(d, s);
  const allocRows = d.items.map(it => { const other = allocated(d, it.id, s.id), rem = num(it.qty) - other; const cur = num(s.alloc[it.id]);
    return `<tr><td>${esc(it.desc)}${it.backorder ? ' <span class="pill amber">백오더</span>' : ''}</td><td class="r">${num(it.qty)}</td><td class="r">${other}</td><td style="width:90px"><input class="n" data-bind="${b}alloc.${it.id}" data-t="n" value="${cur}"></td><td>${cur > rem ? '<span class="pill red">초과</span>' : ''}<button class="btn sm ghost" data-act="allocRest" data-sid="${s.id}" data-id="${it.id}">잔량</button></td></tr>`; }).join('');
  const boxRows = s.boxes.map((x, i) => { const bc = boxCalc(x), bb = `${b}boxes.#${x.id}.`;
    return `<tr><td>${i + 1}</td><td><input class="n" data-bind="${bb}l" data-t="n" value="${num(x.l)}"></td><td><input class="n" data-bind="${bb}w" data-t="n" value="${num(x.w)}"></td><td><input class="n" data-bind="${bb}h" data-t="n" value="${num(x.h)}"></td>
      <td><input class="n" data-bind="${bb}nw" data-t="n" value="${num(x.nw)}"></td><td><input class="n" data-bind="${bb}gw" data-t="n" value="${num(x.gw)}"></td><td class="r num">${kg(bc.vol)}</td><td class="r num">${kg(bc.charge)}</td>
      <td><input data-bind="${bb}contents" value="${esc(x.contents)}" placeholder="예: Espresso set ×12"></td><td><button class="btn sm ghost" data-act="delBox" data-sid="${s.id}" data-id="${x.id}">×</button></td></tr>`; }).join('');
  return `<div class="row"><b>${s.no}차 배송</b>${s.shippedAt ? `<span class="pill green">출고 ${esc(s.shippedAt)}</span>` : ''}<span class="spacer"></span><button class="btn sm danger" data-act="delShip" data-sid="${s.id}" ${s.shippedAt ? 'disabled' : ''}>배송 삭제</button></div>
  <fieldset><legend>운송 방식 (Carrier)</legend><div class="grid3">
  ${F('방식', b + 'method', s.method, { options: { DHL: 'DHL Express', EMS: 'EMS', forwarder: '국내 지정 물류업체 인도', other: '기타' } })}
  ${s.method === 'DHL' ? F('운임 계정', b + 'account', s.account, { options: { buyer: '고객 DHL 계정 (Receiver pays)', seller: '당사 계정' } }) : '<span></span>'}
  ${F('출고 예정일', b + 'plannedDate', s.plannedDate, { type: 'date' })}</div>
  ${s.method === 'DHL' && s.account === 'buyer' ? `<div class="grid2">${F('고객 DHL 계정번호 (로컬 저장)', b + 'accountNo', s.accountNo)}${F('승인 근거 (예: 2026-11-23 고객 이메일 승인)', b + 'approvalRef', s.approvalRef)}</div>
    <div class="row">${CB('고객이 계정 사용을 서면으로 승인함', b + 'accountApproved', s.accountApproved)}<button class="btn sm" data-act="attach" data-stage="shipping" data-kind="dhl" data-sid="${s.id}">승인 메일 첨부</button></div>` : ''}
  ${F('배송지 (이 배송만 다를 때, 예: 국내 지정 물류업체 창고)', b + 'shipTo', s.shipTo, { area: true, ph: '비우면 고객 배송지 주소 사용' })}</fieldset>
  <fieldset><legend>품목 배정 (Allocation) — 이번 배송 통관가액 USD ${usd(ss.value)} / 주문 총액 USD ${usd(totals(d).total)}</legend>
  <table class="t"><thead><tr><th>품목</th><th class="r">주문</th><th class="r">다른 배송</th><th class="r">이번 배송</th><th></th></tr></thead><tbody>${allocRows || '<tr><td colspan="5" class="empty">품목 없음</td></tr>'}</tbody></table></fieldset>
  <fieldset><legend>검수·포장 (Inspection & boxes) — 부피무게 = 가로×세로×높이 ÷ ${num(state.settings.defaults.dimDivisor) || 5000}</legend>
  ${CB('검수 완료 (수량·파손·인쇄 확인)', b + 'inspected', s.inspected)}
  <div style="overflow-x:auto"><table class="t"><thead><tr><th>#</th><th>L cm</th><th>W cm</th><th>H cm</th><th>N.W.</th><th>G.W.</th><th class="r">부피kg</th><th class="r">청구kg</th><th>내용물</th><th></th></tr></thead><tbody>${boxRows || '<tr><td colspan="10" class="empty">박스 없음</td></tr>'}</tbody>
  <tfoot><tr><td colspan="4">${s.boxes.length}박스</td><td class="r">${kg(ss.nw)}</td><td class="r">${kg(ss.gw)}</td><td class="r">${kg(ss.vol)}</td><td class="r">${kg(ss.charge)}</td><td colspan="2"></td></tr></tfoot></table></div>
  <div class="row"><button class="btn sm" data-act="addBox" data-sid="${s.id}">+ 박스 추가</button></div></fieldset>
  <fieldset><legend>수출신고 (Declaration) — 신고와 수출이행은 별개</legend><div class="grid2">
  ${F('신고 방식', b + 'declMode', s.declMode, { options: DECL })}${F('수출신고번호', b + 'declNo', s.declNo)}</div>
  <div class="row">${CB('신고 수리됨', b + 'declAccepted', s.declAccepted)}</div>
  <div class="row"><label class="chk"><input type="checkbox" data-act="toggleExport" data-sid="${s.id}" ${s.exportDone ? 'checked' : ''} ${!s.shippedAt ? 'disabled' : ''}>수출이행(선적·인도) 완료</label><span class="tiny faint">${s.shippedAt ? '' : '출고 완료 후 체크할 수 있습니다'}</span></div></fieldset>
  <fieldset><legend>배송 (Dispatch)</legend><div class="grid2">${F('운송장 번호 (AWB / Tracking)', b + 'awb', s.awb)}<div class="f"><span>&nbsp;</span>${CB('픽업·인도 예약 완료', b + 'pickupBooked', s.pickupBooked)}</div></div>
  ${F('메모', b + 'note', s.note, { area: true })}
  <div class="sec-title" style="margin:6px 0 0">출고 조건 (Shipping gate)</div><ul class="gate">${g.map(x => `<li class="${x.ok ? 'yes' : 'no'}">${esc(x.t)}</li>`).join('')}</ul>
  <div class="row">${s.shippedAt ? `<button class="btn" data-act="unship" data-sid="${s.id}">출고 취소</button>` : `<button class="btn pri" data-act="ship" data-sid="${s.id}" ${g.every(x => x.ok) ? '' : 'disabled'}>출고 완료 처리</button>`}</div></fieldset>`;
}
function drPay(d) {
  const t = totals(d), f = ui.payForm || { kind: 'credited', date: today(), amount: '', krw: '', ref: '', note: '' };
  ui.payForm = f;
  const rows = d.payments.map(p => `<tr><td><span class="pill ${p.kind === 'credited' ? 'green' : 'amber'}">${p.kind === 'credited' ? '실입금' : '송금증'}</span></td><td class="num">${esc(p.date)}</td><td class="r num">${usd(p.amount)}</td><td class="r num">${p.kind === 'credited' ? krw(p.krw) : ''}</td><td class="small">${esc(p.ref)} ${esc(p.note)}</td>
    <td>${p.fileId ? `<a class="small" style="cursor:pointer;text-decoration:underline" data-act="openFile" data-id="${p.fileId}">파일</a>` : ''}</td><td><button class="btn sm ghost" data-act="delPay" data-id="${p.id}">×</button></td></tr>`).join('');
  return `<div class="stat"><span class="k">청구 총액</span><span class="v">USD ${usd(t.total)}</span><span class="k">출고 필요 입금액</span><span class="v">USD ${usd(t.needForShip)}</span>
    <span class="k">송금증 합계 (입금 미확정)</span><span class="v">USD ${usd(t.receipts)}</span><span class="k">실입금 합계</span><span class="v strong">USD ${usd(t.credited)}</span><span class="k">잔액</span><span class="v strong">USD ${usd(t.balance)}</span></div>
  <fieldset><legend>기록 추가</legend><div class="grid3">
  ${F('구분', 'ui:payForm.kind', f.kind, { options: { receipt: '송금증 수령 (고객이 보낸 증빙)', credited: '실입금 확인 (은행 계좌 확인)' } })}${F('일자', 'ui:payForm.date', f.date, { type: 'date' })}
  ${F(f.kind === 'credited' ? '입금 인정액 USD' : '송금증 금액 USD', 'ui:payForm.amount', f.amount, { t: 'n' })}
  ${f.kind === 'credited' ? F('원화 입금액 (KRW, 환전 후)', 'ui:payForm.krw', f.krw, { t: 'n' }) : ''}${F('참조 (송금인·은행 거래번호)', 'ui:payForm.ref', f.ref)}${F('메모', 'ui:payForm.note', f.note)}
  <label class="f full"><span>${f.kind === 'credited' ? '입금 확인 캡처 (선택)' : '송금증 파일 (선택)'}</span><input type="file" data-filefor="pay"></label></div>
  ${f.kind === 'receipt' ? '<div class="warn">송금증은 고객이 송금했다는 증빙일 뿐입니다. 실입금 확인 전에는 출고 조건에 반영되지 않습니다.</div>' : '<div class="ok">실입금은 은행 계좌에서 직접 확인한 금액만 입력하세요. 수수료가 차감되어 들어왔다면 인정액과 메모를 함께 기록합니다.</div>'}
  <div class="row"><button class="btn pri" data-act="addPay">기록 추가</button></div></fieldset>
  <fieldset><legend>기록 (History)</legend><table class="t"><thead><tr><th>구분</th><th>일자</th><th class="r">USD</th><th class="r">KRW</th><th>참조</th><th></th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">기록 없음</td></tr>'}</tbody></table></fieldset>`;
}
function drEmail(d) {
  const e = ui.email;
  return `${F('템플릿 (Template)', 'ui:email.key', e.key, { options: EMAILS })}
  <div class="row"><button class="btn sm" data-act="emailReset">템플릿 다시 불러오기</button><span class="tiny faint">현재 수출 건 데이터(문서 번호·금액·배송)로 채워집니다. 발송 전에 내용을 확인하세요.</span></div>
  ${F('제목 (Subject)', 'ui:email.subject', e.subject)}${F('본문 (Body)', 'ui:email.body', e.body, { area: true })}
  <div class="row"><button class="btn" data-act="copyEmail">본문 복사</button>${d.customer.email ? `<a class="btn" href="mailto:${esc(d.customer.email)}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}">메일 앱으로 열기</a>` : ''}<button class="btn pri" data-act="logEmail">발송 기록 저장</button></div>`;
}
function drSettle(d) {
  const t = totals(d), costs = sum(d.settlement.costs, c => c.krw);
  return `<div class="stat"><span class="k">원화 입금액 (실입금)</span><span class="v">${krw(t.creditedKrw)}</span><span class="k">비용 합계</span><span class="v">${krw(costs)}</span><span class="k">수익</span><span class="v strong">${krw(t.creditedKrw - costs)}</span></div>
  <fieldset><legend>비용 (원가·포장·국내운송·인쇄·수수료 등, KRW)</legend>
  ${d.settlement.costs.map(c => `<div class="row"><input class="inp" style="flex:1" data-bind="deal:settlement.costs.#${c.id}.label" value="${esc(c.label)}" placeholder="항목"><input class="inp n" style="width:140px" data-bind="deal:settlement.costs.#${c.id}.krw" data-t="n" value="${num(c.krw)}"><button class="btn sm ghost" data-act="delCost" data-id="${c.id}">×</button></div>`).join('') || '<div class="empty">비용 없음</div>'}
  <div class="row"><button class="btn sm" data-act="addCost">+ 비용 추가</button></div></fieldset>
  ${F('정산 메모 (수출실적·영세율·증빙 위치 등)', 'deal:settlement.note', d.settlement.note, { area: true })}
  <p class="tiny faint">세무 판단(영세율·수출실적)은 앱이 확정하지 않습니다. 확인 필요 항목에서 상태를 관리하세요.</p>`;
}

/* ---------- document modal ---------- */
function modalHtml() {
  const d = state.deals.find(x => x.id === ui.modal.dealId), doc = d?.docs.find(x => x.id === ui.modal.docId);
  if (!doc) { ui.modal = null; return ''; }
  const sn = snapOf(d, doc), errs = verifyMath(sn), warns = doc.status === 'draft' ? docWarnings(d, doc, sn) : [];
  const ed = doc.status === 'draft', b = 'doc:edits.';
  const versions = d.docs.filter(x => x.type === doc.type && (x.shipmentId || null) === (doc.shipmentId || null));
  let side = `<div class="row"><b>${DOC[doc.type].ko}</b>${DOC_STATUS[doc.status]}</div>`;
  side += errs.length ? `<div class="err">자동 검산 오류:<br>${errs.map(esc).join('<br>')}</div>` : (sn.lines?.length ? '<div class="ok">자동 검산 통과 — 단가 × 수량 = 금액, 소계·총액 일치</div>' : '');
  if (doc.status === 'draft') {
    side += warns.map(w => `<div class="warn">${esc(w)}</div>`).join('');
    side += F('발행일 (Date)', b + 'date', doc.edits.date, { type: 'date', live: true });
    if (['QT', 'PI', 'FI'].includes(doc.type)) side += F('옵션 표기 (Bill To 아래 굵게)', b + 'option', doc.edits.option, { ph: 'Option A | Original selection', live: true });
    if (doc.type === 'QT') side += F('유효기간 (Valid until)', b + 'validUntil', doc.edits.validUntil, { type: 'date', live: true });
    if (doc.type === 'CI') side += F('Incoterms (확인 필요)', b + 'incoterms', doc.edits.incoterms, { ph: '예: EXW Hwaseong / FCA', live: true });
    if (doc.type === 'PI' || doc.type === 'FI') (doc.edits.sched || []).forEach((s, i) => { side += F(`결제 일정 문구 ${i + 1}`, `${b}sched.${i}`, s, { live: true }); });
    if (doc.type !== 'MARK') side += F(doc.type === 'KR' ? '메모' : 'Notes (영문)', b + 'notes', doc.edits.notes, { area: true, live: true });
    side += `<div class="tiny faint">초안은 수출 건 데이터와 실시간으로 연결됩니다. <b>발행</b>하면 이 시점의 내용이 고정되고, 이후에는 수정본으로만 변경할 수 있습니다.</div>`;
  } else {
    side += `<div class="small muted">발행: ${esc(doc.issuedAt || '')}<br>발행된 문서는 수정할 수 없습니다. 변경이 필요하면 <b>수정본</b>을 만드세요 (이전 본은 이력으로 보존).</div>`;
    if (doc.originalNo) side += `<div class="small">원 문서: ${esc(doc.originalNo)}</div>`;
    if (doc.status === 'issued' && ['PI', 'QT', 'FI'].includes(doc.type) && doc.snapshot.sig !== sigOf(d)) side += '<div class="err">현재 주문 내용이 이 문서와 다릅니다.</div>';
  }
  side += `<div class="sec-title" style="margin:8px 0 0">버전 (Versions)</div><div class="doclist">${versions.map(v => `<div class="docitem ${v.status} ${v.id === doc.id ? 'current' : ''}" data-act="openDoc" data-id="${v.id}" ${v.id === doc.id ? 'style="border-color:var(--text)"' : ''}><span class="no">${esc(v.no)}</span>${DOC_STATUS[v.status]}</div>`).join('')}</div>`;
  const actions = `<button class="btn" data-act="printDoc">PDF 출력 / 인쇄</button>
    ${ed ? `<button class="btn pri" data-act="issueDoc">발행 (Issue)</button><button class="btn danger" data-act="delDoc">초안 삭제</button>` : ''}
    ${doc.status === 'issued' && doc.type !== 'KR' ? `<button class="btn" data-act="reviseDoc">수정본 만들기</button><button class="btn danger" data-act="voidDoc">무효 처리</button>` : ''}
    ${doc.status === 'issued' && doc.type === 'KR' ? `<button class="btn" data-act="reviseDoc">다시 작성</button>` : ''}`;
  return `<div class="overlay"></div><div class="modal"><div class="modal-h"><b class="num">${esc(doc.no)}</b><span class="faint small">${DOC[doc.type].title}</span><span class="spacer"></span>${actions}<button class="btn" data-act="closeModal">닫기</button></div>
  <div class="modal-b"><div class="modal-side">${side}</div><div class="modal-prev" id="doc-preview">${renderDoc(sn, ed)}</div></div></div>`;
}

/* ---------- settings ---------- */
function viewSettings() {
  const S = state.settings, s = 'set:';
  const tiers = S.pricing.tiers.map((t, i) => `<tr><td><input class="n" data-bind="${s}pricing.tiers.${i}.min" data-t="n" value="${num(t.min)}"></td><td><input class="n" data-bind="${s}pricing.tiers.${i}.max" data-t="nn" value="${t.max == null ? '' : t.max}" placeholder="이상"></td>
    <td><input class="n" data-bind="${s}pricing.tiers.${i}.discount" data-t="n" value="${num(t.discount)}"></td><td style="text-align:center"><input type="checkbox" data-bind="${s}pricing.tiers.${i}.negotiable" data-t="b" ${t.negotiable ? 'checked' : ''}></td>
    <td><input data-bind="${s}pricing.tiers.${i}.note" value="${esc(t.note)}"></td><td><button class="btn sm ghost" data-act="delTier" data-i="${i}">×</button></td></tr>`).join('');
  const prods = state.products.map(p => { const b = `root:products.#${p.id}.`; return `<tr><td><input data-bind="${b}nameEn" value="${esc(p.nameEn)}"><input style="margin-top:3px" data-bind="${b}nameKo" value="${esc(p.nameKo)}" placeholder="국문명"></td>
    <td><input class="n" data-bind="${b}priceKrw" data-t="n" value="${num(p.priceKrw)}"></td><td><input class="n" data-bind="${b}piecesPerSet" data-t="n" value="${num(p.piecesPerSet)}"></td><td><input class="n" data-bind="${b}weightKg" data-t="n" value="${num(p.weightKg)}"></td>
    <td><input class="n" data-bind="${b}stock" data-t="n" value="${num(p.stock)}"></td><td><input data-bind="${b}hsCode" value="${esc(p.hsCode)}" placeholder="확인 필요"></td>
    <td><select data-bind="${b}hsStatus"><option value="pending" ${p.hsStatus !== 'ok' ? 'selected' : ''}>확인 필요</option><option value="ok" ${p.hsStatus === 'ok' ? 'selected' : ''}>확인됨</option></select></td>
    <td><button class="btn sm ghost" data-act="delProduct" data-id="${p.id}">×</button></td></tr>`; }).join('');
  return `<h2 style="font-size:20px;margin-bottom:12px">설정·제품·데이터 <span class="faint" style="font-weight:400;font-size:14px">Settings</span></h2>
  <div class="set-grid">
  <div class="panel"><div class="sec-title" style="margin:0">판매자 정보 (Seller / Exporter) — 영문</div>
    <div class="grid2">${F('회사명', s + 'seller.company', S.seller.company)}${F('서명자 / 담당자', s + 'seller.signer', S.seller.signer)}${F('주소', s + 'seller.address', S.seller.address, { area: true, cls: 'full' })}
    ${F('사업자등록번호', s + 'seller.regNo', S.seller.regNo)}${F('전화', s + 'seller.phone', S.seller.phone)}${F('이메일', s + 'seller.email', S.seller.email)}${F('웹사이트', s + 'seller.web', S.seller.web)}</div>
    <label class="f"><span>문서 로고 이미지 (선택, 없으면 텍스트 "bunnar")</span><input type="file" accept="image/*" data-filefor="logo"></label>${S.logo ? '<button class="btn sm" data-act="clearLogo">로고 제거</button>' : ''}</div>
  <div class="panel"><div class="sec-title" style="margin:0">은행 정보 (Bank) — 이 브라우저에만 저장</div>
    <div class="grid2">${F('은행', s + 'bank.bank', S.bank.bank)}${F('SWIFT/BIC', s + 'bank.swift', S.bank.swift)}${F('예금주 (Beneficiary)', s + 'bank.beneficiary', S.bank.beneficiary)}${F('계좌번호', s + 'bank.account', S.bank.account)}${F('추가 문구 (예: Wise 안내)', s + 'bank.note', S.bank.note, { cls: 'full' })}</div>
    <div class="tiny faint">은행 정보는 코드 저장소에 포함되지 않으며 JSON 백업 파일에만 들어갑니다. 백업 파일은 공개된 곳에 올리지 마세요.</div>
    <div class="sec-title" style="margin:10px 0 0">기본값 (Defaults)</div>
    <div class="grid2">${F('Incoterms 기본값 (확인 필요)', s + 'defaults.incoterms', S.defaults.incoterms, { ph: '비워두면 TBC' })}${F('원산지', s + 'defaults.origin', S.defaults.origin)}
    ${F('부피무게 나눗수 (DHL 5000)', s + 'defaults.dimDivisor', S.defaults.dimDivisor, { t: 'n' })}${F('출고 전 필요 입금 (신규 건 기본)', s + 'defaults.shipRequires', S.defaults.shipRequires, { options: { full: '전액 실입금 후 출고', deposit: '선금 실입금 후 출고' } })}</div></div>
  <div class="panel full" style="grid-column:1/-1"><div class="sec-title" style="margin:0">가격 정책 (Wholesale pricing) — 신규 수출 건에 복사되어 적용, 기존 건·발행 문서에는 영향 없음</div>
    <div class="grid4">${F('기본 환율 (KRW/USD)', s + 'pricing.fxRate', S.pricing.fxRate, { t: 'n' })}${F('환율 기준일', s + 'pricing.fxDate', S.pricing.fxDate, { type: 'date' })}
    ${F('VAT 처리 방식 (확인 필요)', s + 'pricing.vatMode', S.pricing.vatMode, { options: { included: 'VAT 포함 소비자가 × (1−할인율), 별도 차감 없음', deductOnce: '할인 후 VAT 1회 차감 (÷1.1)' } })}${F('VAT율 (%)', s + 'pricing.vatRate', S.pricing.vatRate, { t: 'n' })}</div>
    <table class="t"><thead><tr><th>최소 수량</th><th>최대 수량</th><th>할인율 %</th><th>개별 협의</th><th>비고</th><th></th></tr></thead><tbody>${tiers}</tbody></table>
    <div class="row"><button class="btn sm" data-act="addTier">+ 구간 추가</button>${F('', s + 'pricing.moqNote', S.pricing.moqNote, { cls: 'spacer' })}</div>
    <div class="tiny faint">수량 기준: 주문 전체 세트 수. 국내 VAT 포함 소비자가 기준. VAT는 어떤 경우에도 두 번 차감되지 않습니다. 배송비·인쇄비는 별도 비용으로 청구합니다.</div></div>
  <div class="panel" style="grid-column:1/-1"><div class="sec-title" style="margin:0">제품 (Products)</div>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>영문명 / 국문명</th><th class="r">기준가 ₩ (VAT 포함)</th><th class="r">세트당 피스</th><th class="r">세트 중량kg</th><th class="r">재고</th><th>HS코드</th><th>HS 상태</th><th></th></tr></thead><tbody>${prods}</tbody></table></div>
    <div class="row"><button class="btn sm" data-act="addProduct">+ 제품 추가</button><span class="tiny faint">기준가가 0인 제품은 견적에서 수동 단가로 입력하세요.</span></div></div>
  <div class="panel" style="grid-column:1/-1"><div class="sec-title" style="margin:0">데이터 (Backup · Export)</div>
    <div class="row"><button class="btn pri" data-act="backup" data-files="1">전체 백업 JSON (첨부 포함)</button><button class="btn" data-act="backup">백업 JSON (첨부 제외)</button>
    <label class="btn">JSON 복원<input type="file" accept="application/json,.json" data-filefor="restore" hidden></label>
    <button class="btn" data-act="csv">CSV 내보내기 (수출 건·품목)</button><span class="spacer"></span><button class="btn" data-act="loadSample">예시 데이터 불러오기</button><button class="btn danger" data-act="resetAll">전체 초기화</button></div>
    <div class="tiny faint">데이터는 이 브라우저에만 저장됩니다. 정기적으로 백업하고, 백업 파일은 비공개 위치(개인 드라이브 등)에 보관하세요. 마지막 저장: ${esc(state.deals.reduce((m, d) => d.updatedAt > m ? d.updatedAt : m, '—'))}</div></div>
  </div>`;
}

/* ============================== binding ============================== */
function resolveRoot(prefix) {
  if (prefix === 'deal') return deal();
  if (prefix === 'set') return state.settings;
  if (prefix === 'root') return state;
  if (prefix === 'ui') return ui;
  if (prefix === 'doc') { const d = state.deals.find(x => x.id === ui.modal?.dealId); return d?.docs.find(x => x.id === ui.modal.docId); }
}
function step(o, s) { if (o == null) return undefined; if (s.startsWith('#')) return Array.isArray(o) ? o.find(x => x.id === s.slice(1) || x.key === s.slice(1)) : undefined; return o[s]; }
function applyBind(el) {
  const [prefix, path] = el.dataset.bind.split(/:(.*)/s);
  const root = resolveRoot(prefix); if (!root) return null;
  const segs = path.split('.'); let o = root;
  for (let i = 0; i < segs.length - 1; i++) { let nx = step(o, segs[i]); if (nx === undefined && !segs[i].startsWith('#')) { nx = {}; o[segs[i]] = nx; } o = nx; if (o == null) return null; }
  const last = segs[segs.length - 1], t = el.dataset.t;
  let v = t === 'b' ? el.checked : el.value;
  if (t === 'n') v = num(v);
  if (t === 'nn') v = el.value.trim() === '' ? null : num(el.value);
  o[last] = v;
  return { prefix, path, obj: o, last, v };
}
function afterBind(r) {
  const d = deal();
  if (r.prefix === 'deal' && d) {
    d.updatedAt = nowStr();
    if (r.path === 'customer.country' && !d.customer.cc) { const cc = COUNTRY_CC[String(r.v).trim().toLowerCase()]; if (cc) d.customer.cc = cc; }
    if (r.path === 'customer.cc') d.customer.cc = String(r.v).toUpperCase().slice(0, 3);
    if (r.last === 'productId') { const p = productOf(r.v); if (p) Object.assign(r.obj, { desc: p.nameEn, priceKrw: p.priceKrw, piecesPerSet: p.piecesPerSet, hsCode: p.hsCode }); }
    if (r.last === 'manual' && r.v) { r.obj.manual = false; const u = unitOf(d, r.obj); r.obj.manual = true; r.obj.unitUsd = u; }
    if (r.last === 'discountAuto' && !r.v) d.pricing.discount = (() => { d.pricing.discountAuto = true; const x = dealDiscount(d); d.pricing.discountAuto = false; return x; })();
    if (r.path.endsWith('.method') && r.v !== 'DHL') r.obj.account = 'seller';
    if (r.path.endsWith('.method') && r.v === 'DHL') r.obj.account = 'buyer';
    if (r.path === 'terms.type' && r.v === 'full') d.terms.shipRequires = 'full';
  }
  if (r.prefix === 'ui' && r.path === 'email.key') { const e = emailTpl(d, r.v); ui.email.subject = e.subject; ui.email.body = e.body; }
  if (r.prefix === 'set' && r.path === 'pricing.tiers') { /* noop */ }
}

/* ============================== actions ============================== */
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); }
function download(name, text, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function pickFile(accept, cb) { const i = document.createElement('input'); i.type = 'file'; if (accept) i.accept = accept; i.onchange = () => i.files[0] && cb(i.files[0]); i.click(); }
async function storeFile(d, file, meta) {
  const id = 'f_' + uid();
  await FileDB.put(id, file);
  d.files.push(Object.assign({ id, name: file.name, mime: file.type, size: file.size, addedAt: nowStr() }, meta));
  return id;
}
const blobToB64 = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
const b64ToBlob = async u => (await fetch(u)).blob();
const commit = () => { save(); render(); };

const A = {
  home() { ui.view = 'home'; ui.dealId = null; ui.drawer = null; window.scrollTo(0, 0); render(); },
  settings() { ui.view = 'settings'; ui.drawer = null; window.scrollTo(0, 0); render(); },
  filter(el) { ui.filter = el.dataset.v; render(); },
  newDeal() { const d = newDeal(); state.deals.unshift(d); ui.view = 'deal'; ui.dealId = d.id; ui.drawer = { kind: 'customer' }; commit(); },
  openDeal(el) { ui.view = 'deal'; ui.dealId = el.dataset.id; window.scrollTo(0, 0); render(); },
  drawer(el) { ui.drawer = { kind: el.dataset.k, sid: el.dataset.sid }; if (el.dataset.k === 'email' && !ui.email.body) A.emailReset(); render(); },
  closeDrawer() { ui.drawer = null; render(); },
  archive() { const d = deal(); d.archived = !d.archived; log(d, d.archived ? '보관 처리' : '보관 해제'); commit(); },
  async deleteDeal() { const d = deal(); if (!confirm(`"${d.customer.name || d.code}" 수출 건과 첨부파일을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`)) return; for (const f of d.files) await FileDB.del(f.id).catch(() => { }); state.deals = state.deals.filter(x => x !== d); A.home(); save(); },
  exportDeal() { const d = deal(); download(`bunnar-export_${d.code}.json`, JSON.stringify({ schema: SCHEMA, exportedAt: nowStr(), deal: d }, null, 2)); },
  addLog() { const d = deal(); const t = (ui.newLog || '').trim(); if (!t) return; log(d, t, 'note'); ui.newLog = ''; commit(); },
  delLog(el) { const d = deal(); if (!confirm('이 기록을 삭제할까요?')) return; d.logs = d.logs.filter(l => l.id !== el.dataset.id); commit(); },
  addVerify() { const d = deal(); const t = (ui.newVerify || '').trim(); if (!t) return; d.verify.push({ key: 'v' + uid(), label: t, status: 'pending', note: '' }); ui.newVerify = ''; commit(); },
  /* items */
  addItem() { const d = deal(); d.items.push({ id: uid(), productId: '', desc: '', qty: 0, piecesPerSet: 2, priceKrw: 0, unitUsd: 0, manual: false, backorder: false, hsCode: '' }); commit(); },
  delItem(el) { const d = deal(); d.items = d.items.filter(i => i.id !== el.dataset.id); d.shipments.forEach(s => delete s.alloc[el.dataset.id]); commit(); },
  addCharge() { deal().charges.push({ id: uid(), label: '', amount: 0 }); commit(); },
  delCharge(el) { const d = deal(); d.charges = d.charges.filter(c => c.id !== el.dataset.id); commit(); },
  reapplyPolicy() { const d = deal(), P = state.settings.pricing; if (!confirm('현재 설정의 환율·할인 구간·VAT 방식을 이 수출 건에 다시 적용합니다. (발행된 문서는 바뀌지 않습니다)')) return; Object.assign(d.pricing, { fxRate: P.fxRate, fxDate: P.fxDate, vatMode: P.vatMode, vatRate: P.vatRate, tiers: clone(P.tiers), discountAuto: true }); log(d, `가격 정책 재적용 (환율 ${P.fxRate})`); commit(); },
  /* shipments */
  addShip() { const d = deal(); const s = newShipment(d); if (!d.shipments.length) d.items.forEach(i => { if (!i.backorder) s.alloc[i.id] = num(i.qty); }); d.shipments.push(s); log(d, `${s.no}차 배송 추가`); ui.drawer = { kind: 'ship', sid: s.id }; commit(); },
  delShip(el) { const d = deal(); if (!confirm('이 배송을 삭제할까요?')) return; d.shipments = d.shipments.filter(s => s.id !== el.dataset.sid); ui.drawer = null; commit(); },
  allocRest(el) { const d = deal(), s = d.shipments.find(x => x.id === el.dataset.sid), it = d.items.find(i => i.id === el.dataset.id); s.alloc[it.id] = Math.max(0, num(it.qty) - allocated(d, it.id, s.id)); commit(); },
  addBox(el) { const d = deal(), s = d.shipments.find(x => x.id === el.dataset.sid), last = s.boxes[s.boxes.length - 1]; s.boxes.push({ id: uid(), l: last?.l || 0, w: last?.w || 0, h: last?.h || 0, gw: 0, nw: 0, contents: '' }); commit(); },
  delBox(el) { const d = deal(), s = d.shipments.find(x => x.id === el.dataset.sid); s.boxes = s.boxes.filter(b => b.id !== el.dataset.id); commit(); },
  ship(el) {
    const d = deal(), s = d.shipments.find(x => x.id === el.dataset.sid), g = shipGate(d, s);
    if (!g.every(x => x.ok)) { alert('출고 조건이 충족되지 않았습니다:\n\n' + g.filter(x => !x.ok).map(x => '✕ ' + x.t).join('\n')); return; }
    if (!confirm(`${s.no}차 배송을 출고 완료 처리합니다.`)) return;
    s.shippedAt = today(); log(d, `${s.no}차 배송 출고 완료 (${METHOD[s.method]}${s.awb ? ' · ' + s.awb : ''})`); commit();
  },
  unship(el) { const d = deal(), s = d.shipments.find(x => x.id === el.dataset.sid); if (!confirm('출고 완료를 취소할까요?')) return; s.shippedAt = ''; s.exportDone = false; log(d, `${s.no}차 배송 출고 취소`); commit(); },
  toggleExport(el) {
    const d = deal(), s = d.shipments.find(x => x.id === el.dataset.sid);
    if (!s.shippedAt) { el.checked = false; return; }
    if (el.checked && s.declMode === 'formal' && !(s.declNo || '').trim()) { el.checked = false; alert('정식 수출신고 건은 수출신고번호를 먼저 입력하세요.'); return; }
    s.exportDone = el.checked; log(d, `${s.no}차 배송 수출이행 ${s.exportDone ? '완료' : '취소'}`); commit();
  },
  /* payments */
  payForm(el) { ui.payForm = { kind: el.dataset.kind, date: today(), amount: '', krw: '', ref: '', note: '' }; ui.payFile = null; ui.drawer = { kind: 'pay' }; render(); },
  async addPay() {
    const d = deal(), f = ui.payForm;
    if (!(num(f.amount) > 0)) { alert('금액을 입력하세요.'); return; }
    const p = { id: uid(), kind: f.kind, date: f.date || today(), amount: r2(f.amount), krw: f.kind === 'credited' ? Math.round(num(f.krw)) : 0, ref: f.ref, note: f.note, fileId: '' };
    if (ui.payFile) p.fileId = await storeFile(d, ui.payFile, { kind: 'remittance', stage: 'payment' });
    d.payments.push(p);
    log(d, `${f.kind === 'credited' ? '실입금 확인' : '송금증 수령'} USD ${usd(p.amount)}${p.krw ? ` (${krw(p.krw)})` : ''}`);
    ui.payForm = { kind: f.kind, date: today(), amount: '', krw: '', ref: '', note: '' }; ui.payFile = null; commit();
  },
  delPay(el) { const d = deal(); if (!confirm('이 결제 기록을 삭제할까요?')) return; const p = d.payments.find(x => x.id === el.dataset.id); d.payments = d.payments.filter(x => x !== p); log(d, `결제 기록 삭제: ${p.kind} USD ${usd(p.amount)}`); commit(); },
  /* files */
  attach(el) {
    const d = deal(), { stage, kind, sid } = el.dataset;
    pickFile('', async f => { await storeFile(d, f, { kind, stage, shipmentId: sid || '' }); log(d, `첨부: [${FILE_KIND[kind] || kind}] ${f.name}`); commit(); });
  },
  async openFile(el) {
    const blob = await FileDB.get(el.dataset.id);
    if (!blob) { alert('파일을 찾을 수 없습니다. (다른 브라우저이거나 첨부 제외 백업에서 복원된 경우)'); return; }
    const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  async delFile(el) { const d = deal(); const f = d.files.find(x => x.id === el.dataset.id); if (!confirm(`첨부 "${f.name}"을(를) 삭제할까요?`)) return; await FileDB.del(f.id).catch(() => { }); d.files = d.files.filter(x => x !== f); d.payments.forEach(p => { if (p.fileId === f.id) p.fileId = ''; }); log(d, `첨부 삭제: ${f.name}`); commit(); },
  /* docs */
  newDoc(el) {
    const d = deal();
    if (!d.customer.cc) { alert('문서 번호에 쓸 국가 코드(예: AU)를 먼저 입력하세요.'); ui.drawer = { kind: 'customer' }; render(); return; }
    const doc = createDoc(d, el.dataset.type, el.dataset.sid || null); ui.modal = { dealId: d.id, docId: doc.id }; commit();
  },
  openDoc(el) { ui.modal = { dealId: deal().id, docId: el.dataset.id }; render(); },
  closeModal() { ui.modal = null; render(); },
  issueDoc() {
    const d = deal(), doc = d.docs.find(x => x.id === ui.modal.docId), sn = buildSnap(d, doc);
    const errs = verifyMath(sn); if (errs.length) { alert('자동 검산 오류가 있어 발행할 수 없습니다:\n' + errs.join('\n')); return; }
    const w = docWarnings(d, doc, sn);
    if (!confirm(`${doc.no} 을(를) 발행합니다.\n발행 후에는 수정할 수 없고 수정본으로만 변경됩니다.${w.length ? '\n\n확인할 점:\n- ' + w.join('\n- ') : ''}\n\n계속할까요?`)) return;
    d.docs.filter(x => x.type === doc.type && x.status === 'issued' && (x.shipmentId || null) === (doc.shipmentId || null)).forEach(x => { x.status = 'superseded'; x.supersededBy = doc.no; });
    doc.snapshot = sn; doc.status = 'issued'; doc.issuedAt = nowStr();
    log(d, `${doc.type} 발행: ${doc.no}${doc.originalNo ? ` (원 문서 ${doc.originalNo} 대체)` : ''} · USD ${usd(sn.total ?? sn.value ?? 0)}`);
    commit(); toast('발행되었습니다. PDF 출력으로 저장하세요.');
  },
  reviseDoc() { const d = deal(), doc = d.docs.find(x => x.id === ui.modal.docId); const nd = createDoc(d, doc.type, doc.shipmentId); ui.modal.docId = nd.id; commit(); },
  voidDoc() { const d = deal(), doc = d.docs.find(x => x.id === ui.modal.docId); const why = prompt('무효 처리 사유 (기록에 남습니다):'); if (why === null) return; doc.status = 'void'; doc.voidReason = why; log(d, `${doc.type} 무효: ${doc.no} — ${why}`); commit(); },
  delDoc() { const d = deal(), doc = d.docs.find(x => x.id === ui.modal.docId); if (!confirm('초안을 삭제할까요?')) return; d.docs = d.docs.filter(x => x !== doc); log(d, `${doc.type} 초안 삭제: ${doc.no}`); ui.modal = null; commit(); },
  printDoc() {
    const d = deal(), doc = d.docs.find(x => x.id === ui.modal.docId);
    $('#print-root').innerHTML = renderDoc(snapOf(d, doc), doc.status === 'draft');
    const old = document.title; document.title = `${doc.no}_BUNNAR${doc.status === 'draft' ? '_DRAFT' : ''}`;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); document.title = old; $('#print-root').innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  },
  /* email */
  emailKey(el) { ui.email.key = el.dataset.key; A.emailReset(true); ui.drawer = { kind: 'email' }; render(); },
  emailReset(silent) { const e = emailTpl(deal(), ui.email.key); ui.email.subject = e.subject; ui.email.body = e.body; if (silent !== true) render(); },
  async copyEmail() { try { await navigator.clipboard.writeText(`Subject: ${ui.email.subject}\n\n${ui.email.body}`); toast('복사되었습니다'); } catch (e) { alert('복사 실패 — 직접 선택해 복사하세요.'); } },
  logEmail() { const d = deal(); log(d, `[${EMAILS[ui.email.key]}] ${ui.email.subject}\n\n${ui.email.body}`, 'email'); const st = { inquiry: 'inquiry_reply', pi: 'invoice_sent', shipped: 'shipping_notify' }[ui.email.key]; if (st) d.checks[st] = true; commit(); toast('상담 기록에 저장했습니다'); },
  /* settlement */
  addCost() { deal().settlement.costs.push({ id: uid(), label: '', krw: 0 }); commit(); },
  delCost(el) { const d = deal(); d.settlement.costs = d.settlement.costs.filter(c => c.id !== el.dataset.id); commit(); },
  /* settings */
  addTier() { state.settings.pricing.tiers.push({ min: 0, max: null, discount: 0, negotiable: false, note: '' }); commit(); },
  delTier(el) { state.settings.pricing.tiers.splice(+el.dataset.i, 1); commit(); },
  addProduct() { state.products.push({ id: 'p_' + uid(), sku: '', nameEn: '', nameKo: '', priceKrw: 0, piecesPerSet: 2, weightKg: 0, stock: 0, hsCode: '', hsStatus: 'pending' }); commit(); },
  delProduct(el) { if (!confirm('제품을 삭제할까요? (기존 수출 건의 품목은 유지됩니다)')) return; state.products = state.products.filter(p => p.id !== el.dataset.id); commit(); },
  clearLogo() { state.settings.logo = ''; commit(); },
  async backup(el) {
    const withFiles = !!el.dataset.files, out = { schema: SCHEMA, app: 'BUNNAR Export', version: APP_VERSION, exportedAt: nowStr(), data: state };
    if (withFiles) { out.files = {}; for (const d of state.deals) for (const f of d.files) { const b = await FileDB.get(f.id).catch(() => null); if (b) out.files[f.id] = await blobToB64(b); } }
    download(`bunnar-export-backup_${ymd()}${withFiles ? '_files' : ''}.json`, JSON.stringify(out));
    toast('백업 파일을 저장했습니다 — 비공개 위치에 보관하세요');
  },
  csv() {
    const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['code', 'customer', 'country', 'email', 'sets', 'goods_usd', 'charges_usd', 'total_usd', 'receipts_usd', 'credited_usd', 'credited_krw', 'balance_usd', 'payment_status', 'current_stage', 'next_todo', 'shipments', 'planned_ship', 'archived']];
    const lines = [['code', 'customer', 'item', 'qty', 'unit_usd', 'amount_usd', 'manual_price', 'backorder']];
    for (const d of state.deals) {
      const t = totals(d), nt = nextTodo(d);
      rows.push([d.code, d.customer.name, d.customer.country, d.customer.email, t.sets, t.goods, t.charges, t.total, t.receipts, t.credited, t.creditedKrw, t.balance, payStatus(d, t).label, nt.st ? `${nt.st.no} ${nt.st.ko}` : 'done', nt.t, d.shipments.map(s => `${s.no}:${METHOD[s.method]}${s.shippedAt ? '(shipped ' + s.shippedAt + ')' : ''}`).join(' | '), d.shipments.map(s => s.plannedDate).filter(Boolean).join(' | '), d.archived]);
      t.lines.forEach(l => lines.push([d.code, d.customer.name, l.desc, l.qty, l.unit, l.amount, l.manual, l.backorder]));
    }
    const bom = '﻿';
    download(`bunnar-export_deals_${ymd()}.csv`, bom + rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
    setTimeout(() => download(`bunnar-export_lines_${ymd()}.csv`, bom + lines.map(r => r.map(q).join(',')).join('\n'), 'text/csv'), 400);
  },
  async resetAll() { if (!confirm('모든 수출 건·설정·첨부파일을 삭제합니다. 먼저 백업하세요. 계속할까요?')) return; if (prompt('확인을 위해 "초기화"를 입력하세요') !== '초기화') return; await FileDB.clear().catch(() => { }); state = freshState(); save(); A.home(); },
  loadSample() { loadSample(); ui.view = 'home'; ui.filter = 'active'; commit(); toast('예시 데이터를 불러왔습니다'); },
};

/* ============================== sample data (anonymized) ============================== */
function loadSample() {
  state.deals = state.deals.filter(d => !String(d.code).startsWith('EX-SAMPLE'));
  const it = (pn, qty, unit, extra = {}) => { const p = state.products.find(x => x.nameEn === pn); return Object.assign({ id: uid(), productId: p ? p.id : '', desc: pn, qty, piecesPerSet: p ? p.piecesPerSet : 2, priceKrw: p ? p.priceKrw : 0, unitUsd: unit, manual: true, backorder: false, hsCode: p ? p.hsCode : '' }, extra); };
  // 1) 호주 — 114세트, 분할 배송(90 + 24), 고객 DHL 계정, 송금증만 수령한 상태
  const au = newDeal();
  au.code = 'EX-SAMPLE-AU';
  au.customer = { name: 'Sample Café AU (테스트)', contact: 'Test Buyer', country: 'Australia', cc: 'AU', email: 'buyer@example.com', phone: '', billAddress: '', shipAddress: 'Sample address, Sydney NSW\nAustralia', notes: '예시 데이터 — 실제 고객 정보 아님' };
  au.items = [it('Espresso Cup 75ml & Saucer', 12, 16.11), it('Flat White Cup 190ml & Saucer', 30, 21.71), it('Cappuccino Cup 190ml & Saucer', 24, 22.27, { backorder: true }), it('Americano Cup 300ml & Saucer', 24, 22.83), it('Caffè Latte Cup 270ml & Saucer', 24, 24.50)];
  au.terms = { type: 'full', depositPct: 50, shipRequires: 'full' };
  const s1 = newShipment(au); au.shipments.push(s1); au.items.filter(i => !i.backorder).forEach(i => { s1.alloc[i.id] = i.qty; });
  const s2 = newShipment(au); au.shipments.push(s2); au.items.filter(i => i.backorder).forEach(i => { s2.alloc[i.id] = i.qty; });
  s1.plannedDate = addDays(today(), 1); s2.plannedDate = addDays(today(), 14);
  au.payments.push({ id: uid(), kind: 'receipt', date: today(), amount: 2515.02, krw: 0, ref: 'Remittance slip (sample)', note: '송금증만 수령 — 실입금 확인 전', fileId: '' });
  au.checks = { inquiry_request: true, inquiry_reply: true, quotation_stock: true, quotation_extra: true };
  log(au, '고객 요청: Option A 원래 선택 + 카페라떼 24세트 추가. 카푸치노는 12월 초 입고 예정 → 2차 배송', 'note');
  log(au, '인쇄 서비스(로고 인쇄) 문의 — 단가·최소 수량 별도 견적 예정. 이번 주문에는 미포함', 'note');
  log(au, '배송: 고객 DHL 계정 사용 요청. 계정 사용 서면 승인 받은 뒤 픽업 예약 예정', 'note');
  // 2) 대만 — 48피스, 선금 50% 실입금, 국내 지정 물류업체 인도, 2박스
  const tw = newDeal();
  tw.code = 'EX-SAMPLE-TW';
  tw.customer = { name: 'Sample Shop TW (테스트)', contact: 'Test Buyer', country: 'Taiwan', cc: 'TW', email: 'buyer@example.com', phone: '', billAddress: '', shipAddress: '', notes: '예시 데이터 — 실제 고객 정보 아님' };
  tw.items = [it('Sample item A', 30, 9.87, { piecesPerSet: 1 }), it('Sample item B', 18, 10.14, { piecesPerSet: 1 })];
  tw.charges = [{ id: uid(), label: 'Domestic shipping to designated forwarder (Korea)', amount: 12 }];
  tw.terms = { type: 'deposit', depositPct: 50, shipRequires: 'full' };
  tw.payments.push({ id: uid(), kind: 'credited', date: today(), amount: 239.31, krw: 0, ref: 'Deposit (sample)', note: '선금 인정액', fileId: '' });
  const t1 = newShipment(tw); t1.method = 'forwarder'; t1.account = 'seller'; t1.shipTo = 'Designated forwarder warehouse (Korea) — sample\nAttn: Sample Shop TW'; tw.items.forEach(i => { t1.alloc[i.id] = i.qty; });
  t1.boxes = [{ id: uid(), l: 40, w: 30, h: 30, gw: 0, nw: 0, contents: 'Sample item A ×30' }, { id: uid(), l: 40, w: 30, h: 25, gw: 0, nw: 0, contents: 'Sample item B ×18' }];
  t1.declMode = 'unset'; tw.shipments.push(t1);
  tw.verify.find(v => v.key === 'perf').note = '국내 물류업체 인도 건 — 직접 수출실적 인정 여부 확인 필요';
  tw.verify.find(v => v.key === 'zero').note = '영세율 적용 가능 여부 세무사 확인';
  log(tw, '한국 내 지정 물류업체로 배송 요청. 2박스, 박스별 배송 식별 라벨 필요', 'note');
  state.deals.unshift(tw, au);
}

/* ============================== events ============================== */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act; if (!A[act]) return;
  if (el.tagName === 'INPUT' && el.type === 'checkbox') { A[act](el); return; }
  if (el.tagName === 'A' && el.getAttribute('href')) return;
  e.preventDefault(); A[act](el);
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.filefor) {
    const f = el.files[0]; if (!f) return;
    if (el.dataset.filefor === 'pay') { ui.payFile = f; return; }
    if (el.dataset.filefor === 'logo') { if (f.size > 400000) { alert('로고 이미지는 400KB 이하로 올려주세요.'); return; } state.settings.logo = await blobToB64(f); commit(); return; }
    if (el.dataset.filefor === 'restore') {
      try {
        const j = JSON.parse(await f.text());
        if (j.schema !== SCHEMA || !j.data) throw new Error('BUNNAR Export 백업 파일이 아닙니다.');
        if (!confirm(`백업(${j.exportedAt || ''}, 수출 건 ${j.data.deals?.length || 0}개)으로 현재 데이터를 교체합니다. 계속할까요?`)) return;
        state = migrate(j.data);
        if (j.files) for (const [id, b64] of Object.entries(j.files)) await FileDB.put(id, await b64ToBlob(b64));
        save(); A.home(); toast('복원되었습니다');
      } catch (err) { alert('복원 실패: ' + err.message); }
      return;
    }
  }
  if (el.dataset.bind && !el.dataset.live) { const r = applyBind(el); if (r) { afterBind(r); save(); renderSoon(); } }
  else if (el.dataset.bind && el.dataset.live) { save(); renderSoon(); }
});
/* 입력 후 바로 버튼을 누를 때(blur→change) 화면이 다시 그려져 클릭이 사라지지 않도록, 포인터가 눌린 동안에는 렌더를 미룹니다. */
let pointerDown = false, pendingRender = false;
function renderSoon() { if (pointerDown) pendingRender = true; else render(); }
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
document.addEventListener('pointerup', () => { setTimeout(() => { pointerDown = false; if (pendingRender) { pendingRender = false; render(); } }, 0); }, true);
document.addEventListener('pointercancel', () => { pointerDown = false; if (pendingRender) { pendingRender = false; render(); } }, true);
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.bind && el.dataset.live) {
    applyBind(el);
    const d = state.deals.find(x => x.id === ui.modal?.dealId), doc = d?.docs.find(x => x.id === ui.modal.docId);
    if (doc && $('#doc-preview')) $('#doc-preview').innerHTML = renderDoc(snapOf(d, doc), doc.status === 'draft');
  } else if (el.dataset.bind && el.dataset.bind.startsWith('ui:')) applyBind(el); // 메모 입력 중 보존
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (ui.modal) A.closeModal(); else if (ui.drawer) A.closeDrawer(); }
});
window.addEventListener('beforeunload', save);

/* ============================== init ============================== */
state = load();
render();
