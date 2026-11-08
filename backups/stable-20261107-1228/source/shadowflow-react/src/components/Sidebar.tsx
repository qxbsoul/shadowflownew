import type { ViewKey } from '../types';
import { useWorkbench, VIEW_TITLES } from '../store';

const NAV_GROUPS: { label: string; items: ViewKey[] }[] = [
  { label: '工 作', items: ['workbench', 'tasks', 'deliverables'] },
  { label: '公 司', items: ['org', 'dashboard', 'knowledge'] },
];

export default function Sidebar() {
  const { view, setView, tasks, gwStatus } = useWorkbench();
  const taskBadge = tasks.filter(t => t.enabled).length;

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">S</div>
        <div>
          <div className="brand-name">ShadowFlow</div>
          <div className="brand-sub">星火营销公司 · 工作台</div>
        </div>
      </div>

      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          <div className="nav-label">{group.label}</div>
          {group.items.map(item => (
            <button
              key={item}
              className={view === item ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(item)}
            >
              <span className="mark" />
              {VIEW_TITLES[item]}
              {item === 'tasks' && <span className="badge">{taskBadge}</span>}
            </button>
          ))}
        </div>
      ))}

      <div className="sidebar-foot">
        <div className="gw-pill" title="数据接口：ShadowFlow Gateway（?api= 可配置地址）">
          <span className={gwStatus === 'ok' ? 'dot ok' : 'dot off'} />
          <span>
            {gwStatus === 'connecting'
              ? '正在连接 Gateway…'
              : gwStatus === 'ok'
                ? 'Gateway 已连接 · 实时数据'
                : '演示数据 · Gateway 未连接'}
          </span>
        </div>
        <a className="gw-pill" href="https://github.com/Ravenveil/ShadowFlow" target="_blank" rel="noopener">
          <span className="dot ok" />
          <span>github.com/Ravenveil/ShadowFlow</span>
        </a>
        <div className="user-card">
          <div className="user-avatar">老</div>
          <div>
            <div className="user-name">老板</div>
            <div className="user-role">公司创始人</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
