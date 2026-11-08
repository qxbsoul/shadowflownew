import { useState } from 'react';
import { shipShopOrder } from '../api';
import { useWorkbench } from '../store';

const COMPANIES = ['顺丰速运', '中通快递', '圆通速递', '韵达快递', '京东物流', '邮政 EMS'];

/** 发货：填快递公司与单号，老板侧订单随即变成「已发货」。 */
export default function ShipOrderModal({ orderId }: { orderId: string }) {
  const { shopOrders, refreshShopOrders, closeModal, toast } = useWorkbench();
  const order = shopOrders.find(item => item.id === orderId);
  const [company, setCompany] = useState('顺丰速运');
  const [trackingNo, setTrackingNo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!trackingNo.trim()) return toast('请填写快递单号');
    setBusy(true);
    try {
      await shipShopOrder(orderId, { tracking_company: company.trim(), tracking_no: trackingNo.trim(), tracking_note: note.trim() });
      await refreshShopOrders();
      toast('已发货，顾客可以在商品页看到快递信息');
      closeModal();
    } catch (error) {
      toast(`发货失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="modal-body">
        <div className="preview-box">
          <strong>{order?.product_name ?? '订单'}</strong>
          {order && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
            {order.quantity} 件 · {order.buyer_name} · {order.address}
          </div>}
        </div>
        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label" htmlFor="ship-company">快递公司</label>
          <input id="ship-company" className="form-input" list="ship-companies" value={company} disabled={busy} onChange={event => setCompany(event.target.value)} />
          <datalist id="ship-companies">{COMPANIES.map(item => <option key={item} value={item} />)}</datalist>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="ship-no">快递单号</label>
          <input id="ship-no" className="form-input" value={trackingNo} disabled={busy} onChange={event => setTrackingNo(event.target.value)} placeholder="例如 SF1234567890" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="ship-note">物流备注（可选）</label>
          <input id="ship-note" className="form-input" value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="例如：已揽收，预计 3 天送达" />
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={closeModal}>取消</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void submit()}>{busy ? '正在提交…' : '确认发货'}</button>
      </div>
    </>
  );
}
