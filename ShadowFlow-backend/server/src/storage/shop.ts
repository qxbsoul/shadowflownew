/**
 * shop.ts — 公司小商品店铺（商品 / 订单 / 变更审批 / 财务与销售统计）存储层。
 *
 * 与演示用 merchant-board 模块完全独立：这里所有数据都带 company_id，走公司边界；
 * 金额一律整数分（cents），避免浮点误差。
 *
 * 口径：
 *   营业收入 = 已支付订单（paid/shipped/delivered）的实收金额之和
 *   商品成本 = 这些订单的（进货成本 × 件数）之和
 *   AI 成本  = token_usage 里本公司的刊例价估算（CNY）
 *   毛利     = 营业收入 − 商品成本 − AI 成本
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from './sqlite';

const DAY_MS = 24 * 60 * 60 * 1000;

const DDL = `
CREATE TABLE IF NOT EXISTS shop_products (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  images_json TEXT NOT NULL DEFAULT '[]',
  price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  market_price_cents INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  shipping_fee_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_products_company ON shop_products(company_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS shop_orders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_image TEXT NOT NULL DEFAULT '',
  unit_price_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL,
  shipping_fee_cents INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL,
  buyer_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_payment',
  tracking_company TEXT NOT NULL DEFAULT '',
  tracking_no TEXT NOT NULL DEFAULT '',
  tracking_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  shipped_at INTEGER,
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_company ON shop_orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS shop_change_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  product_id TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shop_changes_company ON shop_change_requests(company_id, status, created_at DESC);
`;

const ready = new Set<string>();

function db(): Database.Database {
  const conn = getDb();
  const key = (conn as { name?: string }).name ?? 'default';
  if (!ready.has(key)) {
    conn.exec(DDL);
    ready.add(key);
  }
  return conn;
}

export class ShopError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type ShopProductStatus = 'active' | 'offline' | 'deleted';
export type ShopOrderStatus = 'pending_payment' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export interface ShopProduct {
  id: string;
  company_id: string;
  name: string;
  summary: string;
  description: string;
  images: string[];
  price_cents: number;
  cost_cents: number;
  market_price_cents: number;
  stock: number;
  shipping_fee_cents: number;
  status: ShopProductStatus;
  created_at: number;
  updated_at: number;
}

export interface ShopOrder {
  id: string;
  company_id: string;
  product_id: string;
  product_name: string;
  product_image: string;
  unit_price_cents: number;
  cost_cents: number;
  quantity: number;
  shipping_fee_cents: number;
  amount_cents: number;
  buyer_name: string;
  phone: string;
  address: string;
  note: string;
  status: ShopOrderStatus;
  tracking_company: string;
  tracking_no: string;
  tracking_note: string;
  created_at: number;
  paid_at: number | null;
  shipped_at: number | null;
  delivered_at: number | null;
}

export interface ShopChangeRequest {
  id: string;
  company_id: string;
  conversation_id: string;
  action: 'create' | 'update' | 'delete';
  product_id: string;
  payload: Record<string, unknown>;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: number;
  decided_at: number | null;
}

const PRODUCT_IMAGE_LIMIT = 5;
const PRODUCT_IMAGE_MAX_BYTES = 1_500_000;

function text(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cents(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 100_000_000);
}

function positiveInt(value: unknown, fallback = 0, max = 100_000): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

/** 图片只接受 data:image/* 或 http(s) 链接；单张与总量都设上限，避免把库写爆。 */
export function normalizeImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const value = item.trim();
    if (!value) continue;
    const isData = /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value);
    const isUrl = /^https?:\/\//i.test(value);
    if (!isData && !isUrl) continue;
    if (isData && value.length > PRODUCT_IMAGE_MAX_BYTES) continue;
    out.push(value);
    if (out.length >= PRODUCT_IMAGE_LIMIT) break;
  }
  return out;
}

