import { useState } from 'react';
import type { ChatShopChange } from '../types';
import { useWorkbench } from '../store';

const ACTION_LABEL: Record<ChatShopChange['action'], string> = { create: '上架', update: '修改', delete: '删除' };
const money = (cents: unknown) => (typeof cents === 'number' ? `¥${(cents / 100).toFixed(2)}` : '');

/**
 * 对话内的商品变更审批卡：AI 上架/改价/删除商品时会立刻出现在聊天里，
 * 老板可以就地批准，不必再跳到「人工审批」页。
 */
export default function ChatShopChangeCard({ change }: { change: ChatShopChange }) {
  const { shopChanges, decideShopChange, toast } = useWorkbench();
  const [busy, setBusy] = useState(false);
  // 以 store 里的最新状态为准（审批后同一张卡会即时变化），拿不到再退回消息里的快照。
  const live = shopChanges.find(item => item.id === change.id) ?? change;
  const pending = live.status === 'pending';
  const payload = live.payload ?? {};

  const decide = async (decision: 'approve' | 'reject') => {
    if (busy) return;
    setBusy(true);
    try {
      await decideShopChange(live.id, decision);
    } catch {
      toast('商品变更审批提交失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`chat-shop-change ${pending ? 'pending' : 'decided'}`} aria-label="商品变更审批">
      <div className="chat-approval-heading">
        <span>商品变更审批 · {ACTION_LABEL[live.action]}</span>
        <small>{pending ? '批准后才会写入店铺' : live.status === 'approved' ? '已生效' : '已驳回'}</small>
      </div>
      <h4>{live.summary}</h4>
      <div className="approval-change-grid">
        {typeof payload.name === 'string' && <div><span>名称</span><b>{payload.name}</b></div>}
        {typeof payload.price_cents === 'number' && <div><span>售价</span><b>{payload.price_cents ? money(payload.price_cents) : '未定价（草稿）'}</b></div>}
        {typeof payload.cost_cents === 'number' && <div><span>成本</span><b>{money(payload.cost_cents)}</b></div>}
        {typeof payload.market_price_cents === 'number' && payload.market_price_cents > 0 && <div><span>市场价</span><b>{money(payload.market_price_cents)}</b></div>}
        {typeof payload.stock === 'number' && <div><span>库存</span><b>{payload.stock} 件</b></div>}
        {typeof payload.shipping_fee_cents === 'number' && <div><span>运费</span><b>{money(payload.shipping_fee_cents)}</b></div>}
        {Array.isArray(payload.images) && payload.images.length > 0 && <div><span>宣传图</span><b>{payload.images.length} 张</b></div>}
      </div>
      {typeof payload.description === 'string' && payload.description && (
        <div className="chat-shop-change-desc">{payload.description.slice(0, 400)}{payload.description.length > 400 ? '…' : ''}</div>
      )}
      {pending ? (
        <div className="chat-approval-options">
          <button type="button" disabled={busy} onClick={() => void decide('approve')}>{busy ? '提交中…' : '批准并生效'}</button>
          <button type="button" disabled={busy} onClick={() => void decide('reject')}>驳回</button>
        </div>
      ) : (
        <div className="chat-approval-result">
          <span>{live.status === 'approved' ? '老板已批准，商品变更已生效。' : '老板已驳回，商品保持不变。'}</span>
        </div>
      )}
    </section>
  );
}
