'use strict';
// 一键公网联机：在房主电脑上运行（需能访问外网）
//   1. 在进程内启动游戏服务器
//   2. 启动 cloudflared 快速隧道，把游戏暴露为公网链接
//   3. 自动打开浏览器 + 复制链接；关闭本窗口即停止联机
// 用法：node host.js  （或双击"联机公网.bat"）
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { server } = require('./server');

const PORT = Number(process.env.PORT || 8800);
const cfPath = path.join(__dirname, 'tools', 'cloudflared.exe');
let cf = null;

if (!fs.existsSync(cfPath)) {
  console.error('未找到 tools\\cloudflared.exe，请先双击"联机公网.bat"自动下载，');
  console.error('或手动下载 https://github.com/cloudflare/cloudflared/releases 放到 tools 目录。');
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`游戏服务器已启动: http://localhost:${PORT}`);
  console.log('正在建立公网隧道（cloudflared）...\n');

  cf = spawn(cfPath, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });

  let buf = '';
  let announced = false;
  const onData = (c) => {
    if (announced) return;
    buf += c.toString();
    if (buf.length > 8192) buf = buf.slice(-4096);
    const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      announced = true;
      const url = m[0];
      console.log('==============================================');
      console.log('  公网链接（已复制到剪贴板）:');
      console.log('  ' + url);
      console.log('  用浏览器打开它 → 创建房间 → 把页面上的');
      console.log('  邀请链接发给朋友，朋友点开即玩，无需任何操作。');
      console.log('  关闭本窗口即停止联机。');
      console.log('==============================================\n');
      spawn('powershell', ['-NoProfile', '-Command', `Set-Clipboard -Value '${url}'`], { stdio: 'ignore', windowsHide: true });
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true, windowsHide: true }).unref();
    }
  };
  cf.stdout.on('data', onData);
  cf.stderr.on('data', onData);
  cf.on('error', (e) => { console.error('cloudflared 启动失败:', e.message); process.exit(1); });
  cf.on('exit', (code) => { console.log(`\ncloudflared 已退出（${code}），联机停止。`); process.exit(code || 0); });
});

// 窗口关闭 / Ctrl+C 时清理隧道进程，避免残留占用
process.on('exit', () => { try { if (cf) cf.kill(); } catch (e) { /* ignore */ } });
