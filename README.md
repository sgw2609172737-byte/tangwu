# 🖐 唐五 · 联机对战

双人面对面回合制竞技游戏《唐五》的电脑版：**网页即开即玩，支持联机对战**。零依赖（仅需 Node.js），所有规则在服务器端权威结算。

## 快速开始

1. 安装 [Node.js](https://nodejs.org/)（18 或更高版本，自带，无需 npm 安装任何包）。
2. 启动服务器：
   - Windows：双击 `run.bat`；
   - 或命令行：`node server.js`
3. 浏览器打开 <http://localhost:8800>，输入昵称，**创建房间**，把房间码或邀请链接发给朋友（对方点链接或输入房间码**加入房间**），双方就绪后自动开局。

## 怎么和朋友联机

| 场景 | 方法 |
|---|---|
| 同一台电脑 | 开两个浏览器窗口/标签页，一个创建、一个加入 |
| 同一局域网（家里/宿舍） | 朋友在浏览器输入 `http://你的电脑IP:8800`（IP 看 `ipconfig` 的 IPv4 地址；服务器启动时也会打印）。若连不上，需在 Windows 防火墙放行 8800 端口 |
| 公网（异地） | 双击 `online-play.bat`（见下） |

### 公网联机：房主双击一次，朋友点链接即玩

房主（需要能上网的电脑）：

1. 双击 **`online-play.bat`**（或 `联机公网.bat`，两者相同）：
   - 自动检查 Node.js；首次运行自动下载 cloudflared（约 40MB，仅一次）；
   - 自动启动游戏服务器 + 内网穿透，**自动打开并复制公网链接**。
2. 用弹出的链接开房，把页面上的**邀请链接**发给朋友。

> ⚠️ 重要：必须把**整个 `tangwu` 文件夹**拷到你的电脑，再双击文件夹**内部**的 `online-play.bat`。不要把 `.bat` 单独拷出去运行（否则会报 `Cannot find module host.js`）。

朋友：**点开链接即可**——自动生成昵称、自动进房、自动开局，不需要任何其他操作（链接形如 `https://xxxx.trycloudflare.com/?room=XXXX`）。

> 说明：快速隧道每次启动会换一个新地址，适合临时开黑；想要**永久固定链接**，用 `cloudflared tunnel login` 注册命名隧道即可（免费）。关闭房主的命令行窗口即停止联机。

### 传统公网部署（可选）

**A. 内网穿透（无公网 IP 也适用）**
```bash
cloudflared tunnel --url http://localhost:8800
# 把输出的 https://xxx.trycloudflare.com 发给朋友即可
```
（ngrok 同理：`ngrok http 8800`）

**B. 路由器端口映射**
路由器设置 TCP 8800 端口转发到本机，朋友访问 `http://你的公网IP:8800`。

**C. 部署到服务器（VPS，永久在线）**
```bash
# 把整个 tangwu 文件夹上传到服务器后：
node server.js          # 直接跑
# 或后台常驻：
nohup node server.js > server.log 2>&1 &
```
用 Nginx 反代时，SSE 需要关闭缓冲：
```nginx
location / {
    proxy_pass http://127.0.0.1:8800;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

## 永久链接：免费部署到云端（无需自己开电脑）

想要 `xxx.onrender.com` 这类**永久公网链接**（效果等同 vercel.app，且支持本游戏的长连接），推荐部署到免费的长驻 Node 平台：

### Render（推荐，免费）

1. 把整个 `tangwu` 文件夹推到一个 GitHub 仓库（`package.json`、`render.yaml`、`Procfile` 已备好）。
2. 打开 [render.com](https://render.com) 注册（可用 GitHub 登录）→ **New → Blueprint** → 选择你的仓库。
3. Render 自动读取 `render.yaml` 部署，几分钟后给你一个 `https://tangwu-xxx.onrender.com` 链接。
4. 用它开房、发邀请链接，朋友点开即玩。

> 免费版闲置约 15 分钟会休眠，下次访问首次加载约需 20–30 秒（冷启动），之后正常。

### Railway / Glitch / Replit（备选）

- **Railway**：导入仓库 → 自动识别 `Procfile`（`web: node server.js`）→ 部署，给一个 `.up.railway.app` 链接。
- **Glitch / Replit**：把 `server.js` 等文件传上去，运行 `node server.js` 即可，获得公网链接。

### 部署到 Vercel（可选，需要配 Upstash Redis）

Vercel 本身是"静态站 + 短命 Serverless 函数"，无法维持长连接。本仓库已改造为 **Vercel 兼容架构**：前端静态托管 + `api/` 函数跑游戏逻辑 + **Upstash Redis** 存房间状态 + 客户端短轮询同步（同一份客户端在自建服务器上也能用）。部署步骤：

1. **创建 Upstash Redis（免费）**：打开 [upstash.com](https://upstash.com) 或 Vercel Marketplace 搜 "Upstash" → 创建一个免费 Redis → 在控制台拿到两个值：`UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`。
2. **推送 GitHub**：把整个 `tangwu` 文件夹推到 GitHub 仓库。
3. **导入 Vercel**：[vercel.com](https://vercel.com) → New Project → 导入该仓库 → Framework Preset 选 **Other** → 在 Environment Variables 里添加上面的两个变量 → Deploy。
4. 部署完成后得到 `https://xxx.vercel.app`，用它开房、发邀请链接，朋友点开即玩。

> ⚠️ 免费额度：Upstash 免费版约 **1 万次命令/天**。本游戏两个人在线轮询约消耗 3600 次/小时（自适应轮询已优化），够日常娱乐；玩得频繁建议在 Upstash 开启按量付费（约 $0.2/10 万次，几乎免费）。想完全免费不限量，用上面的 Render 方案。

### 为什么 Vercel 上"棋类游戏"能实时对战？

它们用的是**独立实时后端**（Firebase / Supabase / Redis），Vercel 只托管前端。本游戏的实时部分同理交给 Upstash Redis（短轮询拉取），逻辑仍由 Vercel 函数权威结算。

## 玩法速览

- 每回合：费用 +1$（封顶 11$）→ 技能手必须与对方一只手相加（取个位）→ 可选释放技能（消耗技能手数字的费用）或空过。
- 先手 20 血、后手 21 血，先手随机；把对方血量打到 ≤0 获胜；同时倒下平局。
- 数字 0–9 各有 3–5 个技能，含 buff、假人（第二条命）、赌命、98K 连携秒杀、尤里控场等。
- 完整规则见游戏内右上角"📖 规则"按钮（`public/rules.html`）。

## 目录结构

```
tangwu/
  server.js         HTTP + SSE/轮询 服务器、房间管理、断线重连
  engine.js         游戏引擎（回合流程、伤害管线、buff、胜负、序列化）
  skills.js         技能表（0-9，含淬毒）
  public/           网页客户端（index.html / style.css / app.js / rules.html）
  api/              Vercel Serverless 函数（hello / action / state）
  lib/vercel-store.js  Upstash Redis 存取层（Vercel 版用）
  vercel.json       Vercel 部署配置
  host.js           一键公网联机（服务器 + cloudflared 隧道 + 自动开浏览器）
  online-play.bat    房主双击入口（自动下载 cloudflared 后调用 host.js；联机公网.bat 与其相同）
  run.bat           Windows 局域网/本机启动
  test/             引擎单元测试、Vercel 逻辑测试、压力测试、端到端、活体测试
```

## 测试

```bash
node test/engine.test.js   # 引擎单元测试（28 个场景）
node test/vercel.test.js   # Vercel 版逻辑测试（内存模拟 Upstash，10 项）
node test/stress.js        # 随机对局压力测试（默认300局，找崩溃/死锁）
node test/e2e.js           # 端到端联机测试（需先停止占用端口的服务）
node test/live.js          # 活体测试：两机器人连上运行中的服务器随机对战（SSE 版）
node test/live-poll.js     # 活体测试（轮询版，模拟新版客户端协议）
```

## 技术说明

- **零依赖**：只用 Node 内置模块（http/fs/crypto），无需 `npm install`。
- **实时同步**：SSE（Server-Sent Events）推送状态，断线自动重连、自动恢复席位；操作走 HTTP POST。
- **权威服务器**：客户端只提交操作，所有结算在服务端完成，防作弊。
- 端口可用环境变量修改：`PORT=9000 node server.js`。

## UI 架构（v3 动漫风）

- `public/ui.js` 两个导出：`handSVG(d)`（0-11 手势）与 `skillCardHTML(sk, digit, afford, attrs)`（技能卡）。
- **手势引擎**：2D 关节链骨架（`chain` → `outline` 生成带圆尖的锥形外轮廓），深棕描边 `#47291b` + 肤色渐变平涂 + 赛璐璐阴影条 + 指节线 + 掌纹；姿势表 `POSES` 驱动（up=伸直指 / bumps=蜷握指节包 / thumb=拇指模式），7(捏合)、8(枪)、9(钩) 为定制搭建。改姿势只调 `POSES` 与 `thumbFor` 的关节角/长度。
- **技能卡牌**：`SKILL_ART`（ui.js 内 IIFE）= 40 个技能各自的 SVG 插画（徽章图元库 `P.*` + 辉光 + 光束 + 粒子，`scene()` 组装），8 类主题色由 CSS `.theme-*` 提供。★技能自动带金星角标。
- **验收工具**：`node tools/gen-preview.js` 生成 `public/preview.html`（全部手势 + 模拟对局界面 + 40 张卡牌）；`public/debug-hands.html` 为手势放大调试页（本地用，不打包）。
- 手势底座：`.hand-box::before` 圆盘（费用手蓝 / 技能手紫），无文字标注。
