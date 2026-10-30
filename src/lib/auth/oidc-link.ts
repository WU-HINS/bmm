/**
 * OIDC 账户绑定链路的服务端实现
 *
 * 与登录链路相互独立：
 * 1. GET /api/auth/oidc/link           —— 已登录用户发起绑定，生成 state / nonce / PKCE 并跳转 IdP
 * 2. GET /api/auth/oidc/link/callback  —— 校验 state、换取 token、验证 id_token，最终写入 account 记录
 *
 * ! 仅可在 Node 运行时使用（依赖 node:crypto）
 */

import crypto from 'node:crypto'
import { initGlobalData } from '@/utils/global-data'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { readOidcConfig, type OidcConfig, type OidcIdentity } from './oidc-config'

export const OIDC_LINK_COOKIE = 'bmm.oidc.link'
/** 绑定会话有效期（秒），超时后需要重新发起绑定 */
export const OIDC_LINK_TTL = 10 * 60
export const OIDC_LINK_CALLBACK_PATH = '/api/auth/oidc/link/callback'
export const OIDC_LINK_START_PATH = '/api/auth/oidc/link'
/** 绑定意图 Cookie 的作用域，需覆盖 start 与 callback 两个地址 */
export const OIDC_LINK_COOKIE_PATH = OIDC_LINK_START_PATH

export interface OidcDiscoveryDocument {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  userinfo_endpoint?: string
}

export interface OidcLinkIntent {
  /** 与 IdP 往返的 state */
  state: string
  /** 防重放的 nonce */
  nonce: string
  /** PKCE code_verifier */
  codeVerifier: string
  /** 发起绑定时的登录用户 */
  userId: string
  /** 过期时间戳（毫秒） */
  exp: number
}

function getSealingKey() {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET 未配置，无法完成 OIDC 绑定')
  return crypto.createHash('sha256').update('bmm:oidc-link:' + secret).digest()
}

/** 把绑定意图加密后塞进 HttpOnly Cookie，避免被伪造 */
export function sealLinkIntent(intent: OidcLinkIntent) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getSealingKey(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(intent), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

export function openLinkIntent(sealed?: string | null): OidcLinkIntent | null {
  if (!sealed) return null
  try {
    const raw = Buffer.from(sealed, 'base64url')
    if (raw.length <= 28) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const body = raw.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', getSealingKey(), iv)
    decipher.setAuthTag(tag)
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
    const intent = JSON.parse(json) as OidcLinkIntent
    if (!intent?.state || !intent?.nonce || !intent?.codeVerifier || !intent?.userId) return null
    if (!Number.isFinite(intent.exp) || intent.exp < Date.now()) return null
    return intent
  } catch {
    return null
  }
}

const discoveryCache = initGlobalData<{
  wellKnown: string
  expiresAt: number
  data: OidcDiscoveryDocument | null
}>({
  key: 'oidc-discovery',
  initialData: () => ({ wellKnown: '', expiresAt: 0, data: null }),
})

/** 拉取并缓存 IdP 的发现文档 */
export async function getOidcDiscovery(config: OidcConfig): Promise<OidcDiscoveryDocument> {
  const fresh = discoveryCache.data && discoveryCache.wellKnown === config.wellKnown
  if (fresh && discoveryCache.expiresAt > Date.now()) return discoveryCache.data!

  const res = await fetch(config.wellKnown, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`获取 OIDC 发现文档失败（${config.wellKnown} 返回 HTTP ${res.status}）`)
  }
  const doc = (await res.json()) as Partial<OidcDiscoveryDocument>
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error('OIDC 发现文档缺少 authorization_endpoint / token_endpoint / jwks_uri')
  }

  discoveryCache.data = doc as OidcDiscoveryDocument
  discoveryCache.wellKnown = config.wellKnown
  discoveryCache.expiresAt = Date.now() + 10 * 60 * 1000
  return discoveryCache.data
}

/** 绑定回调地址，必须与 IdP 侧登记的一致 */
export function getLinkRedirectUri() {
  const base = (process.env.AUTH_URL || '').replace(/\/+$/, '')
  if (!base) throw new Error('AUTH_URL 未配置，无法构造 OIDC 回调地址')
  return base + OIDC_LINK_CALLBACK_PATH
}

/** 构造授权跳转，同时给出需要写进 Cookie 的加密意图 */
export async function createLinkRequest(userId: string) {
  const config = readOidcConfig()
  if (!config) throw new Error('OIDC 未配置，无法发起绑定')
  const discovery = await getOidcDiscovery(config)

  const intent: OidcLinkIntent = {
    state: crypto.randomBytes(16).toString('base64url'),
    nonce: crypto.randomBytes(16).toString('base64url'),
    codeVerifier: crypto.randomBytes(32).toString('base64url'),
    userId,
    exp: Date.now() + OIDC_LINK_TTL * 1000,
  }

  const challenge = crypto.createHash('sha256').update(intent.codeVerifier).digest('base64url')
  const authorizeUrl = new URL(discovery.authorization_endpoint)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', config.clientId)
  authorizeUrl.searchParams.set('redirect_uri', getLinkRedirectUri())
  authorizeUrl.searchParams.set('scope', config.scopes)
  authorizeUrl.searchParams.set('state', intent.state)
  authorizeUrl.searchParams.set('nonce', intent.nonce)
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  if (config.prompt) authorizeUrl.searchParams.set('prompt', config.prompt)

  return { authorizeUrl: authorizeUrl.toString(), cookieValue: sealLinkIntent(intent) }
}

