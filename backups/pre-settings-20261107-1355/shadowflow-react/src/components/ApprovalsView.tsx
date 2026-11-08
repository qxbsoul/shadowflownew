import { useState } from 'react';
import type { ApprovalDto } from '../api';
import { useWorkbench } from '../store';

const FILTERS = ['待审批', '已批准', '已驳回', '全部'];

function timeText(raw?: string): string {
  if (!raw) return '时间未记录';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString('zh-CN', { hour12: false });
}

function statusText(status: ApprovalDto['status']): string {
  return status === 'pending' ? '待审批' : status === 'approved' ? '已批准' : '已驳回';
}

export default function ApprovalsView() {
  const { approvals, deliverables, approvalLoading, refreshApprovals, openModal, gwStatus } = useWorkbench();
  const [filter, setFilter] = useState('待审批');
  const list = approvals.filter(item => {
    if (filter === '全部') return true;
    return statusText(item.status) === filter;
  });

  return (
    <div className="view-inner">
      <div className="view-head">
        <div>
          <h2>人工审批</h2>
          <div className="sub">验收中高风险任务成果 —— 批准后继续推进，驳回后返工</div>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" disabled={approvalLoading || gwStatus !== 'ok'} onClick={() => void refreshApprovals()}>
            {approvalLoading ? '正在刷新…' : '刷新审批'}
          </button>
        </div>
      </div>

      <div className="filter-tabs">
        {FILTERS.map(item => (
          <button key={item} className={'ftab' + (filter === item ? ' active' : '')} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>

      {list.length ? list.map(item => {
        const project = deliverables.find(d => d.sourceId === item.project_id);
        const pending = item.status === 'pending';
        return (
          <div className="task-card" key={item.id}>
            <div className="task-ico">审</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="task-name">{item.title}</div>
              <div className="task-meta">
                <span>项目：<b>{project?.title ?? item.project_id ?? '公司项目'}</b></span>
                <span>风险：<b>{item.risk === 'high' ? '高' : item.risk === 'low' ? '低' : '中'}</b></span>
                <span>提交人：<b>{item.payload?.by ?? item.requested_by ?? '公司岗位'}</b></span>
                <span>{timeText(item.created_at)}</span>
                <span className={'pill ' + (pending ? 'pill-wait' : item.status === 'approved' ? 'pill-ok' : 'pill-err')}>
                  {statusText(item.status)}
                </span>
              </div>
              {(item.payload?.summary || item.note) && (
                <div className="preview-box" style={{ marginTop: '10px', fontSize: '12px' }}>
                  {item.payload?.summary && <div><b>交付摘要：</b>{item.payload.summary}</div>}
                  {item.note && <div style={{ marginTop: '6px' }}><b>审批意见：</b>{item.note}</div>}
                  {!pending && <div style={{ marginTop: '6px', color: 'var(--muted)' }}>{item.decided_by ?? '老板'} · {timeText(item.decided_at)}</div>}
                </div>
              )}
            </div>
            {pending && (
              <div className="task-right" style={{ minWidth: '118px' }}>
                <button className="btn btn-dark btn-sm" onClick={() => openModal({ kind: 'decide-approval', approvalId: item.id, decision: 'approved' })}>
                  批准并继续
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => openModal({ kind: 'decide-approval', approvalId: item.id, decision: 'rejected' })}>
                  驳回返工
                </button>
              </div>
            )}
          </div>
        );
      }) : (
        <div className="panel panel-pad">
          <div className="empty-tip">
            {gwStatus === 'ok'
              ? filter === '待审批' ? '当前没有待审批事项' : '该分类下暂无审批记录'
              : '离线演示模式不生成虚假审批记录'}
          </div>
        </div>
      )}
    </div>
  );
}
