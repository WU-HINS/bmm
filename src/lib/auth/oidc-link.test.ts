import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, test } from 'vitest'
import { toIdTokenVerifyMessage, verifyOidcIdToken } from './oidc-link'

const ISSUER = 'https://id.example.com/realms/bmm'
const AUDIENCE = 'bmm-client'
const NONCE = 'nonce-abc'

type AlgCase = {
  name: string
  alg: string
  /** Node 的 WebCrypto 密钥与哈希绑定，生成时需使用同一个算法 */
  keygen: 'RS256' | 'RS512' | 'PS256' | 'ES256' | 'ES384'
}

const ALG_CASES: AlgCase[] = [
  { name: 'RSA RS256', alg: 'RS256', keygen: 'RS256' },
  { name: 'RSA RS512', alg: 'RS512', keygen: 'RS512' },
  { name: 'RSA-PSS PS256', alg: 'PS256', keygen: 'PS256' },
  { name: 'EC P-256 ES256', alg: 'ES256', keygen: 'ES256' },
  { name: 'EC P-384 ES384', alg: 'ES384', keygen: 'ES384' },
]

async function createSigner(keygen: AlgCase['keygen']) {
  const { publicKey, privateKey } = await generateKeyPair(keygen)
  const jwk = { ...(await exportJWK(publicKey)), kid: 'kid-' + keygen, alg: keygen }
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }), kid: jwk.kid }
}

const BASE_CLAIMS = {
  email: 'user@example.com',
  email_verified: true,
  name: '张三',
  preferred_username: 'zhangsan',
  picture: 'https://cdn.example.com/a.png',
}

function sign(
  privateKey: CryptoKey,
  kid: string,
  alg: string,
  overrides: Record<string, unknown> = {},
  opts: { expiresIn?: string; issuer?: string; audience?: string } = {}
) {
  return new SignJWT({
    ...BASE_CLAIMS,
    nonce: NONCE,
    ...overrides,
  })
    .setProtectedHeader({ alg, kid })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setSubject('subject-1')
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '5m')
    .sign(privateKey)
}

const ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512']

describe('H: id_token 验签（RSA / EC）', () => {
  for (const item of ALG_CASES) {
    test(`${item.name} 可通过校验`, async () => {
      const { privateKey, jwks, kid } = await createSigner(item.keygen)
      const token = await sign(privateKey, kid, item.alg)

      const identity = await verifyOidcIdToken(token, {
        jwks,
        issuer: ISSUER,
        audience: AUDIENCE,
        nonce: NONCE,
        algorithms: ALGORITHMS,
      })

      expect(identity).toEqual({
        subject: 'subject-1',
        email: 'user@example.com',
        name: '张三',
        picture: 'https://cdn.example.com/a.png',
      })
    })
  }

  test('missing email yields null', async () => {
    const { privateKey, jwks, kid } = await createSigner('ES256')
    const token = await sign(privateKey, kid, 'ES256', { email: undefined, name: undefined })
    const identity = await verifyOidcIdToken(token, {
      jwks,
      issuer: ISSUER,
      audience: AUDIENCE,
      nonce: NONCE,
      algorithms: ALGORITHMS,
    })
    expect(identity.email).toBeNull()
    expect(identity.name).toBe('zhangsan')
  })

  test('ES256 但算法白名单只放 RS256 时拒绝', async () => {
    const { privateKey, jwks, kid } = await createSigner('ES256')
    const token = await sign(privateKey, kid, 'ES256')
    await expect(
      verifyOidcIdToken(token, {
        jwks,
        issuer: ISSUER,
        audience: AUDIENCE,
        nonce: NONCE,
        algorithms: ['RS256'],
      })
    ).rejects.toThrowError('id_token 签名算法不在允许列表内')
  })

  test('aud 不匹配会被拒绝', async () => {
    const { privateKey, jwks, kid } = await createSigner('RS256')
    const token = await sign(privateKey, kid, 'RS256', {}, { audience: 'other-client' })
    await expect(
      verifyOidcIdToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, algorithms: ALGORITHMS })
    ).rejects.toThrowError('aud')
  })

  test('iss 不匹配会被拒绝', async () => {
    const { privateKey, jwks, kid } = await createSigner('RS256')
    const token = await sign(privateKey, kid, 'RS256', {}, { issuer: 'https://evil.example.com' })
    await expect(
      verifyOidcIdToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, algorithms: ALGORITHMS })
    ).rejects.toThrowError('iss')
  })

  test('过期 token 会被拒绝', async () => {
    const { privateKey, jwks, kid } = await createSigner('RS256')
    const token = await sign(privateKey, kid, 'RS256', {}, { expiresIn: '-10m' })
    await expect(
      verifyOidcIdToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, algorithms: ALGORITHMS })
    ).rejects.toThrowError('已过期')
  })

  test('nonce 不匹配会被拒绝', async () => {
    const { privateKey, jwks, kid } = await createSigner('RS256')
    const token = await sign(privateKey, kid, 'RS256', { nonce: 'other-nonce' })
    await expect(
      verifyOidcIdToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, algorithms: ALGORITHMS })
    ).rejects.toThrowError('nonce 校验失败')
  })

  test('EC 私钥签发的 token 无法被 RSA 公钥验证', async () => {
    const ec = await createSigner('ES256')
    const rsa = await createSigner('RS256')
    const token = await sign(ec.privateKey, ec.kid, 'ES256')
    await expect(
      verifyOidcIdToken(token, { jwks: rsa.jwks, issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, algorithms: ALGORITHMS })
    ).rejects.toThrowError(/签名校验失败|未找到与 id_token 匹配的公钥/)
  })

  test('HS256 等对称算法会被拒绝', async () => {
    const secret = new TextEncoder().encode('shared-secret')
    const token = await new SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('subject-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret)

    const { jwks } = await createSigner('RS256')
    await expect(
      verifyOidcIdToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, algorithms: ALGORITHMS })
    ).rejects.toThrowError('签名算法不在允许列表内')
  })

  test('错误映射到可读中文', () => {
    expect(toIdTokenVerifyMessage({ code: 'ERR_JWKS_TIMEOUT' })).toContain('JWKS')
    expect(toIdTokenVerifyMessage({ code: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: 'aud' })).toContain('aud')
    expect(toIdTokenVerifyMessage(new Error('boom'))).toContain('boom')
  })
})