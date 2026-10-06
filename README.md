# 🖐 唐五 · 联机对战

双人面对面回合制竞技游戏《唐五》的电脑版：**网页即开即玩，支持联机对战**。零依赖（仅需 Node.js），联机规则在服务器端权威结算。

## 快速开始

1. 安装 [Node.js](https://nodejs.org/)（18 或更高版本，自带，无需 npm 安装任何包）。
2. 启动服务器：
   - Windows：双击 `run.bat`；
   - 或命令行：`node server.js`
3. 浏览器打开 <http://localhost:8800>，输入昵称，**创建房间**，把房间码或邀请链接发给朋友（对方点链接或输入房间码**加入房间**），双方就绪后自动开局。

## 界面与 AI 更新

- 联机大厅、本地菜单、对战桌、禁用技能和规则手册统一为深蓝与铜金主题；真人手势保持清晰的费用手/技能手标签，手机端双方并排显示。
- 相加前预览结果数字、对应技能及费用不足的自动空过提示。技能说明完整显示；本地版增加禁用搜索/费用筛选、数字快捷键、规则弹窗和音效开关。
- 浏览器打开 `http://localhost:8800/local.html` 可运行本地双人、AI 对战和 AI 观战。AI 在 Web Worker 中计算，返回菜单会取消搜索；双击 `public/local.html` 时若浏览器禁用 Worker，则使用较小计算预算兼容运行。
- AI 修复尤里控制回合的斩杀归属和连携评分；增加局面缓存、动作排序、重复状态去重，改进假人、持续伤害、反弹与赌命倒计时的评估。
- 困难本地 AI 单步搜索预算为 700ms，宗师为 1600ms，普通为 100ms；服务端普通/困难整段 AI 回合共用 1400ms、宗师共用 3200ms 预算（另有状态结算开销）。24 点求解缓存结果并去掉重复排列搜索。

### 规则校正与发育策略

- 保留八的免费连招、幻雾、两回合冰封及基础 +1 费用、双倍圣水数值和跨回合连续施放 24 次限制。
- 开局后对局顶部常驻展示全部禁用技能的插画、名称、费用和完整效果；双方重复禁用去重，再来一局重新更新。
- 赌命每局只能释放一次；24 点使用施放前、扣费前的四手数字。其他技能的原有无效施放行为保持不变。
- 呼吸回血基础每层 +1；拥有强化时每层额外 +1，移除强化后恢复基础值。
- 盈能改为：立即 +2 费用，获得至少 3 层充能；之后每放一个非攻击技能（盈能自身除外）+1 层，上限 6；下次攻击消耗全部充能增伤，可重新蓄能，DOT 与反弹不消耗充能。
- 唐化允许多个假人同时存在，按召唤顺序逐个挡致命伤；假人强化只作用于队首。识破清空全部备用假人，不再换血，保留 +1 血、+6 费、1 伤及无敌抵挡规则。
- 小烈焰、淬毒在受伤方回合结束时结算，包括冰封跳过的回合；再次行动不算回合结束。
- AI 按未来多个自身回合估算圣水、呼吸和组合收益，降低高血量时刷小治疗的偏好。

### 首页与入口

首页使用现代无衬线排版和全部 40 张技能卡循环轮播，全部固定在同一圆周上，以恒定角速度缓慢旋转；顶部清晰，下方逐渐模糊并融入背景，保留鼠标轻微视差；可手动前后翻卡、暂停轮播。联机入口分为人机、创建、加入三个标签，支持方向键切换，并共享昵称。首页动效随减少动画设置、切到后台和进入对局自动停止。

### 技能插画与动画

全部 40 个技能已改为统一的立体游戏插画。顶部「图鉴」打开 `artbook.html`，支持名称/效果搜索、费用筛选和点击预览，另有 98K 连携演出按钮。

本地与联机对局均从引擎的有序视觉事件播放动画：卡牌飞出、拳击冲击、火焰、冰晶、治疗、护盾破碎、毒雾，以及 98K 瞄准/连携。血条与连携读数有变化反馈；重复轮询不重播，重新连接不补放历史动画。动画不延迟规则结算或锁定操作。

右上角「动画：全 / 少」记住用户偏好，并优先尊重系统“减少动态效果”设置。图集位于 `public/assets/skills/skill-atlas.png`，通过内置 image_gen 生成；完整提示词保存在同目录 `generation-prompt.txt`。

### 验证

```sh
npm test           # 引擎、AI 战术、HTTP 联机、Vercel 状态逻辑
npm run test:ai    # 三档自对战、服务端 AI 驱动与小样本强度检查
python test/ui-home.py # 首页入口、键盘、动效设置及窄屏布局
python test/ui-effects.py # 插画映射、特效、去重、清理与减少动画
python test/ui-smoke.py  # 浏览器交互；需要 Python Playwright 和 Chrome/Chromium
```

浏览器测试自动开启并关闭本地服务器，截图写入系统临时目录 `tangwu-ui-qa`。可设置 `BROWSER_PATH` 指定浏览器。AI 对战胜率有随机性，小样本结果不代表稳定胜率。

## 排位与宗师 AI（2026-10-06）

- **人机排位**：本地菜单选择「人机排位」。5 局定级；青铜、白银、黄金、铂金、钻石、大师、宗师七个段位；按双方积分与结果更新 Elo。AI 难度随积分提高，战绩和最高分保存在当前浏览器/桌面应用。普通人机、本地双人与观战不计分。
- **真人排位**：运行 `node server.js`，进入首页「真人排位」。填写昵称并匹配；双方无需分享房间码。先匹配相近积分，等待越久逐步放宽范围。积分、战绩和排行榜由服务器结算；每步限时 90 秒、禁用限时 120 秒，超时/认输记负，双方禁用都超时记平局。刷新恢复当前对局，完成后重新匹配。
- 两类积分完全独立。本地返回菜单保留排位，可继续；开始另一局会将已开始但未完成的人机排位记负。真人点击「认输并离开」立即结算，直接断线不会抹去当前对局，超时后仍会记负。
- 自建服务器保存 `data/ranked.json`（不加入 Git），可通过 `TANGWU_RANK_FILE` 指定持久磁盘路径。备份/迁移应包含该文件。Vercel 使用已有 Upstash Redis，在同一事务中保存匹配、对局和积分，结果不会重复计算。没有配置 Redis 时，Vercel 排位入口会显示配置错误。
- 真人身份是服务器生成的匿名本机密钥，保存在浏览器中；昵称不作为身份，清除浏览器存储后无法找回。当前适合小规模联机，未实现登录账号、跨设备找回或反刷分系统。公开竞技运营需要补上这些能力。
- **宗师 AI**：存在已通过独立对照测试的模型时使用神经网络引导的 MCTS，并先检查强制连招；模型未通过或无法加载时使用完整回合 alpha-beta 搜索。相加、再次行动和尤里控制都按实际操作者计分。离线 Worker 不可用时用短预算兼容运行，强度相应降低。
- 已验证一条七步操作的 98K 连携斩杀可穿透无敌、反弹与假人。学习型网络已通过 CUDA 训练，但没有求解唐五全部状态，**不保证全局必胜**。
- 静态构建 `npm run build:dist` 只包含离线人机排位；真人排位需要 Node 服务器或配好 Redis 的 Vercel 后端。构建不会自动发布现有线上站点。

```sh
npm test                         # 包含宗师战术和排位结算/匹配回归
python test/ui-ranked.py          # 两个浏览器身份的真人排位及本地排位完整流程
npm run benchmark:ai             # 新宗师与 Git 8974dd9 的困难 AI，换边/相同开局与预算
```

对照赛报告输出 `output/qa/ai-benchmark-<预算>ms.json`。可用 `AI_PAIRS`、`AI_BUDGET`、`AI_BASELINE` 环境变量调整成对开局数、每步毫秒和旧版提交。小样本与短预算不能代表对真人的稳定胜率。

此前搜索增强版同预算 250ms 对照实测：6 组成对开局、12 局，对旧版困难 7 胜、4 负、1 平；全部在 800 步内结束。学习型模型有独立的新报告，不能将这份旧结果视为学习模型成绩。可运行 `node test/ui-electron-ranked.cjs` 重验包内模型、真实 `file://` Worker 连携斩杀与桌面排位积分落盘（需要 Python Playwright 与现有 Electron 打包目录）。

## 本地训练 AI

训练代码已经实际运行，并保留 4 代模型与所有对局数据：192 局搜索教师预热，加上 3 轮各 128 局神经网络引导自我对弈，共 576 局、40,655 条局面样本。选择模型与最终测试分开；优先保留实战表现较好的模型，后代不会自动覆盖。正式使用的模型可能来自更早的一代，因此界面中的训练局数表示该模型实际见过的数据。

当前晋级的是第 1 代（192 局教师预热＋128 局自我对弈，共 320 局、24,955 个样本）。独立换边对照：相同每步 50ms 预算下，对旧搜索宗师 **58 胜、6 负**；相同每步 250ms 预算下 **13 胜、3 负**。这仅说明对当前旧宗师的测试提升，不是对真人或所有规则组合的必胜保证。详见 `models/training-report.md` 和模型内的晋级报告。

- `learning.js`：使用真正的 `engine.js` 生成局面与合法动作；232 个特征、51 个动作编码。包括公平正义的不同增益目标，不读取日志或动画。输入中部分无界数量经过对数缩放与汇总，因此这是近似学习模型。
- `scripts/collect-ai.js`：固定种子、节点预算的教师对局，以及 MCTS 自我对弈；每 5 局有一局混入搜索教师。未在步数上限前结束的对局不把胜负猜测当作真实标签。
- `scripts/train-ai.py`：PyTorch CUDA 训练 232→128→128 的策略/价值网络。整局划分训练与验证集，策略使用合法动作掩码，价值目标为真实终局胜负。每代保存权重、Adam 状态、JSON 推理模型、验证指标和汇总；继续训练会从最后一代检查点恢复。
- `scripts/evaluate-model.js`：新模型与固定的搜索宗师对战，每个开局交换席位，使用相同毫秒预算，包含固定和随机禁用组合。正式晋级要求独立短预算测试至少 64 局，以及独立 250ms 测试至少 16 局；未过门槛的候选只能放入实验入口，保留当前正式模型。
- `models/tangwu-pv.json` 与 `neural-model.js`：同一模型的 JSON 和浏览器/Node 版本。运行游戏不需要 PyTorch、GPU、网络或外部 API，浏览器 Worker 使用普通 JavaScript 推理。训练脚本才需要 Python、PyTorch 与 CUDA。

在项目目录执行 PowerShell：

```powershell
# 首次使用新输出目录训练；已有输出不会静默覆盖
.\train-ai.ps1 -Output output/training/my-run -WarmGames 192 -Rounds 3 -SelfplayGames 128

# 延续本次训练，增加到 6 轮；更长训练不保证更强
.\train-ai.ps1 -Output output/training/2026-10-06/run1 -Resume -Rounds 6
```

启动器优先使用 `TANGWU_TORCH_PYTHON` 指定的 Python；本机可复用 `D:\Comfy\Qwen-Standalone\ComfyUI\.venv\Scripts\python.exe` 的 CUDA PyTorch，使用期间不修改该环境。其他电脑应安装对应 CUDA 版 PyTorch，并用 `-TorchPython` 指向 Python 路径。训练默认使用两个数据生成线程，数据、日志、检查点都留在指定输出目录。

训练完成会生成 `candidate.json`，不会仅凭训练损失降低就自动升级。晋级与发布流程：

```powershell
node scripts/evaluate-model.js --model output/training/my-run/candidate.json --out output/training/my-run/promotion-50ms.json --pairs 32 --budget 50 --workers 2 --seed 910000
node scripts/evaluate-model.js --model output/training/my-run/candidate.json --out output/training/my-run/promotion-250ms.json --pairs 8 --budget 250 --workers 2 --seed 920000
node scripts/publish-model.js --model output/training/my-run/candidate.json --promotion output/training/my-run/promotion-50ms.json --long output/training/my-run/promotion-250ms.json
node scripts/build-static.js
npm run build:dist
```

模型发布校验规则哈希、两份对照报告的模型哈希、独立种子及晋级成绩，错误模型不能套用其他模型的报告。规则改动后应重新训练并验证。继续训练的报告还应使用新的验证种子，避免反复调参污染同一测试集。

## 让你与 AI 的对局参与训练

网页人机入口和本地菜单中展开「与 AI 一起进步」，开启「让我的人机对局参与训练」。设置按当前浏览器保存，适用于各个人机难度及人机排位。完整自然结束的对局会保存为私有训练记录；认输、中断、超出记录上限或无法重放的记录不会生成胜负样本。已经进行到中途的旧对局从下一局开始记录。

线上房间在服务器记录人类和 AI 的实际行动；网页本地模式记录完整行动序列，再由服务器使用真实引擎从标准开局重放，验证合法行动、控制归属和终局胜者。训练记录不包含昵称、房间码或房间令牌，只包含随机对局 ID、开局先后手、禁用、动作和胜者。每个训练身份最多在云端保留最近 50 局，身份由浏览器保存，导出接口不提供其他用户记录。

开启后会显示「云端已收录 N 局」。关闭开关停止接收新记录。网络失败的网页本地对局暂存在浏览器（最多 5 局），恢复连接后重试；离线文件模式可导出本机记录。`导出对局` 下载可直接复盘的数据；`连接本机训练` 下载私有的 `tangwu-training-link.json`，请妥善保存，勿公开提交。

本机已经支持自动同步和训练混入：把连接文件保存为 `data/training-link.json` 后，`train-ai.ps1` 每次启动训练会拉取该身份的记录、使用当前模型重新搜索各个局面的策略目标，再与教师/自我对弈样本混合。价值标签来自验证后的真实胜负，训练和验证仍按整局分开；人类样本最多占 60,000 条回放容量的 20%。因此不会直接模仿你每一手操作，也不会把认输当作棋盘必败。模型仍须通过独立晋级测试才会上线。

```powershell
node scripts/sync-human.js --link data/training-link.json --out data/human-training
# 下一次训练自动混入同步后的对局；两参数也可以指向另一份连接和数据目录
.\train-ai.ps1 -Output output/training/2026-10-06/run1 -Resume -Rounds 4
# 使用手动导出的记录也可以导入
node scripts/import-human.js --input tangwu-human-games.json --out data/human-training
```

自建服务器使用 `data/human-records.json`，可用 `TANGWU_TRAINING_FILE` 改变位置；Vercel 使用已有 Redis 的独立私有键和原子更新，最后一次访问后 90 天过期。个人对局记录和本机连接均不加入 Git。验证命令：`npm run test:human`、`node test/vercel-human.test.js`、`python test/ui-human-training.py`；`test/human-torch.py` 额外证明导入的人类样本实际产生 CUDA 梯度并可导出为 JavaScript 模型。

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

- 每回合：费用 +1$（封顶 11$）→ 技能手必须与对方一只手相加（取个位）→ 可选释放技能（消耗技能手数字的费用）或空过；相加后若费用不足（或连续出技能已达 24 次）无法释放任何技能，会自动空过。
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

## 2026-10-03 卡牌细节更新

- 统一金属边框、费用徽章、压印标题与分类状态栏，首页卡轮和禁用卡片保持同一风格。
- 效果原文完整保留，只突出关键数值；图鉴直接展示效果。不可用卡牌保留文字对比度，并显示费用差额、连出上限或赌命使用限制。
- 修复入场动画结束后覆盖悬停位移的问题；键盘聚焦、手机 320px / 390px 排版与减少动画模式均保留。

## 2026-10-02 界面与体验更新

- 40 张新技能插画，统一用于首页、对局、禁用和图鉴。图集及生成提示词位于 `public/assets/skills/skill-atlas-v2.png`、`generation-prompt-v2.txt`；使用内置图像工具，工具不提供模型版本选择，无法确认 image2.5。
- 靛蓝与黄铜界面、技能分类、卡牌入场与攻击轨迹、技能手变化反馈；支持系统及手动减少动画。
- 本地对局在每次结算后自动保存一个最近未结束的对局；刷新或返回菜单后可继续。存档留在当前浏览器或桌面应用中，开始新的对局并完成禁用后覆盖旧存档，结束后清除。不保存尚未完成的禁用阶段。
- AI 观战可暂停并选择 0.5× / 1× / 2× / 4× 行动节奏，继续存档后默认暂停。速度调整只影响观战等待时间，AI 思考仍需时间。
- 本地对局可导出文本战报；联机禁用搜索同时匹配名称和效果描述。
- `npm run build:dist` 同步可托管或双击打开的本地静态版本，首页为 `dist/index.html`。构建不会发布线上网站。
- 功能回归：`npm test`；浏览器验证：`python test/ui-refinement.py`、`python test/ui-smoke.py`、`python test/ui-effects.py`，截图输出至 `output/qa/`。

## 本地版 / 人机对战 / 打包 exe

- **本地单机版**：双击 `启动本地版.bat`（Edge 应用模式）打开 `public/local.html`，含人机对战（三档 AI）、本地双人、AI 观战；纯离线，不依赖服务器、不联网。
- **AI**：`ai.js`（仓库根，Node+浏览器双环境）局面评估与有预算的迭代加深搜索，困难/宗师增加完整回合及强制连招搜索，**不接任何大模型/API**；`lib/ai-player.js` 在服务端驱动人机对战（自建 `server.js` 与 Vercel `api/*` 共用）。
- **网页版人机对战**：大厅选难度 →「🤖 对战 AI」（AI 在服务端权威结算）。
- **打包单文件 exe**：`node tools/build-electron.js` 组装应用目录 → 在其中 `npm install && npm run dist`（走 npmmirror 镜像）→ 产出 `dist/TangWu.exe`（Electron 便携版单文件，约 100MB，Win10/11 双击即玩，无需 Edge/.NET/联网）。
