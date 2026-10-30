import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'

/**
 * 健康检查的统一实现
 *
 * - deep=false：进程级存活检查，**不加载数据库模块**（容器 liveness，数据库故障时不触发重启）
 * - deep=true ：惰性加载数据库并执行一次查询（容器 readiness，失败返回 503）
 */
export async function healthResponse(deep: boolean) {
  const base = {
    status: 'ok' as 'ok' | 'degraded',
    uptime: Math.round(process.uptime()),
    time: new Date().toISOString(),
  }
  const headers = { 'cache-control': 'no-store' }

  if (!deep) return NextResponse.json(base, { headers })

  try {
    // 惰性导入：数据库配置错误时只影响 readiness，不会让存活探针一起失败
    const { db, schema } = await import('@/db')
    await db.select({ ok: sql`1` }).from(schema.users).limit(1)
    return NextResponse.json({ ...base, db: 'up' }, { headers })
  } catch (error) {
    console.error('[health] 数据库不可用', error)
    return NextResponse.json({ ...base, status: 'degraded', db: 'down' }, { status: 503, headers })
  }
}
