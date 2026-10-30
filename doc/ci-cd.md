# CI / CD 工作流

仓库包含三个 GitHub Actions 工作流，全部使用 **原生架构 runner** 构建（amd64 用 `ubuntu-latest`，arm64 用 `ubuntu-24.04-arm`），不使用 QEMU 模拟。

| 工作流 | 文件 | 触发 | 产物 | 镜像标签 |
| --- | --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml` | push（所有分支）、PR、手动 | 类型检查 / Lint / 测试结果 | — |
| Docker CI | `.github/workflows/docker-ci.yml` | **每次 push**、手动 | 多架构镜像（GHCR） | `ci-<短 SHA>`、`ci-<分支名>`，**不含 latest** |
| Release | `.github/workflows/release.yml` | tag `v*.*.*`、手动 | amd64/arm64 二进制包 + 多架构镜像 + GitHub Release | `vX.Y.Z`、`X.Y.Z`、`X.Y`、`X`、`latest` |

## 1. 镜像标签策略

- **CI 镜像永远不带 `latest`**：`latest` 只由 Release 工作流发布，避免「任意一次 push 覆盖正式标签」。
- CI 镜像按提交与分支打标，便于定位：
  ```
  ghcr.io/<owner>/bmm:ci-1a2b3c4
  ghcr.io/<owner>/bmm:ci-feat-oidc
  ```
- Release 镜像同时打语义化版本与滚动标签，`latest` 随之指向该次发版。

## 2. 原生多架构构建

两个架构分别在**对应架构的原生 runner** 上构建，避免 QEMU 带来的几十倍耗时与原生依赖（`sharp`）错架构问题：

```
build (linux/amd64, ubuntu-latest)  ──push-by-digest──▶  ghcr.io/…@sha256:aaa
build (linux/arm64, ubuntu-24.04-arm) ──push-by-digest──▶  ghcr.io/…@sha256:bbb
                                                              │
                          docker buildx imagetools create ────┘
                                       │
                                       ▼
                     ghcr.io/<owner>/bmm:ci-1a2b3c4 （多架构索引）
```

要点：

- `outputs: type=image,...,push-by-digest=true` 让每个架构先推 digest，再由合并作业生成 manifest list；
- `provenance` / `sbom` 关闭，避免 digest 与附加清单耦合导致合并失败；
- GHA 缓存按架构分开（`scope=ci-amd64` / `scope=ci-arm64`），互不覆盖。

## 3. 发版流程

```bash
# 打 tag 即发版
git tag v1.2.0
git push origin v1.2.0
```

或在 Actions 页面手动运行 **Release** 并填写版本号（如 `v1.2.0`）。发布内容：

1. `bmm-<version>-linux-amd64.tar.gz` + `.sha256`
2. `bmm-<version>-linux-arm64.tar.gz` + `.sha256`
3. 多架构镜像 `ghcr.io/<owner>/bmm:<version>`（含 `latest`）
4. GitHub Release（自动生成变更列表 + 使用说明）

### 二进制包里有什么

Next.js 没有「原生可执行文件」概念，所谓二进制包是按架构构建的 **standalone 运行时**：

```
bmm-<version>-linux-<arch>/
├── server.js            # 入口，node server.js 启动
├── node_modules/        # 按 outputFileTracingRoot 裁剪后的运行时依赖（含该架构的 sharp）
├── .next/               # 服务端产物 + static
├── public/
├── db/sqlite/*.sql      # SQLite 初始化 SQL（standalone 不含 drizzle-kit）
└── README.txt
```

用 `NEXT_OUTPUT=standalone` 触发 `next.config.js` 里的 `output: 'standalone'`，Docker 构建仍走完整产物，互不影响。

```bash
tar -xzf bmm-1.2.0-linux-amd64.tar.gz
cd bmm-1.2.0-linux-amd64
sqlite3 sqlite.db < db/sqlite/0000_*.sql      # 仅首次
PORT=3000 HOSTNAME=0.0.0.0 node server.js
```

## 4. 权限与凭据

| 用途 | 凭据 | 需要的权限 |
| --- | --- | --- |
| GHCR 推送 | `secrets.GITHUB_TOKEN` | workflow 里声明 `permissions.packages: write` |
| 创建 Release | `secrets.GITHUB_TOKEN` | `permissions.contents: write` |
| arm64 runner | 无需额外配置 | 公共仓库免费；私有仓库需企业版或自托管 runner |

首次推送镜像后，若希望镜像可被匿名拉取，需到 GitHub → Packages → 该包 → Settings 把可见性改为 **Public**（默认继承仓库可见性，公共仓库通常已是 public）。

## 5. 可选：同时推 Docker Hub

GHCR 开箱即用，不需要任何 secret。若还需要 Docker Hub，给两个 docker 作业各加一个登录步骤与一组 tag 即可：

```yaml
      - name: Login to Docker Hub
        if: ${{ secrets.DOCKER_USERNAME != '' }}
        uses: docker/login-action@v4
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
```

> 注意：多架构 digest 合并必须发生在同一个 registry 内，跨 registry 需分别构建，不能只做 manifest 复制。

## 6. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `ubuntu-24.04-arm` 排队不动 / 报 unsupported | 仓库为私有或组织未开放 arm runner | 改为自托管 arm64 runner（`runs-on: [self-hosted, linux, arm64]`） |
| GHCR push 401 | 缺少 `packages: write`，或 token 无工作流权限 | 检查 workflow `permissions` 与仓库 Actions 设置 |
| 合并作业 `no such manifest` | 某个架构构建失败但被 `fail-fast: false` 掩盖 | 打开该 arch 的构建日志，修复后重跑 |
| Release 没生成 | tag 不是 `vX.Y.Z` 形式 | 用 `v1.2.3` / `v1.2.3-rc.1` |
| CI 中 `tsc` 报大量 drizzle 重载错误 | 未生成 `local.d.ts` | CI 已包含 `npx tsx scripts/db-init.mjs` 步骤 |
