import { useMemo, useState } from 'react';
import type { ChatApprovalListItemDto } from '../api';
import ChatRichContent from './ChatRichContent';
import { useWorkbench } from '../store';

const FILTERS = ['待审批', '已批准', '已驳回', '全部'];

function timeText(raw?: string | number | null): string {
  if (!raw) return '时间未记录';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? String(raw) : date.toLocaleString('zh-CN', { hour12: false });
}

function statusText(item: ChatApprovalListItemDto): '待审批' | '已批准' | '已驳回' {
  if (item.status === 'pending') return '待审批';
  return item.outcome === 'reject' ? '已驳回' : '已批准';
}

function decisionText(item: ChatApprovalListItemDto): string {
  if (item.status === 'pending') return '';
  if (item.decision === 'approve') return '老板已批准并继续';
  if (item.decision === 'reject') return '老板已驳回，该分支停止';
  return item.outcome === 'continue' ? '按自定义意见继续' : '按自定义意见停止';
}

const CHANGE_LABELS = { create: '上架', update: '修改', delete: '删除' } as const;
const money = (cents: unknown) => (typeof cents === 'number' ? `¥${(cents / 100).toFixed(2)}` : '');

/** 人工审批：任务节点审批 + AI 商品变更审批。 */
export default function ApprovalsView() {
  const {
    chatApprovals, chatApprovalsLoading, refreshChatApprovals, decideChatApproval,
    shopChanges, shopChangesLoading, refreshShopChanges, decideShopChange,
    toast, gwStatus,
  } = useWorkbench();
  const [filter, setFilter] = useState('待审批');
  const [busyId, setBusyId] = useState('');

  const taskList = chatApprovals.filter(item => filter === '全部' || statusText(item) === filter);
  const changeList = useMemo(() => shopChanges.filter(item => {
    if (filter === '全部') return true;
    if (filter === '待审批') return item.status === 'pending';
    if (filter === '已批准') return item.status === 'approved';
    return item.status === 'rejected';
  }), [shopChanges, filter]);
  const taskPending = chatApprovals.filter(item => item.status === 'pending').length;
  const changePending = shopChanges.filter(item => item.status === 'pending').length;
  const pendingCount = taskPending + changePending;

  const decideTask = async (item: ChatApprovalListItemDto, decision: 'approve' | 'reject') => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await decideChatApproval(item.id, decision, '', undefined, item.conversation_id);
    } catch {
      toast('审批提交失败，请重试');
    } finally {
      setBusyId('');
    }
  };

  const decideChange = async (id: string, decision: 'approve' | 'reject') => {
    if (busyId) return;
    setBusyId(id);
    try {
      await decideShopChange(id, decision);
    } catch {
      toast('商品变更审批提交失败，请重试');
    } finally {
      setBusyId('');
    }
  };

  const refresh = () => {
    void Promise.all([refreshChatApprovals(), refreshShopChanges()]).catch(() => toast('刷新失败，请稍后重试'));
  };

  return (
    <div className="view-inner">
      <div className="view-head">
        <h2>人工审批</h2>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" disabled={chatApprovalsLoading || shopChangesLoading || gwStatus !== 'ok'} onClick={refresh}>
            {chatApprovalsLoading || shopChangesLoading ? '正在刷新…' : '刷新审批'}
          </button>
        </div>
      </div>

      <div className="filter-tabs">
        {FILTERS.map(item => (
          <button key={item} className={'ftab' + (filter === item ? ' active' : '')} onClick={() => setFilter(item)}>
            {item}
            {item === '待审批' && pendingCount > 0 ? ` ${pendingCount}` : ''}
          </button>
        ))}
      </div>

      <section className="approval-section">
        <div className="approval-section-head">
          <h3>任务审批</h3>
          <span>{taskPending} 待处理</span>
        </div>
        {taskList.length ? taskList.map(item => {
          const pending = item.status === 'pending';
          return (
            <div className="task-card approval-card" key={item.id}>
              <div className="task-ico">审</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="task-name">{item.task_title || '待审批任务'}</div>
                <div className="task-meta">
                  <span>对话：<b>{item.conversation_title || '未命名对话'}</b></span>
                  <span>{timeText(item.created_at)}</span>
                  <span className={'pill ' + (pending ? 'pill-wait' : item.outcome === 'reject' ? 'pill-err' : 'pill-ok')}>
                    {statusText(item)}
                  </span>
                </div>
                <div className="approval-content">
                  <div className="approval-content-label">需要审批的内容（总经理下发工单）</div>
                  {item.content ? (
                    <ChatRichContent content={item.content} className="approval-content-body" />
                  ) : (
                    <div className="approval-content-body approval-content-empty">这条历史审批没有存下工单内容，只保留了标题与决定结果。</div>
                  )}
                </div>
                {!pending && (
                  <div className="approval-decision">
                    <b>{decisionText(item)}</b>
                    {item.custom_text && <span>意见：{item.custom_text}</span>}
                    <span className="muted">{timeText(item.decided_at)}</span>
                  </div>
                )}
              </div>
              {pending && (
                <div className="task-right" style={{ minWidth: '118px' }}>
                  <button className="btn btn-dark btn-sm" disabled={Boolean(busyId)} onClick={() => void decideTask(item, 'approve')}>
                    {busyId === item.id ? '提交中…' : '批准并继续'}
                  </button>
                  <button className="btn btn-danger btn-sm" disabled={Boolean(busyId)} onClick={() => void decideTask(item, 'reject')}>
                    驳回此分支
                  </button>
                </div>
              )}
            </div>
          );
        }) : (
          <div className="panel panel-pad"><div className="empty-tip">
            {filter === '待审批' ? '当前没有待审批的任务；对话里需要老板确认的节点会出现在这里' : '该分类下暂无任务审批'}
          </div></div>
        )}
      </section>

      {filter !== '已驳回' && (
        <section className="approval-section">
          <div className="approval-section-head">
            <h3>商品变更审批</h3>
            <span>{changePending} 待处理</span>
          </div>
          <div className="approval-hint">AI 在对话里提出的商品上架、改价、改图、下架删除都会先进入这里，批准后才会真正生效。</div>
          {changeList.length ? changeList.map(item => {
            const pending = item.status === 'pending';
            const payload = item.payload ?? {};
            return (
              <div className="task-card approval-card approval-change" key={item.id}>
                <div className="task-ico shop-ico">店</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="task-name">{item.summary}</div>
                  <div className="task-meta">
                    <span className={'pill ' + (item.action === 'delete' ? 'pill-err' : item.action === 'create' ? 'pill-ok' : 'pill-wait')}>
                      {CHANGE_LABELS[item.action]}
                    </span>
                    {item.conversation_id && <span>来自对话</span>}
                    <span>{timeText(item.created_at)}</span>
                    <span className={'pill ' + (pending ? 'pill-wait' : item.status === 'approved' ? 'pill-ok' : 'pill-err')}>
                      {pending ? '待审批' : item.status === 'approved' ? '已生效' : '已驳回'}
                    </span>
                  </div>
                  <div className="approval-change-grid">
                    {typeof payload.name === 'string' && <div><span>名称</span><b>{payload.name}</b></div>}
                    {typeof payload.price_cents === 'number' && <div><span>售价</span><b>{money(payload.price_cents)}</b></div>}
                    {typeof payload.cost_cents === 'number' && <div><span>成本</span><b>{money(payload.cost_cents)}</b></div>}
                    {typeof payload.market_price_cents === 'number' && payload.market_price_cents > 0 && <div><span>市场价</span><b>{money(payload.market_price_cents)}</b></div>}
                    {typeof payload.stock === 'number' && <div><span>库存</span><b>{payload.stock} 件</b></div>}
                    {typeof payload.shipping_fee_cents === 'number' && <div><span>运费</span><b>{money(payload.shipping_fee_cents)}</b></div>}
                    {Array.isArray(payload.images) && payload.images.length > 0 && <div><span>宣传图</span><b>{payload.images.length} 张</b></div>}
                  </div>
                  {typeof payload.description === 'string' && payload.description && (
                    <div className="approval-content">
                      <div className="approval-content-label">商品介绍</div>
                      <div className="approval-content-body approval-change-desc">{payload.description}</div>
                    </div>
                  )}
                </div>
                {pending && (
                  <div className="task-right" style={{ minWidth: '118px' }}>
                    <button className="btn btn-dark btn-sm" disabled={Boolean(busyId)} onClick={() => void decideChange(item.id, 'approve')}>
                      {busyId === item.id ? '提交中…' : '批准并生效'}
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={Boolean(busyId)} onClick={() => void decideChange(item.id, 'reject')}>
                      驳回
                    </button>
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="panel panel-pad"><div className="empty-tip">
              {filter === '待审批' ? '当前没有待审批的商品变更' : '该分类下暂无商品变更'}
            </div></div>
          )}
        </section>
      )}
    </div>
  );
}
