<div align="center">
  <img width="108" src="./doc/images/logo.svg" alt="BMM Logo">
  <h1>BMM</h1>
  <p>收纳、整理、搜索与分享网站书签的开源全栈应用。</p>
  <p>面向个人与团队的书签管理器，支持公开展示、用户空间、后台维护，以及 AI 辅助整理流程。</p>
  <p>
    <a href="https://bmm.lccl.cc/" target="_blank">在线体验</a> ·
    <a href="https://github.com/Y80/bmm" target="_blank">GitHub</a> ·
    <a href="#quick-start">快速开始</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16">
    <img src="https://img.shields.io/badge/React-19-149eca?logo=react" alt="React 19">
    <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript 5">
    <img src="https://img.shields.io/badge/Drizzle_ORM-0.44-green" alt="Drizzle ORM">
  </p>
</div>

<!-- README-I18N:START -->

**简体中文** | [English](./README.en.md)

<!-- README-I18N:END -->

<div align="center">
  <img alt="PC 端明亮与暗色主题" src="./doc/images/screenshot-pc-light-dark.png">
  <img alt="后台管理界面" src="./doc/images/screenshot-pc-cms-light-dark.png">
  <img width="680" alt="移动端界面" src="./doc/images/screenshot-mobile.png">
  <img width="680" alt="AI 解析网站演示" src="./doc/images/screenshot-ai-analyse.gif">
</div>

<a id="overview"></a>

## 概览

BMM 是一个用于管理网站书签的开源应用。它把“收藏网页”“按标签整理”“公开展示优质网站”“在后台持续维护数据”放到同一套系统里，并为书签录入提供自动抓取与 AI 辅助能力。

你可以把它当作：

- 个人书签仪表盘
- 团队内的知识导航站
- 对外公开的优质网站目录

<a id="highlights"></a>

## 核心能力

- 公开页、用户空间、管理后台三套使用场景共存，适合从个人使用逐步扩展到公共导航站。
- 支持导入浏览器导出的书签文件，能把目录结构转为标签关联，降低迁移成本。
- 支持标签与书签的多对多关系、拖拽排序、关键词检索与拼音检索。
- 自动抓取网站标题、描述、图标，并补充常见图标路径探测能力。
- 支持 GitHub OAuth、通用 OIDC 单点登录与邮箱密码登录，并支持把 OIDC 身份绑定到已有账户。
- 通过 AI 自动分析网站信息、推荐标签，并为标签生成关联建议与主题色。
- 响应式界面同时覆盖桌面端与移动端，支持亮色与暗色主题。

<a id="roadmap"></a>

## 计划中的功能

- [ ] 多功能卡片，例如天气与资讯
- [ ] 浏览器扩展插件
- [ ] 书签可用性检测
- [ ] 稍后阅读系统

<a id="stack"></a>

## 技术栈

