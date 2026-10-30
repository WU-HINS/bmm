# BMM 全向评审与优化面

> 评审对象：`Y80/bmm` @ `f8d4bbe`（style: refine home page translucent theme）
> 评审方式：静态通读 + 依赖与配置核对 + 关键链路追踪；结论标注证据等级
> 范围：架构、认证授权、数据层、Server Actions、外部抓取、AI 集成、前端、性能、可观测性、测试、构建部署、仓库卫生

---

## 0. 结论

**一句话**：这是一个约定统一、分层清晰、工程完整度明显高于同类个人项目的 Next.js 16 全栈应用；真正的短板不在代码组织，而在**认证安全细节**、**外部抓取的 SSRF 面**和**缺失的质量门禁**。

**三条最该先做的事**（按收益/成本排序）：

1. **认证硬化** —— PBKDF2 仅 1000 轮、密码比较非常量时间、登录无限流、user.email 无唯一约束。四项叠加，构成「离线爆破 + 并发注册投毒」的组合风险。
2. **抓取链路出站收敛** —— fetchHtml 对用户提交的 URL 直接发起请求并跟随重定向，未阻断内网与云元数据地址，也没有响应体大小上限。
3. **把 CI 变成真正的门禁** —— 当前 Docker 构建带 IGNORE_BUILD_ERRORS=true，类型错误会被静默发布；仓库里没有任何 lint / test / typecheck 流水线。

**本次交付**：在上述评审基础上完成 **OIDC 登录 + 账户绑定**（AUTH_OIDC_ISSUER / AUTH_OIDC_ID / AUTH_OIDC_SECRET 三变量接入，绑定链路独立于 NextAuth 内部实现），未配置时零影响。详见第 6 节与 [doc/oidc.md](./doc/oidc.md)。

---

## 1. 事实基线

| 项目 | 值 | 证据 |
| --- | --- | --- |
| 框架 | Next.js 16.2.6 + React 19.2.5 | package.json [FACT] |
| 认证 | next-auth 5.0.0-beta.29 + @auth/drizzle-adapter 1.10.0 | package.json [FACT] |
| ORM / 驱动 | drizzle-orm 0.45.2，libsql / postgres-js | package.json、src/db [FACT] |
| UI | HeroUI 2.8.10 + Ant Design 6.1.0 + Tailwind 4 | package.json [FACT] |
| AI | Vercel AI SDK 6.x + @ai-sdk/openai-compatible | src/lib/ai [FACT] |
| 规模 | src 下 199 个受控文件，约 17.5k 行 TS/TSX | git ls-files + wc -l [FACT] |
| 运行约束 | Node ≥ 24、pnpm ≥ 10.24 | package.json#engines [FACT] |
| 测试 | Vitest 3.2.4，串行执行（fileParallelism:false） | vitest.config.ts [FACT] |
| 持久化默认 | SQLite file:./sqlite.db，首次启动自动建表 | .env、scripts/db-init.mjs [FACT] |

---

## 2. 架构地图

```
src/app/            App Router：页面（RSC 默认）+ 4 组路由（public / user / admin / api）
src/components/     展示与交互组件（ui / re-export / 业务模块）
src/actions/        Server Action 唯一写入口，统一被 makeAction 包装（schema + guard + 错误归一）
src/controllers/    业务逻辑 + zod schema，直接使用 drizzle
src/lib/            横切能力：auth、ai、zod、SqlXError
src/db/             sqlite / postgres 双 schema + 双 driver，按 DB_DRIVER 切换
src/utils/          纯函数与网络、抓取、图标探测等基础设施
```

**数据流**：RSC/客户端 → runAction(actXxx()) → makeAction（schema 校验 → guard → handler）→ Controller → drizzle → DB → 统一 { data | error } 返回。

**分层评价**：这套分层是本项目最大的优势 —— 写操作只有一条通路，权限判定、参数校验、错误文案高度一致，新增功能的心智负担很低。本次 OIDC 变更正是按这套约定落地的（1 个 controller、3 个 action、2 个 route handler、2 个 lib 模块）。

---

## 3. 分项评审

### 3.1 认证与账户（最高优先级）