function rowToProduct(row: Record<string, unknown>): ShopProduct {
  let images: string[] = [];
  try {
    const parsed = JSON.parse(String(row.images_json ?? '[]')) as unknown;
    if (Array.isArray(parsed)) images = parsed.filter((item): item is string => typeof item === 'string');
  } catch { /* 损坏的图片字段按空处理，不影响商品本身。 */ }
  return {
    id: String(row.id), company_id: String(row.company_id), name: String(row.name ?? ''),
    summary: String(row.summary ?? ''), description: String(row.description ?? ''),
    images,
    price_cents: Number(row.price_cents ?? 0), cost_cents: Number(row.cost_cents ?? 0),
    market_price_cents: Number(row.market_price_cents ?? 0), stock: Number(row.stock ?? 0),
    shipping_fee_cents: Number(row.shipping_fee_cents ?? 0),
    status: (String(row.status ?? 'active') as ShopProductStatus),
    created_at: Number(row.created_at ?? 0), updated_at: Number(row.updated_at ?? 0),
  };
}

export interface ProductInput {
  name?: unknown;
  summary?: unknown;
  description?: unknown;
  images?: unknown;
  price_cents?: unknown;
  cost_cents?: unknown;
  market_price_cents?: unknown;
  stock?: unknown;
  shipping_fee_cents?: unknown;
  status?: unknown;
}

export function createProduct(companyId: string, input: ProductInput): ShopProduct {
  const name = text(input.name, 80);
  if (!name) throw new ShopError(422, '商品名称不能为空');
  const price = cents(input.price_cents);
  const status: ShopProductStatus = input.status === 'offline' ? 'offline' : 'active';
  // 允许先以「未上架草稿」形式存在（AI 拿不到真实售价时不该逼它编数字），
  // 但在售商品必须有正数售价。
  if (status === 'active' && price <= 0) throw new ShopError(422, '在售商品的售价必须大于 0');
  const now = Date.now();
  const id = `prd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  db().prepare(`INSERT INTO shop_products
    (id,company_id,name,summary,description,images_json,price_cents,cost_cents,market_price_cents,stock,shipping_fee_cents,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, companyId, name, text(input.summary, 200), text(input.description, 8000),
    JSON.stringify(normalizeImages(input.images)), price, cents(input.cost_cents),
    cents(input.market_price_cents), positiveInt(input.stock), cents(input.shipping_fee_cents),
    status, now, now,
  );
  return getProduct(id, companyId)!;
}

export function updateProduct(companyId: string, id: string, input: ProductInput): ShopProduct {
  const existing = getProduct(id, companyId);
  if (!existing) throw new ShopError(404, '商品不存在');
  const name = input.name === undefined ? existing.name : text(input.name, 80);
  if (!name) throw new ShopError(422, '商品名称不能为空');
  const price = input.price_cents === undefined ? existing.price_cents : cents(input.price_cents);
  const nextStatus: ShopProductStatus = input.status === 'offline' ? 'offline'
    : input.status === 'active' ? 'active' : existing.status;
  if (nextStatus === 'active' && price <= 0) throw new ShopError(422, '在售商品的售价必须大于 0');
  db().prepare(`UPDATE shop_products SET
      name=?, summary=?, description=?, images_json=?, price_cents=?, cost_cents=?,
      market_price_cents=?, stock=?, shipping_fee_cents=?, status=?, updated_at=?
    WHERE id=? AND company_id=?`).run(
    name,
    input.summary === undefined ? existing.summary : text(input.summary, 200),
    input.description === undefined ? existing.description : text(input.description, 8000),
    JSON.stringify(input.images === undefined ? existing.images : normalizeImages(input.images)),
    price,
    input.cost_cents === undefined ? existing.cost_cents : cents(input.cost_cents),
    input.market_price_cents === undefined ? existing.market_price_cents : cents(input.market_price_cents),
    input.stock === undefined ? existing.stock : positiveInt(input.stock),
    input.shipping_fee_cents === undefined ? existing.shipping_fee_cents : cents(input.shipping_fee_cents),
    nextStatus,
    Date.now(), id, companyId,
  );
  return getProduct(id, companyId)!;
}

export function deleteProduct(companyId: string, id: string): boolean {
  const result = db().prepare(`UPDATE shop_products SET status='deleted', updated_at=? WHERE id=? AND company_id=?`)
    .run(Date.now(), id, companyId);
  return result.changes > 0;
}

