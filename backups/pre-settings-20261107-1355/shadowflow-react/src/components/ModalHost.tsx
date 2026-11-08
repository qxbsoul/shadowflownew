import { useEffect, useState } from 'react';
import { useWorkbench } from '../store';

export default function ModalHost() {
  const { modal, closeModal } = useWorkbench();

  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal, closeModal]);

  if (!modal) return null;
  const wide = modal.kind === 'preview-deliverable';

  return (
    <div
      className="modal-mask show"
      onClick={e => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true" aria-label={TITLE[modal.kind]}>
        <div className="modal-head">
          <h3>{TITLE[modal.kind]}</h3>
          <button className="modal-x" onClick={closeModal}>
            关闭
          </button>
        </div>
        <ModalBody modal={modal} />
      </div>
    </div>
  );
}

const TITLE: Record<string, string> = {
  'new-dept': '新建部门',
  'rename-dept': '重命名部门',
  'delete-dept': '删除部门',
  'new-position': '新建岗位',
  'delete-position': '删除岗位',
  'new-staff': '添加员工',
  'delete-staff': '删除员工',
  'new-task': '新建定时任务',
  'delete-task': '删除定时任务',
  'decide-approval': '人工审批',
  'delete-deliverable': '删除项目',
  'preview-deliverable': '交付物预览',
};

function ModalBody({ modal }: { modal: NonNullable<ReturnType<typeof useWorkbench>['modal']> }) {
  switch (modal.kind) {
    case 'new-dept':
      return <NewDeptModal />;
    case 'rename-dept':
      return <RenameDeptModal deptId={modal.deptId} />;
    case 'delete-dept':
      return <DeleteDeptModal deptId={modal.deptId} />;
    case 'new-position':
      return <NewPositionModal deptId={modal.deptId} />;
    case 'delete-position':
      return <DeletePositionModal positionId={modal.positionId} />;
    case 'new-staff':
      return <NewStaffModal positionId={modal.positionId} />;
    case 'delete-staff':
      return <DeleteStaffModal staffId={modal.staffId} />;
    case 'new-task':
      return <NewTaskModal />;
    case 'delete-task':
      return <DeleteTaskModal taskId={modal.taskId} />;
    case 'decide-approval':
      return <DecideApprovalModal approvalId={modal.approvalId} decision={modal.decision} />;
    case 'delete-deliverable':
      return <DeleteDeliverableModal deliverableId={modal.deliverableId} />;
    case 'preview-deliverable':
      return <PreviewDeliverableModal deliverableId={modal.deliverableId} />;
  }
}

/* ─────────── 部门 ─────────── */

function NewDeptModal() {
  const { createDept, closeModal, toast } = useWorkbench();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  return (
    <>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">部门名称</label>
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：渠道增长部"
          />
        </div>
        <div className="form-group">
          <label className="form-label">说明（可选）</label>
          <input
            className="form-input"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="这个部门负责什么业务"
          />
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>
          取消
        </button>
        <button
          className="btn btn-dark btn-sm"
          onClick={() => {
            if (!name.trim()) return toast('请填写部门名称');
            createDept(name.trim(), desc.trim());
          }}
        >
          创建部门
        </button>
      </div>
    </>
  );
}

function RenameDeptModal({ deptId }: { deptId: string }) {
  const { org, renameDept, closeModal } = useWorkbench();
  const dept = org.departments.find(d => d.id === deptId);
  const [name, setName] = useState(dept?.name ?? '');

  return (
    <>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">部门名称</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>
          取消
        </button>
        <button className="btn btn-dark btn-sm" onClick={() => renameDept(deptId, name.trim())}>
          保存
        </button>
      </div>
    </>
  );
}

function DeleteDeptModal({ deptId }: { deptId: string }) {
  const { org, deleteDept, closeModal } = useWorkbench();
  const dept = org.departments.find(d => d.id === deptId);
  const posIds = org.positions.filter(p => p.deptId === deptId).map(p => p.id);
  const staffN = org.staff.filter(s => posIds.includes(s.positionId)).length;

  return (
    <>
      <div className="modal-body">
        <div className="preview-box">
          确认删除「<b>{dept?.name}</b>」？将同时移除其下 <b>{posIds.length}</b> 个岗位与 <b>{staffN}</b> 名员工。此操作不可撤销。
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>
          取消
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => deleteDept(deptId)}>
          确认删除
        </button>
      </div>
    </>
  );
}

