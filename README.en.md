<div align="center">
  <img width="108" src="./doc/images/logo.svg" alt="BMM Logo">
  <h1>BMM</h1>
  <p>An open-source full-stack app for collecting, organizing, searching, and sharing website bookmarks.</p>
  <p>Built for personal and team use, with a public showcase, user workspace, admin tools, and AI-assisted bookmark workflows.</p>
  <p>
    <a href="https://bmm.lccl.cc/" target="_blank">Live Demo</a> ·
    <a href="https://github.com/Y80/bmm" target="_blank">GitHub</a> ·
    <a href="#quick-start">Quick Start</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16">
    <img src="https://img.shields.io/badge/React-19-149eca?logo=react" alt="React 19">
    <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript 5">
    <img src="https://img.shields.io/badge/Drizzle_ORM-0.44-green" alt="Drizzle ORM">
  </p>
</div>

<!-- README-I18N:START -->

[简体中文](./README.md) | **English**

<!-- README-I18N:END -->

<div align="center">
  <img alt="Desktop light and dark themes" src="./doc/images/screenshot-pc-light-dark.png">
  <img alt="Admin dashboard" src="./doc/images/screenshot-pc-cms-light-dark.png">
  <img width="680" alt="Mobile layout" src="./doc/images/screenshot-mobile.png">
  <img width="680" alt="AI website analysis demo" src="./doc/images/screenshot-ai-analyse.gif">
</div>

<a id="overview"></a>

## Overview

BMM is an open-source application for managing website bookmarks. It combines collecting links, organizing them with tags, publishing curated websites, and maintaining the data from an admin interface in one system, with automatic metadata fetching and AI-assisted entry flows.

You can use it as:

- a personal bookmark dashboard
- a team knowledge directory
- a public website curation portal

<a id="highlights"></a>

## Highlights

- Public pages, user workspaces, and admin tools live in the same product, so you can grow from personal use to a shared navigation site.
- Browser bookmark exports can be imported and mapped into tag relationships, which makes migration easier.
- Supports many-to-many tag and bookmark relations, drag-and-drop sorting, keyword search, and pinyin search.
- Automatically fetches website titles, descriptions, and icons, with extra probing for common icon paths.
- Supports GitHub OAuth, generic OIDC single sign-on, and email/password authentication, including linking an OIDC identity to an existing account.
- Uses AI to analyze websites, suggest tags, and generate related-tag suggestions and theme colors.
- Responsive UI works across desktop and mobile, with light and dark themes.

<a id="roadmap"></a>

## Planned Features

- [ ] Multi-purpose cards such as weather and news
- [ ] Browser extension
- [ ] Bookmark availability checks
- [ ] Read-it-later workflow

<a id="stack"></a>

## Tech Stack

