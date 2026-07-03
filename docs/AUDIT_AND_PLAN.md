# Power-Up Chess — 审计汇总与路径 B 工作计划

**文档日期：** 2026-07-02  
**状态：** 审计结论 + 执行计划（经 Jeff 反馈修订）  
**选定路径：** **路径 B** — 亲友小范围测试（非公开发布）

**相关文档：**

- 功能现状：`FEATURE_MAP.md`
- 开放问题：`OPEN_QUESTIONS.md`
- 技术架构：`TECHNICAL_ARCHITECTURE.md`
- 成本护栏：`COST_GUARDRAILS.md`
- 隐私草案：`PRIVACY.md`
- COPPA 自检：`COPPA_CHECKLIST.md`

---

## 第一部分：审计汇总

### 1.1 总体评价

Power-Up Chess 是一个**文档驱动、已上线、功能超预期**的儿童国际象棋学习产品。核心承诺（真实棋规、服务端权威走子、Stockfish 赛后分析、引擎驱动的诚实评价、城堡积分经济、大厅社交、谜题与教程体系）大多已在生产环境运行。

当前阶段定位：**功能丰富的学习站 + 亲友圈内测版**，而非面向公众的成熟儿童产品。主要差距在工程护栏、安全加固、面向 Ada 的体验打磨、以及文档与代码的同步——而非缺少核心功能。

**信任顺序（文档与代码不一致时）：** `FEATURE_MAP.md` → 代码 → 较旧的 `MVP*_PLAN.md` / `OPEN_QUESTIONS.md`。

---

### 1.2 做得特别好的地方

#### 棋规与引擎诚信（产品底线）

- 走子经 Cloud Functions 用 chess.js 重放验证（`functions/src/rooms/submitMove.ts`）；Firestore 规则禁止客户端直写对局状态。
- 走子分类（Best…Blunder）与 Brilliant 启发式有单元测试，阈值与 `DECISIONS.md` 一致。
- Host 评论：选择性 LLM、缓存、每日配额、3 秒客户端超时与模板回退，成本与诚实性兼顾。

#### 儿童安全架构意识

- 无私开匹配，仅私密房间链接在线对局。
- **标准棋局（在线 / 本地 / AI 练习）无聊天** — 符合学习站定位。
- 大厅（Great Hall）聊天：脏话过滤、限速、举报达阈值自动隐藏。
- `forgetMe` 可删除服务端 guest 数据并 wipe 本地存储。
- Gemini API key 仅在 Cloud Functions，未暴露到客户端。

#### 产品与文档纪律

- `FEATURE_MAP.md`（2026-07-01）是「现实真相」的一页总览，质量高。
- 城堡世界观、First Visit 引导、Today's Practice、艰难对局软化等，与 `HOST_PERSONAS.md` 和 Ada 受众一致。

#### UX 与工程实践

- 2D 棋盘响应式、触控目标 ≥44px、PWA 分层缓存（Stockfish / 3D 懒加载）。
- Firestore 默认拒绝 + 函数独占写；规则测试与部分单元测试已存在。
- 约 90 个 Cloud Functions 按 domain 分目录，整体架构清晰。

---

### 1.3 主要问题与差距

#### 工程护栏（P0）

| 问题 | 现状 |
|------|------|
| **无 CI（持续集成）** | 没有 `.github/workflows/`；合并前无自动跑 typecheck / lint / test |
| **测试覆盖薄** | 约 14 个测试文件 vs 200+ 前端文件、~90 个 Functions；核心 callable 几乎无测试 |
| **客户端/服务端代码重复** | `rooms/types`、`personas`、Wizard 引擎等双份维护，存在静默漂移风险 |
| **GCP 账单告警未配置** | `COST_GUARDRAILS.md` Layer 3 仍为 planned |
| **Firestore rules 测试不完整** | 仅覆盖部分 collection，与生产 `firestore.rules` 不同步 |

#### 安全与聊天（P1，经 Jeff 反馈修订）

