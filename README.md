# Warehouse Layout

Web-based warehouse layout editor: racks, zones, levels and locations in top and isometric 3D views, with inventory, work orders, picking routes and reports. Files are processed locally in the browser; there is no data server, accounts or analytics.

## Structure

- `next/`: web app (React, TypeScript, Vite and Three.js). Full documentation (in Spanish) in [next/README.md](next/README.md).
- `ejemplo-*.csv`, `ejemplo-informe-ERP.xls`/`.xlsx`: real ERP and inventory exports used by the import tests.

## Development

With Node 24:

```bash
cd next
npm ci
npm run dev
```

Checks: `npm run lint`, `npx vitest run`, `npm run build` and `npm run test:e2e`.

## Deployment

`main` is published to Cloudflare Workers by [.github/workflows/deploy-production.yml](.github/workflows/deploy-production.yml) on every push that changes `next/**`, or manually from Actions. The workflow installs dependencies, runs lint and unit tests, builds, publishes the `warehouse-layout` Worker (static files only from `next/dist`, configured in [next/wrangler.toml](next/wrangler.toml)) and then smoke-checks `/`, `/en/`, `/app` and a missing path (404).

GitHub configuration, `production` environment:

| Type | Name | Purpose |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Token with permission to edit Workers |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account |
| Variable | `WAREHOUSE_LAYOUT_SITE_URL` | Public HTTPS origin, e.g. `https://example.com`. Without it the build is `noindex` |
| Variable | `WAREHOUSE_LAYOUT_SMOKE_URL` | Optional. URL for the post-deploy check; defaults to `WAREHOUSE_LAYOUT_SITE_URL` |

Manual deploy from `next/`: `npm run build`, then `npx wrangler deploy`.
