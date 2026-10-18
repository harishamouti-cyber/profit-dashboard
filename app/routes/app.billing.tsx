import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { billingMode, createSubscriptionRaw, pricingPageUrl, shouldUseTestCharge } from "../lib/billing.server";
import { PLAN_PRICES, type BillingPlanName } from "../lib/plan";
import { RouteErrorBoundary } from "../components/ui";
import { requireShop } from "../lib/shop.server";
import { refreshPlan } from "../lib/sync/bootstrap.server";
import { authenticate } from "../shopify.server";

const FEATURES: Record<BillingPlanName, string[]> = {
  Starter: ["Dashboard and daily P&L", "Up to 300 orders a month counted", "3 expenses", "Top 10 products", "No per-order fees"],
  Growth: ["Unlimited orders and expenses", "Cost and ad spend CSV", "Recalculate cost history", "Full product table and exports", "No per-order fees"],
  Pro: ["Everything in Growth", "Shipping CSV and SKU fallback costs", "Custom gateway rules", "No per-order fees"],
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, shop: cached } = await requireShop(request);
  // Always read the live subscription here so a just-approved plan shows immediately.
  let shop = cached;
  try {
    shop = (await refreshPlan(admin, session.shop)) ?? cached;
  } catch (error) {
    console.error(`plan refresh failed for ${session.shop}`, error);
  }
  return {
    plan: shop.plan,
    mode: billingMode(),
    pricingUrl: pricingPageUrl(shop.shopDomain),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing, redirect } = await authenticate.admin(request);
  const form = await request.formData();
  const plan = String(form.get("plan") ?? "") as BillingPlanName;
  if (!PLAN_PRICES[plan]) return { message: "Unknown plan." };
  const mode = billingMode();
  const storeHandle = session.shop.replace(/\.myshopify\.com$/i, "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "profit-dashboard";
  const returnUrl = `https://admin.shopify.com/store/${storeHandle}/apps/${appHandle}/app/billing`;
  if (mode === "shopify_app_pricing") {
    return { pricingUrl: pricingPageUrl(session.shop) };
  }
  if (mode === "manual_raw") {
    const result = await createSubscriptionRaw(admin, plan, returnUrl);
    if (result.userErrors.length > 0) return { message: result.userErrors.join("; ") };
    if (!result.confirmationUrl) return { message: "Shopify did not return an approval link. Please try again." };
    return redirect(result.confirmationUrl, { target: "_top" });
  }
  return billing.request({
    plan,
    isTest: await shouldUseTestCharge(admin),
    returnUrl,
  });
};

const TAGLINES: Record<BillingPlanName, string> = {
  Starter: "For new stores finding their real margin.",
  Growth: "For growing brands running ads every day.",
  Pro: "For operators who want every cost covered.",
};

const COMPARE: Array<{ label: string; values: [string | boolean, string | boolean, string | boolean] }> = [
  { label: "Orders counted per month", values: ["300", "Unlimited", "Unlimited"] },
  { label: "Daily profit and loss", values: [true, true, true] },
  { label: "Custom expenses", values: ["3", "Unlimited", "Unlimited"] },
  { label: "Product profit table", values: ["Top 10", "Full", "Full"] },
  { label: "Cost and ad spend CSV import", values: [false, true, true] },
  { label: "Recalculate cost history", values: [false, true, true] },
  { label: "Shipping CSV and SKU fallback costs", values: [false, false, true] },
  { label: "Custom payment gateway fees", values: [false, false, true] },
];

const FAQ = [
  { q: "Is there a free trial?", a: "Every plan starts with a 7-day free trial. You are not charged until it ends." },
  { q: "How am I billed?", a: "Charges appear on your regular Shopify invoice. There are no per-order fees on any plan." },
  { q: "Can I switch plans later?", a: "Yes. Upgrades and downgrades apply right away, and Shopify prorates the difference." },
];

