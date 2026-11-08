import { useWorkbench } from '../store';

/** 「公司现场」—— ① AI 在做什么 ② 交付了什么 ③ 错误与原因 */
export default function LiveBoard() {
  const { activities, deliverables, errors, retryError, openModal, setView } = useWorkbench();

  const actCnt = activities.length ? activities.length + ' 项进行中' : '空闲';
  const dlCnt = '今日 ' + deliverables.filter(d => d.time.includes('今天') || d.time === '刚刚').length + ' 项';
  const unresolved = errors.filter(e => !e.resolved).length;
  const errCnt = unresolved ? unresolved + ' 项待处理' : '全部正常';

  return (
    <aside className="live-col">
      <div className="live-title">
        <span className="pulse" />
        <h3>公司现场</h3>
      </div>
      <div className="live-sub">透明化经营：AI 在做什么 · 交付了什么 · 错误与原因</div>

      {/* ① AI 在做什么 */}
      <div className="live-card">
        <h4>
          <span className="num n1">1</span>AI 在做什么
          <span className="cnt">{actCnt}</span>
        </h4>
        <div>
          {activities.length ? (
            activities.map(a => {
              const pct = Math.round((a.current / a.steps.length) * 100);
              return (
                <div className="act-item" key={a.id}>
                  <div className="act-top">
                    <div className="act-title">{a.title}</div>
                    <div className="act-pos">{a.position}</div>
                  </div>
                  <div className="act-detail">
                    {a.status === 'running' ? (
                      <span className="spin" />
                    ) : (
                      <span className={'pill ' + (a.status === 'done' ? 'pill-ok' : a.status === 'blocked' ? 'pill-wait' : 'pill-err')}>
                        {a.status === 'done' ? '完成' : a.status === 'blocked' ? '待审批' : '失败'}
                      </span>
                    )}{' '}
                    {a.detail}
                  </div>
                  {a.status === 'blocked' && (
                    <button className="mini-btn" style={{ marginBottom: '8px' }} onClick={() => setView('approvals')}>
                      前往人工审批
                    </button>
                  )}
                  <div className="bar">
                    <i style={{ width: pct + '%' }} />
                  </div>
                  <div className="act-steps">
                    {a.steps.map((s, i) => (
                      <span key={s} className={'step-pill' + (i < a.current ? ' done' : i === a.current ? ' now' : '')}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-tip">当前没有进行中的工作，给总经理派个活试试</div>
          )}
        </div>
      </div>

      {/* ② 交付了什么（最近 4 条） */}
      <div className="live-card">
        <h4>
          <span className="num n2">2</span>交付了什么
          <span className="cnt">{dlCnt}</span>
        </h4>
        <div>
          {deliverables.slice(0, 4).map(d => (
            <div
              className="dl-item"
              key={d.id}
              onClick={() => openModal({ kind: 'preview-deliverable', deliverableId: d.id })}
            >
              <div className="dl-ico" style={{ background: d.color, color: 'var(--navy)' }}>
                {d.mark}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="dl-name">{d.title}</div>
                <div className="dl-meta">
                  {d.client} · {d.time}
                </div>
              </div>
              <span className={'pill ' + (d.status === '已交付' ? 'pill-ok' : d.status === '失败' ? 'pill-err' : 'pill-wait')}>{d.status}</span>
            </div>
          ))}
          {!deliverables.length && <div className="empty-tip">还没有交付成果</div>}
        </div>
      </div>

      {/* ③ 错误与原因 */}
      <div className="live-card">
        <h4>
          <span className="num n3">3</span>错误与原因
          <span className="cnt">{errCnt}</span>
        </h4>
        <div>
          {errors.length ? (
            errors.map(e => (
              <div className={e.resolved ? 'err-item resolved' : 'err-item'} key={e.id}>
                <div className="err-title">
                  <span className={'pill ' + (e.resolved ? 'pill-ok' : 'pill-err')}>
                    {e.resolved ? '已恢复' : '异常'}
                  </span>{' '}
                  {e.title}
                </div>
                <div className="err-line">
                  <b>原因：</b>
                  {e.cause}
                </div>
                <div className="err-line">
                  <b>影响：</b>
                  {e.impact}
                </div>
                <div className="err-line">
                  <b>处置：</b>
                  {e.action}
                </div>
                <div className="err-actions">
                  <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{e.time}</span>
                  {!e.resolved && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 'auto', padding: '3px 11px', fontSize: '11px' }}
                      onClick={() => retryError(e.id)}
                    >
                      重试
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-tip">未发现异常，一切正常</div>
          )}
        </div>
      </div>
    </aside>
  );
}
