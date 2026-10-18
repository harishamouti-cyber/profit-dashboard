# Plainprofit

Embedded Shopify app that shows a merchant's profit: revenue after discounts and returns, COGS, payment fees, shipping cost, ad spend, and operating expenses. Pricing is a flat monthly plan ($9 / $19 / $29). There are no per-order fees.

The merchant-facing name is Plainprofit. The blueprint's working name was TrueMargin.

## Stack

- [Shopify React Router app template](https://github.com/Shopify/shopify-app-template-react-router) (React Router 7, not the old Remix template)
- Node.js **22.15 or newer** (the Shopify package tree requires it)
- Admin GraphQL API **2026-10**
- Polaris web components (`<s-page>`, `<s-section>`, and the rest). This app does not use the `@shopify/polaris` React package.
- PostgreSQL and Prisma
- Money math is `decimal.js` (Prisma `Decimal(14,4)`). Day buckets use the shop's IANA timezone.

## Local setup

1. Install [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) and Node 22.15+.
2. Create a [development store](https://shopify.dev/docs/apps/tools/development-stores) in the Partner Dashboard.
3. Start PostgreSQL and create a database. With a local Postgres superuser:

   ```bash
   createuser -s profit
   psql -c "ALTER USER profit WITH PASSWORD 'profit';"
   createdb -O profit profit_dashboard
   ```

   Or with Docker:

   ```bash
   docker run --name profit-dashboard-db -e POSTGRES_PASSWORD=profit -e POSTGRES_USER=profit -e POSTGRES_DB=profit_dashboard -p 5432:5432 -d postgres:16
   ```

4. Copy the environment file. It only sets the database and billing switch. Do not commit `.env`, and do not add `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, or `SCOPES` to it. `shopify app dev` injects those. If they are present in `.env` with placeholder values, they override the CLI and the embedded app falls back to the public login page.

   ```bash
   cp .env.example .env
   ```

5. Install, generate the client, and apply migrations:

   ```bash
   npm install
   npx prisma migrate deploy
   npm run setup
   ```

6. `shopify.app.toml` is already linked to the Partner app (`client_id` is committed, handle `profit-dashboard-214`). Do not run `shopify app config link` against a different app unless you mean to replace that file. A link can rewrite `application_url` to `https://shopify.dev/apps/default-app-home`, clear the scopes, and bump `api_version`, which makes the relative webhook URIs fail validation.

7. Start the dev server and install on the development store:

   ```bash
   shopify app dev
   ```

   `shopify.web.toml` starts Prisma migrate and the React Router dev server. Without that file the CLI starts no web process.

The CLI prints the install URL. After install, the app bootstraps the shop, seeds estimated gateway rules, and queues three bulk operations (orders, refunds, variant costs).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Set this in `.env` |
| `BILLING_MODE` | `shopify_app_pricing` (default), `package`, or `manual_raw` |
| `SHOPIFY_APP_HANDLE` | `profit-dashboard-214`, used in the hosted pricing URL |
| `SHOPIFY_API_KEY` | Injected by `shopify app dev`. Set it yourself only in production |
| `SHOPIFY_API_SECRET` | Injected by `shopify app dev`. Set it yourself only in production |
| `SCOPES` | Injected by `shopify app dev`. Production value is `read_orders,read_products,read_inventory` |
| `SHOPIFY_APP_URL` | Injected by `shopify app dev` (the tunnel). In production this is the public https URL |
| `DISABLE_EMBEDDED_WORKER` | Set to `1` on the web service when a separate worker process is running |

`BILLING_MODE=shopify_app_pricing` sends the merchant to Shopify's hosted plan page (`https://admin.shopify.com/store/{store}/charges/{handle}/pricing_plans`). Gating still reads `currentAppInstallation.activeSubscriptions`. `package` uses `billing.request` from `@shopify/shopify-app-react-router`. `manual_raw` calls the legacy `appSubscriptionCreate` mutation. Test charges are used when `NODE_ENV` is not `production`.

## Protected customer data (Level 1)

Order queries need protected customer data access even though this app never asks for buyer identity fields.

1. Partner Dashboard → your app → **API access requests**.
2. Open **Protected customer data**.
3. Request **Level 1**.
4. Do **not** request name, email, phone, or address fields.
5. Save the protected customer data reasons in the Partner Dashboard before you deploy. Order and refund webhook subscriptions fail validation until those reasons are saved.

Scopes in `shopify.app.toml` are `read_orders`, `read_products`, and `read_inventory`. `read_all_orders` is not requested until Shopify approves it; without it, history is the last 60 days. `read_shopify_payments_payouts` is not requested. Fees come from `OrderTransaction.fees` when Shopify returns them, otherwise from a gateway rule.

See [docs/PRIVACY.md](docs/PRIVACY.md). Production hosting is in [docs/DEPLOY.md](docs/DEPLOY.md).

## Plans

| | Starter $9 | Growth $19 | Pro $29 |
| --- | --- | --- | --- |
| Orders counted / month | 300, then a banner | Unlimited | Unlimited |
| Expenses | 3 | Unlimited | Unlimited |
| Products | Top 10 | Full table | Full table |
| Cost and ad CSV, exports, cost history recalc | | Yes | Yes |
| Shipping CSV, SKU fallback costs, custom gateway rules, digest | | | Yes |

The digest sender is a stub. It does not send email.

## Checks

```bash
npm run typecheck
npm run lint
npx prisma validate
npx vitest run
npm run build
grep -RInE "customer\\b|email|phone|shippingAddress|billingAddress|displayAddress|clientIp" app/lib/graphql
```

`shopify app dev`, a live refund webhook, and a billing test charge were not run here. They need a Partner app and a development store.

## Spec adjustments

- Default `BILLING_MODE` is `shopify_app_pricing`, matching Shopify's current default for new public apps.
- `Shop.planSyncedAt` caches the subscription for 10 minutes. `Order.requiresShipping` is stored so flat shipping can be recomputed without another API read.
- `InventoryItem.variant` is deprecated in 2026-10. Cost sync reads `variants(first: 5)`.
- Bulk order queries pass `shippingLines(includeRemovals: true)` because the default hides removed rates.
- Refund bulk queries include refund `transactions` so refunded fees can be reversed. The shorter Q3 in the scaffold prompt omitted them.
- `bulkOperationRunQuery` passes `groupObjects: false` (required in 2026-10).
- Node engines are `>=22.15` because a transitive package refuses 22.14 under `engine-strict`.
- SKU fallback costs are stored as `VariantCost` rows with `variantGid = "sku:<sku>"` and source `SKU_FALLBACK`. They apply on Pro when a line has no variant id.
- Estimated gateway rules are seeded for every plan. Editing them is a Pro feature.
- Same-day full cancellations are dropped, with their refunds, when `excludeCancelled` is on.
- On the same effective date, MANUAL beats CSV and SKU_FALLBACK, which beat SHOPIFY.
- Changing fee settings queues a full order backfill. Transaction fees are not stored, so they have to be read again.
- A cost override does not rewrite history until the merchant runs Recalculate history (Growth+).
- Gift-card refund lines are left out of returns and COGS.
- The refund webhook reads `order_id` and re-fetches the order. It does not trust the refund's own id from the payload.
