#!/usr/bin/env node
/** 一键拉起全栈服务；自动复用已有 ShadowFlow Python，Ctrl+C 只清理本次进程树。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(ROOT, 'ShadowFlow-backend');
const FRONTEND = path.join(ROOT, 'shadowflow-react');
const IS_WIN = process.platform === 'win32';
const children = [];
let stopping = false;

function resolveNode22() {
  const portable = IS_WIN
    ? path.join(ROOT, '.tools', 'node22', 'node.exe')
    : path.join(ROOT, '.tools', 'node22', 'bin', 'node');
  if (fs.existsSync(portable)) return portable;
  const major = Number(process.versions.node.split('.')[0]);
  if (major === 22) return process.execPath;
  throw new Error(`ShadowFlow 网关要求 Node 22，当前为 ${process.versions.node}。请安装 Node 22，或将便携运行时放到 .tools/node22。`);
}

function wire(child, label) {
  const prefix = `[${label}] `;
  child.stdout?.on('data', chunk => process.stdout.write(chunk.toString().split(/\r?\n/).filter(Boolean).map(line => prefix + line).join('\n') + '\n'));
  child.stderr?.on('data', chunk => process.stderr.write(chunk.toString().split(/\r?\n/).filter(Boolean).map(line => prefix + line).join('\n') + '\n'));
}

function launch(label, file, args, cwd) {
  const child = spawn(file, args, { cwd, detached: !IS_WIN, shell: false, env: process.env });
  children.push(child);
  wire(child, label);
  child.on('error', error => {
    console.error(`[${label}] 启动失败：${error.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[${label}] 已退出（code=${code} signal=${signal}），正在停止其他服务。`);
    stop(code ?? 1);
  });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (IS_WIN) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    }
  }
  setTimeout(() => process.exit(code), IS_WIN ? 800 : 150);
}

function probe(url, method = 'GET') {
  return new Promise(resolve => {
    const req = http.request(url, { method, timeout: 2500 }, res => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function waitFor(url, label, method = 'GET', timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probe(url, method)) return;
    if (stopping) throw new Error(`${label} 启动中断`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`${label} 在 ${timeoutMs / 1000} 秒内未就绪：${url}`);
}

async function hasReusablePython() {
  try {
    const response = await fetch('http://127.0.0.1:8000/', { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.name === 'ShadowFlow' && body?.status === 'running';
  } catch {
    return false;
  }
}

async function main() {
  const node = resolveNode22();
  if (!fs.existsSync(path.join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js'))) {
    throw new Error('前端依赖未安装，请先执行：npm --prefix shadowflow-react ci');
  }
  if (!fs.existsSync(path.join(BACKEND, 'server', 'node_modules', 'tsx', 'dist', 'cli.mjs'))) {
    throw new Error('网关依赖未安装，请用 Node 22 在 ShadowFlow-backend/server 执行 npm ci');
  }

  console.log('ShadowFlow 全栈联调启动中…');
  const explicitNoPython = process.argv.includes('--no-python');
  const reusePython = explicitNoPython || await hasReusablePython();
  if (!explicitNoPython && reusePython) console.log('检测到 ShadowFlow Python :8000 已运行，自动复用，不再重复启动。');
  if (explicitNoPython) console.log('按参数跳过 Python 启动，将使用现有 :8000。');
  const backendTarget = path.join(BACKEND, 'scripts', 'dev.mjs');
  const backendArgs = reusePython ? ['--no-python'] : ['--no-open'];
  launch('backend', node, [backendTarget, ...backendArgs], BACKEND);
  launch('frontend', node, [path.join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '0.0.0.0', '--port', '3007', '--strictPort'], FRONTEND);

  await waitFor('http://127.0.0.1:8002/health', 'Node 网关');
  await waitFor('http://127.0.0.1:3007/', 'React 前端');
  const seeded = await probe('http://127.0.0.1:8002/api/opc/seed', 'POST');
  if (!seeded) throw new Error('演示公司初始化失败，请检查 Python 日志');

  console.log('\n全部服务已就绪：');
  console.log('  工作台      http://localhost:3007');
  console.log('  网关        http://localhost:8002/health');
  console.log('  Python 文档 http://localhost:8000/docs');
  console.log(reusePython
    ? '按 Ctrl+C 可停止本次启动的网关和前端；现有 Python 会继续运行。\n'
    : '按 Ctrl+C 可同时停止三项服务。\n');
  await new Promise(() => {});
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
main().catch(error => {
  console.error(`\n启动失败：${error.stack || error}`);
  stop(1);
});
