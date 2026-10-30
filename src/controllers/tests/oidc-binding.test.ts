import { db, schema } from '@/db'
import { faker } from '@faker-js/faker'
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, test } from 'vitest'
import CredentialsController from '../Credentials.controller'
import OidcBindingController from '../OidcBinding.controller'

function mockIdentity(sub = faker.string.uuid()) {
  return { subject: sub, email: null, name: null, picture: null }
}

/** 通过账号密码创建用户（同时会写入 credentials 类型的 account） */
async function createCredentialedUser() {
  const email = faker.internet.email()
  const password = faker.string.alphanumeric(12)
  await CredentialsController.create({ email, password })
  const user = await CredentialsController.verify({ email, password })
  return user
}

/** 直接建一个没有任何登录方式的用户，用于验证「最后一种登录方式」守卫 */
async function createBareUser() {
  const [user] = await db
    .insert(schema.users)
    .values({ email: faker.internet.email(), name: faker.person.firstName() })
    .returning()
  return user
}

const createdEmails: string[] = []

afterAll(async () => {
  for (const email of createdEmails) {
    try {
      await CredentialsController.delete(email)
    } catch {}
  }
})

describe('H: OIDC 账户绑定', { sequential: true }, () => {
  test('绑定后写入 oidc 类型的 account 记录', async () => {
    const email = faker.internet.email()
    createdEmails.push(email)
    await CredentialsController.create({ email, password: 'abcd1234' })
    const user = await CredentialsController.verify({ email, password: 'abcd1234' })

    const identity = mockIdentity()
    const result = await OidcBindingController.bind(user.id, identity)

    expect(result.created).toBe(true)
    expect(result.account).toMatchObject({
      userId: user.id,
      provider: 'oidc',
      providerAccountId: identity.subject,
      type: 'oidc',
    })

    const binding = await OidcBindingController.findBinding(user.id)
    expect(binding?.providerAccountId).toBe(identity.subject)
    await expect(
      OidcBindingController.findUserIdBySubject(identity.subject)
    ).resolves.toBe(user.id)
  })

  test('重复绑定同一身份是幂等的', async () => {
    const user = await createCredentialedUser()
    const identity = mockIdentity()

    await OidcBindingController.bind(user.id, identity)
    const again = await OidcBindingController.bind(user.id, identity)

    expect(again.created).toBe(false)
    await expect(
      db.$count(
        schema.accounts,
        and(
          eq(schema.accounts.provider, 'oidc'),
          eq(schema.accounts.providerAccountId, identity.subject)
        )
      )
    ).resolves.toBe(1)
  })

  test('身份已被其他账户占用时拒绝绑定', async () => {
    const owner = await createCredentialedUser()
    const intruder = await createCredentialedUser()
    const identity = mockIdentity()

    await OidcBindingController.bind(owner.id, identity)

    await expect(OidcBindingController.bind(intruder.id, identity)).rejects.toThrowError(
      '该 OIDC 身份已绑定到其他账户，请更换身份或在原账户解绑后重试'
    )
  })

  test('同一账户不允许绑定第二个 OIDC 身份', async () => {
    const user = await createCredentialedUser()
    await OidcBindingController.bind(user.id, mockIdentity())

    await expect(OidcBindingController.bind(user.id, mockIdentity())).rejects.toThrowError(
      '当前账户已绑定 OIDC 身份，请先解绑后再绑定新的身份'
    )
  })

  test('未绑定时解绑会报错', async () => {
    const user = await createCredentialedUser()
    await expect(OidcBindingController.unbind(user.id)).rejects.toThrowError(
      '当前账户未绑定该 OIDC 身份'
    )
  })

  test('解绑后账户仍保留其他登录方式才允许', async () => {
    const user = await createCredentialedUser()
    const identity = mockIdentity()
    await OidcBindingController.bind(user.id, identity)

    const removed = await OidcBindingController.unbind(user.id)

    expect(removed).toHaveLength(1)
    await expect(OidcBindingController.findBinding(user.id)).resolves.toBeNull()
  })

  test('解绑后会失去唯一登录方式时拒绝', async () => {
    const user = await createBareUser()
    await OidcBindingController.bind(user.id, mockIdentity())

    await expect(OidcBindingController.unbind(user.id)).rejects.toThrowError(
      '解绑后账户将没有任何可用的登录方式，请先设置密码或绑定其他账号'
    )
  })
})
