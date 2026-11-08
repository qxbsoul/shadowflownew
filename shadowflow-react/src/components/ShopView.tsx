import { useMemo, useState } from 'react';
import { deliverShopOrder, type ShopOrderDto, type ShopProductDto } from '../api';
import { useWorkbench } from '../store';

const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

const ORDER_STATUS: Record<string, { label: string; tone: string }> = {
  pending_payment: { label: '待支付', tone: 'pill-wait' },
  paid: { label: '待发货', tone: 'pill-wait' },
  shipped: { label: '已发货', tone: 'pill-live' },
  delivered: { label: '已完成', tone: 'pill-ok' },
  cancelled: { label: '已取消', tone: 'pill-err' },
};

function timeText(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function margin(product: ShopProductDto): string {
  if (!product.price_cents) return '—';
  return `${Math.round(((product.price_cents - product.cost_cents) / product.price_cents) * 100)}%`;
}

export default function ShopView() {
  const {
    shopProducts, shopProductsLoading, shopOrders, shopOrdersLoading,
    shopChanges, refreshShopProducts, refreshShopOrders, refreshShopChanges,
    openModal, toast, gwStatus,
  } = useWorkbench();
  const [tab, setTab] = useState<'products' | 'orders'>('products');
  const [orderFilter, setOrderFilter] = useState<'all' | 'paid' | 'shipped' | 'delivered' | 'pending_payment'>('all');

  const pendingChanges = shopChanges.filter(item => item.status === 'pending').length;
  const activeProducts = shopProducts.filter(item => item.status === 'active').length;
  const totalStock = shopProducts.reduce((sum, item) => sum + item.stock, 0);
  const totalSold = shopProducts.reduce((sum, item) => sum + item.sold_qty, 0);
  const orders = useMemo(
    () => shopOrders.filter(order => orderFilter === 'all' || order.status === orderFilter),
    [shopOrders, orderFilter],
  );

  const refresh = () => {
    void Promise.all([refreshShopProducts(), refreshShopOrders(), refreshShopChanges()])
      .then(() => toast('商品与订单已刷新'))
      .catch(() => toast('刷新失败，请稍后重试'));
  };

  return (
    <div className="view-inner shop-view">
      <div className="view-head">
        <div>
          <h2>商品与订单</h2>
          <p className="view-description">小商品店铺后台：维护商品与成本售价、跟踪订单与快递、扫码即可下单购买。</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" disabled={shopProductsLoading || gwStatus !== 'ok'} onClick={refresh}>
            {shopProductsLoading || shopOrdersLoading ? '正在刷新…' : '刷新'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => openModal({ kind: 'product-editor' })}>添加商品</button>
        </div>
      </div>

      <div className="shop-kpis">
        <div className="shop-kpi"><span>商品</span><strong>{shopProducts.length}</strong><small>在售 {activeProducts}</small></div>
        <div className="shop-kpi"><span>库存</span><strong>{totalStock}</strong><small>件</small></div>
        <div className="shop-kpi"><span>累计销量</span><strong>{totalSold}</strong><small>件</small></div>
        <div className="shop-kpi"><span>待发货</span><strong>{shopOrders.filter(order => order.status === 'paid').length}</strong><small>笔</small></div>
        <div className="shop-kpi shop-kpi-warn"><span>待审批变更</span><strong>{pendingChanges}</strong><small>AI 上架/改价需批准</small></div>
      </div>

      <div className="filter-tabs shop-tabs">
        <button className={'ftab' + (tab === 'products' ? ' active' : '')} onClick={() => setTab('products')}>商品 {shopProducts.length}</button>
        <button className={'ftab' + (tab === 'orders' ? ' active' : '')} onClick={() => setTab('orders')}>订单 {shopOrders.length}</button>
      </div>

      {tab === 'products' && (
        <div className="shop-product-grid">
          {shopProducts.map(product => (
            <article className="shop-product" key={product.id}>
              <div className="shop-product-media">
                {product.images[0]
                  ? <img src={product.images[0]} alt={product.name} loading="lazy" />
                  : <span className="shop-product-placeholder">{product.name.slice(0, 1)}</span>}
                <span className={'pill ' + (product.status === 'active' ? 'pill-ok' : 'pill-wait')}>
                  {product.status === 'active' ? '在售' : '已下架'}
                </span>
              </div>
              <div className="shop-product-body">
                <div className="shop-product-name">{product.name}</div>
                <div className="shop-product-summary">{product.summary || '还没有一句话卖点'}</div>
                <div className="shop-product-price">
                  <strong>{money(product.price_cents)}</strong>
                  {product.market_price_cents > 0 && <span className="shop-market">市场价 {money(product.market_price_cents)}</span>}
                </div>
                <div className="shop-product-stats">
                  <span>成本 {money(product.cost_cents)}</span>
                  <span>毛利 {margin(product)}</span>
                  <span>库存 {product.stock}</span>
                  <span>已售 {product.sold_qty}</span>
                </div>
                <div className="shop-product-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal({ kind: 'product-editor', productId: product.id })}>编辑</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal({ kind: 'product-qr', productId: product.id })}>销售二维码</button>
                  <button className="btn btn-ghost btn-sm shop-danger" onClick={() => openModal({ kind: 'delete-product', productId: product.id })}>删除</button>
                </div>
              </div>
            </article>
          ))}
          {!shopProducts.length && (
            <div className="panel panel-pad shop-empty">
              <div className="empty-tip">还没有商品。点右上角「添加商品」上架第一件，或让总经理在对话里帮你上架（需你审批）。</div>
            </div>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <>
          <div className="filter-tabs shop-tabs">
            {([['all', '全部'], ['paid', '待发货'], ['shipped', '已发货'], ['delivered', '已完成'], ['pending_payment', '待支付']] as const).map(([key, label]) => (
              <button key={key} className={'ftab' + (orderFilter === key ? ' active' : '')} onClick={() => setOrderFilter(key)}>{label}</button>
            ))}
          </div>
          <div className="shop-orders">
            {orders.map(order => <OrderRow key={order.id} order={order} />)}
            {!orders.length && <div className="empty-tip">{shopOrders.length ? '该状态下没有订单' : '还没有订单。把商品二维码发出去，顾客扫码就能下单。'}</div>}
          </div>
        </>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: ShopOrderDto }) {
  const { openModal, refreshShopOrders, toast, gwStatus } = useWorkbench();
  const [busy, setBusy] = useState(false);
  const status = ORDER_STATUS[order.status] ?? { label: order.status, tone: 'pill-wait' };

  const complete = async () => {
    if (!gwStatus) return;
    setBusy(true);
    try {
      await deliverShopOrder(order.id);
      await refreshShopOrders();
      toast('订单已标记完成');
    } catch {
      toast('操作失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="shop-order">
      <div className="shop-order-main">
        <div className="shop-order-product">
          {order.product_image
            ? <img src={order.product_image} alt={order.product_name} loading="lazy" />
            : <span className="shop-order-placeholder">{order.product_name.slice(0, 1)}</span>}
          <div>
            <strong>{order.product_name}</strong>
            <span>{money(order.unit_price_cents)} × {order.quantity} 件{order.shipping_fee_cents ? ` · 运费 ${money(order.shipping_fee_cents)}` : ''}</span>
          </div>
        </div>
        <div className="shop-order-amount"><strong>{money(order.amount_cents)}</strong><span>{timeText(order.created_at)}</span></div>
      </div>
      <div className="shop-order-detail">
        <div><span>买家</span><b>{order.buyer_name}{order.phone ? ` · ${order.phone}` : ''}</b></div>
        <div><span>地址</span><b>{order.address}</b></div>
        <div><span>备注</span><b>{order.note || '无'}</b></div>
        {order.tracking_no && (
          <div><span>快递</span><b>{order.tracking_company || '快递'} {order.tracking_no}{order.tracking_note ? ` · ${order.tracking_note}` : ''}</b></div>
        )}
      </div>
      <div className="shop-order-foot">
        <span className={'pill ' + status.tone}>{status.label}</span>
        <div className="actions">
          {order.status === 'paid' && <button className="btn btn-dark btn-sm" onClick={() => openModal({ kind: 'ship-order', orderId: order.id })}>填写快递并发货</button>}
          {order.status === 'shipped' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void complete()}>{busy ? '处理中…' : '标记完成'}</button>}
        </div>
      </div>
    </article>
  );
}
