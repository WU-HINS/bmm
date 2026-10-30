import OidcBindingController from '@/controllers/OidcBinding.controller'
import { auth } from '@/lib/auth'
import {
  exchangeLinkCode,
  OIDC_LINK_COOKIE,
  OIDC_LINK_COOKIE_PATH,
  openLinkIntent,
} from '@/lib/auth/oidc-link'
import { readOidcConfig } from '@/lib/auth/oidc-config'
import { PageRoutes } from '@cfg'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getOrigin(req: NextRequest) {
  return (process.env.AUTH_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

/**
 * 完成 OIDC 账户绑定
 *
 * 校验顺序：state → 登录会话 → code → id_token 验签 → 写入 account 记录
 */
export async function GET(req: NextRequest) {
  const origin = getOrigin(req)
  const params = req.nextUrl.searchParams

  const finish = (status: 'ok' | 'error', detail?: string) => {
    const url = new URL(PageRoutes.User.SETTINGS, origin)
    url.searchParams.set('bind', status)
    if (detail) url.searchParams.set('reason', detail)
    const res = NextResponse.redirect(url)
    res.cookies.set(OIDC_LINK_COOKIE, '', { path: OIDC_LINK_COOKIE_PATH, maxAge: 0 })
    return res
  }

  const idpError = params.get('error')
  if (idpError) {
    return finish('error', params.get('error_description') || idpError)
  }

  if (!readOidcConfig()) return finish('error', 'OIDC 未配置')

  const intent = openLinkIntent(req.cookies.get(OIDC_LINK_COOKIE)?.value)
  if (!intent) return finish('error', '绑定会话已过期或无效，请重新发起绑定')

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL(PageRoutes.LOGIN, origin))
  }
  if (session.user.id !== intent.userId) {
    return finish('error', '登录状态已变化，请重新发起绑定')
  }

  const code = params.get('code')
  if (!code) return finish('error', 'IdP 未返回授权码')

  try {
    const identity = await exchangeLinkCode(intent, { code, state: params.get('state') })
    const result = await OidcBindingController.bind(session.user.id, identity)
    return finish('ok', result.created ? undefined : '该身份已绑定当前账户')
  } catch (error) {
    console.error('[oidc-link] 绑定失败', error)
    return finish('error', error instanceof Error ? error.message : '绑定失败')
  }
}
