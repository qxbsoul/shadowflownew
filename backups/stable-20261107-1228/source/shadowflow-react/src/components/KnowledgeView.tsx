import { KB_TYPES } from '../data';
import { useWorkbench } from '../store';

export default function KnowledgeView() {
  const { knowledge, kbFilter, setKbFilter, toast } = useWorkbench();
  const list = knowledge.filter(k => kbFilter === '全部' || k.tags.includes(kbFilter));

  return (
    <div className="view-inner">
      <div className="view-head">
        <div>
          <h2>知识库</h2>
          <div className="sub">公司沉淀的行业情报、客户资料与方法论，AI 干活时自动引用</div>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" onClick={() => toast('资料上传向导尚未接入；知识包创建与索引 API 已在 api.ts 预留')}>
            上传资料
          </button>
        </div>
      </div>

      <div className="filter-tabs">
        {KB_TYPES.map(t => (
          <button key={t} className={'ftab' + (kbFilter === t ? ' active' : '')} onClick={() => setKbFilter(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="panel">
        {list.length ? (
          list.map(k => (
            <div className="kb-item" key={k.id} onClick={() => toast(`${k.title}：${k.tags.join(' · ')}；检索与浏览页面已预留`)}>
              <div className="kb-ico" style={{ background: k.color, color: 'var(--navy)' }}>
                {k.mark}
              </div>
              <div style={{ flex: 1 }}>
                <div className="kb-title">{k.title}</div>
                <div className="kb-desc">{k.desc}</div>
                <div className="kb-tags">
                  {k.tags.map(t => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-tip">该分类下暂无资料</div>
        )}
      </div>
    </div>
  );
}