interface TokenResponse {
  id_token?: string
  access_token?: string
  token_type?: string
}

function assertState(intent: OidcLinkIntent, state: string | null) {
  if (!state || state.length !== intent.state.length) {
    throw new Error('state 校验失败，请重新发起绑定')
  }
  if (!crypto.timingSafeEqual(Buffer.from(state), Buffer.from(intent.state))) {
    throw new Error('state 校验失败，请重新发起绑定')
  }
}

/**
 * 完成绑定：换取 token、校验 id_token、返回 IdP 声明的身份
 *
 * ! 只信任经 JWKS 验签的 id_token，不读取 userinfo，避免多一次受代理影响的请求
 */
export async function exchangeLinkCode(intent: OidcLinkIntent, params: { code: string; state: string | null }): Promise<OidcIdentity> {
  const config = readOidcConfig()
  if (!config) throw new Error('OIDC 未配置，无法完成绑定')
  assertState(intent, params.state)

  const discovery = await getOidcDiscovery(config)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: getLinkRedirectUri(),
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: intent.codeVerifier,
  })

  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`换取 OIDC 令牌失败（HTTP ${res.status}）${detail ? '：' + detail.slice(0, 200) : ''}`)
  }

  const tokens = (await res.json()) as TokenResponse
  if (!tokens.id_token) {
    throw new Error('OIDC 提供方未返回 id_token，无法校验身份，请检查 IdP 的 openid scope 配置')
  }

  return await verifyOidcIdToken(tokens.id_token, {
    jwks: createRemoteJWKSet(new URL(discovery.jwks_uri), { timeoutDuration: 5000 }),
    issuer: discovery.issuer || config.issuer,
    audience: config.clientId,
    nonce: intent.nonce,
    algorithms: config.idTokenAlgs,
  })
}

/** 备注：RSA（RS/PS）与 EC（ES）以及 EdDSA 均由 jose 通过 JWKS 的 kty/crv/alg 自动选键 */
export interface VerifyIdTokenOptions {
  jwks: JWTVerifyGetKey
  issuer: string
  audience: string
  nonce: string
  /** 允许的签名算法；默认取 AUTH_OIDC_ALGS 或内置白名单 */
  algorithms: string[]
}

/** jose 的错误映射为可读的中文原因，避免把底层堆栈暴露到页面 */
export function toIdTokenVerifyMessage(error: unknown) {
  const code = (error as { code?: string })?.code
  const claim = (error as { claim?: string })?.claim
  switch (code) {
    case 'ERR_JOSE_ALG_NOT_ALLOWED':
      return 'id_token 签名算法不在允许列表内，本站仅接受 RSA（RS/PS）、EC（ES）与 EdDSA'
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
      if (claim === 'iss') return 'id_token 的 iss 与 issuer 不一致，请检查 AUTH_OIDC_ISSUER'
      if (claim === 'aud') return 'id_token 的 aud 与 AUTH_OIDC_ID 不一致，请检查应用配置'
      if (claim === 'exp' || claim === 'iat' || claim === 'nbf') {
        return 'id_token 已过期或时间戳异常，请检查服务器与 IdP 的时间同步'
      }
      return `id_token 声明校验失败：${claim || '未知声明'}`
    case 'ERR_JWT_EXPIRED':
      return 'id_token 已过期，请检查服务器与 IdP 的时间同步'
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
      return 'id_token 签名校验失败，请确认 IdP 的 JWKS 与当前签名密钥一致'
    case 'ERR_JWKS_NO_MATCHING_KEY':
      return 'JWKS 中未找到与 id_token 匹配的公钥（kid / alg / crv 不匹配）'
    case 'ERR_JWKS_MULTIPLE_MATCHING_KEYS':
      return 'JWKS 中存在多个匹配公钥，无法唯一确定签名密钥'
    case 'ERR_JWKS_TIMEOUT':
      return '拉取 IdP 的 JWKS 超时'
    case 'ERR_JOSE_NOT_SUPPORTED':
      return 'IdP 使用了当前运行时不支持的签名算法'
    default:
      return error instanceof Error ? `id_token 校验失败：${error.message}` : 'id_token 校验失败'
  }
}

/**
 * 校验 id_token 并归一化 OIDC 身份
 *
 * - 支持 RSA（RS256/384/512、PS256/384/512）与 EC（ES256/384/512）以及 EdDSA
 * - 校验 iss / aud / exp / nbf，并允许 60s 时钟偏移
 * - IdP 回传 nonce 时强制比对
 */
export async function verifyOidcIdToken(
  idToken: string,
  options: VerifyIdTokenOptions
): Promise<OidcIdentity> {
  let payload
  try {
    ;({ payload } = await jwtVerify(idToken, options.jwks, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: options.algorithms,
      clockTolerance: 60,
    }))
  } catch (error) {
    throw new Error(toIdTokenVerifyMessage(error))
  }

  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('OIDC id_token 缺少 sub 声明')
  }
  if (typeof payload.nonce === 'string' && payload.nonce !== options.nonce) {
    throw new Error('nonce 校验失败，请重新发起绑定')
  }

  const email =
    typeof payload.email === 'string' && payload.email.includes('@') ? payload.email : null
  const name =
    (typeof payload.name === 'string' && payload.name) ||
    (typeof payload.preferred_username === 'string' && payload.preferred_username) ||
    null
  const picture = typeof payload.picture === 'string' ? payload.picture : null

  return { subject: payload.sub, email, name, picture }
}