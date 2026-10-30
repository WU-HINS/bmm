'use client'

import { actUnbindOidcAccount, actUpdateUserProfile } from '@/actions'
import AdminPageTitle from '@/components/AdminPageTitle'
import ReButton from '@/components/re-export/ReButton'
import ReInput from '@/components/re-export/ReInput'
import { zodSchemas } from '@/lib/zod'
import { robustUrl } from '@/utils'
import { runAction } from '@/utils/client'
import { ApiRoutes, FieldConstraints, IconNames, PageRoutes } from '@cfg'
import { Avatar, Card, CardBody, Form, FormProps, addToast, cn } from '@heroui/react'
import { useMount } from 'ahooks'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { FormEvent, useState, useTransition } from 'react'

export type OidcBindingState = {
  /** 服务端是否配置了 OIDC */
  enabled: boolean
  /** IdP 展示名 */
  name: string
  icon: string | null
  /** 当前账户是否已绑定 */
  bound: boolean
  /** id_token 中的 sub */
  subject: string | null
}

type Props = {
  user: {
    name: string
    image: string
    email: string
  }
  oidc: OidcBindingState
}

const CARD_CLS =
  'border-divider/60 dark:bg-content1/62 overflow-hidden rounded-[28px] border bg-white/58 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:shadow-none'
const PANEL_CLS = 'dark:bg-default-100/5 rounded-[24px] bg-white/38 px-6 py-7 backdrop-blur-md md:px-7 md:py-7'

