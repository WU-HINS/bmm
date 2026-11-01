# 部署示例编排

面向本仓库产出的镜像（GHCR）提供四套可直接使用的编排示例。镜像由 CI / Release 工作流构建，均为 `linux/amd64` + `linux/arm64` 多架构。

| 场景 | 文件 | 适用 |
| --- | --- | --- |
| 单机 SQLite | [`compose/sqlite.yml`](./compose/sqlite.yml) | 个人/小团队，零外部依赖 |
| 应用 + PostgreSQL | [`compose/postgres.yml`](./compose/postgres.yml) | 数据量较大、需要备份/扩容 |
| 应用 + Caddy 自动 HTTPS | [`compose/with-caddy.yml`](./compose/with-caddy.yml) | 公网部署 + OIDC 登录 |
| Kubernetes | [`k8s/`](./k8s/) | 集群环境 |

---

## 1. 前置：选镜像

镜像地址 `ghcr.io/wu-hins/bmm`，标签含义：

| 标签 | 来源 | 用途 |
| --- | --- | --- |
| `latest` | Release 工作流 | 生产默认 |
| `vX.Y.Z` / `X.Y.Z` / `X.Y` | Release 工作流 | 固定版本，推荐生产使用 |
| `ci-<短SHA>` / `ci-<分支>` | Docker CI（每次 push） | 验证未发布改动，**不要用于生产** |

公共仓库的 GHCR 包通常可直接匿名拉取；若为私有，需 `docker login ghcr.io -u <user> -p <token>`。

---

## 2. 单机 SQLite（最快）

```bash
cd deploy/compose
cp .env.example .env          # 至少填 AUTH_URL、AUTH_SECRET
docker compose -f sqlite.yml up -d
docker compose -f sqlite.yml logs -f bmm
```

要点：

- 数据落在命名卷 `bmm-data` 的 `/app/data/sqlite.db`，首次启动由容器内 `db-init` 自动建表；
- `AUTH_URL` 必须等于浏览器实际访问地址（含协议/端口），否则登录回调会失败；
- 健康检查打 `/api/health`（进程级），不会因数据库短暂波动反复重启。

备份：

```bash
docker compose -f sqlite.yml exec bmm sh -c 'cp /app/data/sqlite.db /app/data/backup-$(date +%F).db'
docker cp bmm:/app/data/backup-$(date +%F).db ./sqlite-$(date +%F).db
```

---

## 3. 应用 + PostgreSQL

```bash
cd deploy/compose
cp .env.example .env          # 填 AUTH_URL、AUTH_SECRET、POSTGRES_PASSWORD
docker compose -f postgres.yml up -d
```

要点：

- 应用启动时自动执行 `drizzle-kit migrate`，无需手工建表；
- PostgreSQL 默认不映射宿主机端口，只在 compose 网络内可访问；
- 密码含特殊字符时需 URL 编码（或在 `DB_CONNECTION_URL` 里显式写编码后的值）。

备份：

```bash
docker compose -f postgres.yml exec -T postgres \
  pg_dump -U bmm -d bmm -Fc > bmm-$(date +%F).dump
```

---

## 4. 公网 + 自动 HTTPS（Caddy）

```bash
cd deploy/compose
cp .env.example .env          # BMM_DOMAIN、ACME_EMAIL、AUTH_SECRET
docker compose -f with-caddy.yml up -d
```

- Caddy 自动申请/续期证书，并把 80/443 反代到 `bmm:3000`；
- `AUTH_URL` 自动取 `https://${BMM_DOMAIN}`，与浏览器地址一致；
- 反向代理场景务必保证 `AUTH_URL`、IdP 回调地址、用户访问地址三者一致。

**OIDC 接线**：在 IdP 的应用里登记两个回调地址（缺一会导致另一条链路失败）

```
登录：https://bmm.example.com/api/auth/callback/oidc
绑定：https://bmm.example.com/api/auth/oidc/link/callback
```

