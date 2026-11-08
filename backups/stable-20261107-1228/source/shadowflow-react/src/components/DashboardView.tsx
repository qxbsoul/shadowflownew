import { useWorkbench } from '../store';

const COLORS = ['#FF5B35', '#7B61FF', '#12B5A5', '#0D2440'];
const CIRCUMFERENCE = 2 * Math.PI * 56;

export default function DashboardView() {
  const { dashboard, dashboardLoading, refreshDashboard, toast } = useWorkbench();
  const max = Math.max(1, ...dashboard.series.map(point => point.value));
  const totalCalls = dashboard.breakdown.reduce((sum, item) => sum + item.calls, 0);
  const topModels = [...dashboard.breakdown].sort((a, b) => b.calls - a.calls).slice(0, 4);
  let offset = 0;

  const refresh = () => {
    void refreshDashboard()
      .then(() => toast('经营简报已按最新数据刷新'))
      .catch(() => toast('刷新失败，请查看工作台错误原因'));
  };

  return (
    <div className="view-inner">
      <div className="view-head">
        <div>
          <h2>数据看板</h2>
          <div className="sub">真实运行用量与公司经营数据 —— 调用、交付、成本一屏掌握</div>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" disabled={dashboardLoading} onClick={refresh}>
            {dashboardLoading ? '正在刷新…' : '刷新经营简报'}
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        {dashboard.kpis.map(kpi => (
          <div className="kpi-card" key={kpi.label}>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className={'kpi-trend ' + kpi.dir}>{kpi.trend}</div>
          </div>
        ))}
      </div>

      <div className="chart-grid">
        <div className="panel panel-pad">
          <div className="chart-title">近 7 天模型调用量</div>
          <div className="chart-sub">来自 Node 网关 token_usage 的按日真实调用次数</div>
          {dashboard.series.length ? (
            <svg viewBox="0 0 560 220" width="100%" height="220" role="img" aria-label="近 7 天模型调用量柱状图">
              <line x1="40" y1="190" x2="545" y2="190" stroke="rgba(13,36,64,.15)" strokeWidth="1" />
              {dashboard.series.map((point, index) => {
                const height = Math.round((point.value / max) * 140);
                const x = 60 + index * 68;
                const y = 190 - height;
                return (
                  <g key={point.day} fontSize="11" fill="#5B6B84" fontFamily="Noto Sans SC">
                    <rect x={x} y={y} width="46" height={height} fill={index === dashboard.series.length - 1 ? '#12B5A5' : '#0D2440'} opacity=".88" />
                    <text x={x + 23} y="208" textAnchor="middle">{point.label}</text>
                    <text x={x + 23} y={Math.max(16, y - 8)} textAnchor="middle" fill="#0D2440" fontWeight="600">{point.value}</text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="empty-tip" style={{ height: 220 }}>正在加载调用趋势</div>
          )}
        </div>

        <div className="panel panel-pad">
          <div className="chart-title">模型调用分布</div>
          <div className="chart-sub">近 30 天共 {totalCalls} 次调用，按模型统计</div>
          {totalCalls > 0 ? (
            <svg viewBox="0 0 240 190" width="100%" height="190" role="img" aria-label="模型调用分布环图">
              <g transform="translate(78,95)">
                <circle r="56" fill="none" stroke="rgba(13,36,64,.08)" strokeWidth="22" />
                {topModels.map((item, index) => {
                  const length = (item.calls / totalCalls) * CIRCUMFERENCE;
                  const currentOffset = offset;
                  offset += length;
                  return (
                    <circle
                      key={item.key}
                      r="56"
                      fill="none"
                      stroke={COLORS[index]}
                      strokeWidth="22"
                      strokeDasharray={`${length} ${CIRCUMFERENCE}`}
                      strokeDashoffset={-currentOffset}
                      transform="rotate(-90)"
                    />
                  );
                })}
              </g>
              <g fontSize="11" fontFamily="Noto Sans SC" fill="#12294A">
                {topModels.map((item, index) => (
                  <g key={item.key}>
                    <rect x="165" y={35 + index * 32} width="10" height="10" fill={COLORS[index]} />
                    <text x="182" y={44 + index * 32}>{item.key} {Math.round((item.calls / totalCalls) * 100)}%</text>
                  </g>
                ))}
              </g>
            </svg>
          ) : (
            <div className="empty-tip" style={{ height: 190 }}>当前窗口暂无模型调用记录</div>
          )}
          <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: '10px', paddingTop: '11px', fontSize: '11.5px', color: 'var(--muted)' }}>
            <b style={{ color: 'var(--navy)' }}>洞察：</b>{dashboard.insight}
          </div>
        </div>
      </div>
    </div>
  );
}