| # | 现状 | 问题 | 影响 |
| --- | --- | --- | --- |
| A1 | pbkdf2Sync(password, salt, 1000, 32, 'sha256') | 迭代仅 1000 轮，OWASP 对 PBKDF2-HMAC-SHA256 的建议是 600,000 轮 | 离线爆破成本低几个数量级 [FACT] |
| A2 | verifyPassword 用 === 比较 hex 字符串 | 非常量时间比较 | 理论计时侧信道，与 A1 叠加时是最弱环 [INFERENCE] |
| A3 | users.email 无 unique()；注册流程是 count() 后再 insert() | TOCTOU：并发注册同一邮箱可写出多条用户；findFirst 语义随之不确定 | 账号归属混乱、OIDC/凭证多绑定歧义 [FACT] |
| A4 | 无登录失败计数、无速率限制、无锁定或验证码 | 在线爆破无成本 | 结合 A1，弱口令几乎无防护 [INFERENCE] |
| A5 | session.strategy='jwt'，role 写入 token | 角色变更需等 token 过期（maxAge 30 天）；用户被删除后旧 token 仍可访问 | 降权与封禁不即时 [FACT] |
| A6 | GitHub token 交换默认走第三方代理 FETCH_GITHUB_TOKEN_PROXY（.env 中指向 *.val.run） | 第三方可见授权码与 access_token | 供应链与凭据泄露面 [FACT] |
| A7 | .env 被 git 跟踪（含 AUTH_SECRET、示例 GitHub OAuth 凭据） | 密钥入库 | 拿到仓库即可伪造 JWT [FACT] |
| A8 | sessions / verificationTokens / authenticators 表在 JWT 策略下无人写入 | 死表 | 认知负担与「以为有得查」的误判 [FACT] |

**建议（按顺序）**：

1. 迁移到 argon2id（或至少 scrypt），并支持「登录时按需 rehash」平滑升级；
2. users.email 加唯一约束（先去重存量数据），注册改为 insert ... onConflictDoNothing + 判空；
3. 登录限流：serverless 下必须用外部存储（Upstash/Redis），进程内计数无效；
4. 短期方案：jwt 回调携带 userVersion（users 增列），会话刷新时比对，做到分钟级降权；
5. .env 移出版本库，改 .env.example，并轮换 AUTH_SECRET。

### 3.2 数据层

