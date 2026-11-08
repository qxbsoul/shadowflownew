import { DL_TYPES } from '../data';
import { useWorkbench } from '../store';

export default function DeliverablesView() {
  const { deliverables, dlFilter, setDlFilter, openModal } = useWorkbench();
  const list = deliverables.filter(d => dlFilter === '全部' || d.type === dlFilter);

  return (
    <div className="view-inner">
      <div className="view-head">
        <div>
          <h2>交付成果</h2>
          <div className="sub">公司产出的全部业务成果，可预览、可追溯</div>
        </div>
      </div>

      <div className="filter-tabs">
        {DL_TYPES.map(t => (
          <button key={t} className={'ftab' + (dlFilter === t ? ' active' : '')} onClick={() => setDlFilter(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="dl-grid">
        {list.length ? (
          list.map(d => (
            <div
              className="dl-card"
              key={d.id}
              onClick={() => openModal({ kind: 'preview-deliverable', deliverableId: d.id })}
            >
              <div className="dl-cover" style={{ background: d.color }}>
                {d.mark}
                <span className={'pill ' + (d.status === '已交付' ? 'pill-ok' : d.status === '失败' ? 'pill-err' : 'pill-wait')}>{d.status}</span>
              </div>
              <div className="dl-info">
                <div className="t">{d.title}</div>
                <div className="m">
                  <span>{d.type}</span>
                  <span>{d.client}</span>
                  <span>{d.time}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-tip" style={{ gridColumn: '1 / -1' }}>
            该分类下暂无交付物
          </div>
        )}
      </div>
    </div>
  );
}
