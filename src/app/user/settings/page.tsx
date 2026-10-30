import OidcBindingController from '@/controllers/OidcBinding.controller'
import { auth } from '@/lib/auth'
import { pickOidcPublicConfig, readOidcConfig } from '@/lib/auth/oidc-config'
import ClientPage from './ClientPage'

export const metadata = {
  title: '个人资料',
}

export default async function Page() {
  const session = await auth()
  const binding = session?.user?.id
    ? await OidcBindingController.findBinding(session.user.id)
    : null

  return (
    <ClientPage
      user={{
        name: session?.user.name || '',
        image: session?.user.image || '',
        email: session?.user.email || '',
      }}
      oidc={{
        ...pickOidcPublicConfig(readOidcConfig()),
        bound: !!binding,
        subject: binding?.providerAccountId ?? null,
      }}
    />
  )
}