| 问题 | 说明 | Jeff 反馈后的处理 |
|------|------|-------------------|
| Wizard 对局内聊天 | Wizard's Duel 有文字 + 语音聊天 | **不视为违反「标准棋局无聊天」** — Wizard 是趣味游戏模式，非标准练习对局 |
| 一对一私聊风险 | Wizard 房间聊天仅房间内可见 | **改为：Wizard 文字/语音内容透传 Hall**，统一 moderation，避免隐形私聊 |
| 家长同意 / COPPA | 完整可验证家长同意未实现 | **路径 B 不优先** — 本站定位学习站、亲友圈测试；完整 COPPA 留路径 C（公开发布） |
| displayName 客户端可控 | `postChat` / `setPresence` 未强制绑定 guest 记录 | **同意修复** — 服务端读取并校验 |
| Hall LLM 回复无 scrub | `@Lucy` / `@Luca` 自动回复未过滤 | **同意修复** |
| Gemini 无显式 safetySettings | 依赖模型默认 | **同意加固** |
| 无 Firebase App Check | callable 可被脚本滥用 | **同意部署** |
| Bypass 路径、profanity 深度、uid 封禁等 | 见安全审计明细 | **同意加固** |

#### Ada 体验（P2 — 全部同意）

- AI 练习缺少 Hint（谜题/残局有，AI 屏没有）。
- 大厅未做 learn / play / break 三区（Phase 1C）；信息密度对 8–10 岁偏高。
- 赛后复盘默认展示 Engine eval、CP loss 等工程师语言。
- `MuteButton` 已实现但未挂载到 UI。
- 200 分解锁文案偏硬，挫败感强。
- 对局中 host 存在感弱（主要靠吃子模板 + 赛后分析）。
- 部分 a11y 缺口：棋盘无键盘路径、部分 modal 无 focus trap。

#### 文档债（P3 — 同意治理）

- `OPEN_QUESTIONS.md` 大量条目已在代码中实现，仍标为 open。
- `TECHNICAL_ARCHITECTURE.md` 仍描述 moves 子集合；实现为 room 文档内 `moves[]`。
- `DECISIONS.md` 写 MVP0 仅 Capture Spark；已上线 Tactic Bloom + Crown Badge。
- Hall 门牌文案过时（如锦标赛仍写 coming soon）。
- MVP1 承诺（both-host、跨设备自己的对局历史）部分有代码无 UX 或未同步。

#### 设备策略（Jeff 裁定）

- **保持现状**：继续支持手机，但**不做专项优化**；体验以 desktop + tablet 为主。
- 文档应写明「支持手机，非主要优化目标」，而非「不支持手机」。

---

### 1.4 战略路径选择

| 路径 | 定位 | 本计划 |
|------|------|--------|
| A | Ada 专属打磨 | — |
| **B** | **亲友小范围测试** | **✓ 选定** |
| C | 公开发布 | 延后（完整 COPPA、Wizard 语音转写审核等） |

**路径 B 目标：** 不大幅扩张功能；补齐工程护栏、安全加固、Ada 日常路径体验、文档同步，达到「放心邀请几个家庭试用」。

---

### 1.5 术语说明（审计中提到的关键项）

#### CI（Continuous Integration，持续集成）

每次 push 或 PR 时由 GitHub Actions 自动执行：

```text
pnpm install → typecheck → lint → test →（可选）build
```

防止类型错误、lint 回归、走子逻辑破坏在未人工测试的情况下进入 main。

#### submitMove 测试

针对 `functions/src/rooms/submitMove.ts` 的自动化测试，覆盖：合法/非法走子、非当前回合、moveIndex 竞争、时钟超时等。可通过纯函数抽取 + 单元测试，或 Firebase emulator 集成测试实现。

#### Firestore rules 测试

扩展 `functions/test/firestore-rules.test.ts`，使测试集合与生产 `firestore.rules` 一致（guests、invitations、wizard_rooms、lobby 等），并在 CI 中通过 emulator 执行。

#### displayName 服务端绑定

聊天与在线状态写入时，不使用客户端传入的显示名，而从 `guests/{normalizedName}` 文档读取 `displayName`（uid 校验通过后）；客户端伪造或冒充他人昵称的路径被关闭。

#### LLM 输出 scrub

大厅 `@Lucy` / `@Luca` 等 Gemini 回复经与 `askHost` 相同的内容过滤；高危输出拒绝发送或回退模板，避免不当内容出现在所有在线访客面前。

---

### 1.6 明确不做 / 延后（路径 B 范围外）