| # | 现状 | 问题 | 建议 |
| --- | --- | --- | --- |
| D1 | src/db/sqlite/schemas 与 src/db/postgres/schemas 手写双份 | 结构漂移无检测（本次 OIDC 无需动表，但新增字段要改两处） | 加一个「列名集合一致性」单测，成本极低收益高 |
| D2 | SQLite 侧 text() 无长度，PG 侧 varchar(length) | 长度约束只在前端 zod | 把 FieldConstraints 也用于 zod（多数已做到） |
| D3 | 仅 userBookmarks.hostKey 有索引 | userId、bId/tId 的高频过滤缺索引（name 因 unique 自动有索引） | 按 findMany 的 where/orderBy 组合补索引 |
| D4 | UserController.delete 手工级联删除 6 张表 | 已有 onDelete: cascade，双保险但易漏新表 | 保留事务，改为依赖 cascade + 断言 |
| D5 | 迁移产物在 src/db/*/migrations/&lt;env&gt;，另有 db:push | db:push 会忽略 migrations 直接改表 | 生产只允许 db:migrate，push 仅限本地 |

### 3.3 Server Actions

| # | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| S1 | make-action.ts:47 | 字符串拼接优先级高于 \|\|，无 issue 时得到字面量「参数错误：undefined」；且 pop() 取的是最后一条 issue，通常应取第一条 | 用模板字符串 + issues[0] |
| S2 | make-action.ts:56 | guard:'admin' 未通过时 redirect(LOGIN)，而 admin layout 用的是 /forbidden | 统一到 FORBIDDEN |
| S3 | 全局 | Error.message 直接回传客户端；SqlXError 会把底层约束信息中文化后透出 | 生产环境改为通用文案 + 日志留痕 |
| S4 | 全局 | 无幂等键、无请求体大小限制 | 关键写操作加幂等键 |
### 3.4 外部抓取与网络（SSRF 面）

| # | 位置 | 问题 |
| --- | --- | --- |
| N1 | src/utils/fetch-html.ts → fetchHtmlRequest | 直接请求用户提交的 URL，未阻断内网、回环、link-local 地址；redirect:'follow' 会一路跟随跳进内网 |
| N2 | src/utils/http.ts:41-50 | arrayBuffer() 全量读入，无 Content-Length / maxBytes 上限，单文件即可打爆内存 |
| N3 | SiteSetting.controller 的 proxyUrl 模板 {url} | 管理员可配任意代理模板，等于把出站能力开放给配置面；误配会泄露内网 |
| N4 | BookmarkHostCheck | 30s 超时、并发 5、24h 新鲜度 —— 这块设计是好的，可作为抓取链路的改造模板 |

**建议**：URL → DNS 解析 → 校验目标 IP 不在 127/8、10/8、172.16/12、192.168/16、169.254/16、::1、fc00::/7；redirect:'manual' 自行跟随最多 3 跳并逐跳校验；响应体上限 5MB；提供 SITE_ALLOW_PRIVATE_HOSTS=1 开关（自建 NAS 用户会需要）。

### 3.5 AI 集成

- AiProvider.controller 的 apiKey 以明文 JSON 落在 siteConfigs，与其它站点配置同级。建议用 AUTH_SECRET 派生密钥做 AES-GCM 封装（本次绑定 Cookie 已用同一手法，可直接复用）。
- 分析调用无超时与长度保护，建议加 AbortSignal.timeout 与失败降级。
- prompts.ts 集中管理提示词，是被低估的优点 —— AI 行为可审阅、可回归。

### 3.6 前端与设计系统

- **双 UI 库并存**（HeroUI + Ant Design），另有 motion 与 framer-motion 两个动画包同时在用 → 包体与样式体系双份维护成本 [FACT]。
- src/app 下没有 error.tsx / loading.tsx / not-found.tsx → 任一 RSC 抛错即整屏 500，缺少局部降级 [FACT]。
- DEFAULT_BOOKMARK_PAGESIZE = 240：首页一次取 240 条书签，首屏 RSC payload 偏大。
- 未使用 next/font，依赖系统字体（不算缺陷，但跨平台观感不统一）。
- i18next 在依赖里但没有使用 → 死依赖。

### 3.7 性能与缓存

- 全站没有 unstable_cache / revalidate / dynamic 声明（除本次新增的两个 route），公开页每次请求都查库。
- 公开页是读多写少场景，ISR / revalidateTag 的收益极高，且与 actInsertPublicBookmark 的写路径容易对齐。
- 无 middleware，意味着没有统一的 bot 拦截、限流、安全响应头（CSP、X-Frame-Options 等）。
- images.dangerouslyAllowSVG: true 且允许远程 pattern —— 当前 remotePatterns 只放行 iconify 与自定义 logo，尚可，但变更时需谨慎。

### 3.8 可观测性

- 仅 console.log / console.error（16 处），无结构化日志、无 trace id、无错误聚合。
- 建议在 makeAction 内统一捕获并附加 {action, userId, ms, ok}，接一个低成本收集端即可覆盖 80% 排障场景。

### 3.9 测试

- 已有：DB 层、controller 层（credentials、read-later、host-check）、纯函数（bookmark-host、website-icon、fetch-html）。
- 缺：认证集成测试、组件测试、E2E；fileParallelism:false 让全量测试串行，CI 时间线性增长。
- 本次补充两组测试：OIDC 配置解析、绑定与解绑规则。

### 3.10 构建与部署

| # | 现状 | 问题 |
| --- | --- | --- |
| B1 | Dockerfile 构建阶段 IGNORE_BUILD_ERRORS=true | 类型错误既不进 CI 也不阻断发布 [FACT] |
| B2 | 只有 docker-build-push 一个 workflow，无 lint/test/typecheck | 质量门禁为零 [FACT] |
| B3 | 多阶段 Docker，最终镜像含 prune 后的 node_modules | 用体积换简单，可接受；若需瘦身可评估 standalone + 例外依赖 |
| B4 | pnpm --frozen-lockfile | 好实践 [FACT] |

### 3.11 仓库卫生与文档

- README 中英双份、结构完整（概览/能力/技术栈/部署/FAQ），是少见的加分项。
- .env 入库（见 A7）；.agents/skills、skills-lock.json 与产品代码混放，边界可再理清。
- 提交信息遵守 conventional commits，可直接生成 CHANGELOG。
---

## 4. 优化面（优先级矩阵）

### P0 · 1–3 天，风险收敛

| 编号 | 事项 | 改动点 | 验收标准 |
| --- | --- | --- | --- |
| P0-1 | 密码存储与比对升级 | Credentials.controller：argon2id 或 scrypt + timingSafeEqual；登录成功时按需 rehash | 新注册为 argon2id；旧 PBKDF2 哈希首次登录后自动升级；单测覆盖 |
| P0-2 | users.email 唯一约束 | sqlite/pg schema + 去重脚本 + 迁移 | 并发注册同邮箱只成功一次；create 返回中文错误 |
| P0-3 | 登录限流 | Redis/Upstash + actVerifyUser 前置计数 | 单 IP 5 次/分钟；超限中文提示；serverless 下生效 |
| P0-4 | 抓取 SSRF 收敛 | utils/http.ts 增加目标 IP 校验、手动跟随重定向、5MB 上限 | 请求 169.254.169.254 被拒；请求 127.0.0.1 被拒（除非开关打开） |
| P0-5 | 密钥出库 | 删除被跟踪的 .env，新增 .env.example，轮换 AUTH_SECRET | git ls-files .env 为空；README 指引更新 |

### P1 · 1–2 周，质量与体验

| 编号 | 事项 | 改动点 |
| --- | --- | --- |
| P1-1 | CI 门禁 | GitHub Actions：pnpm lint + tsc --noEmit + vitest run；Docker 构建去掉 IGNORE_BUILD_ERRORS |
| P1-2 | 角色/封禁即时生效 | jwt 回调比对 users.role 版本号，或切 database session（保留 edge-split config） |
| P1-3 | AI Key 加密 | 复用本次实现的 AES-GCM 封装，siteConfigs 内只存密文 |
| P1-4 | 公开页缓存 | unstable_cache + 写路径 revalidateTag('public:bookmarks') |
| P1-5 | 错误边界 | 每个路由组补 error.tsx / loading.tsx |
| P1-6 | 结构化日志 | make-action 统一包装，输出 {action, userId, ms, ok} |

### P2 · 持续

| 编号 | 事项 |
| --- | --- |
| P2-1 | UI 库收敛（AntD → HeroUI 或反向），移除 motion / framer-motion 重复项 |
| P2-2 | schema 单源化，或至少补列一致性测试 |
| P2-3 | 死依赖清理（i18next 等） |
| P2-4 | Playwright 冒烟：登录、建书签、绑定 OIDC、导出 |
| P2-5 | 首页分页尺寸从 240 下调 + 虚拟滚动 |

---

## 5. 反例与边界条件（这些建议在什么情况下会失效）

| 建议 | 反例 | 处理 |
| --- | --- | --- |
| 加 email 唯一约束 | 存量库可能已有重复邮箱 | 先跑去重脚本（保留最早注册者并迁移绑定关系），再上约束 |
| 切 database session | authConfig 是刻意拆成「无 adapter」以兼容 edge 的，切策略会牵动 middleware 侧 | 保留 split config，只在 auth() 内改为查库；或先做 P1-2 的版本号方案 |
| 加登录限流 | serverless 多实例下内存计数无效 | 必须外部存储；本地开发可降级为内存实现 |
| SSRF 阻断内网 | 用户确实会收藏 NAS / 内网 IP 站点（10.x、192.168.x） | 默认阻断 + SITE_ALLOW_PRIVATE_HOSTS 显式放开，并在 UI 提示后果 |
| 关掉 IGNORE_BUILD_ERRORS | 上游依赖的 .d.ts 偶发报错会卡住发布 | 先跑一次 tsc --noEmit 摸清基线（本次实测 0 错误），再开门禁 |
| 公开页 ISR | 管理员改数据后需要即时可见 | 写路径 revalidateTag + 首页 revalidate 兜底 |
---

## 6. 本次变更：OIDC 登录与账户绑定

### 6.1 接入方式

```bash
AUTH_OIDC_ISSUER=https://id.example.com/realms/bmm   # 也支持完整 discovery 地址
AUTH_OIDC_ID=bmm
AUTH_OIDC_SECRET=your-client-secret
```

三项齐备即启用；缺任一项整体关闭，登录页与绑定卡片自动隐藏，**对其他登录方式零影响**。

IdP 侧登记两个回调地址：

| 用途 | 地址 |
| --- | --- |
| 登录 | {AUTH_URL}/api/auth/callback/oidc |
| 绑定 | {AUTH_URL}/api/auth/oidc/link/callback |

### 6.2 设计取舍

| 决策 | 理由 |
| --- | --- |
| 登录走 Auth.js 内置 type:'oidc' provider | 不重复造轮子，discovery / PKCE / JWKS 由框架处理 |
| 绑定**不复用** Auth.js 登录回调链路 | 框架的「登录即建会话」语义与「给已登录用户挂身份」冲突；依赖 allowDangerousEmailAccountLinking 会把「按邮箱合并」变成全局默认，风险不可控 |
| 绑定使用独立 OAuth 流程 + 加密 Cookie 携带意图 | state / nonce / PKCE 全程自持；意图用 AUTH_SECRET 派生的 AES-256-GCM 封装，无法伪造 |
| 只信任经 JWKS 验签的 id_token | 不额外请求 userinfo，少一跳、少一个受代理影响的失败点 |
| 默认不按邮箱合并（AUTH_OIDC_TRUST_EMAIL=false） | 避免 IdP 侧未验证邮箱直接接管本地账户 |
| 绑定写入标准 account 表 | 与登录链路共享数据，绑定后登录自然命中，无需额外映射表与迁移 |

### 6.3 新增 / 修改文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| src/lib/auth/oidc-config.ts | 新增 | 环境变量解析、issuer/wellKnown 归一化、scope 规范化（纯函数，可测） |
| src/lib/auth/oidc-provider.ts | 新增 | provider 工厂 + claims 映射（name / preferred_username / nickname 兜底） |
| src/lib/auth/oidc-link.ts | 新增 | discovery 缓存、AES-GCM 意图封装、PKCE、token 交换、JWT 验签 |
| src/controllers/OidcBinding.controller.ts | 新增 | 绑定 / 解绑规则与冲突判定 |
| src/app/api/auth/oidc/link/route.ts | 新增 | 绑定起点（校验 session → 生成意图 → 302 到 IdP） |
| src/app/api/auth/oidc/link/callback/route.ts | 新增 | 绑定回调（state → session → code → id_token → 写库） |
| src/lib/auth/config.ts | 修改 | 条件注册 provider；signIn 增加 OIDC 邮箱守卫 |
| src/actions/items/auth.ts | 修改 | getOidcLoginConfig / getOidcBindingState / unbindOidcAccount |
| src/actions/index.ts | 修改 | 导出 actGetOidcLoginConfig / actGetOidcBindingState / actUnbindOidcAccount |
| src/app/login/page.tsx | 修改 | OIDC 登录按钮 + 4 类错误文案 |
| src/app/user/settings/page.tsx | 修改 | 传入绑定状态 |
| src/app/user/settings/ClientPage.tsx | 修改 | 「账号绑定」卡片（绑定 / 解绑 / 状态 / sub 展示 / 回调 toast） |
| app.config.ts | 修改 | 新增 ApiRoutes.OIDC_LINK |
| global.d.ts | 修改 | 补充 OIDC 环境变量类型 |
| package.json | 修改 | 直接依赖 jose（原为 next-auth 的传递依赖） |
| .env / README.md / README.en.md | 修改 | 配置说明与使用文档 |
| doc/oidc.md | 新增 | 完整接入指南 + 8 个 IdP 示例 + 排错表 |
| src/lib/auth/oidc-config.test.ts | 新增 | 配置解析 6 个用例 |
| src/controllers/tests/oidc-binding.test.ts | 新增 | 绑定 / 幂等 / 冲突 / 解绑守卫 7 个用例 |

### 6.4 安全属性

1. **state** 常量时间比较，且与加密 Cookie 内的意图绑定；
2. **nonce** 校验（IdP 回传时）；
3. **PKCE S256**，即使 client_secret 泄露也无法用拦截到的 code 换取 token；
4. **会话一致性**：回调要求当前 session.user.id 等于发起时的 userId，阻断「另一浏览器完成绑定」；
5. **冲突拒绝**：同一 sub 已被他人绑定 → 拒绝并回显中文原因；
6. **锁门保护**：解绑前检查是否仍有密码或其他 provider；
7. **Cookie 收敛**：作用域限定 /api/auth/oidc/link，httpOnly + sameSite=lax + HTTPS 下 secure，10 分钟过期；
8. **失败不外泄**：token 端点错误只回显状态码与截断后的响应片段（200 字符）；
9. **签名算法白名单**：`id_token` 仅接受 RSA（RS/PS）、EC（ES）、EdDSA，显式拒绝 `none` / `HS*`，算法声明与 JWKS 的 `kty`/`crv`/`kid` 双向核对；
10. **时钟容忍 60s**，`iss`/`aud`/`exp`/`nbf` 失败均映射为可读中文原因，不向页面暴露底层堆栈。

### 6.5 兼容性

- 未配置 AUTH_OIDC_*：createOidcProvider() 返回 null，providers 数组与改动前完全一致；
- 已有 JWT 会话不受影响（jwt / session 回调字段语义未变）；
- 数据库零迁移（复用 account 表）；
- Node / Edge：OIDC 绑定模块只在 Node runtime 的 route handler 中使用，Edge 侧只依赖纯函数 oidc-config。

---

## 7. 附录：问题清单（按严重度）

| # | 位置 | 级别 | 问题 | 建议 |
| --- | --- | --- | --- | --- |
| 1 | Credentials.controller.ts:8 | 高 | PBKDF2 仅 1000 轮 | argon2id / ≥600k 轮 + 平滑 rehash |
| 2 | Credentials.controller.ts:26 | 中 | 密码比较非常量时间 | timingSafeEqual |
| 3 | db/*/schemas/auth.ts users.email | 高 | 缺唯一约束 + 注册 TOCTOU | 唯一约束 + 去重迁移 |
| 4 | actions/items/auth.ts | 高 | 登录/注册无限流、无失败计数 | 外部存储限流 |
| 5 | .env（已入库） | 高 | AUTH_SECRET 与 OAuth 凭据进入版本库 | 移出并轮换 |
| 6 | lib/auth/config.ts:12 | 中 | JWT 内 role 不随库更新 | 版本号或 database session |
| 7 | utils/http.ts:41 | 高 | 无 SSRF 防护、无大小上限 | 私网阻断 + 5MB 限制 |
| 8 | actions/make-action.ts:47 | 低 | 运算符优先级 bug、取错 issue | 模板字符串 + issues[0] |
| 9 | actions/make-action.ts:56 | 低 | admin 守卫跳登录页 | 跳 /forbidden |
| 10 | Dockerfile:25 + 无 CI 流水线 | 高 | 类型错误静默发布 | 增加 typecheck job |
| 11 | src/app | 中 | 无 error / loading 边界 | 各路由组补齐 |
| 12 | AiProvider.controller | 中 | API Key 明文入库 | AES-GCM 封装 |
| 13 | package.json | 低 | motion/framer-motion、HeroUI/antd 双份、i18next 未用 | 收敛与清理 |
| 14 | src/db | 中 | 双 schema 手工同步 | 一致性测试 |
| 15 | 全站 | 中 | 无缓存策略 | 公开页 ISR + revalidateTag |
| 16 | lib/auth/github-provider.ts:16 | 中 | 默认第三方代理换 token | 自建代理或直连 |