export default function ClientPage(props: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = useSession()
  const [isRefreshing, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: props.user.name,
    image: props.user.image,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isUnbinding, setIsUnbinding] = useState(false)
  const [validationErrors, setValidationErrors] = useState<FormProps['validationErrors']>()

  const previewSrc = robustUrl(form.image) || undefined

  // OIDC 绑定回调会带着结果参数跳回当前页，这里提示后立即清掉参数
  useMount(() => {
    const bind = searchParams.get('bind')
    if (!bind) return
    if (bind === 'ok') {
      addToast({
        color: 'success',
        title: '账号绑定成功',
        description: `现在可以使用 ${props.oidc.name} 登录当前账户`,
      })
    } else {
      addToast({
        color: 'danger',
        title: '账号绑定失败',
        description: searchParams.get('reason') || '请稍后重试',
      })
    }
    router.replace(PageRoutes.User.SETTINGS)
  })

  function validateForm(values: unknown) {
    setValidationErrors(undefined)
    const result = zodSchemas.userProfileUpdate.safeParse(values)
    if (result.success) return result.data
    setValidationErrors(result.error.flatten().fieldErrors)
    return false
  }

  async function handleSubmit(evt: FormEvent<HTMLFormElement>) {
    evt.preventDefault()

    const formData = Object.fromEntries(new FormData(evt.currentTarget))
    const values = validateForm(formData)
    if (!values) return

    setIsSaving(true)
    const result = await runAction(actUpdateUserProfile(values), {
      okMsg: '个人资料已更新',
      onOk: async (data) => {
        const nextForm = {
          name: data.name || '',
          image: data.image || '',
        }
        setForm(nextForm)
        await session.update(nextForm)
        startTransition(() => router.refresh())
      },
    })
    setIsSaving(false)

    if (!result.ok) return
  }

  function handleBindOidc() {
    if (!props.oidc.enabled) {
      addToast({
        color: 'danger',
        description: '服务端未配置 OIDC，请先设置 AUTH_OIDC_ISSUER / AUTH_OIDC_ID / AUTH_OIDC_SECRET',
      })
      return
    }
    // 需要整页跳转到 IdP，因此不走客户端路由
    window.location.href = ApiRoutes.OIDC_LINK
  }

  async function handleUnbindOidc() {
    setIsUnbinding(true)
    await runAction(actUnbindOidcAccount(), {
      okMsg: '已解绑 OIDC 账号，请确认仍有其他登录方式',
      onOk: () => startTransition(() => router.refresh()),
    })
    setIsUnbinding(false)
  }

  return (
    <div className="relative mx-auto flex h-full w-full max-w-5xl items-start px-0 sm:px-6">
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <AdminPageTitle title="个人资料" pathname={pathname} icon={IconNames.Tabler.USER} />

        <Card shadow="none" className={CARD_CLS}>
          <CardBody className="relative overflow-hidden p-0">
            <div className="relative flex flex-col gap-6 px-5 py-6 sm:px-7 sm:py-7">
              <section className="flex justify-center">
                <div className="dark:bg-default-100/5 w-full max-w-[188px] rounded-[24px] bg-white/38 px-4 py-5 text-center backdrop-blur-md">
                  <div className="border-divider/60 bg-background/70 mx-auto flex h-24 w-24 items-center justify-center rounded-full border shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
                    <Avatar
                      className="h-20 w-20 text-2xl shadow-md"
                      src={previewSrc}
                      name={form.name || props.user.email}
                      showFallback
                    />
                  </div>
                  <h2 className="mt-3 text-base font-semibold">{form.name || '未设置昵称'}</h2>
                  <p className="text-foreground-400 mt-1 text-xs break-all">{props.user.email}</p>
                </div>
              </section>

              <section className={PANEL_CLS}>
                <Form validationErrors={validationErrors} onSubmit={handleSubmit}>
                  <ReInput
                    label="昵称"
                    name="name"
                    isRequired
                    maxLength={FieldConstraints.MaxLen.USER_NICKNAME}
                    description={`最多 ${FieldConstraints.MaxLen.USER_NICKNAME} 个字符`}
                    value={form.name}
                    onValueChange={(name) => setForm({ ...form, name })}
                  />
                  <ReInput
                    label="头像 URL"
                    name="image"
                    placeholder="https://example.com/avatar.png"
                    description="支持留空"
                    value={form.image}
                    onValueChange={(image) => setForm({ ...form, image })}
                  />

                  <div className="mt-5 flex w-full justify-end">
                    <ReButton
                      type="submit"
                      color="primary"
                      className={cn('min-w-28 shadow-sm')}
                      isLoading={isSaving || isRefreshing}
                    >
                      保存资料
                    </ReButton>
                  </div>
                </Form>
              </section>
            </div>
          </CardBody>
        </Card>

        <Card shadow="none" className={CARD_CLS}>
          <CardBody className="relative overflow-hidden p-0">
            <div className="relative flex flex-col gap-4 px-5 py-6 sm:px-7 sm:py-7">
              <div>
                <h3 className="text-base font-semibold">账号绑定</h3>
                <p className="text-foreground-400 mt-1 text-xs">
                  绑定第三方身份后，可直接使用它登录当前账户，无需再记账号密码
                </p>
              </div>

              <section className={PANEL_CLS}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="border-divider/60 bg-background/70 flex size-11 shrink-0 items-center justify-center rounded-xl border">
                      {props.oidc.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={props.oidc.icon}
                          alt=""
                          className="size-6 rounded object-contain"
                        />
                      ) : (
                        <span className={cn(IconNames.Tabler.SHIELD_LOCK, 'text-default-500 text-xl')} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{props.oidc.name} 统一登录</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-medium',
                            props.oidc.bound
                              ? 'bg-success-50 text-success-600'
                              : 'bg-default-100 text-default-500'
                          )}
                        >
                          {props.oidc.bound ? '已绑定' : '未绑定'}
                        </span>
                      </div>
                      <p className="text-foreground-400 mt-1 text-xs">
                        {!props.oidc.enabled
                          ? '服务端未配置 OIDC，需设置 AUTH_OIDC_ISSUER / AUTH_OIDC_ID / AUTH_OIDC_SECRET'
                          : props.oidc.bound
                            ? '该身份已可登录当前账户，解绑后需使用其他方式登录'
                            : '绑定后可直接使用该身份登录当前账户'}
                      </p>
                      {props.oidc.bound && props.oidc.subject && (
                        <p className="text-foreground-300 mt-1 font-mono text-[11px] break-all">
                          sub: {props.oidc.subject}
                        </p>
                      )}
                    </div>
                  </div>

                  {props.oidc.enabled && (
                    <ReButton
                      size="sm"
                      variant={props.oidc.bound ? 'bordered' : 'solid'}
                      color={props.oidc.bound ? 'default' : 'primary'}
                      className={cn('shrink-0 rounded-xl', props.oidc.bound && 'text-danger-500')}
                      isLoading={props.oidc.bound ? isUnbinding : false}
                      onPress={props.oidc.bound ? handleUnbindOidc : handleBindOidc}
                    >
                      {props.oidc.bound ? '解绑' : '绑定'}
                    </ReButton>
                  )}
                </div>
              </section>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