| 项 | 原因 |
|----|------|
| 完整 COPPA 可验证家长同意 | 学习站 + 亲友圈；路径 C |
| 手机专项 UX 优化 | 保持现状即可 |
| both-host / surprise host 完整 UX | 有类型/代码，无产品入口；文档标 deferred |
| Hint Sparkle 品牌幂等 | 功能上先做通用 Hint 即可 |
| Terminal MUD 大重构 | 彩蛋，低优先级 |
| 公开 matchmaking | 产品原则不变 |
| Wizard 语音完整转写审核管线 | 路径 B 用透传 Hall + 限速举报；完整 STT 审核路径 C |

---

## 第二部分：路径 B 工作计划

各阶段可并行；**完成标准**为可勾选的验收项，不含工作量与时间预估。

---

### Phase 0 — 工程护栏

**目标：** 核心逻辑变更有可自动发现的回归防护。

#### 0.1 持续集成（CI）

**功能内容：**

- 新增 `.github/workflows/ci.yml`（或等效）。
- 在 push 至 `main` 及所有 PR 上触发。
- 执行 monorepo 级：`pnpm install`、`pnpm typecheck`、`pnpm lint`、`pnpm test`。
- 可选：同 workflow 或独立 job 跑 `pnpm build`。

**完成标准：**

- [ ] 任意破坏 typecheck 或 lint 的 PR 在 GitHub 上显示失败，无法在无 override 下视为绿色。
- [ ] 本地与 CI 使用相同 pnpm / Node 版本约定（engines 一致）。

#### 0.2 submitMove 核心测试

**功能内容：**

- 为走子校验逻辑编写测试（合法走子接受、非法拒绝、错回合、moveIndex 不同步、超时判负等）。
- 优先覆盖 chess.js 重放与事务内校验路径。

**完成标准：**

- [ ] 至少覆盖上述 5 类场景，全部通过。
- [ ] 测试纳入默认 `pnpm test`，CI 必跑。

#### 0.3 Firestore 安全规则测试扩展

**功能内容：**

- 扩展 `functions/test/firestore-rules.test.ts`，对齐 `firestore.rules` 中的主要 collection。
- 包含：guests 自读、invitations 读策略、wizard_rooms、lobby 写拒绝、默认 deny 等。

**完成标准：**

- [ ] 规则测试与生产 rules 文件无已知遗漏（对照 `firestore.rules` 清单勾选）。
- [ ] CI 通过 `firebase emulators:exec`（或项目既有 `test:rules` 脚本）执行并通过。

#### 0.4 测试门禁收紧

**功能内容：**

- 评估并收紧 `passWithNoTests`：避免「零测试也通过」掩盖空包。

**完成标准：**

- [ ] web 与 functions 包在 CI 中若测试套件为空或失败，pipeline 失败。

#### 0.5 castleEnter 安全测试

**功能内容：**

- 为 `castleEnter` 编写测试：magic word 校验、3-strike、bypass 门控、速率限制（按 uid / 按 name 若已实现）。

**完成标准：**

- [ ] 错误 magic word 累计 strike；bypass 用户行为与文档一致；测试在 CI 通过。

#### 0.6 Node 版本统一

**功能内容：**

- 根 `package.json` engines 与 `functions`、README Quickstart 对齐（Node 22）。

**完成标准：**

- [ ] 三处文档/配置一致，无「>=20」与「22」冲突。

#### 0.7 GCP 账单预算告警

**功能内容：**

- 按 `COST_GUARDRAILS.md` Layer 3 在 GCP Console 配置预算与邮件/通知。
- 更新 `FEATURE_MAP.md` 对应行状态。

**完成标准：**

- [ ] 预算阈值与通知渠道已配置并可人工验证触发路径（或文档记录告警邮箱/阈值）。
- [ ] `FEATURE_MAP.md` 中该项标为 shipped 或 partial（若仅缺自动化 runbook）。

---

### Phase 1 — 安全与聊天架构

**目标：** 亲友测试下，大厅与 Wizard 聊天可控、可审、无隐形一对一私聊。

#### 1.1 Wizard 文字消息透传 Hall

**功能内容：**