| 类别   | 技术                                                                 |
| ------ | -------------------------------------------------------------------- |
| 框架   | [Next.js 16](https://nextjs.org/) + React 19                         |
| 语言   | [TypeScript](https://www.typescriptlang.org/)                        |
| 样式   | [Tailwind CSS 4](https://tailwindcss.com/)                           |
| UI     | [HeroUI](https://heroui.com/) + [Ant Design](https://ant.design/)    |
| 数据库 | SQLite / PostgreSQL / Turso                                          |
| ORM    | [Drizzle ORM](https://orm.drizzle.team/)                             |
| 认证   | [NextAuth v5 beta](https://authjs.dev/)                              |
| AI     | [Vercel AI SDK](https://sdk.vercel.ai/) + OpenAI-compatible provider |
| 测试   | [Vitest](https://vitest.dev/)                                        |

<a id="quick-start"></a>

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 24.0.0
- [pnpm](https://pnpm.io/) >= 10.24.0

> [!TIP]
> 首次本地启动默认使用 SQLite。`pnpm dev`、`pnpm build` 和 `pnpm start` 都会先执行数据库初始化脚本，通常不需要手动建库。

### 本地开发

```bash
git clone https://github.com/Y80/bmm.git
cd bmm
pnpm install
pnpm dev
```

启动后访问 `http://localhost:3000`。

<a id="scripts"></a>

## 常用命令

| 命令              | 说明                                             |
| ----------------- | ------------------------------------------------ |
| `pnpm dev`        | 启动开发环境，并在启动前执行数据库初始化         |
| `pnpm build`      | 生产构建                                         |
| `pnpm start`      | 运行生产构建                                     |
| `pnpm lint`       | 执行 ESLint                                      |
| `pnpm test`       | 运行 Vitest 测试                                 |
| `pnpm db:test`    | 检查数据库是否可连接                             |
| `pnpm db:migrate` | 生成并执行数据库迁移                             |
| `pnpm db:push`    | 直接根据 schema 推送数据库变更，可能导致数据风险 |
| `pnpm studio`     | 打开 Drizzle Studio                              |

<a id="env"></a>

## 环境变量

完整示例可参考 [`.env`](./.env)。

> [!TIP]
> 如果你只想先把项目跑起来，本地开发通常只需要默认 SQLite 配置。AI 供应商在管理员后台配置，不需要环境变量。

| 变量                 | 用途                                       |
| -------------------- | ------------------------------------------ |
| `DB_DRIVER`          | 数据库驱动，支持 `sqlite` 或 `postgresql`  |
| `DB_CONNECTION_URL`  | 数据库连接串                               |
| `DB_AUTH_TOKEN`      | Turso 或 libsql 场景的令牌，可选           |
| `AUTH_URL`           | 当前站点访问地址，OAuth 回调与部署时会用到 |
| `AUTH_SECRET`        | NextAuth 密钥，生产环境建议配置            |
| `AUTH_GITHUB_ID`     | GitHub OAuth Client ID，可选               |
| `AUTH_GITHUB_SECRET` | GitHub OAuth Client Secret，可选           |
| `AUTH_OIDC_ISSUER`   | OIDC 发现地址（issuer 基址），可选         |
| `AUTH_OIDC_ID`       | OIDC Client ID，可选                       |
| `AUTH_OIDC_SECRET`   | OIDC Client Secret，可选                   |

<a id="database"></a>

## 数据库

BMM 目前直接支持 SQLite、PostgreSQL 与 Turso。

- 本地默认方案是 SQLite，数据库文件会在首次运行时自动初始化。
- 切换到 PostgreSQL 或 Turso 时，只需要调整 `DB_DRIVER` 与 `DB_CONNECTION_URL`。
- 仓库内提供了 [`docker-compose.yml`](./docker-compose.yml) 作为 PostgreSQL 场景示例。

如果你只想检查数据库状态，可以执行：

```bash
pnpm db:test
pnpm db:migrate
```

<a id="deployment"></a>

## 部署

### Node 部署

```bash
git clone https://github.com/Y80/bmm.git
cd bmm
pnpm install
pnpm build
pnpm start
```

### Docker 部署

项目自带 [`Dockerfile`](./Dockerfile)。下面示例使用 SQLite 挂载数据卷：

```bash
docker build -t bmm .

docker run --rm \
  -e DB_DRIVER=sqlite \
  -e DB_CONNECTION_URL=file:/app/volume/sqlite.db \
  -v bmm:/app/volume \
  -p 3000:3000 \
  bmm
```

### Vercel 部署

1. Fork 本仓库并导入到 Vercel。
2. 在项目的 Environment Variables 中配置数据库与认证参数。
3. 完成部署后，重新核对 `AUTH_URL` 与 GitHub OAuth 回调地址是否一致。

<a id="ai"></a>

## AI 集成

AI 能力用于减少书签录入与整理的手工操作，当前主要覆盖：

- 自动分析网站标题、描述与图标
- 为书签推荐相关标签
- 为标签生成关联建议与主题色

项目通过 Vercel AI SDK 接入 OpenAI-compatible 服务。管理员登录后台后，可在「大模型供应商」页面维护站点级供应商配置，并选择当前启用的供应商。

支持范围包括 OpenAI-compatible 提供商，例如 OpenAI、DeepSeek、Moonshot、GLM 等。若接入非 OpenAI-compatible 服务，可参考 [AI SDK Providers](https://ai-sdk.dev/providers/ai-sdk-providers)。

<a id="deploy-examples"></a>

## 部署示例编排

[`deploy/`](./deploy/) 提供四套可直接使用的编排示例，镜像均为 amd64/arm64 多架构：

| 场景 | 文件 |
| --- | --- |
| 单机 SQLite | [`deploy/compose/sqlite.yml`](./deploy/compose/sqlite.yml) |
| 应用 + PostgreSQL | [`deploy/compose/postgres.yml`](./deploy/compose/postgres.yml) |
| 应用 + Caddy 自动 HTTPS（含 OIDC 接线） | [`deploy/compose/with-caddy.yml`](./deploy/compose/with-caddy.yml) |
| Kubernetes（Deployment / Service / Ingress / 探针） | [`deploy/k8s/`](./deploy/k8s/) |

```bash
cd deploy/compose
cp .env.example .env          # 填 AUTH_URL 与 AUTH_SECRET
docker compose -f sqlite.yml up -d
```

健康检查端点：`GET /api/health`（存活，不访问数据库）、`GET /api/health/deep`（就绪，含数据库探测，失败返回 503；亦可写作 `/api/health?deep=1`）。详见 [`deploy/README.md`](./deploy/README.md)。

<a id="performance"></a>

## 性能

压测方法与结论见 [`doc/performance.md`](./doc/performance.md)，脚本在 [`bench/`](./bench/)。

实测要点（4 vCPU / SQLite / `next start` 单进程）：

- 两轮优化（页大小 240/600 → 60/120、卡片标记瘦身、读路径 TTL 缓存、索引）后，首页单请求 CPU 265ms → **52.7ms**，响应体积 894KB → **275KB**，单副本吞吐 4.3 → **19~24 RPS**；
- `/tags` 从页面内 `redirect()` 改为路由层重定向后，吞吐 31.8 → **1555~2554 RPS**；
- 单副本 CPU 上限约 1 核，**扩容靠多副本**。

```bash
node bench/seed.mjs                       # 造压测数据（perf.db）
node bench/run.mjs --server-pid <pid>     # 全场景压测
node bench/run.mjs --mode ramp --only /   # 并发梯度
```

<a id="ci-cd"></a>

## CI / CD

仓库内置三个 GitHub Actions 工作流，全部在**原生架构 runner** 上构建（amd64 / arm64），不使用 QEMU 模拟：

| 工作流 | 触发 | 产物 |
| --- | --- | --- |
| CI | push（所有分支）、PR | 类型检查、Lint、单元测试 |
| Docker CI | 每次 push | 多架构 CI 镜像（`ci-<sha>` / `ci-<branch>`，**不含 latest**） |
| Release | tag `v*.*.*` 或手动 | amd64/arm64 二进制包、多架构镜像（`vX.Y.Z` / `X.Y` / `latest`）、GitHub Release |

详见 [`doc/ci-cd.md`](./doc/ci-cd.md)。

<a id="oauth"></a>

## GitHub OAuth 配置

> [!IMPORTANT]
> `AUTH_URL`、GitHub OAuth App 的 `Authorization callback URL`、以及用户实际访问 BMM 的地址必须保持一致。

1. 访问 <https://github.com/settings/applications/new> 创建 GitHub OAuth App。
2. 将回调地址设置为 `https://your-domain.com/api/auth/callback/github` 形式。
3. 在环境变量中配置：

```bash
AUTH_GITHUB_ID=your-client-id
AUTH_GITHUB_SECRET=your-client-secret
AUTH_URL=https://your-domain.com
```

如需排查配置错误，可参考下面两张截图：

<img width="480" alt="创建 GitHub OAuth 应用" src="./doc/images/github-oauth-new.png">

<img width="480" alt="检查 GitHub 回调地址" src="./doc/images/github-oauth-cb-url.png">

<a id="oidc"></a>

## OIDC 登录与账号绑定

BMM 内置通用 OIDC 支持：只要 IdP 提供标准的 `/.well-known/openid-configuration`，用三个环境变量即可接入。Keycloak、Authentik、Auth0、Casdoor、Zitadel、Logto、GitLab、Authing 等都可直接使用。

```bash
AUTH_OIDC_ISSUER=https://id.example.com/realms/bmm
AUTH_OIDC_ID=bmm
AUTH_OIDC_SECRET=your-client-secret
```

IdP 侧需要登记两个回调地址：

| 用途     | 回调地址                                  |
| -------- | ----------------------------------------- |
| 登录     | `{AUTH_URL}/api/auth/callback/oidc`       |
| 账号绑定 | `{AUTH_URL}/api/auth/oidc/link/callback` |

配置完成后的表现：

- 登录页出现「<名称> 授权登录」按钮，名称由 `AUTH_OIDC_NAME` 控制；
- 已登录用户可在「个人空间 → 个人资料 → 账号绑定」中绑定或解绑 OIDC 身份；
- 绑定后可以直接用 OIDC 登录进入原账户，不会再因为邮箱重复而提示 `OAuthAccountNotLinked`。

安全默认值：

- 默认**不**按邮箱把 OIDC 身份自动合并进已有账户，避免 IdP 未验证的邮箱被用来接管账号；确需该行为时显式设置 `AUTH_OIDC_TRUST_EMAIL=true`；
- 绑定链路使用 `state` + `nonce` + PKCE，`id_token` 走 JWKS 验签并校验 `iss` / `aud` / `exp`；
- `id_token` 仅接受非对称签名：RSA（RS/PS 系列）、EC（ES256/384/512）与 EdDSA，显式拒绝 `none` 与 `HS*`；
- 解绑前会检查账户是否还有其它登录方式，避免把自己锁在门外。

完整参数说明与常见 IdP 的配置示例见 [`doc/oidc.md`](./doc/oidc.md)。

<a id="faq"></a>

## 常见问题

<details>
<summary><code>AUTH_URL</code> 应该填写什么？</summary>

<br>

它应该等于用户访问 BMM 的实际地址，例如：

- `http://localhost:3000`
- `https://bmm.vercel.app`
- `https://example.com`
- `http://10.1.2.3:3000`

</details>

<details>
<summary>GitHub 登录提示 <code>redirect_uri</code> 错误怎么办？</summary>

<br>

优先检查以下三者是否完全一致：

- GitHub OAuth App 中的 `Authorization callback URL`
- 环境变量 `AUTH_URL`
- 用户实际访问 BMM 的地址

问题示例截图：

![GitHub redirect_uri error](./doc/images/github-redirect-uri-err.png)

</details>

<details>
<summary>修改端口或改成通过 IP 访问后，登录回调不正确怎么办？</summary>

<br>

只要访问地址发生变化，就要同步修改 `AUTH_URL` 和 GitHub OAuth App 中的回调地址。

</details>

<details>
<summary>支持更多数据库吗？</summary>

<br>

当前仓库直接适配的是 SQLite / PostgreSQL / Turso。由于使用了 Drizzle ORM，继续扩展其他数据库的成本相对可控，但需要补充对应 schema 与驱动实现。

</details>