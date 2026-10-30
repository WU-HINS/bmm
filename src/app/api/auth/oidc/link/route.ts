import { auth } from '@/lib/auth'
import { readOidcConfig } from '@/lib/auth/oidc-config'
import {
  createLinkRequest,
  OIDC_LINK_COOKIE,
  OIDC_LINK_COOKIE_PATH,
  OIDC_LINK_TTL,
} from '@/lib/auth/oidc-link'
import { PageRoutes } from '@cfg'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getOrigin(req: NextRequest) {
  return (process.env.AUTH_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

function backToSettings(req: NextRequest, reason: string) {
  const url = new URL(PageRoutes.User.SETTINGS, getOrigin(req))
  url.searchParams.set('bind', 'error')
  url.searchParams.set('reason', reason)
  return NextResponse.redirect(url)
}

/**
 * 发起 OIDC 账户绑定
 *
 * 前置条件：已登录 + 服务端配置了 AUTH_OIDC_ISSUER / AUTH_OIDC_ID / AUTH_OIDC_SECRET
 * 会将用户重定向到 IdP 的授权页，回调地址为 {AUTH_URL}/api/auth/oidc/link/callback
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL(PageRoutes.LOGIN, getOrigin(req)))
  }

  if (!readOidcConfig()) {
    return backToSettings(req, 'OIDC 未配置，无法发起绑定')
  }

  try {
    const { authorizeUrl, cookieValue } = await createLinkRequest(session.user.id)
    const res = NextResponse.redirect(authorizeUrl)
    res.cookies.set(OIDC_LINK_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure: getOrigin(req).startsWith('https://'),
      path: OIDC_LINK_COOKIE_PATH,
      maxAge: OIDC_LINK_TTL,
    })
    return res
  } catch (error) {
    console.error('[oidc-link] 发起绑定失败', error)
    return backToSettings(req, error instanceof Error ? error.message : '发起绑定失败')
  }
}