- Wizard 房间文字聊天在 moderation 处理后，镜像至大厅可见 feed（新子集合或复用 `lobby/messages` 并带类型标记）。
- 消息带上下文前缀（如房间 id、模式 Wizard），便于家长/管理员追溯。
- 复用或扩展 `profanity.ts`、限速、举报逻辑。

**完成标准：**

- [ ] Wizard 房间内发送的一条文字消息，在大厅对应 feed 中可见（权限：已登录访客，与现有大厅策略一致）。
- [ ] 透传消息经过与大厅发帖相同的过滤规则。
- [ ] 无仅房间两人可见、且不同步大厅的 Wizard **文字**聊天路径（除系统/错误临时态）。

#### 1.2 Wizard 语音消息透传策略（路径 B）

**功能内容：**

- 语音消息保留房间内播放/存储能力。
- 大厅侧展示：元数据 + 房间引用 + 举报入口（路径 B 不要求 STT 转写进 Hall）。
- 文档说明：语音在 Wizard 房间可听，大厅显示「某房间有语音消息」级动态或等同可见性策略（与 1.1 设计稿一致）。

**完成标准：**

- [ ] 语音消息有大小/时长/频率上限（已有则文档化；缺失则补齐）。
- [ ] 大厅或统一 moderation 界面可定位到源房间与消息 id 以执行举报/隐藏。
- [ ] `PRIVACY.md` 描述与实现一致。

#### 1.3 统一 moderation 与无 DM 审计

**功能内容：**

- 确认代码库不存在「仅两 uid 可见」的聊天 collection。
- Wizard 与 Hall 举报可复用或扩展 `reportChatMessage` / `chat_flags` 模型。
- 可选：轻量 uid 封禁（admin），拒绝 `postChat` / `setPresence` / Wizard 发帖。

**完成标准：**

- [ ] 代码与文档审计记录：无私聊通道。
- [ ] 举报 Wizard 消息有端到端路径（举报 → 达阈值隐藏或人工处理）。
- [ ] 封禁 uid 后，该用户无法在大厅与 Wizard 发新消息（若实现 1.3 封禁）。

#### 1.4 displayName 服务端绑定

**功能内容：**

- `postChat`、`setPresence`：uid 归属校验后，使用 `guests/{normalizedName}.displayName`，忽略或严格比对客户端传入值。
- `joinRoom` 首次加入：显示名策略与 guest 记录一致或经同样 scrub。
- `castleEnter` / 改名：显示名经 `scrubMessage` 或等价校验。

**完成标准：**

- [ ] 客户端传入与 guest 文档不一致的 displayName 时，服务端拒绝或使用服务端值（行为在代码注释或类型中明确）。
- [ ] 无法用修改客户端在大厅冒充他人已注册昵称。

#### 1.5 Hall LLM 回复 scrub

**功能内容：**

- `hostChatReply.ts`（及同类 Hall LLM 出口）对 Gemini 输出执行与 `askHost` 相同的 scrub；高危则不发或模板回退。

**完成标准：**

- [ ] 模拟不当模型输出时，不会原样出现在 `lobby/messages`。
- [ ] 有可观测日志或计数（便于发现 filter 频率异常）。

#### 1.6 Gemini safetySettings

**功能内容：**

- 在 `functions/src/commentary/gemini.ts`（或统一封装）为所有儿童面向调用配置 `safetySettings`。
- 涵盖：commentary、recap、Hall reply、puzzle explain、story、quiz 等。

**完成标准：**

- [ ] 所有 Gemini 调用经统一封装，safetySettings 一处配置、全局生效。
- [ ] 与 `DECISIONS.md` / 架构文档描述一致。

#### 1.7 Firebase App Check

**功能内容：**

- Web 端注册 App Check；Cloud Functions 对 callable 校验 App Check token（可分阶段：先 monitor 后 enforce）。

**完成标准：**

- [ ] 生产环境 App Check 已启用；Functions 对关键 callable（chat、enter、LLM、走子）enforce 或 documented 分阶段日期下 enforce。
- [ ] 未通过 App Check 的脚本调用被拒绝。

#### 1.8 基础设施加固

**功能内容：**

- Firebase Web API key 域名限制。
- 生产环境强制设置 `IP_HASH_SECRET`（非默认值）。
- Bypass 路径：`castleBypass` 限速；bypass 用户 displayName 不由客户端任意指定。
- Hosting 安全头：`Content-Security-Policy`、`frame-ancestors` 等写入 `firebase.json`。

