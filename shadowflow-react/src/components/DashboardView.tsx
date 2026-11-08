import { useState } from 'react';
import type { DashboardSection } from '../store';
import { useWorkbench } from '../store';

const number = new Intl.NumberFormat('zh-CN');
const money = (value: number) => `¥${value.toFixed(value > 0 && value < 0.01 ? 6 : 4)}`;
const yuan = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
const cny = (value: number) => `¥${value.toFixed(2)}`;
const wan = (cents: number) => (cents >= 1_000_000 ? `¥${(cents / 1_000_000).toFixed(2)}万` : yuan(cents));

type Metric = 'tokens' | 'cost' | 'calls';

const SECTIONS: Array<{ key: DashboardSection; label: string; hint: string }> = [
  { key: 'sales', label: '商品销售', hint: '销量、排行与订单结构' },
  { key: 'finance', label: '公司财务', hint: '营收 / 成本 / 毛利' },
  { key: 'ai', label: 'AI 成本', hint: '模型用量与刊例价估算' },
];

export default function DashboardView() {
  const {
    dashboardSection, setDashboardSection, shopFinance, shopSales, shopStatsLoading,
    refreshShopFinance, refreshShopSales, toast,
  } = useWorkbench();

  const refresh = () => {
    if (dashboardSection === 'finance') {
      void refreshShopFinance().then(() => toast('已读取最新财务数据')).catch(() => toast('刷新失败，请稍后重试'));
    } else {
      void refreshShopSales().then(() => toast('已读取最新销售数据')).catch(() => toast('刷新失败，请稍后重试'));
    }
  };

  return (
    <div className="view-inner usage-dashboard dashboard-page">
      <div className="view-head">
        <div>
          <h2>数据看板</h2>
          <p className="view-description">商品销售、公司财务与 AI 成本三块口径分开统计；模型成本按刊例价估算，不代表实际账单扣费。</p>
        </div>
        {dashboardSection !== 'ai' && (
          <div className="actions">
            <button className="btn btn-ghost btn-sm" disabled={shopStatsLoading} onClick={refresh}>
              {shopStatsLoading ? '正在刷新…' : '刷新数据'}
            </button>
          </div>
        )}
      </div>

      <div className="settings-shell dashboard-shell">
        <nav className="panel settings-nav dashboard-nav" aria-label="看板分区">
          {SECTIONS.map(section => (
            <button
              key={section.key}
              type="button"
              className={dashboardSection === section.key ? 'settings-nav-item active' : 'settings-nav-item'}
              onClick={() => setDashboardSection(section.key)}
            >
              <span>{section.label}</span>
              <small>{section.hint}</small>
            </button>
          ))}
        </nav>
        <div className="settings-content dashboard-content">
          {dashboardSection === 'ai' && <AiCostPanel />}
          {dashboardSection === 'finance' && <FinancePanel />}
          {dashboardSection === 'sales' && <SalesPanel />}
        </div>
      </div>
    </div>
  );
}

/* ── AI 成本 ─────────────────────────────────────────────────────────────── */

