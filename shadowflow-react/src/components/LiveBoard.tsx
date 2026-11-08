import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkbench } from '../store';
import type { ChatActivity, ChatWorkflowItem, ChatWorkflowRun } from '../types';
import ChatRichContent from './ChatRichContent';
import EmployeeAvatar from './EmployeeAvatar';
import './live-board.css';

type BoardTab = 'process' | 'outputs' | 'errors';
type ActivityStatus = 'pending' | 'waiting_approval' | 'running' | 'done' | 'failed' | 'blocked' | 'rejected';

interface DagDefinition {
  id: string;
  agent_id: string;
  name: string;
  title: string;
  depends_on: string[];
  requires_approval: boolean;
  validation_error: string | null;
}

type LiveActivity = Omit<ChatActivity, 'kind' | 'status'> & {
  kind: 'tool' | 'dispatch' | 'model' | 'approval';
  status: ActivityStatus;
  depends_on?: string[];
  thinking?: string;
  approval_id?: string;
};

type LiveRun = ChatWorkflowRun & { dag?: DagDefinition[] };

interface BoardNode {
  id: string;
  agentId: string;
  name: string;
  title: string;
  dependsOn: string[];
  requiresApproval: boolean;
  validationError: string | null;
  status: ActivityStatus;
  item?: ChatWorkflowItem;
  activity?: LiveActivity;
}

interface BoardGraph {
  nodes: BoardNode[];
  layers: BoardNode[][];
  byId: Map<string, BoardNode>;
}

const STATUS_LABELS: Record<ActivityStatus, string> = {
  pending: '待执行',
  waiting_approval: '待审批',
  running: '执行中',
  done: '已完成',
  failed: '失败',
  blocked: '已阻塞',
  rejected: '已拒绝',
};

function formatDuration(ms?: number): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function StatusPill({ status }: { status: ActivityStatus }) {
  return <span className={`dag-status dag-status-${status}`}><i aria-hidden="true" />{STATUS_LABELS[status]}</span>;
}

function nodeContent(node: BoardNode): string {
  return node.item?.content || node.activity?.output || '';
}

function nodeThinking(node: BoardNode): string {
  return node.item?.thinking || node.activity?.thinking || '';
}

function buildGraph(run: ChatWorkflowRun): BoardGraph {
  const liveRun = run as LiveRun;
  const employeeActivities = (run.activities as LiveActivity[]).filter(activity => activity.name === 'employee_task');
  const nodes = new Map<string, BoardNode>();
  const itemById = new Map(run.items.map(item => [item.id, item]));

  const findItem = (id: string, agentId: string, title: string) => itemById.get(id)
    ?? run.items.find(item => item.id === employeeActivities.find(activity => activity.task_id === id)?.id)
    // 刷新后消息 id 与实时 activity id 不同；每个成员每轮至多一个工单，可用成员身份合并。
    ?? run.items.find(item => item.agentId === agentId && (!title || item.taskTitle === title || item.taskTitle === '岗位工单'))
    ?? run.items.find(item => item.agentId === agentId);

  for (const definition of liveRun.dag ?? []) {
    const activity = employeeActivities.find(candidate => candidate.task_id === definition.id || candidate.id === definition.id);
    const item = findItem(definition.id, definition.agent_id, definition.title);
    nodes.set(definition.id, {
      id: definition.id,
      agentId: definition.agent_id,
      name: definition.name,
      title: definition.title,
      dependsOn: [...definition.depends_on],
      requiresApproval: definition.requires_approval,
      validationError: definition.validation_error,
      status: item?.status ?? activity?.status ?? 'pending',
      item,
      activity,
    });
  }

  for (const activity of employeeActivities) {
    const id = activity.task_id ?? activity.id;
    const existing = nodes.get(id);
    if (existing) {
      existing.activity = activity;
      existing.item = existing.item ?? itemById.get(activity.id) ?? run.items.find(item => item.agentId === activity.agent_id);
      existing.status = existing.item?.status ?? activity.status;
      if (!activity.depends_on?.length) continue;
      existing.dependsOn = [...activity.depends_on];
      continue;
    }
    const item = itemById.get(activity.id) ?? run.items.find(candidate => candidate.id === id || candidate.agentId === activity.agent_id);
    nodes.set(id, {
      id,
      agentId: activity.agent_id ?? item?.agentId ?? '',
      name: activity.actor || item?.name || activity.title,
      title: activity.title || item?.taskTitle || '岗位工单',
      dependsOn: [...(activity.depends_on ?? [])],
      requiresApproval: Boolean(activity.approval_id),
      validationError: null,
      status: item?.status ?? activity.status,
      item,
      activity,
    });
  }

  for (const item of run.items) {
    if ([...nodes.values()].some(node => node.item?.id === item.id)) continue;
    const activity = employeeActivities.find(candidate => candidate.id === item.id || candidate.task_id === item.id);
    nodes.set(item.id, {
      id: item.id,
      agentId: item.agentId ?? activity?.agent_id ?? '',
      name: item.name,
      title: item.taskTitle,
      dependsOn: [...(activity?.depends_on ?? [])],
      requiresApproval: Boolean(activity?.approval_id),
      validationError: null,
      status: item.status,
      item,
      activity,
    });
  }

  const allNodes = [...nodes.values()];
  const knownIds = new Set(allNodes.map(node => node.id));
  const remaining = new Set(allNodes.map(node => node.id));
  const layers: BoardNode[][] = [];

  while (remaining.size) {
    const ready = allNodes.filter(node => remaining.has(node.id)
      && node.dependsOn.every(dependency => !knownIds.has(dependency) || !remaining.has(dependency)));
    if (!ready.length) {
      // 依赖环或无效图仍完整展示，不静默丢弃任何员工节点。
      layers.push(allNodes.filter(node => remaining.has(node.id)));
      break;
    }
    layers.push(ready);
    ready.forEach(node => remaining.delete(node.id));
  }

  return { nodes: allNodes, layers, byId: nodes };
}