**完成标准：**

- [ ] API key 仅允许正式域名；部署 checklist 含 `IP_HASH_SECRET`。
- [ ] Bypass 发帖受限速约束；行为与 `MVP2_PLAN` 意图一致。
- [ ] 安全头在部署环境可验证（浏览器或 securityheaders 扫描）。

#### 1.9 Profanity 加强

**功能内容：**

- 高危词**拒绝发送**而不仅是打星号；基础 leetspeak / 规范化。
- 维护流程：词表更新记录在案（工程不负责法律，但负责可审计）。

**完成标准：**

- [ ] 高危命中时消息不进入大厅/Wizard feed。
- [ ] 单元测试覆盖典型 evasion 与拒绝路径。

#### 1.10 隐私文案更新

**功能内容：**

- 更新 `PRIVACY.md`：标准棋局无聊天；Wizard 趣味模式有房间聊天且**会出现在大厅动态（或等同可见性）**；数据删除、AI 使用、排行榜展示原则。

**完成标准：**

- [ ] 文案与 Phase 1.1–1.2 实现一致。
- [ ] Gate 或 `/me` 可访问该隐私说明（见 Phase 3.8）。

---

### Phase 2 — Ada 体验

**目标：** 日常学习路径更顺，减少挫败与信息过载。

#### 2.1 AI 练习 Hint

**功能内容：**

- 在 `AiPracticeScreen` 增加 Hint 控制（单步箭头或 host 一句话），行为对齐残局/谜题中的 hint 模式。
- 不改动棋规；hint 不改变合法着法集合。

**完成标准：**

- [ ] AI 对局进行中可请求 Hint，有次数或节奏限制（与残局/谜题策略同级或文档说明）。
- [ ] Hint 不触发对手着法变化以外的规则例外。

#### 2.2 大厅 Phase 1C（Learn / Play / Break）

**功能内容：**

- `HallScreen` 三门分区：Learn（学棋）、Play（对局）、Break（休息/趣味）。
- 门牌归属与 `FEATURE_MAP.md` §1 表一致；Wizard's Duel 留在 Break，并保留「非标准练棋」说明。

**完成标准：**

- [ ] 三个 section 在 UI 上清晰分区（标题或视觉分隔）。
- [ ] 门与 FEATURE_MAP 表一致；无门落在错误分区。

#### 2.3 赛后复盘「孩子模式」默认

**功能内容：**

- `PostGameAnalysisScreen` 默认：host 故事 + 走子列表 + 分类标签；Engine eval、CP loss、best move 细节折叠为「给好奇的大人」或可展开区块。

**完成标准：**

- [ ] 首次进入复盘不强制展示 cp / eval 数值。
- [ ] 展开后仍可见完整引擎信息（家长/教练可用）。

#### 2.4 全局静音与安静庆祝

**功能内容：**

- 挂载 `MuteButton` 至大厅 header 与对局屏 header。
- 可选：设置项「减少庆祝动画」（尊重 `prefers-reduced-motion` 扩展至 fireworks / PowerUp ceremony）。

**完成标准：**

- [ ] 不打开终端即可静音/恢复音效。
- [ ] `prefers-reduced-motion: reduce` 下庆祝动画显著减弱或跳过。

#### 2.5 200 分解锁友好文案

**功能内容：**

- 锁定 Online / AI 门时，展示「约 N 次 Daily Five」类指引 + 直达 Daily Five 或谜题链接。
- `VisitorCard` 与门牌锁定态文案一致。

**完成标准：**

- [ ] 新用户在大厅能理解「如何解锁」且一键可达赚取积分的活动。
- [ ] 解锁阈值仍由服务器 gate 控制，仅文案/导航优化。

#### 2.6 对局中轻量 host 台词

**功能内容：**

- 模板化非 LLM 台词：将军、重复将军、子力发展、简单战术提示等，在 Local / Online / AI 屏按节奏插入。
- 遵守 `HOST_PERSONAS.md`：温暖、具体、不虚假表扬。

**完成标准：**

- [ ] 非吃子场景下对局中有可感知的 host 存在感（不要求每步）。
- [ ] 台词全部为模板，不增加 per-move LLM 成本。

