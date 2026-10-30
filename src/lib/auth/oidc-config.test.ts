import { describe, expect, test } from 'vitest'
import {
  DEFAULT_ID_TOKEN_ALGS,
  normalizeIdTokenAlgs,
  normalizeIssuer,
  normalizeScopes,
  readOidcConfig,
  resolveWellKnownUrl,
} from './oidc-config'

const baseEnv = {
  AUTH_OIDC_ISSUER: 'https://id.example.com/realms/bmm',
  AUTH_OIDC_ID: 'bmm-client',
  AUTH_OIDC_SECRET: 'bmm-secret',
}

describe('H: OIDC 配置解析', () => {
  test('缺少必需变量时关闭 OIDC', () => {
    expect(readOidcConfig({})).toBeNull()
    expect(readOidcConfig({ ...baseEnv, AUTH_OIDC_ID: '' })).toBeNull()
    expect(readOidcConfig({ ...baseEnv, AUTH_OIDC_SECRET: undefined })).toBeNull()
  })

  test('issuer 非法时不启用', () => {
    expect(readOidcConfig({ ...baseEnv, AUTH_OIDC_ISSUER: 'id.example.com' })).toBeNull()
  })

  test('默认拼接 discover 地址', () => {
    const config = readOidcConfig(baseEnv)!
    expect(config.issuer).toBe('https://id.example.com/realms/bmm')
    expect(config.wellKnown).toBe(
      'https://id.example.com/realms/bmm/.well-known/openid-configuration'
    )
    expect(config.name).toBe('OIDC')
    expect(config.scopes).toBe('openid profile email')
    expect(config.trustEmail).toBe(false)
  })

  test('允许直接传入完整的 discover 地址', () => {
    const issuer = normalizeIssuer(
      'https://id.example.com/realms/bmm/.well-known/openid-configuration/'
    )
    expect(issuer).toBe('https://id.example.com/realms/bmm')
    expect(resolveWellKnownUrl(issuer)).toBe(
      'https://id.example.com/realms/bmm/.well-known/openid-configuration'
    )
  })

  test('自定义配置生效', () => {
    const config = readOidcConfig({
      ...baseEnv,
      AUTH_OIDC_NAME: '公司统一登录',
      AUTH_OIDC_ICON: 'https://id.example.com/logo.png',
      AUTH_OIDC_SCOPES: 'profile,groups',
      AUTH_OIDC_PROMPT: 'consent',
      AUTH_OIDC_TRUST_EMAIL: 'true',
    })!
    expect(config.name).toBe('公司统一登录')
    expect(config.icon).toBe('https://id.example.com/logo.png')
    expect(config.scopes).toBe('openid profile groups')
    expect(config.prompt).toBe('consent')
    expect(config.trustEmail).toBe(true)
  })

  test('id_token 签名算法支持 RSA 与 EC，且拒绝对称算法', () => {
    const config = readOidcConfig(baseEnv)!
    expect(config.idTokenAlgs).toEqual([...DEFAULT_ID_TOKEN_ALGS])
    expect(config.idTokenAlgs).toEqual(
      expect.arrayContaining(['RS256', 'PS256', 'ES256', 'ES384', 'ES512', 'EdDSA'])
    )
    expect(config.idTokenAlg).toBeNull()

    const custom = readOidcConfig({ ...baseEnv, AUTH_OIDC_ALGS: 'ES256, es384' })!
    expect(custom.idTokenAlgs).toEqual(['ES256', 'ES384'])

    const forced = readOidcConfig({ ...baseEnv, AUTH_OIDC_ID_TOKEN_ALG: 'es256' })!
    expect(forced.idTokenAlg).toBe('ES256')

    // HS256 / none 等对称或空算法不在白名单内，配置会被忽略
    const rejected = readOidcConfig({
      ...baseEnv,
      AUTH_OIDC_ALGS: 'HS256 none',
      AUTH_OIDC_ID_TOKEN_ALG: 'HS256',
    })!
    expect(rejected.idTokenAlgs).toEqual([...DEFAULT_ID_TOKEN_ALGS])
    expect(rejected.idTokenAlg).toBeNull()
    expect(normalizeIdTokenAlgs('eddsa')).toEqual(['EdDSA'])
  })

  test('scope 去重且必定包含 openid', () => {
    expect(normalizeScopes('email email openid')).toBe('openid email')
    expect(normalizeScopes('')).toBe('openid')
  })
})