然后把 `AUTH_OIDC_ISSUER` / `AUTH_OIDC_ID` / `AUTH_OIDC_SECRET` 填进 `.env`，`docker compose up -d` 重建容器即可，登录页会出现 OIDC 按钮。

---

## 5. Kubernetes

```bash
# 1) 数据库
kubectl apply -f deploy/k8s/postgres.yaml

# 2) 应用（先改 Secret 里的 AUTH_SECRET / DB_CONNECTION_URL、ConfigMap 里的 AUTH_URL）
kubectl apply -f deploy/k8s/bmm.yaml

# 3) 查看
kubectl -n bmm get pod,svc,ingress
kubectl -n bmm logs deploy/bmm -f
```

要点：

- 探针：`startupProbe`/`livenessProbe` 打 `/api/health`（进程级，不碰数据库），`readinessProbe` 打 `/api/health/deep`（数据库不通返回 503，立即摘流）；
- `replicas` 默认为 **1**：镜像启动时会自动迁移，多副本并发迁移存在竞争。需要扩容时：
  1. 把迁移拆成独立 Job（或在部署流水线里执行一次 `pnpm db:migrate`）；
  2. 给容器覆盖启动命令跳过迁移：`command: ["pnpm", "exec", "next", "start"]`；
  3. 再把副本数调大（数据库需为共享 PostgreSQL，SQLite 只能单副本）。
- 用 SQLite 时保持 `replicas: 1`，并改为 `DB_CONNECTION_URL=file:/app/data/sqlite.db` + 挂载 `ReadWriteOnce` 的 PVC；
- Ingress 默认 nginx class，带 `cert-manager.io/cluster-issuer` 注释可自动签发证书。

---

## 6. 升级与回滚

```bash
# 升级到指定版本
sed -i 's/^BMM_TAG=.*/BMM_TAG=v1.2.0/' .env
docker compose -f sqlite.yml up -d

# 回滚
sed -i 's/^BMM_TAG=.*/BMM_TAG=v1.1.0/' .env
docker compose -f sqlite.yml up -d
```

> 迁移是单向的：回滚大版本前请先用备份还原数据库。SQLite 直接替换 `sqlite.db`；PostgreSQL 用 `pg_restore`。

Kubernetes 侧：

```bash
kubectl -n bmm set image deploy/bmm bmm=ghcr.io/wu-hins/bmm:v1.2.0
kubectl -n bmm rollout status deploy/bmm
kubectl -n bmm rollout undo deploy/bmm    # 回滚
```

---

## 7. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 登录后跳回 `/login?error=Configuration` | `AUTH_URL` 与访问地址不一致 | 统一 `AUTH_URL`、反代域名、IdP 回调三者 |
| OIDC 按钮不出现 | 三项变量没齐 / 容器未重建 | `docker compose up -d` 让新 env 生效；`docker compose exec bmm env \| grep AUTH_OIDC` |
| 容器启动即退出 | `AUTH_SECRET` 或 `DB_CONNECTION_URL` 缺失 | 看日志 `环境变量缺失: ...` |
| SQLite 写失败 `readonly database` | 挂载点权限 | 命名卷而不是只读挂载；或修正宿主目录属主 |
| `manifest unknown` | 标签写错（如尚未发版就用了 `v1.2.0`） | 先用 `latest` 或 `ci-<sha>` |
| 拉镜像 401 | GHCR 包为私有 | `docker login ghcr.io`，k8s 配 `imagePullSecrets` |
| 健康检查一直 unhealthy | 端口/启动时间不足 | 已给 `start_period: 40s`；慢机器可调大 |
| 内存占用偏高 | 默认 V8 堆上限较大 | 编排里已设 `NODE_OPTIONS=--max-old-space-size=384 --max-semi-space-size=8`（峰值约 240MB）；要更省内存见 [`doc/performance.md`](../doc/performance.md) 第 9 节 |
| readiness 一直失败但容器没崩 | 数据库不可达或未建表 | `curl -i http://<pod-ip>:3000/api/health/deep` 看返回体 |