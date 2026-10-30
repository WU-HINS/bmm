/**
 * OIDC 账户绑定
 *
 * account 表是 Auth.js Drizzle Adapter 的标准表，绑定即写入一条
 * { provider: 'oidc', providerAccountId: <sub> } 记录。
 *
 * 与 NextAuth 的登录链路共享同一张表，因此绑定完成后可以直接用 OIDC 登录进入当前账户。
 */

import { db, schema } from '@/db'
import { OIDC_PROVIDER_ID, type OidcIdentity } from '@/lib/auth/oidc-config'
import { and, eq } from 'drizzle-orm'

export interface OidcBinding {
  provider: string
  providerAccountId: string
}

export type BindResult = { created: boolean; account: OidcBinding }

const OidcBindingController = {
  /** 查询当前用户已绑定的 OIDC 身份 */
  async findBinding(userId: UserId, provider = OIDC_PROVIDER_ID) {
    const account = await db.query.accounts.findFirst({
      where: and(eq(schema.accounts.userId, userId), eq(schema.accounts.provider, provider)),
    })
    return account ?? null
  },

  /** 查询某个 OIDC 身份当前绑定到哪个用户 */
  async findUserIdBySubject(subject: string, provider = OIDC_PROVIDER_ID) {
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(schema.accounts.provider, provider),
        eq(schema.accounts.providerAccountId, subject)
      ),
    })
    return account?.userId ?? null
  },

  /**
   * 绑定 OIDC 身份
   *
   * - 同一身份已绑定当前账户：幂等返回
   * - 同一身份已被其他账户占用：拒绝，避免账户越权合并
   */
  async bind(userId: UserId, identity: OidcIdentity): Promise<BindResult> {
    const subject = identity.subject
    if (!subject) throw new Error('OIDC 身份缺少 sub，无法绑定')

    return await db.transaction(async (tx) => {
      const occupied = await tx.query.accounts.findFirst({
        where: and(
          eq(schema.accounts.provider, OIDC_PROVIDER_ID),
          eq(schema.accounts.providerAccountId, subject)
        ),
      })

      if (occupied) {
        if (occupied.userId !== userId) {
          throw new Error('该 OIDC 身份已绑定到其他账户，请更换身份或在原账户解绑后重试')
        }
        return { created: false, account: occupied }
      }

      const selfBinding = await tx.query.accounts.findFirst({
        where: and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, OIDC_PROVIDER_ID)
        ),
      })
      if (selfBinding) {
        throw new Error('当前账户已绑定 OIDC 身份，请先解绑后再绑定新的身份')
      }

      const [account] = await tx
        .insert(schema.accounts)
        .values({
          userId,
          type: 'oidc',
          provider: OIDC_PROVIDER_ID,
          providerAccountId: subject,
        })
        .returning()

      return { created: true, account }
    })
  },

  /**
   * 解绑 OIDC 身份
   *
   * ! 解绑后若账户没有任何其他登录方式，将无法再次登录，因此需要拦截
   */
  async unbind(userId: UserId, provider = OIDC_PROVIDER_ID) {
    const accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId))
    const target = accounts.filter((item) => item.provider === provider)
    if (!target.length) throw new Error('当前账户未绑定该 OIDC 身份')

    const hasPassword = (await db.$count(schema.credentials, eq(schema.credentials.userId, userId))) > 0
    const remaining = accounts.filter((item) => item.provider !== provider)
    if (!hasPassword && !remaining.length) {
      throw new Error('解绑后账户将没有任何可用的登录方式，请先设置密码或绑定其他账号')
    }

    for (const item of target) {
      await db
        .delete(schema.accounts)
        .where(
          and(
            eq(schema.accounts.userId, userId),
            eq(schema.accounts.provider, item.provider),
            eq(schema.accounts.providerAccountId, item.providerAccountId)
          )
        )
    }

    return target
  },
}

export default OidcBindingController
