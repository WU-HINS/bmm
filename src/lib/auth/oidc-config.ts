/**
 * OIDC 登录配置
 *
 * 通过环境变量注入「发现路径 + 应用 ID + 密钥」即可对接任意标准 OIDC 提供方
 * （Keycloak / Authentik / Auth0 / Casdoor / Zitadel / Logto / Authing ...）。
 *
 * 本文件不依赖 Node API，可同时运行于 Edge 与 Node 运行时。
 */

export const OIDC_PROVIDER_ID = 'oidc'

const WELL_KNOWN_PATH = '/.well-known/openid-configuration'

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])

export type EnvLike = Record<string, string | undefined>

/** OIDC 身份的规范化结果 */
export interface OidcIdentity {
  /** id_token 中的 sub，即 account.providerAccountId */
  subject: string
  email: string | null
  name: string | null
  picture: string | null
}

export interface OidcConfig {
  /** issuer 基址，如 https://id.example.com/realms/bmm */
  issuer: string
  /** 完整的发现文档地址 */
  wellKnown: string
  clientId: string
  clientSecret: string
  /** 登录按钮上展示的名称 */
  name: string
  /** 登录按钮上展示的图标地址，可为空 */
  icon: string | null
  /** 请求的 scope，必定包含 openid */
  scopes: string
  /** 是否强制 IdP 重新认证 */
  prompt: string | null
  /** 是否允许把 OIDC 身份按邮箱自动合并进已存在的同邮箱账户 */
  trustEmail: boolean
  /** 绑定链路验签 id_token 时允许的算法（默认 RSA/EC/EdDSA 全集） */
  idTokenAlgs: string[]
  /**
   * 强制登录链路使用的签名算法
   *
   * 仅在 IdP 的 discovery 未正确声明 id_token_signing_alg_values_supported 时需要
   */
  idTokenAlg: string | null
}

function read(env: EnvLike, key: string) {
  const value = env[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 允许传入 issuer 基址，也允许传入完整的 discovery 地址，
 * 统一裁剪为 issuer 基址，避免拼接出 .../.well-known/openid-configuration/.well-known/...
 */
export function normalizeIssuer(input: string) {
  const value = input.trim().replace(/\/+$/, '')
  if (!value) return ''
  if (value.endsWith(WELL_KNOWN_PATH)) {
    return value.slice(0, -WELL_KNOWN_PATH.length)
  }
  return value
}

export function resolveWellKnownUrl(issuer: string) {
  return issuer + WELL_KNOWN_PATH
}

/**
 * 允许接受的 id_token 签名算法
 *
 * ! 只接受非对称算法：RSA（RS/PS）、ECDSA（ES）、EdDSA
 * ! 显式拒绝 none / HS*，避免「用共享密钥伪造签名」的降级攻击
 */
export const DEFAULT_ID_TOKEN_ALGS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
] as const

const SUPPORTED_ALG_SET = new Set<string>(DEFAULT_ID_TOKEN_ALGS)

/** 规范化算法列表：逗号/空格分隔、大小写容错、过滤非白名单项 */
export function normalizeIdTokenAlgs(input: string) {
  const list = input
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const upper = item.toUpperCase()
      // EdDSA 的规范写法是大小写混合，其余算法全大写
      return upper === 'EDDSA' ? 'EdDSA' : upper
    })
    .filter((item) => SUPPORTED_ALG_SET.has(item))
  return list.length ? [...new Set(list)] : [...DEFAULT_ID_TOKEN_ALGS]
}

/** 该算法是否属于「非对称」白名单 */
export function isAllowedIdTokenAlg(alg: string) {
  return SUPPORTED_ALG_SET.has(alg)
}

/** 规范化 scope 串：去重、统一用空格分隔，并把 openid 固定到首位 */
export function normalizeScopes(input: string) {
  const list = [
    ...new Set(
      input
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ]
  return ['openid', ...list.filter((item) => item !== 'openid')].join(' ')
}

function normalizeSingleAlg(input: string) {
  if (!input) return null
  const upper = input.trim().toUpperCase()
  const alg = upper === 'EDDSA' ? 'EdDSA' : upper
  return SUPPORTED_ALG_SET.has(alg) ? alg : null
}

/**
 * 读取 OIDC 配置，缺少必需项时返回 null（此时 OIDC 功能整体关闭）
 */
export function readOidcConfig(env: EnvLike = process.env): OidcConfig | null {
  const issuer = normalizeIssuer(read(env, 'AUTH_OIDC_ISSUER'))
  const clientId = read(env, 'AUTH_OIDC_ID')
  const clientSecret = read(env, 'AUTH_OIDC_SECRET')
  if (!issuer || !clientId || !clientSecret) return null
  if (!URL.canParse(issuer)) return null

  return {
    issuer,
    wellKnown: resolveWellKnownUrl(issuer),
    clientId,
    clientSecret,
    name: read(env, 'AUTH_OIDC_NAME') || 'OIDC',
    icon: read(env, 'AUTH_OIDC_ICON') || null,
    scopes: normalizeScopes(read(env, 'AUTH_OIDC_SCOPES') || 'openid profile email'),
    prompt: read(env, 'AUTH_OIDC_PROMPT') || null,
    trustEmail: TRUTHY.has(read(env, 'AUTH_OIDC_TRUST_EMAIL').toLowerCase()),
    idTokenAlgs: normalizeIdTokenAlgs(read(env, 'AUTH_OIDC_ALGS')),
    idTokenAlg: normalizeSingleAlg(read(env, 'AUTH_OIDC_ID_TOKEN_ALG')),
  }
}

export function isOidcConfigured(env: EnvLike = process.env) {
  return !!readOidcConfig(env)
}

/** 供前端展示的最小配置（不含任何密钥） */
export function pickOidcPublicConfig(config: OidcConfig | null) {
  return {
    enabled: !!config,
    name: config?.name || 'OIDC',
    icon: config?.icon || null,
  }
}