const CSS = `
.pp{--ink:#0b0d12;--muted:#5c6170;--line:#e6e8ee;--brand:#0b0d12;--brand2:#2b2f38;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.pp-hero{text-align:center;padding:12px 0 8px}
.pp-eyebrow{display:inline-flex;gap:6px;align-items:center;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--brand);background:#f2f4f7;border-radius:999px;padding:6px 12px}
.pp-title{font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-.02em;margin:14px 0 8px}
.pp-sub{color:var(--muted);font-size:15px;margin:0 auto;max-width:520px}
.pp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:28px;align-items:stretch}
@media (max-width:900px){.pp-grid{grid-template-columns:1fr}}
.pp-card{position:relative;background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px 24px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(16,24,40,.04);transition:transform .2s ease,box-shadow .2s ease}
.pp-card:hover{transform:translateY(-3px);box-shadow:0 14px 34px -12px rgba(16,24,40,.18)}
.pp-card.featured{border:1.5px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--brand),var(--brand2)) border-box;box-shadow:0 20px 44px -18px rgba(11,13,18,.45)}
.pp-ribbon{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:5px 12px;border-radius:999px;white-space:nowrap}
.pp-head{display:flex;justify-content:space-between;align-items:center}
.pp-name{font-size:16px;font-weight:650}
.pp-current{font-size:11px;font-weight:700;color:#067647;background:#dcfae6;border-radius:999px;padding:4px 10px}
.pp-tag{color:var(--muted);font-size:13px;margin:6px 0 18px;min-height:36px}
.pp-price{display:flex;align-items:baseline;gap:4px}
.pp-amt{font-size:44px;font-weight:750;letter-spacing:-.03em}
.pp-per{color:var(--muted);font-size:14px}
.pp-trial{font-size:12px;color:var(--muted);margin-top:4px}
.pp-btn{margin:20px 0 22px;width:100%;border:0;border-radius:12px;padding:12px 16px;font:600 14px Inter,system-ui,sans-serif;cursor:pointer;transition:filter .15s ease,transform .15s ease}
.pp-btn:active{transform:scale(.98)}
.pp-btn.dark{background:var(--ink);color:#fff}
.pp-btn.grad{background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;box-shadow:0 8px 20px -8px rgba(11,13,18,.6)}
.pp-btn:hover{filter:brightness(1.08)}
.pp-btn[disabled]{background:#f2f4f7;color:#98a2b3;box-shadow:none;cursor:default;filter:none}
.pp-list{list-style:none;padding:0;margin:0;display:grid;gap:11px;border-top:1px solid var(--line);padding-top:20px}
.pp-list li{display:flex;gap:10px;font-size:14px;align-items:flex-start}
.pp-check{flex:none;width:18px;height:18px;border-radius:50%;background:#f2f4f7;color:var(--brand);display:grid;place-items:center;margin-top:1px}
.pp-trust{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 26px;margin:26px 0 6px;color:var(--muted);font-size:13px}
.pp-trust span{display:inline-flex;align-items:center;gap:7px}
.pp-sec{margin-top:34px;background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden}
.pp-sec h3{font-size:16px;font-weight:650;margin:0;padding:18px 22px;border-bottom:1px solid var(--line)}
.pp-table{width:100%;border-collapse:collapse;font-size:14px}
.pp-table th,.pp-table td{padding:13px 22px;text-align:center;border-bottom:1px solid #f1f2f5}
.pp-table th:first-child,.pp-table td:first-child{text-align:left;color:var(--ink)}
.pp-table thead th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}
.pp-table .hl{background:#f9fafb}
.pp-table tr:last-child td{border-bottom:0}
.pp-no{color:#c4c8d2}
.pp-faq{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
@media (max-width:900px){.pp-faq{grid-template-columns:1fr}}
.pp-faq div{padding:18px 22px;border-right:1px solid #f1f2f5}
.pp-faq div:last-child{border-right:0}
.pp-faq b{display:block;font-size:14px;margin-bottom:6px}
.pp-faq p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
.pp-err{margin-top:16px;background:#fef3f2;color:#b42318;border:1px solid #fecdca;border-radius:12px;padding:12px 16px;font-size:14px;text-align:center}
`;