---

## 8. 验证方式与实测结果

```bash
pnpm install
pnpm lint
npx tsc --noEmit
pnpm test
```

本次在本地（Node 22 / pnpm 10.24 / SQLite）实测：

| 检查 | 结果 |
| --- | --- |
| npx tsc --noEmit | **0 error**（需先生成 local.d.ts，见 scripts/utils.mjs#declareLocalType；否则 DB_DRIVER 退化为联合类型会报大量 drizzle 重载错误） |
| npx vitest run（全量） | 25 个文件通过 / 1 跳过，**167 passed / 3 skipped** |
| 新增 OIDC 测试 | 13 个用例全绿（配置解析 6 + 绑定规则 7） |
| npx eslint（改动范围） | 0 error，仅 1 条 img 提示（已按既有约定加 eslint-disable） |
| npx eslint .（全仓） | **1 error（既有）**：src/app/user/read-later/ClientPage.tsx:430 react-hooks/set-state-in-effect —— 说明 lint 从未被纳入发布流程 |
| npx next build | 成功，路由表中出现 /api/auth/oidc/link 与 /api/auth/oidc/link/callback |
| 端到端（本地 mock IdP，RS256 / ES256 / PS256 各跑一遍） | 账号密码登录 → 绑定 OIDC（PKCE/nonce/加密 Cookie 校验）→ 跳回 bind=ok → Cookie 清除 → 用 OIDC 登录命中同一账户（userId 一致），三种签名算法全链路均通过 |
| id_token 验签单测 | 14 例：RS256/RS512/PS256/ES256(P-256)/ES384(P-384) 通过；aud/iss/exp/nonce 不匹配、HS256、EC 对 RSA 公钥等负向用例全部按预期拒绝 |

OIDC 相关验证命令：

```bash
pnpm test -- src/lib/auth/oidc-config.test.ts
pnpm test -- src/controllers/tests/oidc-binding.test.ts
```

> 说明：本地未配置真实 IdP，登录与绑定链路的端到端验证需要在 Keycloak / Authentik 等实例上按 [doc/oidc.md](./doc/oidc.md) 完成；代码侧已覆盖配置解析、绑定规则、类型检查与全量回归。