import { Assets, PageRoutes } from '@cfg'
import { NextAuthConfig } from 'next-auth'
import { credentialsProvider } from './credentials-provider'
import { githubProvider } from './github-provider'
import { OIDC_PROVIDER_ID } from './oidc-config'
import { createOidcProvider } from './oidc-provider'

// 未配置 AUTH_OIDC_* 时返回 null，登录页与绑定入口都会自动隐藏
const oidcProvider = createOidcProvider()

// 这里没有配置 adapter，是为了兼容边缘环境
// https://authjs.dev/guides/edge-compatibility
export const authConfig = {
  // debug: true,
  providers: [githubProvider, credentialsProvider, ...(oidcProvider ? [oidcProvider] : [])],
  // session 1 天内有效，超过 1 天会自动更新；超过 30 天内没有任何操作，就会过期，useSession() auth() 返回 null
  session: { strategy: 'jwt', maxAge: 30 * 24 * 3600, updateAge: 24 * 3600 },
  pages: { signIn: PageRoutes.LOGIN, error: PageRoutes.LOGIN },
  theme: { logo: Assets.LOGO_SVG },
  // debug: true,
  callbacks: {
    signIn(params) {
      // ! IDP 未下发 email 时，创建账户会违反 user.email 的非空约束，这里提前给出可读的错误
      if (params.account?.provider === OIDC_PROVIDER_ID && !params.user?.email) {
        return PageRoutes.LOGIN + '?error=OidcEmailMissing'
      }
      return true
    },
    // redirect(params) {
    //   console.log('[next-auth][callbacks.redirect]\n', params)
    //   return params.url
    // },
    // authorized(params) {
    //   console.log('[next-auth][callbacks.authorized]\n', params)
    // },
    jwt(params) {
      // console.log('[next-auth][callbacks.jwt]\n', params)
      if (params.user) {
        params.token.name = params.user.name
        params.token.email = params.user.email
        params.token.picture = params.user.image
        params.token.role = params.user.role
      }
      if (params.trigger === 'update' && params.session) {
        params.token.name = params.session.name
        params.token.picture = params.session.image
      }
      return params.token
    },
    // 控制 auth() 返回的 Session 的数据
    session(params) {
      // console.log('[next-auth][callbacks.session]\n', params)
      const session = params.session
      if (session.user) {
        // 这里的 params.token 是上面 jwt() 的返回
        session.user.id = params.token.sub!
        session.user.name = params.token.name || ''
        session.user.email = params.token.email || ''
        session.user.image = typeof params.token.picture === 'string' ? params.token.picture : null
        session.user.role = params.token.role as typeof session.user.role
        session.user.isAdmin = params.token.role === 'admin'
      }
      return params.session
    },
  },
} satisfies NextAuthConfig