function AiCostPanel() {
  const { dashboard, dashboardLoading, refreshDashboard, toast, billing, refreshBilling } = useWorkbench();
  const [metric, setMetric] = useState<Metric>('tokens');
  const values = dashboard.series.map(point => metric === 'tokens' ? point.tokens : metric === 'cost' ? point.costCny : point.calls);
  const max = Math.max(1, ...values);
  const hasUsage = dashboard.breakdown.some(item => item.calls > 0);

  return (
    <>
      <div className="dashboard-actions">
        <button className="btn btn-ghost btn-sm" disabled={dashboardLoading} onClick={() => void Promise.all([refreshDashboard(), refreshBilling()]).then(() => toast('已读取最新模型用量')).catch(() => toast('刷新失败，请稍后重试'))}>
          {dashboardLoading ? '正在刷新…' : '刷新用量'}
        </button>
      </div>

      {billing && (
        <section className="panel panel-pad credit-panel">
          <div className="credit-head">
            <div>
              <div className="chart-title">积分消耗</div>
              <div className="chart-sub">{billing.plan_label} · 10,000 Token = 1 积分 · 本周期 {new Date(billing.period_start).toLocaleDateString('zh-CN')} 起</div>
            </div>
            <div className="credit-figure">
              <b>{billing.credits_used}</b><span>/ {billing.credits_total} 积分</span>
            </div>
          </div>
          <div className="credit-bar" role="progressbar" aria-valuenow={billing.percent_used} aria-valuemin={0} aria-valuemax={100} aria-label="积分已使用百分比">
            <i style={{ width: `${billing.percent_used}%` }} />
          </div>
          <div className="credit-meta">
            <span>已用 {billing.percent_used}%</span>
            <span>剩余 {billing.credits_remaining} 积分</span>
            <span>本周期已消耗 {number.format(billing.tokens_used)} Token</span>
          </div>
        </section>
      )}

      <div className="kpi-grid usage-kpis">
        {dashboard.kpis.map(kpi => <div className="kpi-card" key={kpi.label}>
          <div className="kpi-label">{kpi.label}</div><div className="kpi-value">{kpi.value}</div><div className={'kpi-trend ' + kpi.dir}>{kpi.trend}</div>
        </div>)}
      </div>

      <section className="panel panel-pad usage-chart-panel">
        <div className="usage-panel-head">
          <div><div className="chart-title">近 7 天用量趋势</div><div className="chart-sub">没有调用的日期按 0 显示</div></div>
          <div className="usage-metric-tabs" aria-label="趋势指标">
            {([['tokens', 'Token'], ['cost', '估算成本'], ['calls', '调用次数']] as const).map(([key, label]) => <button key={key} className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{label}</button>)}
          </div>
        </div>
        <svg viewBox="0 0 700 250" width="100%" height="250" role="img" aria-label="近 7 天真实模型用量趋势">
          <line x1="45" y1="205" x2="680" y2="205" stroke="var(--line)" />
          {dashboard.series.map((point, index) => {
            const value = values[index] ?? 0;
            const height = value > 0 ? Math.max(2, (value / max) * 160) : 0;
            const x = 72 + index * 88;
            const y = 205 - height;
            return <g key={point.day} fontSize="11" fill="var(--muted)">
              <rect x={x} y={y} width="44" height={height} rx="3" fill={index === dashboard.series.length - 1 ? 'var(--accent-orange)' : 'var(--navy-soft)'} opacity={value ? 0.9 : 0} />
              <text x={x + 22} y="226" textAnchor="middle">{point.label}</text>
              <text x={x + 22} y={Math.max(18, y - 9)} textAnchor="middle" fill="var(--ink)">{metric === 'cost' ? money(value) : number.format(value)}</text>
            </g>;
          })}
        </svg>
      </section>

      <section className="panel panel-pad">
        <div className="chart-title">按模型统计 · 近 30 天</div>
        {hasUsage ? <div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>模型</th><th>调用</th><th>输入 Token</th><th>缓存命中</th><th>输出 Token</th><th>总 Token</th><th>刊例成本</th></tr></thead>
          <tbody>{dashboard.breakdown.map(item => <tr key={item.key}><td>{item.key}</td><td>{number.format(item.calls)}</td><td>{number.format(item.inputTokens)}</td><td>{number.format(item.cachedInputTokens)}</td><td>{number.format(item.outputTokens)}</td><td>{number.format(item.tokens)}</td><td>{money(item.costCny)}</td></tr>)}</tbody></table></div>
          : <div className="empty-tip">还没有真实模型用量。完成一次对话或项目执行后，数据会出现在这里。</div>}
      </section>

      {dashboard.pricing && <section className="usage-pricing-note">
        <strong>{dashboard.pricing.source}</strong><span>未缓存输入 ¥{dashboard.pricing.inputPerMillion}／百万 Token</span><span>缓存命中输入 ¥{dashboard.pricing.cachedInputPerMillion}／百万 Token</span><span>输出 ¥{dashboard.pricing.outputPerMillion}／百万 Token</span>
      </section>}
    </>
  );
}

/* ── 公司财务 ─────────────────────────────────────────────────────────────── */