export function getProduct(id: string, companyId: string): ShopProduct | null {
  const row = db().prepare('SELECT * FROM shop_products WHERE id=? AND company_id=?').get(id, companyId) as Record<string, unknown> | undefined;
  return row ? rowToProduct(row) : null;
}

/** 公开商品页：只能看到在售商品，不带公司鉴权。 */
export function getPublicProduct(id: string): ShopProduct | null {
  const row = db().prepare("SELECT * FROM shop_products WHERE id=? AND status='active'").get(id) as Record<string, unknown> | undefined;
  return row ? rowToProduct(row) : null;
}

export interface ProductStats extends ShopProduct {
  sold_qty: number;
  revenue_cents: number;
  profit_cents: number;
}

export function listProducts(companyId: string, includeDeleted = false): ShopProduct[] {
  const rows = db().prepare(`SELECT * FROM shop_products WHERE company_id=?${includeDeleted ? '' : " AND status<>'deleted'"} ORDER BY updated_at DESC`)
    .all(companyId) as Array<Record<string, unknown>>;
  return rows.map(rowToProduct);
}

/** 商品列表附带销量/营收/毛利，商家后台不用再自己算。营收不含运费（运费单独统计）。 */
export function listProductsWithStats(companyId: string): ProductStats[] {
  const products = listProducts(companyId);
  const rows = db().prepare(`SELECT product_id,
      COALESCE(SUM(quantity),0) AS qty,
      COALESCE(SUM(unit_price_cents * quantity),0) AS revenue,
      COALESCE(SUM(cost_cents * quantity),0) AS cost
    FROM shop_orders WHERE company_id=? AND status IN ('paid','shipped','delivered')
    GROUP BY product_id`).all(companyId) as Array<{ product_id: string; qty: number; revenue: number; cost: number }>;
  const byId = new Map(rows.map(row => [row.product_id, row]));
  return products.map(product => {
    const hit = byId.get(product.id);
    return {
      ...product,
      sold_qty: hit?.qty ?? 0,
      revenue_cents: hit?.revenue ?? 0,
      profit_cents: (hit?.revenue ?? 0) - (hit?.cost ?? 0),
    };
  });
}

function rowToOrder(row: Record<string, unknown>): ShopOrder {
  return {
    id: String(row.id), company_id: String(row.company_id), product_id: String(row.product_id),
    product_name: String(row.product_name ?? ''), product_image: String(row.product_image ?? ''),
    unit_price_cents: Number(row.unit_price_cents ?? 0), cost_cents: Number(row.cost_cents ?? 0),
    quantity: Number(row.quantity ?? 1), shipping_fee_cents: Number(row.shipping_fee_cents ?? 0),
    amount_cents: Number(row.amount_cents ?? 0), buyer_name: String(row.buyer_name ?? ''),
    phone: String(row.phone ?? ''), address: String(row.address ?? ''), note: String(row.note ?? ''),
    status: String(row.status ?? 'pending_payment') as ShopOrderStatus,
    tracking_company: String(row.tracking_company ?? ''), tracking_no: String(row.tracking_no ?? ''),
    tracking_note: String(row.tracking_note ?? ''),
    created_at: Number(row.created_at ?? 0),
    paid_at: row.paid_at == null ? null : Number(row.paid_at),
    shipped_at: row.shipped_at == null ? null : Number(row.shipped_at),
    delivered_at: row.delivered_at == null ? null : Number(row.delivered_at),
  };
}

export interface PublicOrderInput {
  product_id?: unknown;
  quantity?: unknown;
  buyer_name?: unknown;
  phone?: unknown;
  address?: unknown;
  note?: unknown;
}

