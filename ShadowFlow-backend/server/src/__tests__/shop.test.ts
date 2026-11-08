/* 小商品店铺：商品 / 下单支付 / 发货 / 统计 / AI 变更审批。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _resetForTests, getDb } from '../storage/sqlite';
import {
  ShopError,
  createChangeRequest,
  createProduct,
  createPublicOrder,
  decideChangeRequest,
  deliverOrder,
  getOrder,
  listChangeRequests,
  listOrders,
  listProductsWithStats,
  payOrder,
  shipOrder,
  shopFinance,
  shopSales,
  updateProduct,
} from '../storage/shop';
import { executeShopTool } from '../services/opc-shop-tools';
import { createOpcConversation } from '../storage/opc-chat';
import shopRouter from '../routes/shop';

const originalCwd = process.cwd();
let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sf-shop-'));
  process.chdir(dir);
  _resetForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetForTests();
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

function product(companyId = 'co1') {
  return createProduct(companyId, {
    name: '桌面收纳盒', summary: '小体积大容量', description: 'ABS 材质，三色可选。',
    price_cents: 2900, cost_cents: 900, market_price_cents: 4500, stock: 10,
    shipping_fee_cents: 600, images: ['https://example.com/a.png'],
  });
}

describe('商品与订单', () => {
  it('商品可增改删，列表带销量与毛利；公司之间互不可见', () => {
    const created = product('co1');
    product('co2');
    expect(listProductsWithStats('co1')).toHaveLength(1);
    expect(listProductsWithStats('co2')).toHaveLength(1);

    const updated = updateProduct('co1', created.id, { price_cents: 3500, stock: 5 });
    expect(updated.price_cents).toBe(3500);
    expect(updated.stock).toBe(5);
    expect(() => updateProduct('co2', created.id, { price_cents: 1 })).toThrowError(ShopError);
  });

  it('公开下单 → 模拟支付才扣库存 → 发货 → 完成', () => {
    const created = product();
    const order = createPublicOrder({
      product_id: created.id, quantity: 2, buyer_name: '张三',
      phone: '13800000000', address: '上海市浦东新区 1 号', note: '放门口',
    });
    expect(order.status).toBe('pending_payment');
    expect(order.amount_cents).toBe(2900 * 2 + 600);
    expect(listProductsWithStats('co1')[0].stock).toBe(10);

    const paid = payOrder(order.id);
    expect(paid.status).toBe('paid');
    expect(listProductsWithStats('co1')[0].stock).toBe(8);
    // 幂等：重复支付不重复扣库存
    expect(payOrder(order.id).status).toBe('paid');
    expect(listProductsWithStats('co1')[0].stock).toBe(8);

    expect(() => shipOrder('co1', order.id, { tracking_no: '' })).toThrowError(ShopError);
    const shipped = shipOrder('co1', order.id, { tracking_company: '顺丰', tracking_no: 'SF123', tracking_note: '已揽收' });
    expect(shipped.status).toBe('shipped');
    expect(shipped.tracking_no).toBe('SF123');
    expect(deliverOrder('co1', order.id).status).toBe('delivered');
    expect(() => shipOrder('co2', order.id, { tracking_no: 'X' })).toThrowError(ShopError);
  });

  it('库存不足时拒绝下单', () => {
    const created = product();
    expect(() => createPublicOrder({ product_id: created.id, quantity: 99, buyer_name: '李四', address: '北京' }))
      .toThrowError(expect.objectContaining({ status: 409 }));
  });

  it('财务与销售统计口径一致', () => {
    const created = product();
    const order = createPublicOrder({ product_id: created.id, quantity: 2, buyer_name: '王五', address: '杭州' });
    payOrder(order.id);
    // 一笔 AI 成本，进入公司财务
    getDb().prepare(`INSERT INTO token_usage
      (id,ts,company_id,session_id,model,input_tokens,cached_input_tokens,output_tokens,cost_est_usd,cost_est_cny,pricing_status)
      VALUES ('u1',?,?, 's','mimo-v2.6-pro',100,0,50,0,1.5,'official')`).run(Date.now(), 'co1');
    getDb().prepare(`INSERT INTO token_usage
      (id,ts,company_id,session_id,model,input_tokens,cached_input_tokens,output_tokens,cost_est_usd,cost_est_cny,pricing_status)
      VALUES ('u2',?,?, 's','mimo-v2.6-pro',100,0,50,0,9.9,'official')`).run(Date.now(), 'co2');

    const finance = shopFinance('co1');
    // 营收按商品实收（不含运费），运费单独列；毛利再扣 AI 成本。
    expect(finance.revenue_cents).toBe(2900 * 2);
    expect(finance.shipping_income_cents).toBe(600);
    expect(finance.product_cost_cents).toBe(900 * 2);
    expect(finance.ai_cost_cny).toBe(1.5);
    expect(finance.gross_profit_cny).toBe(38.5);
    expect(finance.paid_order_count).toBe(1);

    const sales = shopSales('co1');
    expect(sales.units_sold).toBe(2);
    expect(sales.top_products[0]).toMatchObject({ name: '桌面收纳盒', units: 2, revenue_cents: 5800 });
    expect(sales.series.length).toBeGreaterThan(0);
  });
});

describe('AI 商品变更审批', () => {
  it('员工只能提交变更申请，批准后才真正上架', () => {
    const result = executeShopTool({
      companyId: 'co1', conversationId: 'conv-1', name: 'shop_propose_change',
      input: { action: 'create', name: '手工香薰蜡烛', price_yuan: 59, cost_yuan: 18, stock: 20, summary: '小众香型' },
    });
    const output = result.output as { status: string; change_id: string; summary: string };
    expect(result.isError).toBe(false);
    expect(output.status).toBe('pending_approval');
    expect(output.summary).toContain('上架商品「手工香薰蜡烛」');
    // 未批准前商品不存在
    expect(listProductsWithStats('co1')).toHaveLength(0);
    expect(listChangeRequests('co1', 'pending')).toHaveLength(1);

    const approved = decideChangeRequest('co1', output.change_id, 'approve');
    expect(approved.request.status).toBe('approved');
    expect(approved.product?.name).toBe('手工香薰蜡烛');
    expect(listProductsWithStats('co1')).toHaveLength(1);
    expect(() => decideChangeRequest('co1', output.change_id, 'approve')).toThrowError(ShopError);
  });

  it('驳回不落商品；跨公司不可批准', () => {
    const request = createChangeRequest({
      companyId: 'co1', action: 'create', payload: { name: '测试品', price_cents: 100 }, summary: '上架测试品',
    });
    expect(() => decideChangeRequest('co2', request.id, 'approve')).toThrowError(ShopError);
    decideChangeRequest('co1', request.id, 'reject');
    expect(listProductsWithStats('co1')).toHaveLength(0);
    expect(listChangeRequests('co1')[0].status).toBe('rejected');
  });

  it('修改与删除同样走审批', () => {
    const created = product();
    const update = executeShopTool({
      companyId: 'co1', name: 'shop_propose_change',
      input: { action: 'update', product_id: created.id, price_yuan: 19.9, stock: 3 },
    });
    const updateOut = update.output as { change_id: string };
    decideChangeRequest('co1', updateOut.change_id, 'approve');
    const afterUpdate = listProductsWithStats('co1')[0];
    expect(afterUpdate.price_cents).toBe(1990);
    expect(afterUpdate.stock).toBe(3);

    const remove = executeShopTool({
      companyId: 'co1', name: 'shop_propose_change',
      input: { action: 'delete', product_id: created.id },
    });
    decideChangeRequest('co1', (remove.output as { change_id: string }).change_id, 'approve');
    expect(listProductsWithStats('co1')).toHaveLength(0);
  });

  it('没有确认售价时上架为草稿，批准后是下架状态、可再补价', () => {
    const result = executeShopTool({
      companyId: 'co1', name: 'shop_propose_change',
      input: { action: 'create', name: '待定价样品', summary: '先占位', stock: 5 },
    });
    const output = result.output as { status: string; change_id: string; summary: string; draft: boolean };
    expect(result.isError).toBe(false);
    expect(output.draft).toBe(true);
    expect(output.summary).toContain('未填售价');
    decideChangeRequest('co1', output.change_id, 'approve');
    const product = listProductsWithStats('co1')[0];
    expect(product.status).toBe('offline');
    expect(product.price_cents).toBe(0);
    // 补价并上架后才可以卖
    updateProduct('co1', product.id, { price_cents: 990, status: 'active' });
    expect(listProductsWithStats('co1')[0]).toMatchObject({ price_cents: 990, status: 'active' });
  });

  it('字段名宽容：price / cost / intro 等别名都能识别', () => {
    const result = executeShopTool({
      companyId: 'co1', name: 'shop_propose_change',
      input: { action: 'create', title: '别名商品', price: '19.9', cost: 6, intro: '介绍', inventory: 8 },
    });
    expect(result.isError).toBe(false);
    const request = listChangeRequests('co1', 'pending')[0];
    expect(request.payload).toMatchObject({ name: '别名商品', price_cents: 1990, cost_cents: 600, stock: 8 });
  });

  it('商品介绍不接受内部工单/交接文档', () => {
    const result = executeShopTool({
      companyId: 'co1', name: 'shop_propose_change',
      input: {
        action: 'create', name: '降噪耳机', price_yuan: 199,
        description: '【内部上架变更申请·待老板审批】一、商品类目与基础信息（依据：调研纪要）',
      },
    });
    expect(result.isError).toBe(true);
    const output = result.output as { error: string; retry_hint: string };
    expect(output.error).toContain('内部工单');
    expect(output.retry_hint).toContain('顾客');
    expect(listChangeRequests('co1')).toHaveLength(0);
  });

  it('对话里上架会插入商品变更审批卡，且不再叠一层任务审批', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/opc/auth/me')) return Response.json({ company: { id: 'co1', name: '测试公司' } });
      return Response.json({ items: [{ id: 'e1', name: '运营', title: '电商运营', tools: [], status: 'idle' }] });
    }));
    const { runOpcChatTurn } = await import('../services/opc-chat');
    const { listOpcMessages } = await import('../storage/opc-chat');
    const conversation = createOpcConversation('co1', 'single');
    const events: Array<{ type: string }> = [];
    const callImpl = async function* (_provider: string, input: { systemPrompt: string; messages?: Array<{ role: string; blocks: Array<{ kind: string; output?: string }> }> }) {
      if (input.systemPrompt.includes('编排者')) {
        yield { type: 'text-delta' as const, text: JSON.stringify({ intent: 'task', strategy: 'expert', tasks: [
          // 即使规划器把上架任务标成需要审批，也会因为「商品变更审批」已覆盖而不重复拦。
          { agentId: 'e1', title: '上架新款耳机', prompt: '把新款降噪耳机上架到店铺', requires_approval: true },
        ] }) };
        return;
      }
      if (input.systemPrompt.includes('汇总员工')) { yield { type: 'text-delta' as const, text: '已提交上架审批' }; return; }
      const toolMessage = input.messages?.find(message => message.role === 'tool');
      if (!toolMessage) {
        yield { type: 'tool-use' as const, id: 'call-shop', name: 'shop_propose_change', input: {
          action: 'create', name: '新款降噪耳机', price_yuan: 199, cost_yuan: 80, stock: 10,
          description: '主动降噪，续航 30 小时，通勤办公两用。',
        } };
        return;
      }
      yield { type: 'text-delta' as const, text: '已提交上架审批，等待老板批准。' };
    };
    const result = await runOpcChatTurn({
      conversationId: conversation.id, companyId: 'co1', content: '把新款降噪耳机上架',
      authorization: 'Bearer test', config: { provider: 'openai', model: 'test', apiKey: 'test' },
      callImpl, onEvent: event => events.push(event),
    });
    // 没有任务级 approval 事件；商品变更走自己的审批。
    expect(events.some(event => event.type === 'approval')).toBe(false);
    expect(events.some(event => event.type === 'shop-change')).toBe(true);
    expect(result.messages.some(message => message.status === 'done')).toBe(true);
    const card = listOpcMessages(conversation.id).find(message => message.metadata_json?.includes('"shopChange"'));
    expect(card?.metadata_json).toContain('新款降噪耳机');
    expect(listChangeRequests('co1', 'pending')).toHaveLength(1);
  });

  it('列表工具返回真实商品与毛利', () => {
    const created = product();
    const order = createPublicOrder({ product_id: created.id, quantity: 1, buyer_name: '赵六', address: '成都' });
    payOrder(order.id);
    const result = executeShopTool({ companyId: 'co1', name: 'shop_list_products', input: {} });
    const output = result.output as { items: Array<{ id: string; sold_qty: number; profit_yuan: number }> };
    expect(output.items[0]).toMatchObject({ id: created.id, sold_qty: 1, profit_yuan: 20 });
  });

  it('对话里的员工调用店铺工具 → 生成待审批变更，而不是直接改商品', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/opc/auth/me')) return Response.json({ company: { id: 'co1', name: '测试公司' } });
      return Response.json({ items: [{ id: 'e1', name: '运营', title: '电商运营', tools: [], status: 'idle' }] });
    }));
    const { runOpcChatTurn } = await import('../services/opc-chat');
    const conversation = createOpcConversation('co1', 'single');
    let toolResult = '';
    const callImpl = async function* (_provider: string, input: { systemPrompt: string; messages?: Array<{ role: string; blocks: Array<{ kind: string; output?: string }> }> }) {
      if (input.systemPrompt.includes('编排者')) {
        yield { type: 'text-delta' as const, text: JSON.stringify({ intent: 'task', strategy: 'expert', tasks: [
          { agentId: 'e1', title: '上架新品', prompt: '把手工香薰蜡烛上架到店铺' },
        ] }) };
        return;
      }
      if (input.systemPrompt.includes('汇总员工')) {
        yield { type: 'text-delta' as const, text: '已提交老板审批' };
        return;
      }
      const toolMessage = input.messages?.find(message => message.role === 'tool');
      if (!toolMessage) {
        yield { type: 'tool-use' as const, id: 'call-shop', name: 'shop_propose_change', input: {
          action: 'create', name: '手工香薰蜡烛', price_yuan: 59, cost_yuan: 18, stock: 20,
        } };
        return;
      }
      toolResult = toolMessage.blocks.map(block => block.output ?? '').join('');
      yield { type: 'text-delta' as const, text: '已提交老板审批' };
    };
    await runOpcChatTurn({
      conversationId: conversation.id, companyId: 'co1', content: '上架手工香薰蜡烛',
      authorization: 'Bearer test', config: { provider: 'openai', model: 'test', apiKey: 'test' }, callImpl,
    });
    expect(toolResult).toContain('pending_approval');
    // 员工没有直接建商品，只留下一条待审批变更。
    expect(listProductsWithStats('co1')).toHaveLength(0);
    const pending = listChangeRequests('co1', 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ action: 'create', conversation_id: conversation.id });
    expect(pending[0].summary).toContain('手工香薰蜡烛');
  });
});

describe('店铺路由', () => {
  it('公开商品页与下单支付无需登录，管理接口需要登录', async () => {
    const created = product();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ company: { id: 'co1', name: '测试公司' } })));
    const app = express();
    app.use(express.json());
    app.use('/api/shop', shopRouter);

    const pub = await request(app).get(`/api/shop/public/products/${created.id}`).expect(200);
    expect(pub.body.product).toMatchObject({ name: '桌面收纳盒', price_cents: 2900 });
    expect(pub.body.product.company_id).toBeUndefined();
    expect(pub.body.product.cost_cents).toBeUndefined();

    const order = await request(app).post('/api/shop/public/orders').send({
      product_id: created.id, quantity: 1, buyer_name: '顾客', address: '南京',
    }).expect(201);
    const paid = await request(app).post(`/api/shop/public/orders/${order.body.order.id}/pay`).expect(200);
    expect(paid.body.order.status).toBe('paid');

    await request(app).get('/api/shop/products').expect(401);
    const admin = await request(app).get('/api/shop/products').set('Authorization', 'Bearer co1').expect(200);
    expect(admin.body.items).toHaveLength(1);
    expect(admin.body.items[0].sold_qty).toBe(1);
    const orders = await request(app).get('/api/shop/orders').set('Authorization', 'Bearer co1').expect(200);
    expect(orders.body.items).toHaveLength(1);
    expect(orders.body.items[0].address).toBe('南京');
  });
});
