import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useWorkbench } from '../store';

const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

/** 商品销售二维码：扫开就是公开商品页，可直接下单。 */
export default function ProductQrModal({ productId }: { productId: string }) {
  const { shopProducts, closeModal, toast } = useWorkbench();
  const product = shopProducts.find(item => item.id === productId);
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/p/${productId}`;

  const svg = useMemo(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      return qr.createSvgTag({ cellSize: 6, margin: 2 });
    } catch {
      return '';
    }
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast('商品链接已复制');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 浏览器拒绝剪贴板时不谎称成功，提示手动复制输入框内容。
      toast('浏览器未授权剪贴板，请手动复制下面的链接');
    }
  };

  return (
    <>
      <div className="modal-body product-qr">
        <div className="product-qr-main">
          {svg
            ? <div className="product-qr-code" dangerouslySetInnerHTML={{ __html: svg }} aria-label="商品销售二维码" />
            : <div className="empty-tip">二维码生成失败</div>}
          <div className="product-qr-info">
            <strong>{product?.name ?? '商品'}</strong>
            {product && <span className="product-qr-price">{money(product.price_cents)}{product.market_price_cents > 0 ? <small> 市场价 {money(product.market_price_cents)}</small> : null}</span>}
            <p>顾客扫码即可查看商品介绍、填写地址下单并模拟付款。订单会实时出现在「订单」页。</p>
            <label className="form-label" htmlFor="qr-url">商品链接</label>
            <input id="qr-url" className="form-input" readOnly value={url} onFocus={event => event.currentTarget.select()} />
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>关闭</button>
        <button className="btn btn-ghost btn-sm" onClick={() => void copy()}>{copied ? '已复制' : '复制链接'}</button>
        <button className="btn btn-dark btn-sm" onClick={() => window.open(url, '_blank', 'noopener')}>打开商品页</button>
      </div>
    </>
  );
}
