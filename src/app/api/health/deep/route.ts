import { healthResponse } from '../check'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 就绪检查：GET /api/health/deep
 *
 * 数据库不可用时返回 503，供 Kubernetes readinessProbe / compose healthcheck 使用
 */
export async function GET() {
  return healthResponse(true)
}
