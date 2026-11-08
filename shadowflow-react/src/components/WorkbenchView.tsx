import { useEffect, useRef, useState } from 'react';
import { useWorkbench } from '../store';
import LiveBoard from './LiveBoard';
import ConversationSidebar from './ConversationSidebar';
import ChatRichContent from './ChatRichContent';
import ChatApprovalCard from './ChatApprovalCard';
import ChatShopChangeCard from './ChatShopChangeCard';
import EmployeeAvatar from './EmployeeAvatar';

const QUICK_CHIPS = [
  { label: '生成本周获客简报', text: '生成本周获客简报' },
  { label: '安排每日行业简报', text: '安排每天早上 9 点的行业简报' },
  { label: '复盘上周转化', text: '复盘上周的转化数据' },
  { label: '整理客户跟进计划', text: '整理本周客户跟进计划' },
];

const ACCEPTED_FILES = '.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.txt';
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);

export default function WorkbenchView() {
  const { messages, typing, sendChat, editChatMessage, redoCheckpoint, conversations, activeConversationId, toast, models, selectedModel, selectModel, org } = useWorkbench();
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 目前只接入 MiMo；以后新增供应商时这里会自然出现更多选项。
  const supportedModels = models.filter(model => model.vendor === 'MiMo');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const activeConversation = conversations.find(item => item.id === activeConversationId);
  const projectLocked = Boolean(activeConversation?.projectId);
  const isGroup = activeConversation?.kind === 'group';
  const bossMessages = messages.filter(message => message.from === 'boss' && message.channel !== 'workflow' && message.id && !message.streaming);
  const latestBossMessageId = bossMessages[bossMessages.length - 1]?.id;

  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  useEffect(() => {
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setEditingId(null);
  }, [activeConversationId]);

  useEffect(() => {
    if (!typing) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [typing]);

  const sendAndFollow = (value: string) => {
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    sendChat(value);
  };
  const send = () => {
    const value = text.trim();
    if ((!value && !files.length) || typing) return;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setText('');
    setFiles([]);
    sendChat(value, files);
  };
  const addFiles = (incoming: File[]) => {
    const valid: File[] = [];
    for (const file of incoming) {
      const extension = file.name.toLowerCase().split('.').pop() || '';
      const image = IMAGE_TYPES.has(file.type) && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension);
      const video = VIDEO_TYPES.has(file.type) && ['mp4', 'webm'].includes(extension);
      const txt = (file.type === 'text/plain' || file.type === 'application/octet-stream') && extension === 'txt';
      if (!image && !video && !txt) { toast(`${file.name} 格式不支持`); continue; }
      if ((image && file.size > 10 * 1024 * 1024) || (video && file.size > 25 * 1024 * 1024) || (txt && file.size > 1024 * 1024)) {
        toast(`${file.name} 超过大小限制`); continue;
      }
      valid.push(file);
    }
    const next = [...files, ...valid];
    if (next.length > 4) { toast('每条消息最多添加 4 个文件'); return; }
    if (next.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) { toast('附件总大小不能超过 25 MB'); return; }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const jumpToLatest = () => {
    const el = bodyRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
    setShowJumpToLatest(false);
  };
  const handleChatScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 80;
    setShowJumpToLatest(distance > 120);
  };

  const copyMessage = async (value: string) => {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        // 部分浏览器拒绝异步剪贴板时，仍在本次点击中尝试兼容复制。
      }
    }
    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        textarea.remove();
      }
    }
    toast(copied ? '已复制' : '复制失败，请手动选择文本');
  };

  const toggleThinking = (id: string) => {
    setExpandedThinking(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="workbench">
      <ConversationSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)} />
      <div className="chat-col">
        <div className="chat-head">
          <EmployeeAvatar
            avatar={org.positions.find(position => position.root)?.avatar}
            name={isGroup ? '公司总经理群' : '总经理'}
            size={34}
            dot
          />
          <div className="name">{isGroup ? '公司总经理群' : '总经理'}</div>
          <label className="model-chip" aria-label="当前模型">
            <span>模型</span>
            <select
              value={selectedModel}
              onChange={event => selectModel(event.target.value)}
              disabled={!supportedModels.length}
              title="切换模型"
            >
              {!supportedModels.length && <option value={selectedModel}>读取模型…</option>}
              {supportedModels.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
          </label>
        </div>

        <div className="chat-scroll-wrap">
          <div className="chat-body" ref={bodyRef} onScroll={handleChatScroll}>
            {messages.map((m, i) => {
              const messageId = m.id ?? `message-${i}`;
              const showThinking = Boolean(m.thinking) && (!m.thinkingDone || expandedThinking.has(messageId));
              if (m.approval) return <ChatApprovalCard key={messageId} approval={m.approval} />;
              if (m.shopChange) return <ChatShopChangeCard key={messageId} change={m.shopChange} />;
              if (m.checkpoint) return (
                <div key={messageId} className="chat-checkpoint">
                  <span><strong>Checkpoint</strong><small>执行 {m.checkpoint.task_title} 之前</small></span>
                  <button type="button" disabled={typing || projectLocked} onClick={() => redoCheckpoint(m.checkpoint!.id)}>从这里重做</button>
                </div>
              );
              if (m.activity) {
                const activity = m.activity;
                const stateText = { pending: '等待上游', waiting_approval: '等待老板', running: '执行中', done: '完成', failed: '失败', blocked: '已阻塞', rejected: '已驳回' }[activity.status];
                return (
                  <div key={messageId} className={`chat-activity ${activity.kind} ${activity.status}`}>
                    <div className="chat-activity-marker" aria-hidden="true">{activity.kind === 'tool' ? '⌕' : activity.kind === 'dispatch' ? '→' : activity.kind === 'approval' ? '✓' : '◇'}</div>
                    <div className="chat-activity-body">
                      <div className="chat-activity-head"><strong>{activity.title}</strong><span>{stateText}{activity.duration_ms !== undefined ? ` · ${Math.max(1, Math.round(activity.duration_ms / 1000))} 秒` : ''}</span></div>
                      {activity.detail && <div className="chat-activity-detail">{activity.detail}</div>}
                      {activity.input && activity.kind === 'tool' && <div className="chat-activity-query">查询：{activity.input}</div>}
                      {activity.thinking && (
                        <details className="chat-activity-thinking" open={activity.status === 'running'}>
                          <summary>总经理思考过程</summary><div>{activity.thinking}</div>
                        </details>
                      )}
                      {activity.output && <details className="chat-activity-output"><summary>查看{activity.kind === 'model' ? '分工' : '结果'}</summary><ChatRichContent content={activity.output} /></details>}
                    </div>
                  </div>
                );
              }
              return (
                <div key={messageId} className={m.from === 'boss' ? 'msg-row boss' : `msg-row ${m.from}`}>
                  {m.from !== 'boss' && (
                    <EmployeeAvatar
                      avatar={m.from === 'ceo'
                        ? org.positions.find(position => position.root)?.avatar
                        : org.staff.find(staff => staff.name === m.senderName)?.avatar}
                      name={m.senderName ?? (m.from === 'ceo' ? '总经理' : '系统')}
                      size={28}
                    />
                  )}
                  <div>
                    {m.from !== 'boss' && <div className="msg-sender">{m.senderName ?? (m.from === 'ceo' ? '总经理' : '系统')}</div>}
                    {editingId === m.id ? (
                      <div className="message-editor">
                        <textarea aria-label="编辑最近发言" value={editDraft} onChange={event => setEditDraft(event.target.value)} rows={4} maxLength={12000} autoFocus />
                        <div className="message-editor-actions">
                          <button type="button" onClick={() => setEditingId(null)}>取消</button>
                          <button type="button" disabled={!editDraft.trim()} onClick={() => { editChatMessage(m.id!, editDraft); setEditingId(null); }}>保存并重新生成</button>
                        </div>
                      </div>
                    ) : (
                      <div className="bubble">
                        {m.attachments?.length ? <div className="message-attachments">{m.attachments.map((attachment, index) => <div className={`message-attachment ${attachment.kind}`} key={`${attachment.name}-${index}`}>
                          {attachment.kind === 'image' && attachment.data_url && <img src={attachment.data_url} alt={attachment.name} />}
                          {attachment.kind === 'video' && attachment.data_url && <video src={attachment.data_url} controls preload="metadata" />}
                          <span>{attachment.kind === 'text' ? 'TXT · ' : ''}{attachment.name}</span>
                        </div>)}</div> : null}
                        {m.thinking && (
                          <div className={m.thinkingDone ? 'reasoning-block done' : 'reasoning-block'}>
                            <button type="button" className="reasoning-toggle" onClick={() => toggleThinking(messageId)} aria-expanded={showThinking}>
                              <span>{m.thinkingDone ? '思考过程' : '正在思考'}</span>
                              <span className={showThinking ? 'reasoning-chevron open' : 'reasoning-chevron'} aria-hidden="true">⌄</span>
                            </button>
                            {showThinking && <div className="reasoning-content">{m.thinking}</div>}
                          </div>
                        )}
                        <ChatRichContent content={m.text} className="answer-content" />
                        {m.card && (
                          <div className="biz-card">
                            <div className="bc-head">交付物</div>
                            <div className="bc-body">
                              <div className="bc-title">{m.card.title}</div>
                              <div className="bc-meta">{m.card.meta}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="msg-meta">
                      <span className="msg-time">{m.time}</span>
                      {(m.from === 'boss' || m.from === 'ceo') && !m.streaming && m.channel !== 'workflow' && editingId !== m.id && (
                        <span className="msg-actions">
                          {m.from === 'boss' && m.id === latestBossMessageId && <button type="button" disabled={typing || projectLocked} onClick={() => { setEditingId(m.id!); setEditDraft(m.text); }}>编辑</button>}
                          <button type="button" onClick={() => void copyMessage(m.text)}>复制</button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {typing && (
              <div className="thinking-elapsed" role="status" aria-live="polite">
                <span className="thinking-pulse" aria-hidden="true" />
                已思考 {elapsedSeconds} 秒
              </div>
            )}
          </div>
          {showJumpToLatest && (
            <button type="button" className="jump-latest" onClick={jumpToLatest} aria-label="回到最新对话" title="回到最新对话">
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 3v12M5 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" /></svg>
            </button>
          )}
        </div>

        <div className="chat-foot">
          <div className="quick-chips">
            {QUICK_CHIPS.map(c => <button key={c.label} className="chip" disabled={typing || projectLocked} onClick={() => sendAndFollow(c.text)}>{c.label}</button>)}
          </div>
          {projectLocked && <div className="project-locked">此对话已绑定项目；有新需求请点击“新开对话”。</div>}
          {files.length > 0 && <div className="composer-files">{files.map((file, index) => <span className="composer-file" key={`${file.name}-${file.lastModified}`}>
            <span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></span>
            <button type="button" aria-label={`移除 ${file.name}`} onClick={() => setFiles(previous => previous.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </span>)}</div>}
          <div className={`input-row ${dragging ? 'dragging' : ''}`}
            onDragEnter={event => { event.preventDefault(); dragDepthRef.current += 1; setDragging(true); }}
            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={event => { event.preventDefault(); dragDepthRef.current -= 1; if (dragDepthRef.current <= 0) { dragDepthRef.current = 0; setDragging(false); } }}
            onDrop={event => { event.preventDefault(); dragDepthRef.current = 0; setDragging(false); if (!typing && !projectLocked) addFiles(Array.from(event.dataTransfer.files)); }}>
            <input ref={fileInputRef} className="composer-file-input" type="file" multiple accept={ACCEPTED_FILES} onChange={event => addFiles(Array.from(event.target.files ?? []))} />
            <button type="button" className="composer-add" disabled={typing || projectLocked} onClick={() => fileInputRef.current?.click()} aria-label="添加图片、视频或 TXT 文件" title="添加图片、视频或 TXT 文件">＋</button>
            <textarea
              className="chat-input"
              rows={1}
              placeholder={projectLocked ? '此对话已绑定项目，请新开对话创建新项目' : '给总经理派活，或拖入图片、视频、TXT'}
              value={text}
              disabled={projectLocked}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button type="button" className="send-btn" onClick={send} disabled={typing || projectLocked || (!text.trim() && !files.length)} title="发送">发送</button>
            {dragging && <div className="composer-drop-hint">松开以上传图片、视频或 TXT</div>}
          </div>
        </div>
      </div>
      <LiveBoard />
    </div>
  );
}
