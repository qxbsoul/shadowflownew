$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backup = Join-Path $root 'backups\pre-settings-20261107-1355'

if (-not (Test-Path (Join-Path $backup 'shadowflow-react\src'))) {
    throw "找不到设置页改造前备份：$backup"
}

$frontendPort = Get-NetTCPConnection -LocalPort 3007 -State Listen -ErrorAction SilentlyContinue
if ($frontendPort) {
    throw '请先停止 3007 端口上的 ShadowFlow 前端，再执行回滚。'
}

$frontend = Join-Path $root 'shadowflow-react'
Remove-Item -Recurse -Force (Join-Path $frontend 'src')
Copy-Item -Recurse (Join-Path $backup 'shadowflow-react\src') (Join-Path $frontend 'src')

foreach ($name in @('package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'README.md')) {
    Copy-Item -Force (Join-Path $backup "shadowflow-react\$name") (Join-Path $frontend $name)
}
foreach ($name in @('README.md', '本地启动指南.md')) {
    Copy-Item -Force (Join-Path $backup $name) (Join-Path $root $name)
}

Write-Host '已恢复设置页改造前的源码与文档；数据库未改动。执行 npm run dev 即可重新启动。'
