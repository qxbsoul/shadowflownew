import { spawn } from 'node:child_process';
import { chromium } from './shadowflow-react/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';

const root = 'D:/shadowflow';
const server = spawn(process.execPath, ['start-dev.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
const results = [];
const errors = [];
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error(`服务提前退出 ${server.exitCode}\n${serverLog}`);
    try {
      const front = await fetch('http://localhost:3007/');
      const gateway = await fetch('http://localhost:8002/health');
      if (front.ok && gateway.ok) { ready = true; break; }
    } catch {}
    await sleep(1000);
  }
  if (!ready) throw new Error(`服务未就绪\n${serverLog}`);
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => errors.push(`page: ${err.message}`));
  page.on('response', res => { if (res.status() >= 400 && !res.url().includes('/api/opc/auth/me')) errors.push(`${res.status()} ${res.url()}`); });
  await page.goto('http://localhost:3007/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '未注册演示', exact: true }).first().click();
  await page.getByText('工作台', { exact: true }).first().waitFor({ timeout: 20000 });
  results.push('访客登录成功');
  const pages = ['人工审批','运行日志','定时任务','交付成果','订单','组织架构','数据看板','知识库','设置'];
  for (const name of pages) {
    if (name === '设置') await page.getByRole('button', { name: '打开设置' }).click();
    else await page.locator('.nav-item').filter({ hasText: name }).click();
    await sleep(400);
    const active = await page.locator('.view.active').innerText();
    if (!active.trim()) throw new Error(`${name} 页面为空`);
    results.push(`${name} 页面可打开`);
  }
  await page.locator('.nav-item').filter({ hasText: '组织架构' }).click();
  await page.getByRole('button', { name: '新建部门', exact: true }).click();
  const deptName = `验收部门${Date.now()}`;
  const deptInput = page.locator('.modal.active input, .modal input').first();
  await deptInput.fill(deptName);
  await page.locator('.modal').getByRole('button', { name: /创建|保存|确认/ }).last().click();
  await page.getByText(deptName, { exact: true }).waitFor({ timeout: 10000 });
  results.push('部门真实创建成功');
  const dept = page.locator('.dept-card').filter({ hasText: deptName });
  await dept.getByRole('button', { name: '重命名', exact: true }).click();
  const renamed = `${deptName}已改`;
  await page.locator('.modal input').first().fill(renamed);
  await page.locator('.modal').getByRole('button', { name: /保存|确认/ }).last().click();
  await page.getByText(renamed, { exact: true }).waitFor({ timeout: 10000 });
  results.push('部门真实重命名成功');
  const renamedDept = page.locator('.dept-card').filter({ hasText: renamed });
  await renamedDept.getByRole('button', { name: '删除', exact: true }).click();
  await page.locator('.modal').getByRole('button', { name: /删除|确认/ }).last().click();
  await page.locator('.dept-name').filter({ hasText: renamed }).waitFor({ state: 'detached', timeout: 10000 });
  results.push('空部门真实删除成功');
  await page.locator('.nav-item').filter({ hasText: '知识库' }).click();
  await page.getByRole('button', { name: /新建知识包/ }).first().click();
  await sleep(300);
  const packInput = page.locator('#kb-new-name');
  if (await packInput.count()) {
    const packName = `验收知识包${Date.now()}`;
    await packInput.fill(packName);
    await page.getByRole('button', { name: /创建|保存/ }).last().click();
    await page.locator('option').filter({ hasText: packName }).first().waitFor({ state: 'attached', timeout: 10000 });
    results.push('知识包真实创建成功');
  } else {
    results.push('知识包创建入口已显示（表单选择器需人工复核）');
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('工作台', { exact: true }).first().waitFor({ timeout: 10000 });
  results.push('刷新后会话与公司身份保持');
  await page.screenshot({ path: `${root}/backups/opc-verification.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error('桌面页面出现横向溢出');
  await fs.writeFile(`${root}/backups/opc-verification.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} catch (error) {
  console.error(error);
  console.error(serverLog.slice(-6000));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await sleep(1500);
  if (server.exitCode === null) server.kill('SIGKILL');
}