function FinancePanel() {
  const { shopFinance } = useWorkbench();
  const max = Math.max(1, ...(shopFinance?.series.map(point => point.revenue_cents) ?? [1]));
  const costCny = shopFinance ? (shopFinance.product_cost_cents + shopFinance.ai_cost_cny * 100) / 100 : 0;
  const revenueCny = shopFinance ? shopFinance.revenue_cents / 100 : 0;
  const profit = shopFinance?.gross_profit_cny ?? 0;

  if (!shopFinance) {
    return <section className="panel panel-pad"><div className="empty-tip">正在读取公司财务数据…</div></section>;
  }

  return (
    <>
      <div className="kpi-grid usage-kpis">
        <div className="kpi-card"><div className="kpi-label">营业收入</div><div className="kpi-value">{yuan(shopFinance.revenue_cents)}</div><div className="kpi-trend">近 {shopFinance.window_days} 天商品实收（不含运费）</div></div>
        <div className="kpi-card"><div className="kpi-label">商品成本</div><div className="kpi-value">{yuan(shopFinance.product_cost_cents)}</div><div className="kpi-trend">{shopFinance.paid_order_count} 笔成交的进货成本</div></div>
        <div className="kpi-card"><div className="kpi-label">AI 成本</div><div className="kpi-value">¥{shopFinance.ai_cost_cny.toFixed(2)}</div><div className="kpi-trend">同期真实模型刊例价估算</div></div>
        <div className="kpi-card"><div className="kpi-label">毛利</div><div className={'kpi-value ' + (profit >= 0 ? 'positive' : 'negative')}>{cny(profit)}</div><div className="kpi-trend">营业收入 − 商品成本 − AI 成本</div></div>
        <div className="kpi-card"><div className="kpi-label">客单价</div><div className="kpi-value">{cny(shopFinance.avg_order_cny)}</div><div className="kpi-trend">待发货 {shopFinance.pending_ship_count} 笔</div></div>
      </div>

      <section className="panel panel-pad usage-chart-panel">
        <div className="chart-title">近 {shopFinance.window_days} 天营收</div>
        <div className="chart-sub">按下单日聚合，只算已支付订单；运费收入 {yuan(shopFinance.shipping_income_cents)}</div>
        <div className="finance-bars">
          {shopFinance.series.map((point, index) => {
            const height = point.revenue_cents > 0 ? Math.max(3, (point.revenue_cents / max) * 100) : 0;
            const date = new Date(point.day);
            const showLabel = index % 5 === 0 || index === shopFinance.series.length - 1;
            return (
              <div className="finance-bar" key={point.day} title={`${date.toLocaleDateString('zh-CN')} 营收 ${yuan(point.revenue_cents)}，毛利 ${cny(point.profit_cny)}`}>
                <div className="finance-bar-track"><i style={{ height: `${height}%` }} /></div>
                <span>{showLabel ? `${date.getMonth() + 1}/${date.getDate()}` : ''}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel panel-pad">
        <div className="chart-title">收支构成 · 近 {shopFinance.window_days} 天</div>
        <div className="finance-split">
          <div className="finance-split-row"><span>商品实收</span><b>{yuan(shopFinance.revenue_cents)}</b></div>
          <div className="finance-split-row"><span>运费收入</span><b>{yuan(shopFinance.shipping_income_cents)}</b></div>
          <div className="finance-split-row cost"><span>商品进货成本</span><b>− {yuan(shopFinance.product_cost_cents)}</b></div>
          <div className="finance-split-row cost"><span>AI 模型成本</span><b>{shopFinance.ai_cost_cny > 0 ? `− ¥${shopFinance.ai_cost_cny.toFixed(2)}` : '¥0.00'}</b></div>
          <div className="finance-split-row total"><span>毛利</span><b>{cny(profit)}</b></div>
          <div className="finance-split-row"><span>毛利率</span><b>{revenueCny > 0 ? `${((profit / revenueCny) * 100).toFixed(1)}%` : '—'}</b></div>
          <div className="finance-split-row"><span>总成本</span><b>¥{costCny.toFixed(2)}</b></div>
        </div>
        <div className="chart-sub" style={{ marginTop: 12 }}>
          统计口径：营业收入只算已支付订单的商品金额；AI 成本取同期模型真实调用流水；运费作为单独收入列示，未计快递支出。
        </div>
      </section>
    </>
  );
}

/* ── 商品销售 ─────────────────────────────────────────────────────────────── */

function SalesPanel() {
  const { shopSales, shopProducts } = useWorkbench();
  const series = shopSales?.series ?? [];
  const maxRevenue = Math.max(1, ...series.map(point => point.revenue_cents));
  const top = shopSales?.top_products ?? [];
  const statusCounts = shopSales?.status_counts ?? {};
  const totalOrders = Object.values(statusCounts).reduce((sum, value) => sum + (value ?? 0), 0);

  const statusMeta: Array<{ key: string; label: string; tone: string }> = [
    { key: 'pending_payment', label: '待支付', tone: 'pill-wait' },
    { key: 'paid', label: '待发货', tone: 'pill-wait' },
    { key: 'shipped', label: '已发货', tone: 'pill-live' },
    { key: 'delivered', label: '已完成', tone: 'pill-ok' },
    { key: 'cancelled', label: '已取消', tone: 'pill-err' },
  ];

  const outOfStock = shopProducts.filter(product => product.status === 'active' && product.stock === 0).length;

  if (!shopSales) {
    return <section className="panel panel-pad"><div className="empty-tip">正在读取商品销售数据…</div></section>;
  }

  return (
    <>
      <div className="kpi-grid usage-kpis">
        <div className="kpi-card"><div className="kpi-label">成交订单</div><div className="kpi-value">{number.format(shopSales.paid_orders)}</div><div className="kpi-trend">近 {shopSales.window_days} 天已支付</div></div>
        <div className="kpi-card"><div className="kpi-label">售出件数</div><div className="kpi-value">{number.format(shopSales.units_sold)}</div><div className="kpi-trend">按订单数量累计</div></div>
        <div className="kpi-card"><div className="kpi-label">销售额</div><div className="kpi-value">{wan(shopSales.revenue_cents)}</div><div className="kpi-trend">商品实收，不含运费</div></div>
        <div className="kpi-card"><div className="kpi-label">商品毛利</div><div className="kpi-value">{wan(shopSales.profit_cents)}</div><div className="kpi-trend">销售额 − 进货成本</div></div>
        <div className="kpi-card"><div className="kpi-label">动销商品</div><div className="kpi-value">{top.length}</div><div className="kpi-trend">{outOfStock ? `${outOfStock} 个在售商品缺货` : '库存正常'}</div></div>
      </div>

      <section className="panel panel-pad usage-chart-panel">
        <div className="chart-title">近 {shopSales.window_days} 天销售额</div>
        <div className="chart-sub">柱高为当日商品实收；空白天数按 0 显示</div>
        <div className="finance-bars">
          {series.map((point, index) => {
            const height = point.revenue_cents > 0 ? Math.max(3, (point.revenue_cents / maxRevenue) * 100) : 0;
            const date = new Date(point.day);
            const showLabel = index % 5 === 0 || index === series.length - 1;
            return (
              <div className="finance-bar" key={point.day} title={`${date.toLocaleDateString('zh-CN')} ${point.orders} 单 / ${point.units} 件 / ${yuan(point.revenue_cents)}`}>
                <div className="finance-bar-track"><i style={{ height: `${height}%` }} /></div>
                <span>{showLabel ? `${date.getMonth() + 1}/${date.getDate()}` : ''}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="dashboard-two-col">
        <section className="panel panel-pad">
          <div className="chart-title">热销商品 Top 10</div>
          {top.length ? (
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead><tr><th>商品</th><th>件数</th><th>销售额</th><th>毛利</th></tr></thead>
                <tbody>{top.map(item => (
                  <tr key={item.product_id}>
                    <td>{item.name}</td>
                    <td>{number.format(item.units)}</td>
                    <td>{yuan(item.revenue_cents)}</td>
                    <td>{yuan(item.profit_cents)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="empty-tip">还没有成交记录。把商品二维码发出去，成交后这里就有排行。</div>}
        </section>

        <section className="panel panel-pad">
          <div className="chart-title">订单状态分布</div>
          <div className="sales-status-list">
            {statusMeta.map(meta => {
              const count = statusCounts[meta.key as keyof typeof statusCounts] ?? 0;
              const ratio = totalOrders ? (count / totalOrders) * 100 : 0;
              return (
                <div className="sales-status" key={meta.key}>
                  <span className={'pill ' + meta.tone}>{meta.label}</span>
                  <div className="sales-status-track"><i style={{ width: `${ratio}%` }} /></div>
                  <b>{count}</b>
                </div>
              );
            })}
            <div className="sales-status-total">共 {totalOrders} 笔订单</div>
          </div>
        </section>
      </div>
    </>
  );
}