/* ─────────── 岗位 ─────────── */

function NewPositionModal({ deptId }: { deptId?: string }) {
  const { org, createPosition, closeModal, toast } = useWorkbench();
  const [name, setName] = useState('');
  const [dept, setDept] = useState(deptId ?? org.departments[0]?.id ?? '');
  const [managerId, setManagerId] = useState('p-ceo');
  const [soul, setSoul] = useState('');

  return (
    <>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">岗位名称</label>
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：增长运营专员"
          />
        </div>
        <div className="form-group">
          <label className="form-label">所属部门</label>
          <select className="form-select" value={dept} onChange={e => setDept(e.target.value)}>
            {org.departments.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">汇报对象</label>
          <select className="form-select" value={managerId} onChange={e => setManagerId(e.target.value)}>
            {org.positions
              .filter(p => !p.root)
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            <option value="p-ceo">总经理（公司负责人）</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">职责提示词（岗位灵魂）</label>
          <textarea
            className="form-area"
            value={soul}
            onChange={e => setSoul(e.target.value)}
            placeholder="描述这个岗位负责什么、怎么干活、交付什么"
          />
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>
          取消
        </button>
        <button
          className="btn btn-dark btn-sm"
          onClick={() => {
            if (!name.trim()) return toast('请填写岗位名称');
            createPosition({ name: name.trim(), deptId: dept, managerId, soul });
          }}
        >
          创建岗位
        </button>
      </div>
    </>
  );
}

function DeletePositionModal({ positionId }: { positionId: string }) {
  const { org, deletePosition, closeModal } = useWorkbench();
  const p = org.positions.find(x => x.id === positionId);
  const n = org.staff.filter(s => s.positionId === positionId).length;

  return (
    <>
      <div className="modal-body">
        <div className="preview-box">
          确认删除岗位「<b>{p?.name}</b>」？其下 <b>{n}</b> 名员工将同时移除。此操作不可撤销。
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>
          取消
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => deletePosition(positionId)}>
          确认删除
        </button>
      </div>
    </>
  );
}

/* ─────────── 员工 ─────────── */

function NewStaffModal({ positionId }: { positionId?: string }) {
  const { org, createStaff, closeModal, toast } = useWorkbench();
  const [name, setName] = useState('');
  const [pos, setPos] = useState(
    positionId ?? org.positions.find(p => !p.root)?.id ?? ''
  );
  const [managerId, setManagerId] = useState('p-ceo');

  return (
    <>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">姓名 / 花名</label>
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：小林"
          />
        </div>
        <div className="form-group">
          <label className="form-label">所属岗位</label>
          <select className="form-select" value={pos} onChange={e => setPos(e.target.value)}>
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
              .filter(p => !p.root)
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            <option value="p-ceo">总经理（公司负责人）</option>
          </select>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>
          取消
        </button>
        <button
          className="btn btn-dark btn-sm"
          onClick={() => {
            if (!name.trim()) return toast('请填写姓名');
            createStaff({ name: name.trim(), positionId: pos, managerId });
          }}
        >
          添加
        </button>
      </div>
    </>
  );
}

function DeleteStaffModal({ staffId }: { staffId: string }) {
  const { org, deleteStaff, closeModal } = useWorkbench();
  const s = org.staff.find(x => x.id === staffId);

  return (
    <>
      <div className="modal-body">
        <div className="preview-box">
          确认移除员工「<b>{s?.name}</b>」？
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>
          取消
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => deleteStaff(staffId)}>
          确认移除
        </button>
      </div>
    </>
  );
}

/* ─────────── 定时任务 ─────────── */