| Category  | Technology                                                           |
| --------- | -------------------------------------------------------------------- |
| Framework | [Next.js 16](https://nextjs.org/) + React 19                         |
| Language  | [TypeScript](https://www.typescriptlang.org/)                        |
| Styling   | [Tailwind CSS 4](https://tailwindcss.com/)                           |
| UI        | [HeroUI](https://heroui.com/) + [Ant Design](https://ant.design/)    |
| Database  | SQLite / PostgreSQL / Turso                                          |
| ORM       | [Drizzle ORM](https://orm.drizzle.team/)                             |
| Auth      | [NextAuth v5 beta](https://authjs.dev/)                              |
| AI        | [Vercel AI SDK](https://sdk.vercel.ai/) + OpenAI-compatible provider |
| Testing   | [Vitest](https://vitest.dev/)                                        |

<a id="quick-start"></a>

## Quick Start

### Requirements

- [Node.js](https://nodejs.org/) >= 24.0.0
- [pnpm](https://pnpm.io/) >= 10.24.0

> [!TIP]
> Local startup uses SQLite by default. `pnpm dev`, `pnpm build`, and `pnpm start` all run the database bootstrap script first, so manual database setup is usually unnecessary.

### Local Development

```bash
git clone https://github.com/Y80/bmm.git
cd bmm
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

<a id="scripts"></a>

## Common Commands

| Command           | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| `pnpm dev`        | Start the development server and initialize the database first |
| `pnpm build`      | Build for production                                           |
| `pnpm start`      | Run the production build                                       |
| `pnpm lint`       | Run ESLint                                                     |
| `pnpm test`       | Run Vitest                                                     |
| `pnpm db:test`    | Check database connectivity                                    |
| `pnpm db:migrate` | Generate and apply database migrations                         |
| `pnpm db:push`    | Push schema changes directly and may risk data loss            |
| `pnpm studio`     | Open Drizzle Studio                                            |

<a id="env"></a>

## Environment Variables

See [`.env`](./.env) for the full example.

> [!TIP]
> If you only want to get the app running, local development usually works with the default SQLite configuration. AI providers are configured in the admin dashboard and do not require environment variables.

| Variable             | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `DB_DRIVER`          | Database driver, `sqlite` or `postgresql`          |
| `DB_CONNECTION_URL`  | Database connection string                         |
| `DB_AUTH_TOKEN`      | Optional token for Turso or libsql                 |
| `AUTH_URL`           | Current site URL used by auth and deployment flows |
| `AUTH_SECRET`        | NextAuth secret, recommended for production        |
| `AUTH_GITHUB_ID`     | Optional GitHub OAuth Client ID                    |
| `AUTH_GITHUB_SECRET` | Optional GitHub OAuth Client Secret                |
| `AUTH_OIDC_ISSUER`   | Optional OIDC discovery / issuer base URL          |
| `AUTH_OIDC_ID`       | Optional OIDC Client ID                            |
| `AUTH_OIDC_SECRET`   | Optional OIDC Client Secret                        |

<a id="database"></a>

## Database

BMM currently supports SQLite, PostgreSQL, and Turso directly.

- SQLite is the default local option, and the database file is initialized automatically on first run.
- To switch to PostgreSQL or Turso, update `DB_DRIVER` and `DB_CONNECTION_URL`.
- The repository includes [`docker-compose.yml`](./docker-compose.yml) as a PostgreSQL deployment example.

If you only want to verify database readiness, run:

```bash
pnpm db:test
pnpm db:migrate
```

<a id="deployment"></a>

## Deployment

### Node Deployment

```bash
git clone https://github.com/Y80/bmm.git
cd bmm
pnpm install
pnpm build
pnpm start
```

### Docker Deployment

The repository includes a ready-to-use [`Dockerfile`](./Dockerfile). The example below uses SQLite with a mounted volume:

```bash
docker build -t bmm .

docker run --rm \
  -e DB_DRIVER=sqlite \
  -e DB_CONNECTION_URL=file:/app/volume/sqlite.db \
  -v bmm:/app/volume \
  -p 3000:3000 \
  bmm
```

### Vercel Deployment

1. Fork this repository and import it into Vercel.
2. Configure database and auth variables in Environment Variables.
3. After deployment, verify that `AUTH_URL` matches the GitHub OAuth callback URL.

<a id="ai"></a>

## AI Integration

The AI features reduce manual work during bookmark entry and organization. Current coverage includes:

- automatic website title, description, and icon analysis
- related tag suggestions for bookmarks
- related-tag suggestions and theme colors for tags

The project uses Vercel AI SDK with an OpenAI-compatible provider. After signing in as an administrator, configure site-level providers in the "AI Providers" admin page and choose the active provider there.

Supported options include OpenAI-compatible providers such as OpenAI, DeepSeek, Moonshot, and GLM. For non OpenAI-compatible services, refer to [AI SDK Providers](https://ai-sdk.dev/providers/ai-sdk-providers).

<a id="deploy-examples"></a>

## Deployment Examples

[`deploy/`](./deploy/) ships four ready-to-use orchestrations, all multi-arch (amd64/arm64):

| Scenario | File |
| --- | --- |
| Single-node SQLite | [`deploy/compose/sqlite.yml`](./deploy/compose/sqlite.yml) |
| App + PostgreSQL | [`deploy/compose/postgres.yml`](./deploy/compose/postgres.yml) |
| App + Caddy (auto HTTPS, OIDC ready) | [`deploy/compose/with-caddy.yml`](./deploy/compose/with-caddy.yml) |
| Kubernetes (Deployment / Service / Ingress / probes) | [`deploy/k8s/`](./deploy/k8s/) |

```bash
cd deploy/compose
cp .env.example .env          # set AUTH_URL and AUTH_SECRET
docker compose -f sqlite.yml up -d
```

Health endpoints: `GET /api/health` (liveness, no database access) and `GET /api/health/deep` (readiness, includes a database probe, 503 on failure; `/api/health?deep=1` also works). See [`deploy/README.md`](./deploy/README.md).

<a id="performance"></a>

## Performance

Methodology and results: [`doc/performance.md`](./doc/performance.md); scripts in [`bench/`](./bench/).

Highlights (4 vCPU / SQLite / single-process `next start`):

- Two rounds of optimization (page size 240/600 → 60/120, slimmer card markup, TTL cache on the read path, indexes) cut home CPU per request from 265ms to **52.7ms**, response size from 894KB to **275KB**, and raise per-replica throughput from 4.3 to **19~24 RPS**;
- Moving `/tags` from an in-page `redirect()` to a router-level redirect took it from 31.8 to **1555~2554 RPS**;
- A single replica is capped at roughly one CPU core — **scale out with replicas**; memory stays at 250~290MB (peak ~360MB at 64-way concurrency) with no leak under sustained load (recommended requests 256Mi / limits 512Mi).

```bash
node bench/seed.mjs                       # seed perf.db
node bench/run.mjs --server-pid <pid>     # full suite
node bench/run.mjs --mode ramp --only /   # concurrency ramp
```

<a id="ci-cd"></a>

## CI / CD

Three GitHub Actions workflows ship with the repo, all built on **native-architecture runners** (amd64 / arm64) — no QEMU emulation:

| Workflow | Trigger | Output |
| --- | --- | --- |
| CI | every push, PRs | typecheck, lint, unit tests |
| Docker CI | every push | multi-arch CI images (`ci-<sha>` / `ci-<branch>`, **never latest**) |
| Release | tag `v*.*.*` or manual | amd64/arm64 bundles, multi-arch images (`vX.Y.Z` / `X.Y` / `latest`), GitHub Release |

See [`doc/ci-cd.md`](./doc/ci-cd.md).

<a id="oauth"></a>

## GitHub OAuth Setup

> [!IMPORTANT]
> `AUTH_URL`, the GitHub OAuth App `Authorization callback URL`, and the actual URL users use to access BMM must match exactly.

1. Create a GitHub OAuth App at <https://github.com/settings/applications/new>.
2. Set the callback URL in the form `https://your-domain.com/api/auth/callback/github`.
3. Configure these variables:

```bash
AUTH_GITHUB_ID=your-client-id
AUTH_GITHUB_SECRET=your-client-secret
AUTH_URL=https://your-domain.com
```

These screenshots can help when checking the configuration:

<img width="480" alt="Create GitHub OAuth app" src="./doc/images/github-oauth-new.png">

<img width="480" alt="Check GitHub callback URL" src="./doc/images/github-oauth-cb-url.png">

<a id="oidc"></a>

## OIDC Login and Account Linking

BMM ships with generic OIDC support: any IdP exposing a standard `/.well-known/openid-configuration` can be plugged in with three environment variables — Keycloak, Authentik, Auth0, Casdoor, Zitadel, Logto, GitLab, Authing, and more.

```bash
AUTH_OIDC_ISSUER=https://id.example.com/realms/bmm
AUTH_OIDC_ID=bmm
AUTH_OIDC_SECRET=your-client-secret
```

Register two callback URLs on the IdP side:

| Purpose         | Callback URL                              |
| --------------- | ----------------------------------------- |
| Login           | `{AUTH_URL}/api/auth/callback/oidc`       |
| Account linking | `{AUTH_URL}/api/auth/oidc/link/callback` |

What changes once configured:

- The login page shows a "<name> sign-in" button, labelled by `AUTH_OIDC_NAME`;
- Signed-in users can link or unlink the OIDC identity under "User space → Profile → Account linking";
- A linked identity signs straight into the existing account, no more `OAuthAccountNotLinked` on duplicate e-mail.

Security defaults:

- OIDC identities are **not** merged into existing accounts by e-mail unless you explicitly set `AUTH_OIDC_TRUST_EMAIL=true`;
- The linking flow uses `state` + `nonce` + PKCE and verifies `id_token` against JWKS (`iss` / `aud` / `exp`);
- `id_token` signatures must be asymmetric: RSA (RS/PS), EC (ES256/384/512), or EdDSA — `none` and `HS*` are rejected;
- Unlinking is refused when it would leave the account without any login method.

See [`doc/oidc.md`](./doc/oidc.md) for the full parameter reference and per-IdP examples.

<a id="faq"></a>

## FAQ

<details>
<summary>What should <code>AUTH_URL</code> be?</summary>

<br>

It should equal the real URL users open BMM with, for example:

- `http://localhost:3000`
- `https://bmm.vercel.app`
- `https://example.com`
- `http://10.1.2.3:3000`

</details>

<details>
<summary>What if GitHub login fails with a <code>redirect_uri</code> error?</summary>

<br>

Check whether these three values are exactly the same:

- the GitHub OAuth App `Authorization callback URL`
- the `AUTH_URL` environment variable
- the actual BMM access URL

Example error screenshot:

![GitHub redirect_uri error](./doc/images/github-redirect-uri-err.png)

</details>

<details>
<summary>What if the callback URL becomes wrong after changing the port or using an IP address?</summary>

<br>

Whenever the access URL changes, update both `AUTH_URL` and the callback URL in the GitHub OAuth App.

</details>

<details>
<summary>Are more databases supported?</summary>

<br>

This repository directly implements SQLite / PostgreSQL / Turso. Because it uses Drizzle ORM, extending to more databases is feasible, but it still requires the matching schema and driver work.

</details>