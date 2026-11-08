import { useMemo, useState } from 'react';
import { useWorkbench } from '../store';

function timeText(raw?: string): string {
  if (!raw) return '时间未记录';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString('zh-CN', { hour12: false });
}

function shortTime(raw?: string): string {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return sameDay ? `今天 ${time}` : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function excerpt(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

/** 最终成果预览：以总经理汇总为主，员工中间产出作为可折叠的次要记录。 */
export default function DeliverablesView() {
  const { conversationDeliverables, conversationDeliverablesLoading, refreshConversationDeliverables, openModal, gwStatus } = useWorkbench();
  const [filter, setFilter] = useState<'全部' | '待审批' | '未完成'>('全部');

  const list = useMemo(() => conversationDeliverables.filter(item => {
    if (filter === '待审批') return item.pending_approvals > 0;
    if (filter === '未完成') return !item.final;
    return true;
  }), [conversationDeliverables, filter]);

  return (
    <div className="view-inner">
      <div className="view-head">
        <h2>交付成果</h2>
        <div className="actions">
          <button
            className="btn btn-ghost btn-sm"
            disabled={conversationDeliverablesLoading || gwStatus !== 'ok'}
            onClick={() => void refreshConversationDeliverables()}
          >
            {conversationDeliverablesLoading ? '正在刷新…' : '刷新'}
          </button>
        </div>
      </div>

      <div className="filter-tabs">
        {(['全部', '待审批', '未完成'] as const).map(item => (
          <button key={item} className={'ftab' + (filter === item ? ' active' : '')} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>

      {list.length ? (
        <div className="dl-grid">
          {list.map(item => {
            const done = Boolean(item.final);
            const waiting = !done && item.pending_approvals > 0;
            return (
              <button
                type="button"
                className="dl-card dl-card-conversation"
                key={item.id}
                onClick={() => openModal({ kind: 'preview-conversation-deliverable', deliverableId: item.id })}
              >
                <div className="dl-card-top">
                  <span className="dl-kind">{item.kind === 'group' ? '群聊' : '单聊'}</span>
                  <span className={'pill ' + (done ? 'pill-ok' : waiting ? 'pill-wait' : 'pill-err')}>
                    {done ? '已交付' : waiting ? '待审批' : '未完成'}
                  </span>
                  <time>{shortTime(item.updated_at)}</time>
                </div>
                <div className="dl-card-title">{item.title}</div>
                <div className={'dl-card-excerpt' + (done ? '' : ' muted')}>
                  {done
                    ? excerpt(item.final!.content) || '（最终成果为空）'
                    : waiting
                      ? '还有节点等待你审批，批准并执行完成后才会产出最终成果'
                      : '对话还没有产出最终成果'}
                </div>
                <div className="dl-card-foot">
                  <span>{item.employees.length} 份员工产出</span>
                  <span>{done ? '查看最终成果 →' : '查看进度 →'}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="panel panel-pad">
          <div className="empty-tip">
            {gwStatus === 'ok'
              ? filter === '全部' ? '还没有交付成果，先在工作台给总经理派个活试试' : '该分类下暂无交付成果'
              : '后端未连接，无法加载交付成果'}
          </div>
        </div>
      )}
    </div>
  );
}
