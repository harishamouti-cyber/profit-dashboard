# Deploy Profit Dashboard on Render

Render is the host used here because the app needs a process that stays up. The job queue polls every 2 seconds and reconciles orders every 15 minutes. A serverless host that freezes between requests would stall that work. Render keeps a web service and a separate background worker running, and it provides managed Postgres.

You need:

- A GitHub account with this repo
- A [Render](https://render.com) account
- A Shopify Partner account and the Profit Dashboard app (`profit-dashboard-214`)

## 1. Create the Render services

1. In Render, choose **New** → **Blueprint**.
2. Connect the GitHub repo and select this repository.
3. Render reads `render.yaml` and offers:
   - a web service named `profit-dashboard`
   - a background worker named `profit-dashboard-worker`
   - a Postgres database named `profit-dashboard-db`
4. Apply the blueprint. The first Docker build takes a few minutes. It installs dependencies, generates the Prisma client, builds the app, and runs migrations on start.

## 2. Set environment variables

`DATABASE_URL` is filled from the Render database. Set the rest on **both** the web service and the worker, except `SHOPIFY_APP_URL` and `BILLING_MODE`, which only the web service needs.

| Variable | Where to get it |
| --- | --- |
| `SHOPIFY_API_KEY` | Partner Dashboard → your app → Client ID |
| `SHOPIFY_API_SECRET` | Partner Dashboard → your app → Client secret |
| `SHOPIFY_APP_URL` | The Render web URL, like `https://profit-dashboard.onrender.com`, with no trailing slash |
| `SCOPES` | `read_orders,read_products,read_inventory` (already in the blueprint) |
| `DATABASE_URL` | Injected from Render Postgres. If you set it yourself, add `?sslmode=require` |
| `BILLING_MODE` | `shopify_app_pricing` |
| `SHOPIFY_APP_HANDLE` | `profit-dashboard-214` |

Do not put these Shopify variables in a committed `.env`. On a laptop, `shopify app dev` injects the key, secret, app URL, and scopes. A placeholder `.env` overrides that injection.

Save the variables and wait for the web service to go live. Open `https://<your-app>.onrender.com/health`. The response body is `ok`.

## 3. Point Shopify at Render

From your laptop, with the Shopify CLI logged in:

```bash
shopify app deploy
```

That publishes `shopify.app.toml`. Before you deploy, set `application_url` to the Render URL and add the auth callback to `redirect_urls`:

```toml
application_url = "https://<your-app>.onrender.com"

[auth]
redirect_urls = [ "https://<your-app>.onrender.com/api/auth" ]
```

`shopify app dev` rewrites these URLs locally because `[build] automatically_update_urls_on_dev = true`. Do not commit the tunnel URL from a dev session.

In the Partner Dashboard, open **API access requests → Protected customer data** and save Level 1 access. Do not request name, email, phone, or address. Order and refund webhooks stay invalid until those reasons are saved.

## 4. Verify

1. Install the app on a development store from the Partner Dashboard.
2. The embedded app should open the profit page, not the public marketing site.
3. Onboarding can show “Waiting for the first backfill” before any orders exist. That is expected.
4. Create an order in the dev store. Within a couple of minutes the worker should import it and the dashboard should show a day.
5. `https://<your-app>.onrender.com/health` stays `ok` while the worker service is running.

The worker and the web service use the same image. The web service sets `DISABLE_EMBEDDED_WORKER=1` so only the worker process polls the queue.

### Background jobs: who runs them

Order import, cost sync, refunds, ad spend and expense recalculation all run as jobs in the `Job` table.

- **Local dev (`shopify app dev`)**: the web process runs the job loop itself (started from `app/entry.server.tsx` on the first request). No separate worker is needed. After a Vite server reload the loop is restarted, so jobs never run against a stale module.
- **Production (Render)**: the web service sets `DISABLE_EMBEDDED_WORKER=1` and the `profit-dashboard-worker` service runs `node build/worker.js`. **If the worker service is not running, new installs never import orders.** The worker needs the same `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` and `SHOPIFY_APP_URL` values as the web service.
- Running on a single instance without a worker? Leave `DISABLE_EMBEDDED_WORKER` unset on the web service and it processes jobs inline.

### Billing

`BILLING_MODE=manual_raw` matches **Manual pricing** in the Partner Dashboard (Distribution → Pricing). Charges are created as test charges outside production, and on development stores in production too (Shopify only allows test charges there; app reviewers use development stores). Set `BILLING_TEST=1` to force test charges everywhere.