/** 顾客下单：下单即待支付，付款（模拟）后才算成交并扣库存。 */
export function createPublicOrder(input: PublicOrderInput): ShopOrder {
  const productId = text(input.product_id, 64);
  const product = getPublicProduct(productId);
  if (!product) throw new ShopError(404, '商品不存在或已下架');
  const quantity = Math.min(Math.max(positiveInt(input.quantity, 1, 999), 1), 999);
  if (product.stock < quantity) throw new ShopError(409, '库存不足，请减少购买数量');
  const buyerName = text(input.buyer_name, 40);
  const address = text(input.address, 300);
  if (!buyerName) throw new ShopError(422, '请填写收货人');
  if (!address) throw new ShopError(422, '请填写收货地址');
  const now = Date.now();
  const id = `ord_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const amount = product.price_cents * quantity + product.shipping_fee_cents;
  db().prepare(`INSERT INTO shop_orders
    (id,company_id,product_id,product_name,product_image,unit_price_cents,cost_cents,quantity,shipping_fee_cents,amount_cents,buyer_name,phone,address,note,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_payment',?)`).run(
    id, product.company_id, product.id, product.name, product.images[0] ?? '',
    product.price_cents, product.cost_cents, quantity, product.shipping_fee_cents, amount,
    buyerName, text(input.phone, 30), address, text(input.note, 300), now,
  );
  return getOrder(id)!;
}

/** 模拟支付：点击即成功；重复支付直接返回当前订单（幂等）。 */
export function payOrder(orderId: string): ShopOrder {
  const order = getOrder(orderId);
  if (!order) throw new ShopError(404, '订单不存在');
  if (order.status === 'paid' || order.status === 'shipped' || order.status === 'delivered') return order;
  if (order.status !== 'pending_payment') throw new ShopError(409, '该订单当前不可支付');

  const conn = db();
  const tx = conn.transaction(() => {
    const product = conn.prepare('SELECT stock FROM shop_products WHERE id=?').get(order.product_id) as { stock: number } | undefined;
    if (!product) throw new ShopError(409, '商品已被删除，无法支付');
    if (product.stock < order.quantity) throw new ShopError(409, '库存不足，无法支付');
    conn.prepare('UPDATE shop_products SET stock=stock-?, updated_at=? WHERE id=?').run(order.quantity, Date.now(), order.product_id);
    conn.prepare("UPDATE shop_orders SET status='paid', paid_at=? WHERE id=?").run(Date.now(), orderId);
  });
  tx();
  return getOrder(orderId)!;
}

