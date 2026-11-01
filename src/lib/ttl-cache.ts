/**
 * 进程内 TTL 缓存
 *
 * 用途：公开页每次请求都要读「全部标签」「书签总数」「书签列表」，这些数据读多写少，
 * 缓存几十秒可以把重复查询从请求路径上摘掉。
 *
 * 失效策略：
 * - 写路径（新增/更新/删除书签、标签）调用 invalidateCache('public:') 主动失效
 * - 多副本部署时，其它副本最多滞后 TTL（默认 20~60s），可接受
 * - 测试环境（NODE_ENV=test）或 DISABLE_TTL_CACHE=1 时直接透传，避免测试读到脏数据
 */

import { initGlobalData } from '@/utils/global-data'

interface Entry {
  value: unknown
  expiresAt: number
}

const store = initGlobalData<Map<string, Entry>>({
  key: 'ttl-cache',
  initialData: () => new Map(),
})

const inflight = initGlobalData<Map<string, Promise<unknown>>>({
  key: 'ttl-cache-inflight',
  initialData: () => new Map(),
})

const DISABLED = process.env.NODE_ENV === 'test' || process.env.DISABLE_TTL_CACHE === '1'

/** 读取缓存，未命中则执行 loader 并写入；同一 key 的并发请求只会执行一次 loader */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  if (DISABLED) return loader()

  const hit = store.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value as T

  const running = inflight.get(key)
  if (running) return running as Promise<T>

  const promise = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, promise)
  return promise
}

/** 按前缀失效，例如 invalidateCache('public:') */
export function invalidateCache(prefix: string) {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** 仅用于调试/压测：清空全部缓存 */
export function clearCache() {
  store.clear()
  inflight.clear()
}
