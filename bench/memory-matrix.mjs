/**
 * V8 内存参数对照实验
 *
 *   node bench/memory-matrix.mjs
 *
 * 对同一份构建，用不同的 NODE_OPTIONS 启动服务，跑同样的负载，比较
 * 空闲 RSS / 负载峰值 RSS / RPS / V8 堆占用。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = Number(process.env.PORT || 3502)
const BASE = 'http://127.0.0.1:' + PORT
const DURATION = Number(process.env.DURATION || 20)
const CONNECTIONS = Number(process.env.CONNECTIONS || 8)

const VARIANTS = [
  { name: '默认（gzip + semi 16）', nodeOptions: '--max-old-space-size=512' },
  { name: 'heap 384 + semi 8', nodeOptions: '--max-old-space-size=384 --max-semi-space-size=8' },
  { name: '关闭内置 gzip', nodeOptions: '--max-old-space-size=512', env: { NEXT_COMPRESS: '0' } },
  {
    name: '关闭 gzip + heap 384 + semi 8',
    nodeOptions: '--max-old-space-size=384 --max-semi-space-size=8',
    env: { NEXT_COMPRESS: '0' },
  },
]

function readMem(pid) {
  const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8')
  const pick = (key) => {
    const m = status.match(new RegExp('^' + key + ':\\s+(\\d+) kB', 'm'))
    return m ? Number(m[1]) / 1024 : 0
  }
  return { rss: pick('VmRSS'), hwm: pick('VmHWM') }
}

async function waitReady(pid) {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(BASE + '/api/health')
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('服务启动超时 (pid ' + pid + ')')
}

async function load(seconds) {
  const deadline = Date.now() + seconds * 1000
  let count = 0
  let bytes = 0
  async function worker() {
    while (Date.now() < deadline) {
      const res = await fetch(BASE + '/', { redirect: 'manual' })
      const body = await res.arrayBuffer()
      bytes += body.byteLength
      count++
    }
  }
  const t0 = Date.now()
  await Promise.all(Array.from({ length: CONNECTIONS }, worker))
  return { count, bytes, seconds: (Date.now() - t0) / 1000 }
}

async function sampleWhile(promise, pid) {
  const samples = []
  const timer = setInterval(() => {
    try {
      samples.push(readMem(pid))
    } catch {}
  }, 400)
  const result = await promise
  clearInterval(timer)
  const rss = samples.map((s) => s.rss)
  return {
    result,
    avg: rss.reduce((a, b) => a + b, 0) / (rss.length || 1),
    peak: Math.max(0, ...rss),
  }
}

console.log('\n| 参数 | 空闲 RSS | 负载均值 | 负载峰值 | RPS | heapUsed | heapTotal | external |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |')

const rows = []
for (const variant of VARIANTS) {
  const child = spawn(
    process.execPath,
    [...(variant.execArgs || []), 'node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
    {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(variant.env || {}),
      NODE_OPTIONS: variant.nodeOptions,
      HOSTNAME: '127.0.0.1',
      AUTH_URL: BASE,
    },
      stdio: ['ignore', 'ignore', 'pipe'],
    }
  )
  let stderr = ''
  child.stderr.on('data', (d) => (stderr += d))

  try {
    try {
      await waitReady(child.pid)
    } catch (error) {
      console.error('[启动失败]', variant.name, '\n', stderr.slice(0, 800))
      throw error
    }
    // 预热，让路由与数据缓存进入稳态
    for (let i = 0; i < 3; i++) await (await fetch(BASE + '/')).arrayBuffer()
    await new Promise((r) => setTimeout(r, 1500))
    const idle = readMem(child.pid)

    const { result, avg, peak } = await sampleWhile(load(DURATION), child.pid)
    const health = await (await fetch(BASE + '/api/health/deep')).json()
    const mem = health.memory || {}

    const row = {
      name: variant.name,
      idle: idle.rss,
      avg,
      peak,
      rps: result.count / result.seconds,
      mbps: result.bytes / result.seconds / 1024 / 1024,
      heapUsed: mem.heapUsedMB,
      heapTotal: mem.heapTotalMB,
      external: mem.externalMB,
    }
    rows.push(row)
    console.log(
      `| ${row.name} | ${row.idle.toFixed(0)} MB | ${row.avg.toFixed(0)} MB | ${row.peak.toFixed(0)} MB | ${row.rps.toFixed(1)} | ${row.mbps.toFixed(1)} MB/s | ${row.heapUsed} MB | ${row.heapTotal} MB |`
    )
  } finally {
    child.kill('SIGKILL')
    await new Promise((r) => setTimeout(r, 1200))
  }
}

const best = [...rows].sort((a, b) => a.peak - b.peak)[0]
console.log(`\n峰值最低：${best.name}（${best.peak.toFixed(0)} MB，${best.rps.toFixed(1)} RPS）`)