/**
 * shop.ts — 小商品店铺路由（/api/shop）。
 *
 * 管理端（需登录，按公司隔离）：
 *   GET    /products            商品列表（含销量/营收/毛利）
 *   POST   /products            添加商品
 *   PATCH  /products/:id        编辑商品
 *   DELETE /products/:id        删除商品（软删）
 *   GET    /orders              订单列表（status/分页）
 *   POST   /orders/:id/ship     发货（填快递公司与单号）
 *   POST   /orders/:id/deliver  确认完成
 *   POST   /orders/:id/cancel   取消待支付订单
 *   GET    /stats/finance       公司财务（营收/商品成本/AI 成本/毛利 + 按天）
 *   GET    /stats/sales         商品销售统计（件数/营收/毛利/商品排行/状态分布）
 *   GET    /changes             商品变更审批列表
 *   POST   /changes/:id/approve 批准并应用变更
 *   POST   /changes/:id/reject  驳回变更
 *
 * 公开端（顾客扫码，无需登录）：
 *   GET    /public/products/:id 商品介绍
 *   POST   /public/orders       下单（待支付）
 *   POST   /public/orders/:id/pay  模拟支付（点即成功）
 *   GET    /public/orders/:id   订单状态
 *
 * 注意：字面量路径都注册在 /:id 之前，避免 Express 把 "public" 当成商品 id。
 */

import { Router, type Request, type Response } from 'express';
import { OpcChatError, opcChatCompany } from '../services/opc-chat';
import {
  ShopError,
  cancelOrder,
  createProduct,
  createPublicOrder,
  decideChangeRequest,
  deleteProduct,
  deliverOrder,
  getOrder,
  getPublicProduct,
  listChangeRequests,
  listOrders,
  listProductsWithStats,
  payOrder,
  shipOrder,
  shopFinance,
  shopSales,
  updateProduct,
  type ProductInput,
} from '../storage/shop';

const router = Router();

function fail(res: Response, error: unknown): void {
  if (error instanceof ShopError) {
    res.status(error.status).json({ error: { code: 'SHOP_ERROR', message: error.message } });
    return;
  }
  if (error instanceof OpcChatError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  res.status(500).json({ error: { code: 'SHOP_INTERNAL', message: error instanceof Error ? error.message : String(error) } });
}

const body = (req: Request): Record<string, unknown> => (req.body ?? {}) as Record<string, unknown>;

async function companyId(req: Request): Promise<string> {
  return (await opcChatCompany(req.headers.authorization || '')).id;
}

function productInput(raw: Record<string, unknown>): ProductInput {
  return {
    name: raw.name, summary: raw.summary, description: raw.description, images: raw.images,
    price_cents: raw.price_cents, cost_cents: raw.cost_cents, market_price_cents: raw.market_price_cents,
    stock: raw.stock, shipping_fee_cents: raw.shipping_fee_cents, status: raw.status,
  };
}

// ── 管理端 ────────────────────────────────────────────────────────────────────

router.get('/products', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.json({ items: listProductsWithStats(company) });
  })().catch(error => fail(res, error));
});

router.post('/products', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.status(201).json({ product: createProduct(company, productInput(body(req))) });
  })().catch(error => fail(res, error));
});

router.patch('/products/:id', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.json({ product: updateProduct(company, req.params.id, productInput(body(req))) });
  })().catch(error => fail(res, error));
});

router.delete('/products/:id', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    if (!deleteProduct(company, req.params.id)) throw new ShopError(404, '商品不存在');
    res.json({ ok: true });
  })().catch(error => fail(res, error));
});

router.get('/orders', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.json(listOrders(company, {
      status: typeof req.query.status === 'string' ? req.query.status : '',
      limit: Number(req.query.limit),
      offset: Number(req.query.offset),
    }));
  })().catch(error => fail(res, error));
});

router.post('/orders/:id/ship', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    const b = body(req);
    res.json({ order: shipOrder(company, req.params.id, {
      tracking_company: b.tracking_company, tracking_no: b.tracking_no, tracking_note: b.tracking_note,
    }) });
  })().catch(error => fail(res, error));
});

router.post('/orders/:id/deliver', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.json({ order: deliverOrder(company, req.params.id) });
  })().catch(error => fail(res, error));
});

router.post('/orders/:id/cancel', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.json({ order: cancelOrder(company, req.params.id) });
  })().catch(error => fail(res, error));
});

router.get('/stats/finance', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.json(shopFinance(company, Number(req.query.days) || 30));
  })().catch(error => fail(res, error));
});

router.get('/stats/sales', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.json(shopSales(company, Number(req.query.days) || 30));
  })().catch(error => fail(res, error));
});

router.get('/changes', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.json({ items: listChangeRequests(company, typeof req.query.status === 'string' ? req.query.status : '') });
  })().catch(error => fail(res, error));
});

router.post('/changes/:id/approve', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.json(decideChangeRequest(company, req.params.id, 'approve'));
  })().catch(error => fail(res, error));
});

router.post('/changes/:id/reject', (req, res) => {
  void (async () => {
    const company = await companyId(req);
    res.json(decideChangeRequest(company, req.params.id, 'reject'));
  })().catch(error => fail(res, error));
});

// ── 公开端（扫码购物页） ──────────────────────────────────────────────────────

router.get('/public/products/:id', (req, res) => {
  try {
    const product = getPublicProduct(req.params.id);
    if (!product) throw new ShopError(404, '商品不存在或已下架');
    // 公开页不暴露公司 id / 成本。
    res.json({
      product: {
        id: product.id, name: product.name, summary: product.summary, description: product.description,
        images: product.images, price_cents: product.price_cents, market_price_cents: product.market_price_cents,
        stock: product.stock, shipping_fee_cents: product.shipping_fee_cents,
      },
    });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/public/orders', (req, res) => {
  try {
    const b = body(req);
    const order = createPublicOrder({
      product_id: b.product_id, quantity: b.quantity, buyer_name: b.buyer_name,
      phone: b.phone, address: b.address, note: b.note,
    });
    res.status(201).json({ order: publicOrderView(order.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/public/orders/:id/pay', (req, res) => {
  try {
    const order = payOrder(req.params.id);
    res.json({ order: publicOrderView(order.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/public/orders/:id', (req, res) => {
  try {
    const order = getOrder(req.params.id);
    if (!order) throw new ShopError(404, '订单不存在');
    res.json({ order: publicOrderView(order.id) });
  } catch (error) {
    fail(res, error);
  }
});

/** 顾客侧只看得到自己需要的字段，不返回公司/成本/内部备注。 */
function publicOrderView(id: string) {
  const order = getOrder(id);
  if (!order) throw new ShopError(404, '订单不存在');
  return {
    id: order.id, product_name: order.product_name, product_image: order.product_image,
    quantity: order.quantity, amount_cents: order.amount_cents, status: order.status,
    buyer_name: order.buyer_name, address: order.address, tracking_company: order.tracking_company,
    tracking_no: order.tracking_no, tracking_note: order.tracking_note,
    created_at: order.created_at, paid_at: order.paid_at, shipped_at: order.shipped_at,
  };
}

export default router;
