import type { OIDCConfig } from 'next-auth/providers'
import { OIDC_PROVIDER_ID, readOidcConfig, type OidcConfig } from './oidc-config'

/** OIDC 提供方可能返回的声明，部分 IdP 的字段命名并不统一，这里做一次兜底 */
export interface OidcProfile {
  sub: string
  name?: string
  preferred_username?: string
  nickname?: string
  email?: string
  email_verified?: boolean
  picture?: string
}

export type OidcProviderOptions = OidcConfig

/**
 * 把 OIDC 声明映射为 Auth.js 的 User
 *
 * ! 邮箱缺失时返回 null，由 signIn 回调给出可读的错误提示，避免写入非法用户记录
 */
export function mapOidcProfile(profile: OidcProfile) {
  const email =
    typeof profile.email === 'string' && profile.email.includes('@') ? profile.email.trim() : null
  return {
    id: profile.sub,
    name: profile.name || profile.preferred_username || profile.nickname || email?.split('@')[0],
    email,
    image: profile.picture || null,
  }
}

/**
 * 生成 OIDC 提供方
 *
 * - 未配置环境变量时返回 null，此时登录页不展示 OIDC 入口
 * - 未显式声明 scope 时默认 openid profile email
 * - 使用 PKCE + state，登录链路无需 client_secret 也能抵御授权码拦截
 */
export function createOidcProvider(options: OidcConfig | null = readOidcConfig()) {
  if (!options) return null

  const provider: OIDCConfig<OidcProfile> = {
    id: OIDC_PROVIDER_ID,
    name: options.name,
    type: 'oidc',
    issuer: options.issuer,
    wellKnown: options.wellKnown,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    checks: ['pkce', 'state'],
    // 仅在 IdP 未正确声明签名算法时通过 AUTH_OIDC_ID_TOKEN_ALG 强制指定（支持 RS/PS/ES 系列）
    ...(options.idTokenAlg
      ? { client: { id_token_signed_response_alg: options.idTokenAlg } }
      : {}),
    // 默认禁止按邮箱自动合并，避免 IdP 侧未验证的邮箱直接接管已有账户
    allowDangerousEmailAccountLinking: options.trustEmail,
    authorization: {
      params: {
        scope: options.scopes,
        ...(options.prompt ? { prompt: options.prompt } : {}),
      },
    },
    profile(profile) {
      return mapOidcProfile(profile)
    },
  }

  return provider
}