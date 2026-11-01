# 压测脚本

零依赖（只用 Node 内置 fetch），配合 [`doc/performance.md`](../doc/performance.md) 使用。

```bash
# 1) 造数据（会清空 perf.db 的业务表）
cp sqlite.db perf.db
DB_CONNECTION_URL=file:./perf.db node bench/seed.mjs
node bench/apply-index.mjs          # 让 perf.db 与最新 schema（含 updatedAt 索引）一致

# 2) 启动被测服务
pnpm build
HOSTNAME=127.0.0.1 AUTH_URL=http://127.0.0.1:3500 \
  DB_DRIVER=sqlite DB_CONNECTION_URL=file:./perf.db AUTH_SECRET=perf \
  npx next start -p 3500

# 3) 压测
node bench/run.mjs --server-pid $(pgrep -f next-server | head -1)
node bench/run.mjs --mode ramp --connections 1,2,4,8,16 --only /
node bench/run.mjs --only 公开首页 --duration 30
```

参数：

| 参数 | 说明 |
| --- | --- |
| `--base` | 目标地址，默认 `http://127.0.0.1:3500` |
| `--server-pid` | 服务端进程 PID，用于采样 `/proc/<pid>/stat` 计算 CPU 开销 |
| `--connections` | 并发数；`--mode ramp` 时支持逗号列表 |
| `--duration` / `--warmup` | 采样秒数 / 预热秒数，默认 15 / 3 |
| `--only` | 只跑指定场景（按名称或完整路径匹配） |
| `--mode ramp` | 并发梯度模式 |

内存采样：

```bash
node bench/memory.mjs --pid <pid>                                   # 空闲基线
node bench/memory.mjs --pid <pid> --path / --connections 8 --duration 20
node bench/memory.mjs --pid <pid> --path / --rounds 6 --duration 10  # 泄漏判定
```

输出 `VmRSS` / `VmHWM` / 线程数，用于判断稳态内存、突发峰值与是否存在随轮次增长。

> 压测客户端与服务端同机运行时，两者会抢同一组 CPU；绝对值偏保守，横向对比有效。