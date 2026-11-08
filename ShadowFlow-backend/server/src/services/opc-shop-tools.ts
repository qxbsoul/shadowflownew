/**
 * opc-shop-tools.ts — 让员工在对话里查看/变更店铺商品的工具定义。
 *
 * 设计约束：员工不能直接改商品。任何上架/改价/改图/删除都必须落成
 * 「商品变更审批」，由老板在「人工审批」里批准后才真正生效。
 *
 * 输入宽容度：模型常见的字段名差异（price / price_yuan / price_cents…）都在
 * 这里归一，缺字段时返回明确的可重试提示，避免一句话没说清就整单失败。
 */

import type { ToolSpec } from '../lib/tool-spec';
import {
  ShopError,
  createChangeRequest,
  describeProductChange,
  listProductsWithStats,
  type ProductInput,
} from '../storage/shop';

export const SHOP_TOOL_NAMES = ['shop_list_products', 'shop_propose_change'] as const;

export function shopTools(): ToolSpec[] {
  return [
    {
      name: 'shop_list_products',
      description:
        '查看本公司店铺商品列表（id、名称、售价、成本、库存、销量、毛利）。'
        + '需要修改或删除某个商品前，先调用它拿到 product_id。',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
      source: 'base',
    },
    {
      name: 'shop_propose_change',
      description:
        '提交商品变更申请（上架/改价/改库存/改介绍/下架删除）。不会立即生效：必须等老板在人工审批里批准。'
        + '价格一律用元。上架时如果还没有确认售价，可以不填 price_yuan，商品会先以“下架草稿”提交，'
        + '由老板批准后补价格，不要为了凑字段编造价格。',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'delete'], description: 'create=上架新商品，update=修改，delete=删除' },
          product_id: { type: 'string', description: 'update/delete 时的商品 id（先用 shop_list_products 查）' },
          name: { type: 'string', description: '商品名称（create 必填）' },
          summary: { type: 'string', description: '一句话卖点，展示在商品卡上' },
          description: { type: 'string', description: '商品详细介绍（正文）' },
          price_yuan: { type: 'number', description: '售价（元）。create 时可留空表示先存草稿' },
          cost_yuan: { type: 'number', description: '进货成本（元），用于毛利统计' },
          market_price_yuan: { type: 'number', description: '市场参考价（元），用于比价展示' },
          stock: { type: 'number', description: '库存件数' },
          shipping_fee_yuan: { type: 'number', description: '运费（元）' },
          images: { type: 'array', items: { type: 'string' }, description: '宣传图 URL 列表（可选）' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      source: 'base',
    },
  ];
}

function firstDefined(input: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') return input[key];
  }
  return undefined;
}

/** 金额统一元→分；也接受显式的 *_cents。 */
function moneyToCents(value: unknown, alreadyCents = false): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return alreadyCents ? Math.round(n) : Math.round(n * 100);
}

function payloadFromInput(input: Record<string, unknown>): ProductInput {
  const payload: ProductInput = {};
  const name = firstDefined(input, ['name', 'title']);
  if (typeof name === 'string') payload.name = name;
  const summary = firstDefined(input, ['summary', 'slogan', 'tagline']);
  if (typeof summary === 'string') payload.summary = summary;
  const description = firstDefined(input, ['description', 'intro', 'detail', 'details']);
  if (typeof description === 'string') payload.description = description;
  const images = firstDefined(input, ['images', 'image']);
  if (Array.isArray(images)) payload.images = images;
  else if (typeof images === 'string' && images.trim()) payload.images = [images];

  const priceCents = firstDefined(input, ['price_cents']);
  payload.price_cents = priceCents !== undefined
    ? moneyToCents(priceCents, true)
    : moneyToCents(firstDefined(input, ['price_yuan', 'price', 'sale_price_yuan', 'sale_price']));
  const costCents = firstDefined(input, ['cost_cents']);
  payload.cost_cents = costCents !== undefined
    ? moneyToCents(costCents, true)
    : moneyToCents(firstDefined(input, ['cost_yuan', 'cost', 'purchase_price_yuan']));
  const marketCents = firstDefined(input, ['market_price_cents']);
  payload.market_price_cents = marketCents !== undefined
    ? moneyToCents(marketCents, true)
    : moneyToCents(firstDefined(input, ['market_price_yuan', 'market_price', 'list_price_yuan']));
  const stock = firstDefined(input, ['stock', 'inventory', 'quantity']);
  if (stock !== undefined) payload.stock = stock;
  const shippingCents = firstDefined(input, ['shipping_fee_cents']);
  payload.shipping_fee_cents = shippingCents !== undefined
    ? moneyToCents(shippingCents, true)
    : moneyToCents(firstDefined(input, ['shipping_fee_yuan', 'shipping_fee', 'shipping']));
  return payload;
}

