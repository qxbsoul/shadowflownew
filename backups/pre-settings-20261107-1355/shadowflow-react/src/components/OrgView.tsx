import { useState } from 'react';
import type { OrgState, Position, Staff } from '../types';
import { AVATAR_PICKS } from '../data';
import { useWorkbench } from '../store';

export default function OrgView() {
  const {
    org,
    selectedPosId,
    selectedStaffId,
    selectPosition,
    selectStaff,
    openModal,
  } = useWorkbench();

  const selectedPos = org.positions.find(p => p.id === selectedPosId) || null;
  const selectedStaff = org.staff.find(s => s.id === selectedStaffId) || null;

  return (
    <div className="view-inner">
      <div className="view-head">
        <div>
          <h2>组织架构</h2>
          <div className="sub">组织 / 岗位 / 员工 / 汇报关系 —— 可随时调整，公司结构跟着业务走</div>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" onClick={() => openModal({ kind: 'new-dept' })}>
            新建部门
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => openModal({ kind: 'new-position' })}>
            新建岗位
          </button>
          <button className="btn btn-dark btn-sm" onClick={() => openModal({ kind: 'new-staff' })}>
            添加员工
          </button>
        </div>
      </div>

      <div className="org-layout">
        <div className="org-canvas">
          <div className="org-root-card">
            <button className="redit" onClick={() => selectPosition('p-ceo')}>
              编辑岗位说明书
            </button>
            <div className="tagline">公司负责人</div>
            <div className="rname">总经理 · AI 首席执行官</div>
            <div className="tagline" style={{ opacity: 0.9 }}>直接向你汇报 · 统管全部部门</div>
          </div>
          <div className="org-tree-line" />
          <div style={{ height: '22px' }} />
          <div className="dept-grid">
            {org.departments.map(d => (
              <DeptCard
                key={d.id}
                org={org}
                deptId={d.id}
                selectedPosId={selectedPosId}
                selectedStaffId={selectedStaffId}
                onSelectPosition={selectPosition}
                onSelectStaff={selectStaff}
              />
            ))}
          </div>
        </div>

        <aside className="org-inspector">
          <div className="panel">
            {selectedPos ? (
              <PositionInspector key={selectedPos.id} position={selectedPos} org={org} />
            ) : selectedStaff ? (
              <StaffInspector key={selectedStaff.id} staff={selectedStaff} org={org} />
            ) : (
              <>
                <div className="insp-head">
                  <div className="kind">岗位说明书</div>
                  <h3>选择左侧节点查看</h3>
                </div>
                <div className="panel-pad">
                  <div className="empty-tip">
                    点击岗位或员工，即可编辑职责、汇报关系与启用状态。
                    <br />
                    部门、岗位、员工都可以随时增删调整。
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─────────── 部门卡片 ─────────── */

function DeptCard({
  org,
  deptId,
  selectedPosId,
  selectedStaffId,
  onSelectPosition,
  onSelectStaff,
}: {
  org: OrgState;
  deptId: string;
  selectedPosId: string | null;
  selectedStaffId: string | null;
  onSelectPosition: (id: string) => void;
  onSelectStaff: (id: string) => void;
}) {
  const { openModal } = useWorkbench();
  const dept = org.departments.find(d => d.id === deptId)!;
  const positions = org.positions.filter(p => p.deptId === deptId);
  const staffCount = positions.reduce((n, p) => n + org.staff.filter(s => s.positionId === p.id).length, 0);

  return (
    <div className="dept-card">
      <div className="dept-head">
        <div>
          <div className="dept-name">{dept.name}</div>
          <div className="dept-stat">
            {positions.length} 个岗位 · {staffCount} 名员工
          </div>
        </div>
        <div className="dept-ops">
          <button className="mini-btn" title="在此部门新建岗位" onClick={() => openModal({ kind: 'new-position', deptId })}>
            添加岗位
          </button>
          <button className="mini-btn" title="重命名" onClick={() => openModal({ kind: 'rename-dept', deptId })}>
            重命名
          </button>
          <button className="mini-btn" title="删除部门" onClick={() => openModal({ kind: 'delete-dept', deptId })}>
            删除
          </button>
        </div>
      </div>
      <div className="pos-list">
        {positions.length ? (
          positions.map(p => {
            const mgr = p.managerId ? org.positions.find(x => x.id === p.managerId) : null;
            return (
              <div
                key={p.id}
                className={
                  'pos-card' +
                  (selectedPosId === p.id ? ' selected' : '') +
                  (p.enabled ? '' : ' disabled')
                }
                onClick={() => onSelectPosition(p.id)}
              >
                <div className="pos-top">
                  <span className="pos-avatar">{p.avatar}</span>
                  <span className="pos-name">{p.name}</span>
                  <span className="pos-report">汇报 → {mgr ? mgr.name : '公司'}</span>
                </div>
                <div className="staff-chips">
                  {org.staff
                    .filter(s => s.positionId === p.id)
                    .map(s => (
                      <span
                        key={s.id}
                        className={'staff-chip' + (selectedStaffId === s.id ? ' selected' : '')}
                        onClick={e => {
                          e.stopPropagation();
                          onSelectStaff(s.id);
                        }}
                      >
                        <span className="sava">{s.avatar}</span>
                        {s.name}
                      </span>
                    ))}
                  <span
                    className="staff-chip add"
                    onClick={e => {
                      e.stopPropagation();
                      openModal({ kind: 'new-staff', positionId: p.id });
                    }}
                  >
                    添加员工
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-tip">暂无岗位，点右上角「新建岗位」</div>
        )}
      </div>
    </div>
  );
}

/* ─────────── 岗位说明书（检查器） ─────────── */

function PositionInspector({ position, org }: { position: Position; org: OrgState }) {
  const { savePosition, openModal } = useWorkbench();
  const [name, setName] = useState(position.name);
  const [deptId, setDeptId] = useState(position.deptId ?? org.departments[0]?.id ?? '');
  const [managerId, setManagerId] = useState(position.managerId ?? 'p-ceo');
  const [soul, setSoul] = useState(position.soul);
  const [avatar, setAvatar] = useState(position.avatar);
  const [enabled, setEnabled] = useState(position.enabled);

  return (
    <>
      <div className="insp-head">
        <div className="kind">岗位说明书</div>
        <h3>
          {position.avatar} · {position.name}
        </h3>
      </div>
      <div className="panel-pad">
        <div className="form-group">
          <label className="form-label">岗位名称</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">所属部门</label>
          <select className="form-select" value={deptId} onChange={e => setDeptId(e.target.value)}>
            {org.departments.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">汇报对象</label>
          {position.root ? (
            <select className="form-select" disabled>
              <option>— 公司负责人，无上级 —</option>
            </select>
          ) : (
            <select className="form-select" value={managerId} onChange={e => setManagerId(e.target.value)}>
              {org.positions
                .filter(x => x.id !== position.id && !x.root)
                .map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              <option value="p-ceo">总经理（公司负责人）</option>
            </select>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">职责提示词（岗位灵魂）</label>
          <textarea className="form-area" value={soul} onChange={e => setSoul(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">头像标记（单字）</label>
          <div className="avatar-picks">
            {AVATAR_PICKS.map(a => (
              <button
                key={a}
                className={'avatar-pick' + (avatar === a ? ' selected' : '')}
                onClick={() => setAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group switch-row">
          <label className="form-label" style={{ margin: 0 }}>
            启用该岗位
          </label>
          <div className={enabled ? 'switch on' : 'switch'} onClick={() => setEnabled(!enabled)}>
            <i />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '9px', marginTop: '16px' }}>
          <button
            className="btn btn-dark btn-sm"
            style={{ flex: 1 }}
            onClick={() => savePosition(position.id, { name, deptId, managerId, soul, avatar, enabled })}
          >
            保存修改
          </button>
          {!position.root && (
            <button className="btn btn-danger btn-sm" onClick={() => openModal({ kind: 'delete-position', positionId: position.id })}>
              删除岗位
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/* ─────────── 员工档案（检查器） ─────────── */

function StaffInspector({ staff, org }: { staff: Staff; org: OrgState }) {
  const { saveStaff, openModal } = useWorkbench();
  const [name, setName] = useState(staff.name);
  const [positionId, setPositionId] = useState(staff.positionId);
  const [managerId, setManagerId] = useState(staff.managerId ?? 'p-ceo');
  const pos = org.positions.find(p => p.id === staff.positionId);

  return (
    <>
      <div className="insp-head">
        <div className="kind">员工档案</div>
        <h3>
          {staff.avatar} · {staff.name}
        </h3>
      </div>
      <div className="panel-pad">
        <div className="form-group">
          <label className="form-label">姓名</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">所属岗位</label>
          <select className="form-select" value={positionId} onChange={e => setPositionId(e.target.value)}>
            {org.positions
              .filter(p => !p.root)
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}（{org.departments.find(d => d.id === p.deptId)?.name || '—'}）
                </option>
              ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">汇报对象（岗位）</label>
          <select className="form-select" value={managerId} onChange={e => setManagerId(e.target.value)}>
            {org.positions
              .filter(p => !p.root && p.id !== staff.positionId)
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            <option value="p-ceo">总经理（公司负责人）</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">当前岗位职责</label>
          <div className="preview-box" style={{ fontSize: '11.5px' }}>
            {pos ? pos.soul : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '9px', marginTop: '16px' }}>
          <button
            className="btn btn-dark btn-sm"
            style={{ flex: 1 }}
            onClick={() => saveStaff(staff.id, { name, positionId, managerId })}
          >
            保存修改
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => openModal({ kind: 'delete-staff', staffId: staff.id })}>
            删除员工
          </button>
        </div>
      </div>
    </>
  );
}
