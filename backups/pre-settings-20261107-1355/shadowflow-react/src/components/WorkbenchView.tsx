import { useEffect, useRef, useState } from 'react';
import { useWorkbench } from '../store';
import LiveBoard from './LiveBoard';

const QUICK_CHIPS = [
  { label: '生成本周获客简报', text: '生成本周获客简报' },
  { label: '安排每日行业简报', text: '安排每天早上 9 点的行业简报' },
  { label: '复盘上周转化', text: '复盘上周的转化数据' },
  { label: '整理客户跟进计划', text: '整理本周客户跟进计划' },
];

export default function WorkbenchView() {
  const { messages, typing, sendChat, toast, gwStatus, models, selectedModel, selectModel } = useWorkbench();
  const [text, setText] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const send = () => {
    const value = text.trim();
    if (!value || typing) return;
    setText('');
    sendChat(value);
  };

  return (
    <div className="workbench">
      <div className="chat-col">
        <div className="chat-head">
          <div className="ava">总</div>
          <div>
            <div className="name">总经理</div>
            <div className="desc">AI 首席执行官 · 代表公司与你对接全部业务</div>
          </div>
          <div className="model-chip">
            <span>模型</span>
            <select value={selectedModel} onChange={e => selectModel(e.target.value)} disabled={gwStatus !== 'ok' || !models.length}>
              {gwStatus !== 'ok' && <option value={selectedModel}>演示模型</option>}
              {models.map(model => (
                <option key={model.id} value={model.id}>{model.label} · {model.tier}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="chat-body" ref={bodyRef}>
          {messages.map((m, i) => (
            <div key={i} className={m.from === 'boss' ? 'msg-row boss' : 'msg-row'}>
              {m.from === 'ceo' && <div className="msg-ava">总</div>}
              <div>
                <div className="bubble">
                  {m.text}
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
                <div className="msg-time">{m.time}</div>
              </div>
            </div>
          ))}
          {typing && (
            <div className="msg-row">
              <div className="msg-ava">总</div>
              <div className="bubble">
                <span className="typing"><i /><i /><i /></span>
              </div>
            </div>
          )}
        </div>

        <div className="chat-foot">
          <div className="quick-chips">
            {QUICK_CHIPS.map(c => (
              <button key={c.label} className="chip" disabled={typing} onClick={() => sendChat(c.text)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="input-row">
            <textarea
              className="chat-input"
              rows={1}
              placeholder="给总经理派活，比如：整理上周获客数据，明早发我简报"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="icon-btn" title="添加附件" onClick={() => toast('附件上传接口已预留，当前版本尚未接入')}>
              附件
            </button>
            <button className="send-btn" onClick={send} disabled={typing || !text.trim()} title="发送">
              发送
            </button>
          </div>
        </div>
      </div>
      <LiveBoard />
    </div>
  );
}