export function getOrder(id: string): ShopOrder | null {
  const row = db().prepare('SELECT * FROM shop_orders WHERE id=?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : null;
}

export function listOrders(companyId: string, options: { status?: string; limit?: number; offset?: number } = {}): { items: ShopOrder[]; total: number } {
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const status = options.status && options.status !== 'all' ? options.status : '';
  const where = `company_id=?${status ? ' AND status=?' : ''}`;
  const args = status ? [companyId, status] : [companyId];
  const total = (db().prepare(`SELECT COUNT(*) AS n FROM shop_orders WHERE ${where}`).get(...args) as { n: number }).n;
  const rows = db().prepare(`SELECT * FROM shop_orders WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset) as Array<Record<string, unknown>>;
  return { items: rows.map(rowToOrder), total };
}

export function shipOrder(companyId: string, id: string, input: { tracking_company?: unknown; tracking_no?: unknown; tracking_note?: unknown }): ShopOrder {
  const order = getOrder(id);
  if (!order || order.company_id !== companyId) throw new ShopError(404, '订单不存在');
  if (order.status !== 'paid') throw new ShopError(409, '只有已支付订单可以发货');
  const trackingNo = text(input.tracking_no, 60);
  if (!trackingNo) throw new ShopError(422, '请填写快递单号');
  db().prepare(`UPDATE shop_orders SET status='shipped', tracking_company=?, tracking_no=?, tracking_note=?, shipped_at=? WHERE id=? AND company_id=?`)
    .run(text(input.tracking_company, 40), trackingNo, text(input.tracking_note, 200), Date.now(), id, companyId);
  return getOrder(id)!;
}

export function deliverOrder(companyId: string, id: string): ShopOrder {
  const order = getOrder(id);
  if (!order || order.company_id !== companyId) throw new ShopError(404, '订单不存在');
  if (order.status !== 'shipped') throw new ShopError(409, '只有已发货订单可以确认完成');
  db().prepare("UPDATE shop_orders SET status='delivered', delivered_at=? WHERE id=? AND company_id=?")
    .run(Date.now(), id, companyId);
  return getOrder(id)!;
}

export function cancelOrder(companyId: string, id: string): ShopOrder {
  const order = getOrder(id);
  if (!order || order.company_id !== companyId) throw new ShopError(404, '订单不存在');
  if (order.status !== 'pending_payment') throw new ShopError(409, '只有待支付订单可以取消');
  db().prepare("UPDATE shop_orders SET status='cancelled' WHERE id=? AND company_id=?").run(id, companyId);
  return getOrder(id)!;
}

// ── 统计 ──────────────────────────────────────────────────────────────────────

const PAID_STATUSES = "('paid','shipped','delivered')";

function startOfDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export interface ShopFinance {
  currency: 'CNY';
  window_days: number;
  revenue_cents: number;
  product_cost_cents: number;
  shipping_income_cents: number;
  ai_cost_cny: number;
  gross_profit_cny: number;
  order_count: number;
  paid_order_count: number;
  pending_ship_count: number;
  avg_order_cny: number;
  series: Array<{ day: number; revenue_cents: number; profit_cny: number; orders: number }>;
}

export function shopFinance(companyId: string, days = 30): ShopFinance {
  const windowDays = Math.min(Math.max(Math.round(days) || 30, 1), 365);
  const now = Date.now();
  const from = now - windowDays * DAY_MS;
  const conn = db();
  const totals = conn.prepare(`SELECT
      COALESCE(SUM(unit_price_cents * quantity),0) AS revenue,
      COALESCE(SUM(cost_cents * quantity),0) AS cost,
      COALESCE(SUM(shipping_fee_cents),0) AS shipping,
      COUNT(*) AS orders
    FROM shop_orders WHERE company_id=? AND status IN ${PAID_STATUSES} AND created_at>=?`).get(companyId, from) as
    { revenue: number; cost: number; shipping: number; orders: number };
  const allOrders = (conn.prepare('SELECT COUNT(*) AS n FROM shop_orders WHERE company_id=? AND created_at>=?')
    .get(companyId, from) as { n: number }).n;
  const pendingShip = (conn.prepare("SELECT COUNT(*) AS n FROM shop_orders WHERE company_id=? AND status='paid'")
    .get(companyId) as { n: number }).n;
  const ai = conn.prepare('SELECT COALESCE(SUM(cost_est_cny),0) AS cny FROM token_usage WHERE company_id=? AND ts>=?')
    .get(companyId, from) as { cny: number };
  const aiCostCny = Math.round((ai.cny ?? 0) * 100) / 100;

  const rows = conn.prepare(`SELECT created_at, unit_price_cents * quantity AS revenue_cents, cost_cents, quantity FROM shop_orders
    WHERE company_id=? AND status IN ${PAID_STATUSES} AND created_at>=? ORDER BY created_at`).all(companyId, from) as
    Array<{ created_at: number; revenue_cents: number; cost_cents: number; quantity: number }>;
  const buckets = new Map<number, { revenue_cents: number; cost_cents: number; orders: number }>();
  for (let day = startOfDay(from); day <= startOfDay(now); day += DAY_MS) {
    buckets.set(day, { revenue_cents: 0, cost_cents: 0, orders: 0 });
  }
  for (const row of rows) {
    const day = startOfDay(row.created_at);
    const bucket = buckets.get(day);
    if (!bucket) continue;
    bucket.revenue_cents += row.revenue_cents;
    bucket.cost_cents += row.cost_cents * row.quantity;
    bucket.orders += 1;
  }
  const series = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([day, value]) => ({
    day,
    revenue_cents: value.revenue_cents,
    profit_cny: Math.round((value.revenue_cents - value.cost_cents) / 100) / 100,
    orders: value.orders,
  }));

  const revenueCny = totals.revenue / 100;
  const costCny = totals.cost / 100;
  return {
    currency: 'CNY',
    window_days: windowDays,
    revenue_cents: totals.revenue,
    product_cost_cents: totals.cost,
    shipping_income_cents: totals.shipping,
    ai_cost_cny: aiCostCny,
    gross_profit_cny: Math.round((revenueCny - costCny - aiCostCny) * 100) / 100,
    order_count: allOrders,
    paid_order_count: totals.orders,
    pending_ship_count: pendingShip,
    avg_order_cny: totals.orders ? Math.round((revenueCny / totals.orders) * 100) / 100 : 0,
    series,
  };
}

export interface ShopSales {
  window_days: number;
  paid_orders: number;
  units_sold: number;
  revenue_cents: number;
  profit_cents: number;
  status_counts: Record<string, number>;
  top_products: Array<{ product_id: string; name: string; units: number; revenue_cents: number; profit_cents: number }>;
  series: Array<{ day: number; orders: number; units: number; revenue_cents: number }>;
}

export function shopSales(companyId: string, days = 30): ShopSales {
  const windowDays = Math.min(Math.max(Math.round(days) || 30, 1), 365);
  const now = Date.now();
  const from = now - windowDays * DAY_MS;
  const conn = db();
  const totals = conn.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(quantity),0) AS units,
      COALESCE(SUM(unit_price_cents * quantity),0) AS revenue, COALESCE(SUM(cost_cents*quantity),0) AS cost
    FROM shop_orders WHERE company_id=? AND status IN ${PAID_STATUSES} AND created_at>=?`)
    .get(companyId, from) as { orders: number; units: number; revenue: number; cost: number };
  const statusRows = conn.prepare('SELECT status, COUNT(*) AS n FROM shop_orders WHERE company_id=? GROUP BY status')
    .all(companyId) as Array<{ status: string; n: number }>;
  const statusCounts: Record<string, number> = {};
  for (const row of statusRows) statusCounts[row.status] = row.n;
  const top = conn.prepare(`SELECT product_id, product_name AS name, COALESCE(SUM(quantity),0) AS units,
      COALESCE(SUM(unit_price_cents * quantity),0) AS revenue, COALESCE(SUM(cost_cents*quantity),0) AS cost
    FROM shop_orders WHERE company_id=? AND status IN ${PAID_STATUSES} AND created_at>=?
    GROUP BY product_id, product_name ORDER BY revenue DESC LIMIT 10`).all(companyId, from) as
    Array<{ product_id: string; name: string; units: number; revenue: number; cost: number }>;
  const rows = conn.prepare(`SELECT created_at, quantity, unit_price_cents * quantity AS revenue_cents FROM shop_orders
    WHERE company_id=? AND status IN ${PAID_STATUSES} AND created_at>=? ORDER BY created_at`).all(companyId, from) as
    Array<{ created_at: number; quantity: number; revenue_cents: number }>;
  const buckets = new Map<number, { orders: number; units: number; revenue_cents: number }>();
  for (let day = startOfDay(from); day <= startOfDay(now); day += DAY_MS) buckets.set(day, { orders: 0, units: 0, revenue_cents: 0 });
  for (const row of rows) {
    const bucket = buckets.get(startOfDay(row.created_at));
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.units += row.quantity;
    bucket.revenue_cents += row.revenue_cents;
  }
  return {
    window_days: windowDays,
    paid_orders: totals.orders,
    units_sold: totals.units,
    revenue_cents: totals.revenue,
    profit_cents: totals.revenue - totals.cost,
    status_counts: statusCounts,
    top_products: top.map(row => ({
      product_id: row.product_id, name: row.name, units: row.units,
      revenue_cents: row.revenue, profit_cents: row.revenue - row.cost,
    })),
    series: [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([day, value]) => ({ day, ...value })),
  };
}

// ── AI 商品变更审批 ───────────────────────────────────────────────────────────

function rowToChange(row: Record<string, unknown>): ShopChangeRequest {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.payload_json ?? '{}')) as unknown;
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
  } catch { /* 损坏的载荷按空处理。 */ }
  return {
    id: String(row.id), company_id: String(row.company_id), conversation_id: String(row.conversation_id ?? ''),
    action: String(row.action) as ShopChangeRequest['action'], product_id: String(row.product_id ?? ''),
    payload, summary: String(row.summary ?? ''),
    status: String(row.status ?? 'pending') as ShopChangeRequest['status'],
    created_at: Number(row.created_at ?? 0), decided_at: row.decided_at == null ? null : Number(row.decided_at),
  };
}

