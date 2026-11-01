/**
 * 进程内 TTL 缓存
 *
 * 用途：公开页每次请求都要读「书签总数」「书签列表」，这些数据读多写少，
 * 缓存几十秒可以把重复查询从请求路径上摘掉。
 *
 * 边界（压测暴露的问题，务必保留）：
 * - **必须限容**：搜索关键词是长尾输入（`/search?keyword=xxx`），若按关键词做 key 会无上限增长。
 *   因此本缓存有 MAX_ENTRIES 上限 + 过期清扫 + 超限淘汰最旧条目。
 * - **调用方要过滤长尾**：`PublicBookmarkController.findMany` 只缓存无关键词的列表请求。
 * - 多副本部署时，其它副本最多滞后 TTL（默认 20~60s）。
 * - 测试环境（NODE_ENV=test）或 DISABLE_TTL_CACHE=1 时直接透传。
 */

import { initGlobalData } from '@/utils/global-data'

interface Entry {
  value: unknown
  expiresAt: number
}

/** 条目上限，超出后按插入顺序淘汰（Map 保序） */
const MAX_ENTRIES = 128
/** 过期清扫的最小间隔 */
const SWEEP_INTERVAL = 30_000

const store = initGlobalData<Map<string, Entry>>({
  key: 'ttl-cache',
  initialData: () => new Map(),
})

const inflight = initGlobalData<Map<string, Promise<unknown>>>({
  key: 'ttl-cache-inflight',
  initialData: () => new Map(),
})

const stats = initGlobalData<{ lastSweep: number }>({
  key: 'ttl-cache-stats',
  initialData: () => ({ lastSweep: 0 }),
})

const DISABLED = process.env.NODE_ENV === 'test' || process.env.DISABLE_TTL_CACHE === '1'

function sweep(now: number) {
  if (now - stats.lastSweep < SWEEP_INTERVAL) return
  stats.lastSweep = now
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key)
  }
}

function put(key: string, value: unknown, ttlMs: number) {
  const now = Date.now()
  store.set(key, { value, expiresAt: now + ttlMs })
  if (store.size > MAX_ENTRIES) {
    sweep(now)
    // 仍超限时，按插入顺序淘汰最旧的条目
    while (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next().value
      if (oldest === undefined) break
      store.delete(oldest)
    }
  }
}

/** 读取缓存，未命中则执行 loader 并写入；同一 key 的并发请求只会执行一次 loader */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  if (DISABLED) return loader()

  const hit = store.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value as T

  const running = inflight.get(key)
  if (running) return running as Promise<T>

  const promise = loader()
    .then((value) => {
      put(key, value, ttlMs)
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
  stats.lastSweep = 0
}

/** 仅用于调试/压测：查看当前条目数 */
export function cacheSize() {
  return store.size
}
