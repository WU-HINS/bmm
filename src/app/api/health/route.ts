import { healthResponse } from './check'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 存活检查：GET /api/health
 *
 * 需要连带校验数据库时用 /api/health/deep（或 ?deep=1）
 */
export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get('deep') === '1'
  return healthResponse(deep)
}
