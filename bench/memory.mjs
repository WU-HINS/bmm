/**
 * 内存采样器（读 /proc/<pid>/status）
 *
 *   node bench/memory.mjs --pid 1234                 # 空闲基线
 *   node bench/memory.mjs --pid 1234 --path / --connections 8 --duration 20
 *   node bench/memory.mjs --pid 1234 --path / --rounds 8 --duration 10
 *
 * 指标：VmRSS（当前常驻）、VmHWM（峰值）、线程数；RSS 单位为 MB
 */
import fs from 'node:fs'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (!t.startsWith('--')) continue
    const [k, inline] = t.slice(2).split('=')
    if (inline !== undefined) out[k] = inline
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i]
    else out[k] = 'true'
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const PID = Number(args.pid)
const BASE = args.base || 'http://127.0.0.1:3500'
const PATH = args.path || '/'
const CONNECTIONS = Number(args.connections || 8)
const DURATION = Number(args.duration || 20)
const ROUNDS = Number(args.rounds || 1)
if (!PID) {
  console.error('缺少 --pid')
  process.exit(1)
}

function readMem() {
  const status = fs.readFileSync('/proc/' + PID + '/status', 'utf8')
  const pick = (key) => {
    const m = status.match(new RegExp('^' + key + ':\\s+(\\d+) kB', 'm'))
    return m ? Number(m[1]) / 1024 : 0
  }
  return {
    rss: pick('VmRSS'),
    hwm: pick('VmHWM'),
    threads: Number((status.match(/^Threads:\s+(\d+)/m) || [])[1] || 0),
  }
}

const samples = []
let timer = null
function startSampling() {
  samples.length = 0
  timer = setInterval(() => samples.push(readMem()), 500)
}
function stopSampling() {
  clearInterval(timer)
  timer = null
  const rss = samples.map((s) => s.rss)
  return {
    avg: rss.reduce((a, b) => a + b, 0) / (rss.length || 1),
    peak: Math.max(0, ...rss),
    last: rss[rss.length - 1] || 0,
  }
}

async function load(seconds) {
  const deadline = Date.now() + seconds * 1000
  const url = BASE + PATH
  let count = 0
  async function worker() {
    while (Date.now() < deadline) {
      const res = await fetch(url, { redirect: 'manual' })
      await res.arrayBuffer()
      count++
    }
  }
  const start = Date.now()
  await Promise.all(Array.from({ length: CONNECTIONS }, worker))
  return { requests: count, seconds: (Date.now() - start) / 1000 }
}

const fmt = (n) => n.toFixed(1)

console.log('\n| 阶段 | 请求数 | RPS | RSS 均值 | RSS 峰值 | RSS 结束 | HWM 峰值 | 线程 |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |')

// 基线
await new Promise((r) => setTimeout(r, 1500))
const idle = readMem()
console.log(
  `| 空闲基线 | - | - | ${fmt(idle.rss)} | ${fmt(idle.rss)} | ${fmt(idle.rss)} | ${fmt(idle.hwm)} | ${idle.threads} |`
)

const rows = []
for (let i = 1; i <= ROUNDS; i++) {
  startSampling()
  const res = await load(DURATION)
  const stat = stopSampling()
  await new Promise((r) => setTimeout(r, 1500))
  const after = readMem()
  const row = {
    round: i,
    requests: res.requests,
    rps: res.requests / res.seconds,
    ...stat,
    end: after.rss,
    hwm: after.hwm,
    threads: after.threads,
  }
  rows.push(row)
  console.log(
    `| ${ROUNDS > 1 ? '第 ' + i + ' 轮' : PATH} | ${row.requests} | ${fmt(row.rps)} | ${fmt(row.avg)} | ${fmt(row.peak)} | ${fmt(row.end)} | ${fmt(row.hwm)} | ${row.threads} |`
  )
}

if (ROUNDS > 1) {
  const first = rows[0].end
  const last = rows[rows.length - 1].end
  console.log(`\n首轮结束 RSS ${fmt(first)} MB → 末轮结束 ${fmt(last)} MB（Δ ${fmt(last - first)} MB，共 ${rows.length} 轮）`)
}

const peakHwm = readMem().hwm
console.log(`\n进程累计峰值（VmHWM）: ${fmt(peakHwm)} MB`)