function DagCanvas({ layers, selectedId, onSelect }: {
  layers: BoardNode[][];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { chatApprovals, org } = useWorkbench();
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const [paths, setPaths] = useState<Array<{ id: string; d: string; active: boolean }>>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const widestLayer = Math.max(1, ...layers.map(layer => layer.length));

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const nextPaths: Array<{ id: string; d: string; active: boolean }> = [];
      for (const layer of layers) {
        for (const node of layer) {
          const target = nodeRefs.current.get(node.id);
          if (!target) continue;
          const targetRect = target.getBoundingClientRect();
          for (const dependency of node.dependsOn) {
            const source = nodeRefs.current.get(dependency);
            if (!source) continue;
            const sourceRect = source.getBoundingClientRect();
            const x1 = sourceRect.left - canvasRect.left + sourceRect.width / 2 + canvas.scrollLeft;
            const y1 = sourceRect.bottom - canvasRect.top + canvas.scrollTop;
            const x2 = targetRect.left - canvasRect.left + targetRect.width / 2 + canvas.scrollLeft;
            const y2 = targetRect.top - canvasRect.top + canvas.scrollTop;
            const bend = Math.max(18, (y2 - y1) / 2);
            nextPaths.push({
              id: `${dependency}->${node.id}`,
              d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
              active: node.status === 'running' || node.id === selectedId || dependency === selectedId,
            });
          }
        }
      }
      setPaths(nextPaths);
      setCanvasSize({ width: canvas.scrollWidth, height: canvas.scrollHeight });
    };
    const frame = window.requestAnimationFrame(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    nodeRefs.current.forEach(node => observer.observe(node));
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [layers, selectedId]);

  return (
    <div className="dag-scroll">
      <div className="dag-canvas" ref={canvasRef} style={{ minWidth: `${Math.max(100, widestLayer * 156)}px` }}>
        <svg className="dag-edges" width={canvasSize.width} height={canvasSize.height} aria-hidden="true">
          <defs>
            <marker id="dag-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 8 4 L 0 8 z" />
            </marker>
          </defs>
          {paths.map(path => <path key={path.id} className={path.active ? 'dag-edge active' : 'dag-edge'} d={path.d} markerEnd="url(#dag-arrow)" />)}
        </svg>
        {layers.map((layer, layerIndex) => (
          <section className="dag-layer" key={layer.map(node => node.id).join('|')} aria-label={`拓扑第 ${layerIndex + 1} 层`}>
            <div className="dag-layer-label"><span>第 {layerIndex + 1} 层</span><span>{layer.length > 1 ? `${layer.length} 项并行` : '单节点'}</span></div>
            <div className="dag-layer-nodes" style={{ gridTemplateColumns: `repeat(${layer.length}, minmax(140px, 1fr))` }}>
              {layer.map(node => {
                const approval = chatApprovals.find(item => item.task_id === node.id);
                return (
                <button
                  type="button"
                  className={`dag-node dag-node-${node.status}${selectedId === node.id ? ' selected' : ''}`}
                  key={node.id}
                  ref={element => {
                    if (element) nodeRefs.current.set(node.id, element);
                    else nodeRefs.current.delete(node.id);
                  }}
                  onClick={() => onSelect(node.id)}
                  aria-label={`查看${node.name}：${node.title}，${STATUS_LABELS[node.status]}`}
                >
                  <span className="dag-node-top">
                    <EmployeeAvatar avatar={org.staff.find(staff => staff.name === node.name)?.avatar} name={node.name} size={22} />
                    <StatusPill status={node.status} />
                  </span>
                  <strong>{node.name}</strong>
                  <span className="dag-node-title">{node.title}</span>
                  <span className="dag-node-meta">
                    <span>{node.dependsOn.length ? `${node.dependsOn.length} 个上游` : '无上游依赖'}</span>
                    <span>{formatDuration(node.item?.durationMs ?? node.activity?.duration_ms) || '详情 ›'}</span>
                  </span>
                  {node.requiresApproval && (
                    <span className={`dag-node-approval${approval && approval.status !== 'pending' ? ' done' : ''}`}>
                      {approval
                        ? approval.status === 'pending'
                          ? '待审批'
                          : approval.decision === 'approve' || approval.outcome === 'continue' ? '已批准' : '已驳回'
                        : '需人工审批'}
                    </span>
                  )}
                  {node.validationError && <span className="dag-node-validation">{node.validationError}</span>}
                </button>
              );})}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [value]);
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return <button type="button" className="inspector-copy" disabled={!value} onClick={() => void copy()}>{copied ? '已复制' : `复制${label}`}</button>;
}

function AgentInspector({ node, graph, onClose, onSelect, onApprovals }: {
  node: BoardNode;
  graph: BoardGraph;
  onClose: () => void;
  onSelect: (id: string) => void;
  onApprovals: () => void;
}) {
  const [thinkingOpen, setThinkingOpen] = useState(node.status === 'running');
  const content = nodeContent(node);
  const thinking = nodeThinking(node);

  useEffect(() => {
    setThinkingOpen(node.status === 'running');
  }, [node.id, node.status]);

  return (
    <div className="inspector-shell">
      <div className="inspector-head">
        <button type="button" className="inspector-back" onClick={onClose} aria-label="返回 DAG" title="返回 DAG">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M10 3 5 8l5 5M5 8h8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        <span className="inspector-avatar" aria-hidden="true">{node.name.slice(0, 1)}</span>
        <div className="inspector-title"><strong>{node.name}</strong><span>员工工单详情</span></div>
        <StatusPill status={node.status} />
      </div>
      <div className="inspector-stream">
        <section className="inspector-section">
          <div className="inspector-section-label">岗位工单</div>
          <h4>{node.title}</h4>
          <div className="inspector-meta"><span>节点 {node.id}</span>{node.requiresApproval && <span>完成后需审批</span>}</div>
        </section>

        <section className="inspector-section">
          <div className="inspector-section-label">真实上游依赖 · {node.dependsOn.length}</div>
          {node.dependsOn.length ? (
            <div className="inspector-upstreams">
              {node.dependsOn.map(dependency => {
                const upstream = graph.byId.get(dependency);
                return upstream ? (
                  <button type="button" key={dependency} onClick={() => onSelect(dependency)}>
                    <span><strong>{upstream.name}</strong><small>{upstream.title}</small></span>
                    <StatusPill status={upstream.status} />
                  </button>
                ) : <div className="inspector-missing" key={dependency}>上游节点 {dependency} 尚未出现在本轮数据中</div>;
              })}
            </div>
          ) : <p className="inspector-muted">无上游依赖，可在规划后直接执行。</p>}
        </section>

        {node.validationError && <section className="inspector-section inspector-alert"><strong>依赖校验异常</strong><p>{node.validationError}</p></section>}
        {(node.status === 'waiting_approval' || node.activity?.approval_id) && (
          <section className="inspector-section inspector-approval">
            <div><strong>人工审批</strong><p>{node.status === 'waiting_approval' ? '该节点正在等待审批，审批前不会继续交付。' : '该节点关联人工审批记录。'}</p></div>
            <button type="button" onClick={onApprovals}>前往审批</button>
          </section>
        )}

        <section className="inspector-section">
          <button type="button" className="inspector-thinking-toggle" onClick={() => setThinkingOpen(value => !value)} aria-expanded={thinkingOpen} disabled={!thinking}>
            <span>{node.status === 'running' ? '正在思考与执行' : '员工思考与执行过程'}</span>
            <span>{thinking ? (thinkingOpen ? '收起' : '展开') : '未返回思考文本'}</span>
          </button>
          {thinking && <div className="inspector-copy-row"><CopyButton value={thinking} label="思考" /></div>}
          {thinkingOpen && thinking && <pre className="inspector-thinking">{thinking}</pre>}
        </section>

        <section className="inspector-section inspector-output-section">
          <div className="inspector-output-head">
            <span>{node.status === 'failed' || node.status === 'rejected' ? '失败 / 拒绝原因' : '员工完整产出'}</span>
            <CopyButton value={content} label="产出" />
          </div>
          {content ? <ChatRichContent content={content} className="inspector-output" /> : <p className="inspector-muted">{node.status === 'pending' ? '等待上游完成后开始生成。' : '正在生成本岗位成果…'}</p>}
        </section>
      </div>
    </div>
  );
}

/** 右栏只投影本地真实对话与项目数据；员工过程不进入单聊聊天区。 */
export default function LiveBoard() {
  const { chatWorkflow, errors, retryError, setView, activeConversationId } = useWorkbench();
  const [tab, setTab] = useState<BoardTab>('process');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [inspectedItemId, setInspectedItemId] = useState('');
  const runs = chatWorkflow.runs;
  const selectedRun = useMemo(() => runs.find(run => run.id === selectedRunId) ?? runs[runs.length - 1], [runs, selectedRunId]);
  const graph = useMemo(() => selectedRun ? buildGraph(selectedRun) : { nodes: [], layers: [], byId: new Map<string, BoardNode>() }, [selectedRun]);
  const inspectedNode = inspectedItemId ? graph.byId.get(inspectedItemId) : undefined;
  const runningCount = graph.nodes.filter(node => node.status === 'running').length;
  const unresolved = errors.filter(error => !error.resolved).length;

  useEffect(() => {
    setSelectedRunId('');
    setInspectedItemId('');
    setTab('process');
  }, [activeConversationId]);

  useEffect(() => {
    if (selectedRunId && !runs.some(run => run.id === selectedRunId)) setSelectedRunId('');
    if (inspectedItemId && !graph.byId.has(inspectedItemId)) setInspectedItemId('');
  }, [runs, selectedRunId, inspectedItemId, graph]);

  return (
    <aside className="live-col">
      {selectedRun && inspectedNode ? (
        <AgentInspector node={inspectedNode} graph={graph} onClose={() => setInspectedItemId('')} onSelect={setInspectedItemId} onApprovals={() => setView('approvals')} />
      ) : (
        <>
          <div className="live-title"><span className="pulse" /><h3>公司现场</h3></div>
          <div className="live-tabs" role="tablist" aria-label="公司现场视图">
            <button type="button" role="tab" aria-selected={tab === 'process'} className={tab === 'process' ? 'active' : ''} onClick={() => setTab('process')}>过程</button>
            <button type="button" role="tab" aria-selected={tab === 'outputs'} className={tab === 'outputs' ? 'active' : ''} onClick={() => setTab('outputs')}>产物 <span>{graph.nodes.length}</span></button>
            <button type="button" role="tab" aria-selected={tab === 'errors'} className={tab === 'errors' ? 'active' : ''} onClick={() => setTab('errors')}>异常 {unresolved > 0 && <span>{unresolved}</span>}</button>
          </div>
          <div className="live-stream">
            {tab === 'process' && (
              <>
                {runs.length > 0 && selectedRun && (
                  <>
                    <div className="run-switcher">
                      <select value={selectedRun.id} onChange={event => { setSelectedRunId(event.target.value); setInspectedItemId(''); }} aria-label="选择执行轮次">
                        {runs.map((run, index) => <option key={run.id} value={run.id}>第 {index + 1} 轮 · {run.goal.slice(0, 28)}</option>)}
                      </select>
                      <span>{runningCount ? `${runningCount} 项执行中` : `${graph.nodes.length} 个员工节点`}</span>
                    </div>
                    <details className="workflow-plan" open={runningCount > 0}>
                      <summary><span>总经理分工摘要</span><span>{selectedRun.strategy || '协作计划'}</span></summary>
                      <div className="workflow-plan-text">{selectedRun.plan || '正在理解目标并拆解任务…'}</div>
                    </details>
                    {graph.layers.length > 0 ? (
                      <DagCanvas layers={graph.layers} selectedId={inspectedItemId} onSelect={setInspectedItemId} />
                    ) : <div className="dag-empty">等待本轮 DAG 规划，所有员工节点将在规划后一次性展示。</div>}
                    {selectedRun.activities.filter(activity => activity.name !== 'employee_task').length > 0 && (
                      <details className="dag-activity-log">
                        <summary>工具与调度记录 <span>{selectedRun.activities.filter(activity => activity.name !== 'employee_task').length}</span></summary>
                        <div className="workflow-activity-list" aria-label="本轮工具与调度记录">
                          {(selectedRun.activities as LiveActivity[]).filter(activity => activity.name !== 'employee_task').map(activity => (
                            <div className={`workflow-activity ${activity.status}`} key={activity.id}>
                              <span className="workflow-activity-icon" aria-hidden="true">{activity.kind === 'tool' ? '⌕' : activity.kind === 'dispatch' ? '→' : activity.kind === 'approval' ? '✓' : '◇'}</span>
                              <div><strong>{activity.title}</strong><span>{activity.detail}</span></div>
                              <StatusPill status={activity.status} />
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {graph.nodes.length > 0 && graph.nodes.every(node => node.status === 'done') && <div className="workflow-complete">员工成果已回传总经理，最终答复在对话区。</div>}
                  </>
                )}
                {runs.length === 0 && <div className="empty-tip">当前没有执行记录，给总经理派个活试试</div>}
              </>
            )}
            {tab === 'outputs' && (
              <div className="outputs-list">
                {graph.nodes.map(node => (
                  <button type="button" className="output-item" key={node.id} onClick={() => { setInspectedItemId(node.id); setTab('process'); }}>
                    <span className="dl-ico">{node.name.slice(0, 1)}</span>
                    <span className="output-main"><strong>{node.title}</strong><span>{node.name} · {nodeContent(node) ? `${nodeContent(node).length} 字` : STATUS_LABELS[node.status]}</span></span>
                    <StatusPill status={node.status} />
                  </button>
                ))}
                {!graph.nodes.length && <div className="empty-tip">还没有交付成果</div>}
              </div>
            )}
            {tab === 'errors' && (
              <div>
                {errors.map(error => (
                  <div className={error.resolved ? 'err-item resolved' : 'err-item'} key={error.id}>
                    <div className="err-title"><span className={`pill ${error.resolved ? 'pill-ok' : 'pill-err'}`}>{error.resolved ? '已处理' : '异常'}</span> {error.title}</div>
                    <div className="err-line"><b>原因：</b>{error.cause}</div>
                    <div className="err-line"><b>影响：</b>{error.impact}</div>
                    <div className="err-line"><b>处置：</b>{error.action}</div>
                    <div className="err-actions"><span>{error.time}</span>{!error.resolved && <button className="btn btn-ghost btn-sm" onClick={() => retryError(error.id)}>标记已处理</button>}</div>
                  </div>
                ))}
                {!errors.length && <div className="empty-tip">未发现异常，一切正常</div>}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