function NewTaskModal() {
  const { org, createTask, closeModal, toast } = useWorkbench();
  const [name, setName] = useState('');
  const [freq, setFreq] = useState('每天');
  const [time, setTime] = useState('09:00');
  const [runDate, setRunDate] = useState('');
  const [weekDay, setWeekDay] = useState('1');
  const [monthDay, setMonthDay] = useState('1');
  const enabledPositions = org.positions.filter(p => !p.root && p.enabled);
  const [position, setPosition] = useState(enabledPositions[0]?.id ?? '');

  return (
    <>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">任务名称</label>
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：每天早上 9 点生成行业简报"
          />
        </div>
        <div className="form-group">
          <label className="form-label">执行频率</label>
          <select className="form-select" value={freq} onChange={e => setFreq(e.target.value)}>
            <option>每天</option>
            <option>每周</option>
            <option>每月</option>
            <option>一次性</option>
          </select>
          <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '5px' }}>
            {freq === '一次性' ? '将在指定日期和时间执行一次' : '按此周期自动重复执行'}
          </div>
        </div>
        {freq === '一次性' && (
          <div className="form-group">
            <label className="form-label">执行日期</label>
            <input className="form-input" type="date" value={runDate} onChange={e => setRunDate(e.target.value)} />
          </div>
        )}
        {freq === '每周' && (
          <div className="form-group">
            <label className="form-label">星期</label>
            <select className="form-select" value={weekDay} onChange={e => setWeekDay(e.target.value)}>
              {['一', '二', '三', '四', '五', '六', '日'].map((day, index) => (
                <option key={day} value={index === 6 ? '0' : String(index + 1)}>星期{day}</option>
              ))}
            </select>
          </div>
        )}
        {freq === '每月' && (
          <div className="form-group">
            <label className="form-label">每月日期</label>
            <input className="form-input" type="number" min="1" max="28" value={monthDay} onChange={e => setMonthDay(e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">执行时间</label>
          <input className="form-input" type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">负责岗位</label>
          <select className="form-select" value={position} onChange={e => setPosition(e.target.value)}>
            {enabledPositions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>取消</button>
        <button
          className="btn btn-dark btn-sm"
          onClick={() => {
            if (!name.trim()) return toast('请填写任务名称');
            createTask({ title: name.trim(), freq, time: time || '09:00', position, runDate, weekDay, monthDay });
          }}
        >
          创建任务
        </button>
      </div>
    </>
  );
}

function DeleteTaskModal({ taskId }: { taskId: string }) {
  const { tasks, deleteTask, closeModal } = useWorkbench();
  const t = tasks.find(x => x.id === taskId);

  return (
    <>
      <div className="modal-body">
        <div className="preview-box">
          确认删除「<b>{t?.title}</b>」？删除后不再自动执行。
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>
          取消
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => deleteTask(taskId)}>
          确认删除
        </button>
      </div>
    </>
  );
}

/* ─────────── 人工审批 ─────────── */

function DecideApprovalModal({ approvalId, decision }: { approvalId: string; decision: 'approved' | 'rejected' }) {
  const { approvals, deliverables, decideApproval, closeModal, toast } = useWorkbench();
  const approval = approvals.find(item => item.id === approvalId);
  const project = deliverables.find(item => item.sourceId === approval?.project_id);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const approved = decision === 'approved';

  const submit = async () => {
    if (!approved && !note.trim()) return toast('驳回时请填写返工意见');
    setBusy(true);
    try {
      await decideApproval(approvalId, decision, note.trim());
      closeModal();
    } catch {
      // store 已展示真实 API 错误，弹窗保留供修正后重试。
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="modal-body">
        <div className="preview-box">
          <h4>{approval?.title ?? '审批事项'}</h4>
          <div style={{ fontSize: '11px', color: 'var(--muted)', margin: '4px 0 10px' }}>
            {project?.title ?? approval?.project_id ?? '公司项目'} · {approval?.payload?.by ?? '公司岗位'}
          </div>
          <div>{approval?.payload?.summary ?? '该审批没有额外交付摘要，请结合项目任务结果验收。'}</div>
          {approval?.payload?.summary?.includes('[simulated]') && (
            <div style={{ fontSize: '11px', color: 'var(--amber)', marginTop: '10px' }}>
              当前摘要来自后端模拟执行，没有真实模型成果可供核验。
            </div>
          )}
        </div>
        <div className="form-group" style={{ marginTop: '14px' }}>
          <label className="form-label">审批意见{approved ? '（可选）' : '（返工要求，必填）'}</label>
          <textarea
            className="form-area"
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder={approved ? '可填写验收说明' : '请说明需要修改的内容，任务将退回负责岗位返工'}
          />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {approved ? '批准后会自动调用项目执行接口；若还有后续审批，项目会停在下一节点。' : '驳回后任务退回待执行，并自动按你的意见重新执行。'}
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={closeModal}>取消</button>
        <button className={approved ? 'btn btn-dark btn-sm' : 'btn btn-danger btn-sm'} disabled={busy} onClick={() => void submit()}>
          {busy ? '正在提交并执行…' : approved ? '批准并继续' : '确认驳回并返工'}
        </button>
      </div>
    </>
  );
}

/* ─────────── 交付物预览 / 删除 / 重试 ─────────── */

function DeleteDeliverableModal({ deliverableId }: { deliverableId: string }) {
  const { deliverables, deleteDeliverable, closeModal } = useWorkbench();
  const d = deliverables.find(item => item.id === deliverableId);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await deleteDeliverable(deliverableId);
    } catch {
      // store 已展示真实 API 错误，弹窗保留供确认状态后重试。
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="modal-body">
        <div className="preview-box">
          确认删除项目「<b>{d?.title ?? deliverableId}</b>」？项目任务、审批记录和关联台账将一并删除，此操作不可撤销。商务订单项目需先走订单取消或归档流程。
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={closeModal}>取消</button>
        <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => void submit()}>
          {busy ? '正在删除…' : '确认删除'}
        </button>
      </div>
    </>
  );
}

function PreviewDeliverableModal({ deliverableId }: { deliverableId: string }) {
  const { deliverables, closeModal, openModal, toast, loadDeliverable, retryDeliverable, gwStatus } = useWorkbench();
  const d = deliverables.find(x => x.id === deliverableId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (d?.sourceId && !d.contentLoaded) void loadDeliverable(deliverableId);
    // 项目状态变化后重新加载正文；contentLoaded 防止重复请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverableId, d?.contentLoaded, d?.rawStatus]);
  if (!d) return null;

  const retry = async () => {
    setBusy(true);
    try {
      await retryDeliverable(deliverableId);
    } catch {
      // store 已展示真实 API 错误。
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="modal-body">
        <div className="preview-box">
          <h4>{d.title}</h4>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
            {d.type} · {d.client} · {d.time} · {d.status}
          </div>
          {gwStatus === 'ok' && d.contentLoaded && d.contentMode && d.contentMode !== 'live' && (
            <div style={{ fontSize: '11px', color: 'var(--amber)', marginBottom: '12px' }}>
              {d.contentMode === 'simulated'
                ? '以下为后端模拟执行记录，不是真实模型生成的业务交付。'
                : d.contentMode === 'mixed'
                  ? '以下记录包含模拟或失败任务，请区分真实产出后再验收。'
                  : '以下记录包含执行错误或加载失败，不代表有效业务交付。'}
            </div>
          )}
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
            {gwStatus === 'ok'
              ? d.contentLoaded
                ? d.content
                : d.status === '已交付'
                  ? '正在从项目记录加载交付正文…'
                  : '项目尚未交付，当前没有可预览正文。'
              : d.content ?? '离线演示模式：连接 Gateway 后展示真实项目交付正文。'}
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={closeModal}>关闭</button>
        {gwStatus === 'ok' && d.sourceId && (
          <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => openModal({ kind: 'delete-deliverable', deliverableId })}>
            删除项目
          </button>
        )}
        {gwStatus === 'ok' && d.sourceId && d.rawStatus === 'failed' && (
          <button className="btn btn-dark btn-sm" disabled={busy} onClick={() => void retry()}>
            {busy ? '正在重试…' : '重试失败任务'}
          </button>
        )}
        <button className="btn btn-dark btn-sm" disabled={busy} onClick={() => toast('导出能力尚未接入；/api/export 已在统一客户端中预留')}>
          导出 PDF
        </button>
      </div>
    </>
  );
}