/** 执行店铺类工具；返回结构直接喂给模型。 */
export function executeShopTool(input: {
  companyId: string;
  conversationId?: string;
  name: string;
  input: unknown;
}): { output: unknown; isError: boolean } {
  const args = (input.input ?? {}) as Record<string, unknown>;
  try {
    if (input.name === 'shop_list_products') {
      const items = listProductsWithStats(input.companyId).map(product => ({
        id: product.id,
        name: product.name,
        status: product.status === 'active' ? '在售' : product.status === 'offline' ? '下架' : product.status,
        price_yuan: product.price_cents / 100,
        cost_yuan: product.cost_cents / 100,
        market_price_yuan: product.market_price_cents / 100,
        stock: product.stock,
        sold_qty: product.sold_qty,
        profit_yuan: product.profit_cents / 100,
      }));
      return {
        output: {
          count: items.length,
          items,
          note: items.length ? '可用 shop_propose_change 修改或删除，也可上架新商品；批准前不会生效。' : '店铺还没有商品，可以直接用 shop_propose_change 上架。',
        },
        isError: false,
      };
    }

    if (input.name === 'shop_propose_change') {
      const action = String(args.action ?? '').toLowerCase();
      if (!['create', 'update', 'delete'].includes(action)) {
        return {
          output: { error: 'action 必须是 create、update 或 delete', retry_hint: '例如 {"action":"create","name":"…"}' },
          isError: true,
        };
      }
      const payload = payloadFromInput(args);
      const productId = typeof args.product_id === 'string' ? args.product_id
        : typeof args.id === 'string' ? args.id : '';

      if (action !== 'create' && !productId) {
        const products = listProductsWithStats(input.companyId).map(item => ({ id: item.id, name: item.name }));
        return {
          output: {
            error: 'update/delete 必须提供 product_id',
            retry_hint: '先调用 shop_list_products 拿到 id，再带上 product_id 重试',
            products,
          },
          isError: true,
        };
      }
      if (action === 'create' && !payload.name) {
        return { output: { error: '上架新商品必须提供 name（商品名称）', retry_hint: '补充 name 后重试' }, isError: true };
      }
      // 商品介绍必须是顾客看到的详情文案，不能把工单/交接/审批记录贴进去。
      const intro = typeof payload.description === 'string' ? payload.description : '';
      if (intro) {
        if (/待老板审批|变更申请|变更审批|交接记录|内部上架|审批事项|依据：/.test(intro)) {
          return {
            output: {
              error: 'description 看起来是内部工单/交接记录，不能直接作为商品介绍',
              retry_hint: '只写顾客看到的商品介绍（卖点、材质、规格、使用场景、售后），用上游文案改写，不要粘贴内部文档',
              preview: intro.slice(0, 80),
            },
            isError: true,
          };
        }
        if (intro.length > 4000) {
          return { output: { error: '商品介绍超过 4000 字', retry_hint: '压缩成顾客能读完的详情文案' }, isError: true };
        }
      }
      // 没有确认售价时不逼模型编数字：以「下架草稿」提交，老板批准后可改价再开售。
      if (action === 'create' && !payload.price_cents) {
        payload.status = 'offline';
      }
      const summary = describeProductChange(action as 'create' | 'update' | 'delete', payload);
      const request = createChangeRequest({
        companyId: input.companyId,
        conversationId: input.conversationId,
        action: action as 'create' | 'update' | 'delete',
        productId,
        payload,
        summary,
      });
      return {
        output: {
          status: 'pending_approval',
          change_id: request.id,
          summary,
          draft: action === 'create' && payload.status === 'offline',
          note: '已提交老板审批，批准前不会改变线上商品。回答里请说明「已提交审批」，不要声称已上架成功。'
            + (action === 'create' && payload.status === 'offline' ? ' 该商品因未确认售价会先以未上架草稿保存。' : ''),
        },
        isError: false,
      };
    }

    return { output: { error: `未知的店铺工具：${input.name}` }, isError: true };
  } catch (error) {
    if (error instanceof ShopError) {
      return { output: { error: error.message, retry_hint: '按提示补全字段后重新调用同一工具' }, isError: true };
    }
    throw error;
  }
}
