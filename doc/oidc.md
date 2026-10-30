# OIDC 接入与账号绑定

BMM 使用 [Auth.js (NextAuth v5)](https://authjs.dev/) 做认证，OIDC 走标准协议，不绑定任何厂商。只要 IdP 暴露 `/.well-known/openid-configuration`，用三个环境变量即可接入。

- **登录**：登录页出现「<名称> 授权登录」，走 Auth.js 内置 OIDC provider
- **绑定**：已登录用户在「个人空间 → 个人资料 → 账号绑定」把 OIDC 身份写入当前账户，之后可用 OIDC 直接登录该账户

---

## 1. 快速开始

### 1.1 在 IdP 创建应用

需要登记**两个**回调地址（两者用途不同，缺一会导致其中一条链路失败）：

| 用途     | 回调地址                                  |
| -------- | ----------------------------------------- |
| 登录     | `{AUTH_URL}/api/auth/callback/oidc`       |
| 账号绑定 | `{AUTH_URL}/api/auth/oidc/link/callback` |

> `AUTH_URL` 必须等于用户实际访问的站点地址，例如 `https://bmm.example.com`，不带结尾斜杠。

### 1.2 配置环境变量

```bash
AUTH_OIDC_ISSUER=https://id.example.com/realms/bmm
AUTH_OIDC_ID=bmm
AUTH_OIDC_SECRET=your-client-secret
```

IdP 里其余规则：

- 应用类型选 **Confidential / Web application**，需要 Client Secret
- 授权类型勾选 **Authorization Code**（必须）、**Refresh Token**（可选）
- scope 至少 `openid`，建议 `openid profile email`
- PKCE 建议设为 **S256 / 强制**

### 1.3 重启并验证

```bash
pnpm build && pnpm start   # 或 pnpm dev
```

- 打开 `/login`，应出现 OIDC 按钮
- 登录后进入 `/user/settings`，应出现「账号绑定」卡片，点击「绑定」跳转 IdP
- 绑定成功后回到个人资料页，顶部提示「账号绑定成功」，卡片状态变为「已绑定」

---

## 2. 环境变量参考

| 变量                    | 必填 | 默认值                  | 说明 |
| ----------------------- | ---- | ----------------------- | ---- |
| `AUTH_OIDC_ISSUER`      | 是   | —                       | issuer 基址；也可直接填完整的 `.../.well-known/openid-configuration`，代码会自动裁剪 |
| `AUTH_OIDC_ID`          | 是   | —                       | Client ID |
| `AUTH_OIDC_SECRET`      | 是   | —                       | Client Secret，仅服务端使用 |
| `AUTH_OIDC_NAME`        | 否   | `OIDC`                  | 登录按钮与绑定卡片的展示名，例如「公司统一登录」 |
| `AUTH_OIDC_ICON`        | 否   | 空                      | 按钮图标地址（建议 32×32 以上的 PNG/SVG） |
| `AUTH_OIDC_SCOPES`      | 否   | `openid profile email`  | 自动补全 `openid`、自动去重、支持逗号或空格分隔 |
| `AUTH_OIDC_PROMPT`      | 否   | 空                      | 如 `consent`、`login`，用于强制 IdP 每次重新认证 |
| `AUTH_OIDC_TRUST_EMAIL` | 否   | `false`                 | 是否允许按邮箱把 OIDC 身份自动合并进已有账户，见第 7 节 |
| `AUTH_OIDC_ALGS`        | 否   | 见下方「签名算法」       | 收窄绑定链路允许的 `id_token` 签名算法，默认 RSA + EC + EdDSA 全集 |
| `AUTH_OIDC_ID_TOKEN_ALG` | 否  | 空                      | IdP 未正确声明 `id_token_signing_alg_values_supported` 时强制指定算法（仅影响登录链路） |

三项必填缺一：OIDC 整体关闭，登录页不出现按钮，绑定卡片显示「服务端未配置 OIDC」，其余登录方式不受影响。

### 2.1 签名算法：RSA 与 EC

`id_token` 验签只接受**非对称算法**，默认白名单：

| 家族 | 算法 | 典型 IdP |
| ---- | ---- | -------- |
| RSA PKCS#1 v1.5 | `RS256` / `RS384` / `RS512` | Keycloak、Auth0、Google、GitLab（默认 RS256） |
| RSA-PSS | `PS256` / `PS384` / `PS512` | 部分合规场景强制 PS256 |
| ECDSA | `ES256`（P-256）/ `ES384`（P-384）/ `ES512`（P-521） | Zitadel、Authentik、企业自建 IdP 常见 ES256 |
| EdDSA | `EdDSA`（Ed25519） | 少数自建 IdP |

- 选键完全由 JWKS 决定：jose 依据 `id_token` 头部的 `kid` / `alg` 与 JWK 的 `kty`（`RSA` / `EC` / `OKP`）、`crv`（`P-256` 等）自动匹配，无需手工配置。
- **显式拒绝 `none` 与 `HS*`**：避免「用 client_secret 伪造签名」的算法降级攻击。若 IdP 只支持 HS256，本站不会降级接受。
- 登录链路（Auth.js）按 discovery 里的 `id_token_signing_alg_values_supported` 校验；若 IdP 未声明或声明有误，用 `AUTH_OIDC_ID_TOKEN_ALG` 强制指定。
- 时钟偏移容忍 60 秒，`exp` / `nbf` / `iat` 异常会给出中文原因。

---

## 3. 登录链路

```
浏览器 ── signIn('oidc') ──▶ /api/auth/signin/oidc
                              │ 生成 state + nonce + PKCE
                              ▼
                        IdP 授权页 ──▶ /api/auth/callback/oidc
                                            │ 用 code 换 token（带 client_secret + code_verifier）
                                            │ JWKS 验签 id_token（iss/aud/exp/nonce）
                                            ▼
                                      查 account(provider='oidc', providerAccountId=sub)
                                        ├─ 命中 → 直接登录对应 user
                                        ├─ 未命中 且 email 未被占用 → 新建 user
                                        └─ 未命中 且 email 已存在 → OAuthAccountNotLinked
```

要点：

- 邮箱由 `profile()` 从 `email` 声明映射，缺失时返回 `null` 并在 `signIn` 回调里拦截，登录页提示 `OidcEmailMissing`
- 默认不做邮箱合并，所以「同邮箱已存在」时会失败——这是**预期行为**，正确做法是先登录已有账户，再用绑定功能把 OIDC 挂上去

---

## 4. 账号绑定链路

与登录链路完全解耦，不依赖 Auth.js 内部行为，流程显式可控：

```
已登录用户 ── GET /api/auth/oidc/link
               │ 1. 校验 session
               │ 2. 拉取并缓存 discovery（10 分钟）
               │ 3. 生成 state / nonce / PKCE code_verifier
               │ 4. 用 AUTH_SECRET 派生的 AES-256-GCM 密钥加密意图，写入 HttpOnly Cookie（10 分钟）
               ▼
             IdP 授权页 ──▶ GET /api/auth/oidc/link/callback
                              │ 1. 校验 state（timingSafeEqual）
                              │ 2. 校验当前 session.user.id == 发起时的 userId
                              │ 3. code + client_secret + code_verifier 换 token
                              │ 4. JWKS 验签 id_token，校验 iss/aud/exp/nonce
                              │ 5. 写入 account(provider='oidc', providerAccountId=sub)
                              ▼
                         302 → /user/settings?bind=ok
```

失败会 `302 → /user/settings?bind=error&reason=<中文原因>`，页面用 toast 展示后立即清掉查询参数。

### 绑定规则

| 场景 | 结果 |
| ---- | ---- |
| 该 `sub` 未绑定过 | 写入 account，返回成功 |
| 该 `sub` 已绑定**当前**账户 | 幂等，返回成功（不重复插入） |
| 该 `sub` 已绑定**其他**账户 | 拒绝：`该 OIDC 身份已绑定到其他账户…` |
| 当前账户已绑定另一个 `sub` | 拒绝：`当前账户已绑定 OIDC 身份…`，需先解绑 |
| 解绑后账户将无任何登录方式 | 拒绝：`解绑后账户将没有任何可用的登录方式…` |

> 「登录方式」的判定：`credential` 表有密码记录，或 `account` 表还有其它 provider 记录。

---

## 5. 常见 IdP 配置示例

### Keycloak

```bash
AUTH_OIDC_ISSUER=https://keycloak.example.com/realms/bmm
AUTH_OIDC_ID=bmm
AUTH_OIDC_SECRET=<Clients → bmm → Credentials → Client secret>
```

- Clients → Create：Client authentication = **On**，Standard flow = **On**
- Valid redirect URIs：`https://bmm.example.com/api/auth/callback/oidc`、`https://bmm.example.com/api/auth/oidc/link/callback`
- Client scopes 中确保 `email` 是 default scope（否则 id_token 无 email 声明）

### Authentik

```bash
AUTH_OIDC_ISSUER=https://authentik.example.com/application/o/bmm/
AUTH_OIDC_ID=<Provider → Client ID>
AUTH_OIDC_SECRET=<Provider → Client Secret>
```

- Providers → Create → **OAuth2/OpenID Provider**，Client type = Confidential
- Redirect URI 同上两个
- Scopes 勾选 `openid`、`email`、`profile`

### Auth0

```bash
AUTH_OIDC_ISSUER=https://your-tenant.auth0.com/
AUTH_OIDC_ID=<Application → Client ID>
AUTH_OIDC_SECRET=<Application → Client Secret>
```

- Application type = **Regular Web Application**
- Allowed Callback URLs 填两个地址
- 注意 issuer 末尾的斜杠，Auth0 的 `iss` 声明带斜杠

### Casdoor

```bash
AUTH_OIDC_ISSUER=https://casdoor.example.com
AUTH_OIDC_ID=<应用 → Client ID>
AUTH_OIDC_SECRET=<应用 → Client secret>
```

- 应用的 Redirect URLs 填两个地址
- 若开启「静默登录」，注意 `AUTH_OIDC_PROMPT` 不要再设置 `consent`

### Zitadel

```bash
AUTH_OIDC_ISSUER=https://zitadel.example.com
AUTH_OIDC_ID=<项目 → 应用 → Client ID>
AUTH_OIDC_SECRET=<应用 → Client Secret>
```

- 应用类型选 **Web**，Authentication Method = Basic
- Redirect URIs 填两个地址，授权模式勾选 Code（PKCE 可选）

### Logto

```bash
AUTH_OIDC_ISSUER=https://your-tenant.logto.app/oidc
AUTH_OIDC_ID=<应用 → App ID>
AUTH_OIDC_SECRET=<应用 → App Secret>
```

- 应用类型 = **Traditional Web**
- Redirect URI 填两个地址

### GitLab（自建）

```bash
AUTH_OIDC_ISSUER=https://gitlab.example.com
AUTH_OIDC_ID=<Application ID>
AUTH_OIDC_SECRET=<Secret>
```

- 勾选 `openid`、`profile`、`email`
- Redirect URI 填两个地址

### Google Workspace

```bash
AUTH_OIDC_ISSUER=https://accounts.google.com
AUTH_OIDC_ID=<Client ID>
AUTH_OIDC_SECRET=<Client Secret>
AUTH_OIDC_SCOPES=openid email profile
```

- OAuth 客户端类型 = **Web 应用**
- 已获授权的重定向 URI 填两个地址

---

## 6. 排错

| 现象 / 错误码 | 原因 | 处理 |
| --- | --- | --- |
| 登录页没有 OIDC 按钮 | 三个必填变量缺一 | 检查 `AUTH_OIDC_ISSUER/ID/SECRET` 后重启 |
| `OAuthAccountNotLinked` | 该邮箱已被本站其他登录方式占用，默认不自动合并 | 用原方式登录 → 个人资料 → 账号绑定 |
| `OidcEmailMissing` | id_token 无 `email` 声明 | IdP 侧开启 `email` scope 或补邮箱映射 |
| `Configuration` | discovery 拉取失败 / token 端点不可达 | 服务端 `curl ${AUTH_OIDC_ISSUER}/.well-known/openid-configuration` 验证 |
| `Configuration` + 服务端日志 `Authorization server did not provide a userinfo endpoint` | Auth.js 走 discovery 时**强制要求** IdP 公布 `userinfo_endpoint` | 在 IdP 侧开启 UserInfo 端点（主流 IdP 默认就有）；自建简易 IdP 需补上该字段 |
| `AccessDenied` | 用户在 IdP 取消授权，或被策略拦截 | 重试或联系 IdP 管理员 |
| 绑定回调 `redirect_uri` 不匹配 | IdP 未登记绑定回调地址 | 补登记 `/api/auth/oidc/link/callback` |
| 绑定提示「绑定会话已过期」 | 超过 10 分钟或 Cookie 丢失 | 重新点击绑定 |
| 绑定提示「state 校验失败」 | Cookie 被覆盖 / 多标签页并发发起 | 关闭其它标签页后重试 |
| 绑定提示「该 OIDC 身份已绑定到其他账户」 | `sub` 已被占用 | 在原账户解绑，或换身份 |
| 绑定提示「换取 OIDC 令牌失败」 | Client Secret 错误 / code 已使用 | 核对 Secret 与系统时间 |
| `id_token 签名算法不在允许列表内` | IdP 使用 HS256 等对称算法，或 `AUTH_OIDC_ALGS` 未包含实际算法 | 改用 RS256/PS256/ES256 签名；或把实际算法加入 `AUTH_OIDC_ALGS` |
| `JWKS 中未找到与 id_token 匹配的公钥` | JWKS 未包含当前签名密钥，或 `kid`/`crv` 变更后缓存未刷新 | 刷新 IdP 密钥并重试（JWKS 有 10 分钟缓存，重启进程立即生效） |
| `id_token 的 aud 与 AUTH_OIDC_ID 不一致` | IdP 侧客户端 ID 与配置不一致 | 核对应用 Client ID |
| `id_token 已过期或时间戳异常` | 服务器与 IdP 时间不同步 | 开启 NTP；本站容忍 60 秒偏移 |

---

## 7. `AUTH_OIDC_TRUST_EMAIL` 的取舍

默认 `false`。此时 OIDC 登录只在「该 sub 已绑定」时成功，即使邮箱与已有账户相同也会被拒绝（`OAuthAccountNotLinked`），必须先登录已有账户完成绑定。

设为 `true` 后，Auth.js 会把同邮箱的 OIDC 身份**自动合并**进已有账户。适用前提：

- IdP 侧已强制邮箱验证（`email_verified === true`）
- 该 IdP 是本站唯一可信身份源，不存在他人自助注册同邮箱的可能

否则任何能在 IdP 注册该邮箱的人都可以接管对应账户，因此不建议在不完全可控的 IdP 上开启。

---

## 8. 实现位置

| 文件 | 职责 |
| ---- | ---- |
| `src/lib/auth/oidc-config.ts` | 环境变量解析与规范化（纯函数，可测试） |
| `src/lib/auth/oidc-provider.ts` | Auth.js OIDC provider 与 claims 映射 |
| `src/lib/auth/oidc-link.ts` | 绑定链路：discovery 缓存、AES-GCM 意图封装、PKCE、token 交换、JWT 验签 |
| `src/lib/auth/config.ts` | provider 注册、`signIn` 邮箱守卫 |
| `src/controllers/OidcBinding.controller.ts` | 绑定 / 解绑的业务规则 |
| `src/app/api/auth/oidc/link/route.ts` | 绑定起点 |
| `src/app/api/auth/oidc/link/callback/route.ts` | 绑定回调 |
| `src/actions/items/auth.ts` | `actGetOidcLoginConfig` / `actGetOidcBindingState` / `actUnbindOidcAccount` |
| `src/app/login/page.tsx` | 登录入口与错误文案 |
| `src/app/user/settings/*` | 绑定卡片 UI |

---

## 9. 数据库

复用 Auth.js 标准 `account` 表，无需迁移：

```
account
├─ provider            'oidc'
├─ providerAccountId   id_token 的 sub
├─ userId              绑定的本地用户
└─ type                'oidc'
```

因为登录与绑定写入同一张表，绑定完成后登录链路会直接命中该记录，不会再触发 `OAuthAccountNotLinked`。

---

## 10. 测试

```bash
pnpm test -- src/lib/auth/oidc-config.test.ts     # 配置解析
pnpm test -- src/controllers/tests/oidc-binding.test.ts   # 绑定/解绑规则
```
