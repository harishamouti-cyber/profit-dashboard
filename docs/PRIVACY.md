# Privacy

Profit Dashboard calculates shop profit. It does not build a customer profile and it does not contact buyers.

## What we read

Admin GraphQL selections and webhook re-fetches use order, product, inventory, and app-subscription fields:

- Shop: id, currency, IANA timezone, myshopify domain
- Order totals in **shop money**, line items (title, SKU, quantity, variant and product ids, gift-card flag, tax and discount amounts), shipping lines (price and tax), transactions (kind, status, gateway, amount, fee amounts)
- Refunds: processed time, refunded merchandise, shipping, adjustments, restock flags, refund transaction fees
- Variant unit cost and catalog titles
- The app's own subscription name and status

Webhook handlers read the resource id from the payload, then re-fetch with those queries. They do not log the payload.

## What we do not read or store

We never request or persist buyer name, email, phone, billing address, shipping address, display address, order note, client IP, custom attributes, or customer journey data. GraphQL documents under `app/lib/graphql` do not select those fields. Order names such as `#1001` are kept because they match shipping-cost CSV rows. They are not a person's name.

## Why

Profit needs order dates, merchandise amounts, discounts, taxes (only to remove them from revenue), shipping charged, payment fees, refunds, and unit costs. None of that requires the buyer's identity. Protected customer data **Level 1** is still required by Shopify before `read_orders` returns order resources. In the Partner Dashboard, request Level 1 and do not request name, email, phone, or address fields.

## Retention

Rows live until the shop is redacted or the merchant uninstalls and Shopify later sends `shop/redact`. Uninstall marks the shop uninstalled and deletes the access token. Historical profit rows stay until `shop/redact`, because merchants sometimes reinstall.

## Deletion

| Topic | Behavior |
| --- | --- |
| `customers/data_request` | No customer record exists. The handler logs the shop domain only and returns 200. |
| `customers/redact` | Order names listed in `orders_to_redact` are replaced with `redacted`. There is no customer id to delete. |
| `shop/redact` | Deletes the shop and every cascaded row (orders, refunds, costs, metrics, expenses, ad spend, subscriptions, sync jobs), plus sessions, queued jobs, and webhook idempotency keys for that domain. |

The compliance route is `/webhooks/compliance`.