export function createChangeRequest(input: {
  companyId: string;
  conversationId?: string;
  action: 'create' | 'update' | 'delete';
  productId?: string;
  payload: ProductInput;
  summary: string;
}): ShopChangeRequest {
  const id = `chg_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  db().prepare(`INSERT INTO shop_change_requests
    (id,company_id,conversation_id,action,product_id,payload_json,summary,status,created_at)
    VALUES (?,?,?,?,?,?,?,'pending',?)`).run(
    id, input.companyId, input.conversationId ?? '', input.action, input.productId ?? '',
    JSON.stringify(input.payload ?? {}), input.summary.slice(0, 500), Date.now(),
  );
  return getChangeRequest(id, input.companyId)!;
}

export function getChangeRequest(id: string, companyId: string): ShopChangeRequest | null {
  const row = db().prepare('SELECT * FROM shop_change_requests WHERE id=? AND company_id=?').get(id, companyId) as Record<string, unknown> | undefined;
  return row ? rowToChange(row) : null;
}

export function listChangeRequests(companyId: string, status = ''): ShopChangeRequest[] {
  const rows = db().prepare(`SELECT * FROM shop_change_requests WHERE company_id=?${status ? ' AND status=?' : ''} ORDER BY created_at DESC LIMIT 100`)
    .all(...(status ? [companyId, status] : [companyId])) as Array<Record<string, unknown>>;
  return rows.map(rowToChange);
}

/** 批准后真正落到商品表；重复批准返回 409，避免重复上架。 */
export function decideChangeRequest(companyId: string, id: string, decision: 'approve' | 'reject'): { request: ShopChangeRequest; product: ShopProduct | null } {
  const request = getChangeRequest(id, companyId);
  if (!request) throw new ShopError(404, '审批记录不存在');
  if (request.status !== 'pending') throw new ShopError(409, '该审批已处理');
  const conn = db();
  let product: ShopProduct | null = null;
  // 应用与状态更新放在同一事务：非法商品数据会让整笔回滚，审批保持待处理。
  const tx = conn.transaction(() => {
    if (decision === 'approve') {
      if (request.action === 'create') product = createProduct(companyId, request.payload);
      else if (request.action === 'update') product = updateProduct(companyId, request.product_id, request.payload);
      else if (request.action === 'delete') deleteProduct(companyId, request.product_id);
    }
    conn.prepare("UPDATE shop_change_requests SET status=?, decided_at=? WHERE id=? AND company_id=? AND status='pending'")
      .run(decision === 'approve' ? 'approved' : 'rejected', Date.now(), id, companyId);
  });
  tx();
  return { request: getChangeRequest(id, companyId)!, product };
}

/** 给「商品变更审批」用的可读摘要，避免前端重复拼装。 */
export function describeProductChange(action: 'create' | 'update' | 'delete', payload: ProductInput, productName?: string): string {
  const name = productName || text(payload.name, 80) || '商品';
  const priceCents = payload.price_cents === undefined ? null : cents(payload.price_cents);
  if (action === 'create') {
    if (!priceCents) return `上架商品「${name}」（未填售价，先存为下架草稿）`;
    return `上架商品「${name}」，售价 ¥${(priceCents / 100).toFixed(2)}`;
  }
  if (action === 'delete') return `下架并删除商品「${name}」`;
  const parts: string[] = [];
  if (priceCents !== null) parts.push(`售价 ¥${(priceCents / 100).toFixed(2)}`);
  if (payload.stock !== undefined) parts.push(`库存 ${positiveInt(payload.stock)}`);
  if (payload.description !== undefined) parts.push('更新商品介绍');
  if (payload.images !== undefined) parts.push('更新宣传图');
  return `修改商品「${name}」${parts.length ? `：${parts.join('、')}` : ''}`;
}