function Check() {
  return (
    <span className="pp-check" aria-hidden="true">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    </span>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const pendingPlan = navigation.state !== "idle" ? String(navigation.formData?.get("plan") ?? "") : "";
  useEffect(() => {
    const url = result && "confirmationUrl" in result ? result.confirmationUrl : result && "pricingUrl" in result ? result.pricingUrl : null;
    if (url && typeof shopify !== "undefined") {
      window.open(String(url), "_top");
    }
  }, [result]);
  const names = Object.keys(PLAN_PRICES) as BillingPlanName[];
  const message = result && "message" in result ? result.message : null;

  return (
    <s-page heading="Plan">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pp">
        <div className="pp-hero">
          <span className="pp-eyebrow">Simple, flat pricing</span>
          <h1 className="pp-title">Know your true profit on every order</h1>
          <p className="pp-sub">One flat monthly price. No per-order fees, no revenue cut, and a 7-day free trial on every plan.</p>
        </div>

        <div className="pp-grid">
          {names.map((name) => {
            const plan = PLAN_PRICES[name];
            const current = data.plan === plan.plan;
            const featured = name === "Growth";
            const pending = pendingPlan === name;
            return (
              <div key={name} className={`pp-card${featured ? " featured" : ""}`}>
                {featured ? <span className="pp-ribbon">Most popular</span> : null}
                <div className="pp-head">
                  <span className="pp-name">{plan.label}</span>
                  {current ? <span className="pp-current">Current plan</span> : null}
                </div>
                <p className="pp-tag">{TAGLINES[name]}</p>
                <div className="pp-price">
                  <span className="pp-amt">${plan.amount}</span>
                  <span className="pp-per">/ month</span>
                </div>
                <div className="pp-trial">7-day free trial, billed through Shopify</div>
                {data.mode === "shopify_app_pricing" ? (
                  <a href={data.pricingUrl} target="_top" style={{ textDecoration: "none" }}>
                    <button type="button" className={`pp-btn ${featured ? "grad" : "dark"}`} disabled={current}>
                      {current ? "Your current plan" : `Choose ${plan.label}`}
                    </button>
                  </a>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="plan" value={name} />
                    <button type="submit" className={`pp-btn ${featured ? "grad" : "dark"}`} disabled={current || pendingPlan !== ""}>
                      {current ? "Your current plan" : pending ? "Opening Shopify…" : `Choose ${plan.label}`}
                    </button>
                  </Form>
                )}
                <ul className="pp-list">
                  {FEATURES[name].map((feature) => (
                    <li key={feature}><Check />{feature}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {message ? <div className="pp-err">{message}</div> : null}

        <div className="pp-trust">
          <span><Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />Secure Shopify billing</span>
          <span><Icon d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />7-day free trial</span>
          <span><Icon d="M18 6 6 18M6 6l12 12" />Cancel anytime</span>
          <span><Icon d="M3 3v18h18M7 14l4-4 4 4 5-5" />No per-order fees</span>
        </div>

        <div className="pp-sec">
          <h3>Compare plans</h3>
          <div style={{ overflowX: "auto" }}>
          <table className="pp-table">
            <thead>
              <tr>
                <th>Feature</th>
                {names.map((n) => <th key={n} className={n === "Growth" ? "hl" : ""}>{n}</th>)}
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className={i === 1 ? "hl" : ""}>
                      {v === true ? <Check /> : v === false ? <span className="pp-no">—</span> : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="pp-sec">
          <h3>Questions</h3>
          <div className="pp-faq">
            {FAQ.map((item) => (
              <div key={item.q}><b>{item.q}</b><p>{item.a}</p></div>
            ))}
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

export const ErrorBoundary = RouteErrorBoundary;