#### 2.7 分析等待 UX

**功能内容：**

- Stockfish 全盘分析期间：明确进度、可离开页面提示（若支持后台继续）、或引导轻量活动（如 Daily Five 链接）。

**完成标准：**

- [ ] 分析超过 N 秒时用户看到进度而非静止页。
- [ ] 文案适合儿童阅读（无「blocking main thread」类术语）。

#### 2.8 邀请与弹窗 a11y

**功能内容：**

- `InviteInbox` 等：`aria-modal`、初始 focus、focus trap、Escape 关闭、focus 还原。
- `MyTeamsList` 等 faux button 补全 Enter/Space。

**完成标准：**

- [ ] 键盘可完成接受/拒绝邀请。
- [ ] 屏幕阅读器可识别对话框标题与主要操作。

#### 2.9 棋盘键盘基础路径

**功能内容：**

- `Board.tsx`：格子可聚焦、方向键或 tab 导航、选定格与合法目的格有 `aria-selected` / 文案反馈（完整键盘走子可分步）。

**完成标准：**

- [ ] 无指针设备下可选子并获知合法着法（至少选格+读屏提示；走子执行可为 Phase 2 最小子集）。

#### 2.10 Hall 与 Shop 文案修复

**功能内容：**

- 锦标赛门牌与 `TournamentRoute` 实际能力一致。
- Theme Shop 与 `cosmetics/registry`、客户端 `pieceSets` 一致，去掉误导性「coming soon」。

**完成标准：**

- [ ] 无主要门牌宣称未实现功能。
- [ ] Shop 可购买集与 UI 锁定状态一致。

#### 2.11 分类阈值校准（Ada 样本）

**功能内容：**

- 用 Ada（及同水平）真实对局样本验证 `classify.ts` 标签分布；必要时微调阈值或 Brilliant 条件，并更新测试 anchor。

**完成标准：**

- [ ] 有记录的样本集与结论（过严/过松/move 类型）。
- [ ] 阈值变更反映在 `classify.test.ts` 与 `FEATURE_MAP.md`（若从 planned → shipped）。

---

### Phase 3 — 结构债与数据

**目标：** 降低维护成本，解决跨设备「自己的对局」历史断裂。

#### 3.1 packages/shared（第一期）

**功能内容：**

- 新建 `packages/shared`（或 `@power-up-chess/shared`），迁入：`rooms/types`、`personas`、wizard `spells/types` 等双份定义。
- web 与 functions 均从 shared 引用。

**完成标准：**

- [ ] 上述类型/常量仅一处定义；两端 build 通过。
- [ ] 文档注明 shared 边界（什么应迁入、什么保留端特有）。

#### 3.2 拆分 callables.ts

**功能内容：**

- 将 `apps/web/src/firebase/callables.ts` 按 domain 拆为多文件，barrel 导出，对外 API 不变。

**完成标准：**

- [ ] 单文件行数降至可维护范围；无导入路径破坏（或仅内部重构）。
- [ ] typecheck 通过。

#### 3.3 服务端 LLM 超时兜底

**功能内容：**

- `hostCommentary`、`gameRecap` 等：服务端 catch / 超时后返回模板或结构化 fallback，不仅依赖客户端 3s。

**完成标准：**

- [ ] Gemini 超时或 5xx 时，客户端仍能收到合法 fallback 响应而非裸 500（与架构文档一致）。

#### 3.4 自己的对局跨设备同步

**功能内容：**

- 本地 / AI 终局后，将摘要（或全文谱）同步至服务端 guest 关联存储；`/history` 或 `/me` 合并展示「本设备 + 账号」对局。
- 与现有 `playerGames` / IndexedDB 策略整合，避免双写混乱。

**完成标准：**

- [ ] 同一 name + magic word 在新设备登录后，可看到此前同步的自有对局列表（至少最近 N 局）。
- [ ] `forgetMe` 仍删除服务端同步数据。

#### 3.5 per-normalizedName enter 限速

**功能内容：**

- `castleEnter` 增加按 `normalizedName` 的尝试频率限制，补充 per-uid 限制。

**完成标准：**

- [ ] 同一昵称高频错误尝试被 throttle；合法用户不受影响。
- [ ] 测试或文档记录限制参数。

