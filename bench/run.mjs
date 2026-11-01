/**
 * 压测执行器（零依赖，基于 Node 内置 fetch 的 HTTP/1.1 连接池）
 *
 *   node bench/run.mjs --base http://127.0.0.1:3500 --server-pid <next-server pid>
 *   node bench/run.mjs --mode ramp --connections 1,2,4,8,16,32 --server-pid <pid>
 *   node bench/run.mjs --only /search --connections 8 --duration 20
 *
 * 指标：RPS、p50/p90/p99、错误数、非 2xx/3xx 数、吞吐（MB/s）、服务端 CPU 核数、
 *       单请求 CPU 开销（ms）
 * 模型：闭合回路（C 个并发工作器持续请求），与 autocannon 默认模型一致
 *
 * ! 压测客户端与服务端同机运行，4 vCPU 共享；绝对值偏保守，横向对比有效
 */
import fs from 'node:fs'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const [key, inline] = token.slice(2).split('=')
    if (inline !== undefined) out[key] = inline
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[key] = argv[++i]
    else out[key] = 'true'
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const BASE = args.base || 'http://127.0.0.1:3500'
const MODE = args.mode || 'all'
const DURATION = Number(args.duration || 15)
const WARMUP = Number(args.warmup || 3)
const ONLY = args.only ? args.only.split(',') : null
const CONN_LIST = (args.connections || '').split(',').filter(Boolean).map(Number)
const SERVER_PID = args['server-pid'] ? Number(args['server-pid']) : null

const EMAIL = process.env.PERF_EMAIL || 'perf@example.com'
const PASSWORD = process.env.PERF_PASSWORD || 'abcd1234'

function pct(sorted, p) {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

/** 读取进程累计 CPU 时间（秒），/proc/<pid>/stat 的 utime+stime */
function readCpuSeconds(pid) {
  if (!pid) return 0
  try {
    const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    return (Number(fields[11]) + Number(fields[12])) / 100
  } catch {
    return 0
  }
}

async function login() {
  const jar = new Map()
  const absorb = (res) => {
    for (const raw of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
      const pair = raw.split(';')[0]
      const i = pair.indexOf('=')
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
    }
  }
  const cookie = () => [...jar].map(([k, v]) => k + '=' + v).join('; ')

  let res = await fetch(BASE + '/api/auth/csrf', { redirect: 'manual', headers: { cookie: cookie() } })
  absorb(res)
  const { csrfToken } = await res.json()

  res = await fetch(BASE + '/api/auth/callback/credentials', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: BASE + '/user' }),
  })
  absorb(res)

  const session = await (await fetch(BASE + '/api/auth/session', { headers: { cookie: cookie() } })).json()
  if (!session?.user?.email) throw new Error('登录失败，无法进行鉴权场景压测：' + JSON.stringify(session))
  return cookie()
}

async function phase(path, connections, seconds, headers) {
  const latencies = []
  const statuses = new Map()
  let bytes = 0
  let errors = 0
  const deadline = Date.now() + seconds * 1000

  async function worker() {
    while (Date.now() < deadline) {
      const t0 = performance.now()
      try {
        const res = await fetch(BASE + path, { headers, redirect: 'manual' })
        const body = await res.arrayBuffer()
        latencies.push(performance.now() - t0)
        bytes += body.byteLength
        statuses.set(res.status, (statuses.get(res.status) || 0) + 1)
      } catch {
        errors++
        latencies.push(performance.now() - t0)
      }
    }
  }

  const cpuBefore = readCpuSeconds(SERVER_PID)
  const startedAt = Date.now()
  await Promise.all(Array.from({ length: connections }, worker))
  const elapsed = (Date.now() - startedAt) / 1000
  const cpuUsed = readCpuSeconds(SERVER_PID) - cpuBefore

  latencies.sort((a, b) => a - b)
  const total = latencies.length
  const nonOk = [...statuses.entries()].filter(([s]) => s >= 400).reduce((n, [, c]) => n + c, 0)

  return {
    elapsed,
    total,
    rps: total / elapsed,
    p50: pct(latencies, 50),
    p90: pct(latencies, 90),
    p99: pct(latencies, 99),
    avg: latencies.reduce((a, b) => a + b, 0) / (total || 1),
    errors,
    nonOk,
    statuses: Object.fromEntries([...statuses.entries()].sort((a, b) => a[0] - b[0])),
    throughputMBps: bytes / elapsed / 1024 / 1024,
    cpuCores: cpuUsed / elapsed,
    cpuMsPerRequest: total ? (cpuUsed * 1000) / total : 0,
  }
}

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '0')

async function runOne(scenario) {
  if (WARMUP > 0) await phase(scenario.path, Math.min(scenario.connections, 8), WARMUP, scenario.headers)
  const r = await phase(scenario.path, scenario.connections, DURATION, scenario.headers)
  const row = { name: scenario.name, path: scenario.path, connections: scenario.connections, ...r }
  console.log(
    '| ' +
      [
        row.name,
        row.connections,
        fmt(row.rps),
        fmt(row.p50),
        fmt(row.p90),
        fmt(row.p99),
        fmt(row.throughputMBps, 2),
        fmt(row.cpuCores, 2),
        fmt(row.cpuMsPerRequest),
        row.nonOk,
        row.errors,
      ].join(' | ') +
      ' |'
  )
  return row
}

const results = []
console.log('\n| 场景 | 并发 | RPS | p50(ms) | p90(ms) | p99(ms) | MB/s | CPU核 | 单请求CPU(ms) | 非2xx | 连接错误 |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')

if (MODE === 'ramp') {
  const conns = CONN_LIST.length ? CONN_LIST : [1, 2, 4, 8, 16, 32]
  const path = args.only || '/'
  for (const c of conns) results.push(await runOne({ name: '并发梯度 ' + path, path, connections: c }))
} else {
  const cookie = await login()
  const scenarios = [
    { name: '健康检查（无 DB）', path: '/api/health', connections: 16 },
    { name: '静态资源 logo.svg', path: '/logo.svg', connections: 16 },
    { name: '就绪检查（查 DB）', path: '/api/health/deep', connections: 16 },
    { name: '标签列表（307 重定向）', path: '/tags', connections: 16 },
    { name: '会话接口（未登录）', path: '/api/auth/session', connections: 16 },
    { name: '公开首页 SSR', path: '/', connections: 8 },
    { name: '公开搜索', path: '/search?keyword=nextjs', connections: 8 },
    { name: '标签详情页', path: '/tags/' + encodeURIComponent('标签01'), connections: 8 },
    { name: '用户空间首页（已登录）', path: '/user', connections: 8, headers: { cookie } },
    { name: '用户书签列表（已登录）', path: '/user/bookmark/list', connections: 8, headers: { cookie } },
  ]
  const list = ONLY ? scenarios.filter((s) => ONLY.some((o) => s.path === o || s.name.includes(o))) : scenarios
  for (const s of list) results.push(await runOne(s))
}

fs.writeFileSync(
  'bench/.perf-results.json',
  JSON.stringify({ base: BASE, mode: MODE, duration: DURATION, serverPid: SERVER_PID, results }, null, 2)
)
console.log('\n结果已写入 bench/.perf-results.json')