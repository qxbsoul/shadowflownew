import { useState, type FormEvent } from 'react';
import { useWorkbench } from '../store';

export default function AuthView() {
  const { authPanel, setAuthPanel, authenticate, guestLogin, authError } = useWorkbench();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (authPanel === 'login') await authenticate('login', { email, password });
      else await authenticate('register', { email, password, display_name: displayName, company_name: companyName });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  };

  const guest = async () => {
    setBusy(true);
    setError('');
    try { await guestLogin(); } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-intro">
        <div className="brand-mark">S</div>
        <p className="auth-kicker">SHADOWFLOW · AI COMPANY OS</p>
        <h1>你的公司，<br />独立工作空间</h1>
        <p className="auth-lede">
          总经理接单、拆解、派工，员工带着工具真实执行；关键动作停下来等你点头，成果沉淀进公司自己的知识库。
        </p>
        <ul className="auth-points">
          <li>一个人也能拥有一支完整团队</li>
          <li>审批、预算与对外发布都握在你手里</li>
          <li>每次项目都变成公司的长期资产</li>
        </ul>
      </section>

      <section className="auth-card" aria-labelledby="auth-title">
        <p className="kicker">{authPanel === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}</p>
        <h2 id="auth-title">{authPanel === 'login' ? '登录 ShadowFlow' : '创建你的 ShadowFlow 账号'}</h2>
        <p className="auth-sub">
          {authPanel === 'login'
            ? '登录以继续你的工作空间；或直接以演示模式浏览。'
            : '注册后会为你创建独立公司空间；也可以先用演示模式体验。'}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="登录或注册">
          <button
            type="button"
            role="tab"
            aria-selected={authPanel === 'login'}
            className={authPanel === 'login' ? 'on' : ''}
            onClick={() => { setAuthPanel('login'); setError(''); }}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authPanel === 'register'}
            className={authPanel === 'register' ? 'on' : ''}
            onClick={() => { setAuthPanel('register'); setError(''); }}
          >
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {authPanel === 'register' && (
            <>
              <label>
                你的称呼
                <input
                  id="auth-name"
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                  placeholder="怎么称呼你"
                  autoComplete="name"
                  required
                />
              </label>
              <label>
                公司名称
                <input
                  id="auth-company"
                  value={companyName}
                  onChange={event => setCompanyName(event.target.value)}
                  placeholder="给公司起个名字"
                  required
                />
              </label>
            </>
          )}
          <label>
            邮箱
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            密码
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder={authPanel === 'register' ? '至少 8 位' : '你的密码'}
              autoComplete={authPanel === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          </label>

          {(error || authError) && <p className="auth-error" role="alert">{error || authError}</p>}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? '请稍候…' : authPanel === 'login' ? '登录并进入公司' : '注册并创建公司'}
            {!busy && (
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
              </svg>
            )}
          </button>
        </form>

        <div className="auth-foot">
          <button type="button" className="auth-demo" disabled={busy} onClick={() => void guest()}>
            游客一键体验
          </button>
        </div>
      </section>
    </div>
  );
}