#### 3.6 轻量 E2E 验收（推荐）

**功能内容：**

- Playwright（或 Vitest browser）：进城堡 → 完成 Daily Five 一题（或跳过登录态 mock）→ 本地对局走一步 → 认输/结束。

**完成标准：**

- [ ] 一条 happy path 在 CI 或 nightly 可跑（emulator 或 staging）。
- [ ] 失败时保留 trace 或截图配置说明。

#### 3.7 排行榜 / 公开名 opt-in

**功能内容：**

- Gate 屏 top-5、find player 等公开露名处，设置中增加 opt-in/out（默认策略在 `PRIVACY.md` 写明）。

**完成标准：**

- [ ] 用户可关闭公开排行榜露名；关闭后不出现在 top-5 等位置（或显示匿名占位策略 documented）。

#### 3.8 应用内隐私入口

**功能内容：**

- Gate 与 `/me` 链接至隐私说明（静态页或 in-app modal），含 Wizard 聊天透传 Hall 说明。

**完成标准：**

- [ ] 未登录与已登录用户均可从上述入口读到当前版 `PRIVACY.md` 内容。

---

### Phase 4 — 文档 Sprint

**目标：** 规划文档不再误导开发；活文档与代码同步。

#### 4.1 FEATURE_MAP 补全

**功能内容：**

- 补充：invitations、presence、Wizard→Hall 透传、endgame/openings 积分、App Check、CI 等 shipped/partial 项。

**完成标准：**

- [ ] §1 门表与 §3 状态表反映路径 B 交付项；更新日期刷新。

#### 4.2 OPEN_QUESTIONS 清理

**功能内容：**

- 已实现项标 ✅ 并指向代码/FEATURE_MAP；保留真正开放项（如 both-host 是否做、piece set 动画策略等）。

**完成标准：**

- [ ] 无「已在生产但仍标 open」的 Product/Safety 条目不处理。

#### 4.3 TECHNICAL_ARCHITECTURE 修订

**功能内容：**

- moves 内嵌数组模型、聊天架构（标准棋局无聊天、Wizard + Hall 透传）、设备策略、host 触发表与现网一致。

**完成标准：**

- [ ] 新开发者读架构文档不会按 moves 子集合或「无 Wizard 聊天」错误实现。

#### 4.4 DECISIONS 与 POWER-UP 范围

**功能内容：**

- 幂等记录：Capture Spark、Tactic Bloom、Crown Badge 现状。

**完成标准：**

- [ ] `DECISIONS.md` 与对局内实际 power-up 行为一致。

#### 4.5 README 与 MVP 计划归档

**功能内容：**

- `README.md` 改为当前能力与 Quickstart。
- `MVP2_PLAN.md`、`MVP3_PLAN.md` 头部加「已交付，归档参考」及日期。

**完成标准：**

- [ ] 新克隆仓库者不被 README 引导至「MVP1 将来式」。

#### 4.6 COPPA_CHECKLIST 分路径

**功能内容：**

- 区分路径 B（亲友测试最低线）与路径 C（公开发布必选项）。

**完成标准：**

- [ ] 清单中每项标注 B 必需 / C 必需 / 已完成。

---

## 路径 B 总完成定义（Done）

当以下全部勾选时，视为路径 B 可邀请亲友试用：

- [ ] **Phase 0** 全部完成标准满足（含 CI + submitMove + rules 测试）。
- [ ] **Phase 1** 全部完成标准满足（含 Wizard→Hall 透传、displayName 绑定、LLM scrub、safetySettings、App Check）。
- [ ] **Phase 2** 全部完成标准满足（含 AI Hint、大厅三区、复盘孩子模式、静音、解锁文案）。
- [ ] **Phase 3** 中 3.1 shared、3.4 跨设备历史、3.8 隐私入口完成；3.6 E2E 强烈推荐。
- [ ] **Phase 4** 文档 sprint 完成，FEATURE_MAP 与代码一致。
- [ ] GCP 账单告警已配置。
- [ ] 手机策略在文档中写明：支持，非主要优化目标。

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-02 | 初版：合并审计结论与 Jeff 反馈（Wizard/Hall 透传、学习站定位、路径 B、手机策略）；附路径 B 分阶段计划与完成标准 |