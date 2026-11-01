import nextConst from 'next/constants.js';
import { checkEnvs, tryLoadParentGitRepoEnv } from './scripts/utils.mjs';

let codeInspectorPlugin;
if (process.env.NODE_ENV === 'development') {
  const { codeInspectorPlugin: plugin } = await import('code-inspector-plugin');
  codeInspectorPlugin = plugin;
}

export default async function setup(phase) {
  tryLoadParentGitRepoEnv()

  if (phase === nextConst.PHASE_DEVELOPMENT_SERVER || phase === nextConst.PHASE_PRODUCTION_SERVER) {
    checkEnvs()
  }

  const domainHost = new URL(process.env.AUTH_URL || 'http://localhost').host

  /** @type {import('next').NextConfig} */
  const nextConfig = {
    // 压测对照：内置 gzip 的 CPU/内存开销 vs 交给反向代理压缩
    compress: process.env.NEXT_COMPRESS !== '0',
    // 发版工作流用 standalone 产物打「二进制包」，Docker 构建仍走完整产物
    ...(process.env.NEXT_OUTPUT === 'standalone'
      ? { output: 'standalone', outputFileTracingRoot: process.cwd() }
      : {}),
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: '*.iconify.design',
          pathname: '**',
        },
        process.env.NEXT_PUBLIC_WEBSITE_LOGO ? new URL(process.env.NEXT_PUBLIC_WEBSITE_LOGO) : undefined,
      ].filter(Boolean),
      dangerouslyAllowSVG: true,
    },
    turbopack: {
      rules: codeInspectorPlugin ? codeInspectorPlugin({
        bundler: 'turbopack',
        hideDomPathAttr: true,
      }) : undefined
    },
    experimental: {
      serverActions: { allowedOrigins: [domainHost] }
    },
    // /tags 只是首页的别名：放到路由层重定向，避免为一次跳转付出整页 SSR 的 CPU
    async redirects() {
      return [{ source: '/tags', destination: '/', permanent: false }]
    },
    // public/ 下的静态资源默认是 max-age=0，这里给一个较长的浏览器缓存
    async headers() {
      const staticAssets = ['/logo.svg', '/logo-no-bg.svg', '/box-empty.png']
      return staticAssets.map((source) => ({
        source,
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      }))
    },
    typescript: {
      ignoreBuildErrors: Boolean(process.env.IGNORE_BUILD_ERRORS),
    },
    allowedDevOrigins: ['127.0.0.1'],
  }
  return nextConfig
}