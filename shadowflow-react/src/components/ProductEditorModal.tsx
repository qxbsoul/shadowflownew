import { useEffect, useMemo, useState } from 'react';
import { createShopProduct, deleteShopProduct, updateShopProduct, type ShopProductDto } from '../api';
import { useWorkbench } from '../store';

/** 把用户选的图片压到最长边 1200px 的 JPEG，避免把库和请求体撑爆。 */
async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1200;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持图片处理');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

const yuan = (cents: number) => (cents ? (cents / 100).toFixed(2) : '');

export default function ProductEditorModal({ productId }: { productId?: string }) {
  const { shopProducts, refreshShopProducts, closeModal, toast } = useWorkbench();
  const existing = useMemo<ShopProductDto | undefined>(
    () => (productId ? shopProducts.find(item => item.id === productId) : undefined),
    [productId, shopProducts],
  );
  const [name, setName] = useState(existing?.name ?? '');
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [price, setPrice] = useState(yuan(existing?.price_cents ?? 0));
  const [cost, setCost] = useState(yuan(existing?.cost_cents ?? 0));
  const [market, setMarket] = useState(yuan(existing?.market_price_cents ?? 0));
  const [stock, setStock] = useState(String(existing?.stock ?? 0));
  const [shipping, setShipping] = useState(yuan(existing?.shipping_fee_cents ?? 0));
  const [status, setStatus] = useState<'active' | 'offline'>(existing?.status === 'offline' ? 'offline' : 'active');
  const [images, setImages] = useState<string[]>(existing?.images ?? []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setSummary(existing.summary);
    setDescription(existing.description);
    setPrice(yuan(existing.price_cents));
    setCost(yuan(existing.cost_cents));
    setMarket(yuan(existing.market_price_cents));
    setStock(String(existing.stock));
    setShipping(yuan(existing.shipping_fee_cents));
    setStatus(existing.status === 'offline' ? 'offline' : 'active');
    setImages(existing.images);
  }, [existing]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const next = [...images];
      for (const file of Array.from(files)) {
        if (next.length >= 5) break;
        if (!file.type.startsWith('image/')) continue;
        next.push(await fileToDataUrl(file));
      }
      setImages(next.slice(0, 5));
    } catch {
      toast('图片处理失败，请换一张试试');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return toast('请填写商品名称');
    const priceCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) return toast('售价必须大于 0');
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        summary: summary.trim(),
        description: description.trim(),
        images,
        price_cents: priceCents,
        cost_cents: Math.round(Number(cost || 0) * 100),
        market_price_cents: Math.round(Number(market || 0) * 100),
        stock: Math.max(0, Math.round(Number(stock || 0))),
        shipping_fee_cents: Math.round(Number(shipping || 0) * 100),
        status,
      };
      if (existing) await updateShopProduct(existing.id, payload);
      else await createShopProduct(payload);
      await refreshShopProducts();
      toast(existing ? '商品已保存' : '商品已上架');
      closeModal();
    } catch (error) {
      toast(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const marginText = (() => {
    const p = Number(price);
    const c = Number(cost);
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(c)) return '—';
    return `${Math.round(((p - c) / p) * 100)}%`;
  })();

  return (
    <>
      <div className="modal-body product-editor">
        <div className="product-editor-grid">
          <div className="product-editor-main">
            <div className="form-group">
              <label className="form-label" htmlFor="pe-name">商品名称</label>
              <input id="pe-name" className="form-input" value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="例如：桌面收纳盒" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="pe-summary">一句话卖点</label>
              <input id="pe-summary" className="form-input" value={summary} disabled={busy} onChange={event => setSummary(event.target.value)} placeholder="展示在商品卡和购物页标题下" />
            </div>
            <div className="product-editor-row">
              <div className="form-group"><label className="form-label" htmlFor="pe-price">售价（元）</label><input id="pe-price" className="form-input" inputMode="decimal" value={price} disabled={busy} onChange={event => setPrice(event.target.value)} placeholder="29.00" /></div>
              <div className="form-group"><label className="form-label" htmlFor="pe-cost">成本（元）</label><input id="pe-cost" className="form-input" inputMode="decimal" value={cost} disabled={busy} onChange={event => setCost(event.target.value)} placeholder="9.00" /></div>
              <div className="form-group"><label className="form-label" htmlFor="pe-market">市场价（元）</label><input id="pe-market" className="form-input" inputMode="decimal" value={market} disabled={busy} onChange={event => setMarket(event.target.value)} placeholder="用于比价" /></div>
            </div>
            <div className="product-editor-row">
              <div className="form-group"><label className="form-label" htmlFor="pe-stock">库存（件）</label><input id="pe-stock" className="form-input" inputMode="numeric" value={stock} disabled={busy} onChange={event => setStock(event.target.value)} /></div>
              <div className="form-group"><label className="form-label" htmlFor="pe-shipping">运费（元）</label><input id="pe-shipping" className="form-input" inputMode="decimal" value={shipping} disabled={busy} onChange={event => setShipping(event.target.value)} placeholder="0" /></div>
              <div className="form-group"><label className="form-label" htmlFor="pe-status">上架状态</label><select id="pe-status" className="form-select" value={status} disabled={busy} onChange={event => setStatus(event.target.value === 'offline' ? 'offline' : 'active')}><option value="active">在售</option><option value="offline">暂时下架</option></select></div>
            </div>
            <div className="product-editor-hint">毛利 = 售价 − 成本，当前毛利 <b>{marginText}</b>；营收统计不含运费。</div>
            <div className="form-group">
              <label className="form-label" htmlFor="pe-desc">商品介绍</label>
              <textarea id="pe-desc" className="form-area" rows={7} value={description} disabled={busy} onChange={event => setDescription(event.target.value)} placeholder="材质、尺寸、使用场景、售后说明等；会显示在扫码后的商品页" />
            </div>
          </div>
          <div className="product-editor-side">
            <label className="form-label">宣传图片（最多 5 张，第一张为封面）</label>
            <div className="product-image-grid">
              {images.map((src, index) => (
                <figure className="product-image" key={`${src.slice(0, 24)}-${index}`}>
                  <img src={src} alt={`商品图 ${index + 1}`} />
                  <button type="button" aria-label={`删除第 ${index + 1} 张图`} onClick={() => setImages(prev => prev.filter((_, i) => i !== index))}>×</button>
                  {index === 0 && <figcaption>封面</figcaption>}
                </figure>
              ))}
              {images.length < 5 && (
                <label className="product-image-add">
                  <input type="file" accept="image/*" multiple disabled={busy || uploading} onChange={event => { void addFiles(event.target.files); event.target.value = ''; }} />
                  <span>{uploading ? '处理中…' : '＋ 上传图片'}</span>
                </label>
              )}
            </div>
            <div className="product-editor-tip">图片会在浏览器里压缩后保存，支持 JPG / PNG / WebP。</div>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={closeModal}>取消</button>
        <button className="btn btn-primary btn-sm" disabled={busy || uploading} onClick={() => void save()}>
          {busy ? '正在保存…' : existing ? '保存修改' : '上架商品'}
        </button>
      </div>
    </>
  );
}

export function DeleteProductModal({ productId }: { productId: string }) {
  const { shopProducts, refreshShopProducts, closeModal, toast } = useWorkbench();
  const product = shopProducts.find(item => item.id === productId);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await deleteShopProduct(productId);
      await refreshShopProducts();
      toast('商品已删除');
      closeModal();
    } catch (error) {
      toast(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="modal-body">
        <div className="preview-box">确认删除商品「<b>{product?.name ?? productId}</b>」？删除后二维码失效，历史订单保留。</div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={closeModal}>取消</button>
        <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => void submit()}>{busy ? '正在删除…' : '确认删除'}</button>
      </div>
    </>
  );
}
