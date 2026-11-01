import UserController from '@/controllers/User.controller'
import { db, schema } from '@/db'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import NextAuth, { NextAuthConfig } from 'next-auth'
import { authConfig } from './config'

const adapter = DrizzleAdapter(db, {
  usersTable: schema.users,
  accountsTable: schema.accounts,
  sessionsTable: schema.sessions,
  verificationTokensTable: schema.verificationTokens,
  authenticatorsTable: schema.authenticators,
})

// ! 首个新用户设为管理员权限
const originCreateUser = adapter.createUser!
adapter.createUser = async (data) => {
  if ((await UserController.count()) === 0) {
    data.role = 'admin'
  }
  return originCreateUser(data)
}

const nextAuthOptions: NextAuthConfig = {
  ...authConfig,
  adapter,
}

// AUTH_URL 带路径会让 next-auth 推导出错误的 basePath，这里提前告警，避免线上出现
// "UnknownAction: Cannot parse action at /api/auth/providers"
const authUrlPath = (() => {
  try {
    const raw = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL
    return raw ? new URL(raw).pathname : '/'
  } catch {
    return '/'
  }
})()
if (authUrlPath !== '/') {
  console.warn(
    `[auth] AUTH_URL 带有路径 "${authUrlPath}"，登录相关接口可能异常。AUTH_URL 应为 scheme://host[:port]，不要带路径。`
  )
}

export const nextAuthLib = NextAuth(nextAuthOptions)

export const auth = nextAuthLib.auth

/**
 * 获取用户 ID
 *
 * ! 仅在已登录的情况下可用，如果未登录则抛出错误
 */
export async function getAuthedUserId() {
  const session = await auth()
  if (!session) throw new Error('getAuthedUserId() 调用出错')
  return session.user.id!
}