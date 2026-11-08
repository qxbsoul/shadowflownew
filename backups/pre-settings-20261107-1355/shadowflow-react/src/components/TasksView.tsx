import { useWorkbench } from '../store';

export default function TasksView() {
  const { tasks, toggleTask, openModal } = useWorkbench();

  return (
    <div className="view-inner">
      <div className="view-head">
        <div>
          <h2>定时任务</h2>
          <div className="sub">公司的周期性与一次性计划，由对应岗位自动执行</div>
        </div>
        <div className="actions">
          <button className="btn btn-primary btn-sm" onClick={() => openModal({ kind: 'new-task' })}>
            新建定时任务
          </button>
        </div>
      </div>

      {tasks.length ? (
        tasks.map(t => (
          <div className="task-card" key={t.id}>
            <div className="task-ico">{t.mark}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="task-name">{t.title}</div>
              <div className="task-meta">
                <span>
                  计划：<b>{t.schedule}</b>
                </span>
                <span>
                  负责岗位：<b>{t.position}</b>
                </span>
                <span>
                  已执行 <b>{t.runs}</b> 次
                </span>
                {t.once ? <span className="pill pill-wait">一次性</span> : <span className="pill pill-ok">周期</span>}
              </div>
            </div>
            <div className="task-right">
              <div className="task-sched">
                下次运行<b>{t.next}</b>
              </div>
              <div className={t.enabled ? 'switch on' : 'switch'} onClick={() => toggleTask(t.id)}>
                <i />
              </div>
              <button className="mini-btn" title="删除" onClick={() => openModal({ kind: 'delete-task', taskId: t.id })}>
                删除
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="panel panel-pad">
          <div className="empty-tip">还没有定时任务，点右上角「新建」</div>
        </div>
      )}
    </div>
  );
}
