import { useEffect, useMemo, useState } from 'react';
import { createPublicOrder, getPublicProduct, payPublicOrder, type PublicOrderDto, type PublicProductDto } from '../api';

const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

type Stage = 'loading' | 'missing' | 'shopping' | 'created' | 'paid';

/** 扫码后的公开商品页：顾客不需要登录，填地址下单并模拟付款。 */
export default function PublicProductPage({ productId }: { productId: string }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [product, setProduct] = useState<PublicProductDto | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [order, setOrder] = useState<PublicOrderDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getPublicProduct(productId)
      .then(found => {
        if (cancelled) return;
        setProduct(found);
        setStage('shopping');
      })
      .catch(() => { if (!cancelled) setStage('missing'); });
    return () => { cancelled = true; };
  }, [productId]);

  const discount = useMemo(() => {
    if (!product || !product.market_price_cents || product.market_price_cents <= product.price_cents) return null;
    return Math.round((1 - product.price_cents / product.market_price_cents) * 100);
  }, [product]);

  const total = product ? product.price_cents * quantity + product.shipping_fee_cents : 0;
  const maxQuantity = Math.max(1, product?.stock ?? 1);

  const submitOrder = async () => {
    if (!product) return;
    setError('');
    if (!buyerName.trim()) return setError('请填写收货人姓名');
    if (!address.trim()) return setError('请填写收货地址');
    setBusy(true);
    try {
      const created = await createPublicOrder({
        product_id: product.id, quantity,
        buyer_name: buyerName.trim(), phone: phone.trim(), address: address.trim(), note: note.trim(),
      });
      setOrder(created);
      setStage('created');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!order) return;
    setBusy(true);
    setError('');
    try {
      const paid = await payPublicOrder(order.id);
      setOrder(paid);
      setStage('paid');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'loading') {
    return <div className="shop-public page"><div className="shop-public-card"><div className="empty-tip">正在加载商品…</div></div></div>;
  }
  if (stage === 'missing' || !product) {
    return (
      <div className="shop-public page">
        <div className="shop-public-card">
          <h1>商品不存在或已下架</h1>
          <p className="shop-public-muted">这个二维码对应的商品可能已经被商家删除，请联系商家确认。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-public page">
      <header className="shop-public-bar">
        <span className="shop-public-brand">ShadowFlow 小店</span>
        <span className="shop-public-muted">扫码购物 · 演示支付</span>
      </header>

      {stage === 'paid' && order ? (
        <div className="shop-public-card shop-public-success">
          <div className="shop-public-success-mark">✓</div>
          <h1>支付成功</h1>
          <p>订单号 <b>{order.id}</b></p>
          <p className="shop-public-muted">商家发货后可以在本页看到快递公司与单号。</p>
          <div className="shop-public-success-grid">
            <div><span>商品</span><b>{order.product_name} × {order.quantity}</b></div>
            <div><span>实付</span><b>{money(order.amount_cents)}</b></div>
            <div><span>收货人</span><b>{order.buyer_name}</b></div>
            <div><span>地址</span><b>{order.address}</b></div>
            {order.tracking_no && <div><span>快递</span><b>{order.tracking_company} {order.tracking_no}</b></div>}
          </div>
        </div>
      ) : (
        <div className="shop-public-card shop-public-product">
          <div className="shop-public-gallery">
            <div className="shop-public-main-image">
              {product.images.length
                ? <img src={product.images[Math.min(imageIndex, product.images.length - 1)]} alt={product.name} />
                : <span className="shop-public-placeholder">{product.name.slice(0, 1)}</span>}
            </div>
            {product.images.length > 1 && (
              <div className="shop-public-thumbs">
                {product.images.map((src, index) => (
                  <button key={`${src.slice(0, 20)}-${index}`} className={index === imageIndex ? 'active' : ''} onClick={() => setImageIndex(index)} aria-label={`查看第 ${index + 1} 张图`}>
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="shop-public-buy">
            <h1>{product.name}</h1>
            {product.summary && <p className="shop-public-summary">{product.summary}</p>}
            <div className="shop-public-price">
              <strong>{money(product.price_cents)}</strong>
              {discount !== null && <span className="shop-public-market">市场价 {money(product.market_price_cents)} · 省 {discount}%</span>}
            </div>
            <div className="shop-public-meta">
              <span>运费 {product.shipping_fee_cents ? money(product.shipping_fee_cents) : '包邮'}</span>
              <span>库存 {product.stock} 件</span>
            </div>

            {stage === 'created' && order ? (
              <div className="shop-public-pay">
                <div className="shop-public-pay-head">订单已创建，请完成支付</div>
                <div className="shop-public-pay-row"><span>商品</span><b>{order.product_name} × {order.quantity}</b></div>
                <div className="shop-public-pay-row"><span>应收</span><b className="shop-public-amount">{money(order.amount_cents)}</b></div>
                <div className="shop-public-pay-row"><span>收货</span><b>{order.buyer_name} · {order.address}</b></div>
                <p className="shop-public-muted">这是演示支付：点击按钮即视为付款成功，不会产生真实扣款。</p>
                {error && <div className="shop-public-error" role="alert">{error}</div>}
                <button className="btn btn-primary shop-public-buy-btn" disabled={busy} onClick={() => void pay()}>
                  {busy ? '正在支付…' : `模拟支付 ${money(order.amount_cents)}`}
                </button>
              </div>
            ) : (
              <div className="shop-public-form">
                <div className="shop-public-qty">
                  <span>数量</span>
                  <div>
                    <button onClick={() => setQuantity(value => Math.max(1, value - 1))} aria-label="减少数量">－</button>
                    <b>{quantity}</b>
                    <button onClick={() => setQuantity(value => Math.min(maxQuantity, value + 1))} aria-label="增加数量">＋</button>
                  </div>
                </div>
                <label htmlFor="pp-name">收货人</label>
                <input id="pp-name" value={buyerName} onChange={event => setBuyerName(event.target.value)} placeholder="姓名" />
                <label htmlFor="pp-phone">手机号（可选）</label>
                <input id="pp-phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="用于联系收货" />
                <label htmlFor="pp-address">收货地址</label>
                <textarea id="pp-address" rows={2} value={address} onChange={event => setAddress(event.target.value)} placeholder="省市区 + 详细地址" />
                <label htmlFor="pp-note">备注（可选）</label>
                <input id="pp-note" value={note} onChange={event => setNote(event.target.value)} placeholder="例如：放门口 / 需要发票" />
                {error && <div className="shop-public-error" role="alert">{error}</div>}
                <button className="btn btn-primary shop-public-buy-btn" disabled={busy || product.stock <= 0} onClick={() => void submitOrder()}>
                  {product.stock <= 0 ? '暂时缺货' : busy ? '正在下单…' : `立即购买 · ${money(total)}`}
                </button>
              </div>
            )}
          </div>

          <div className="shop-public-detail">
            <h2>商品介绍</h2>
            <p>{product.description || '商家还没有填写商品介绍。'}</p>
          </div>
        </div>
      )}

      <footer className="shop-public-foot">本页面由 ShadowFlow 商家后台自动生成 · 演示环境，支付为模拟</footer>
    </div>
  );
}
