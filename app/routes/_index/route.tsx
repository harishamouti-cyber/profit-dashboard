import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

const PLANS = [
  { name: "Starter", price: "$9", detail: "Dashboard, 3 expenses, top 10 products" },
  { name: "Growth", price: "$19", detail: "CSV import, exports, full product table" },
  { name: "Pro", price: "$29", detail: "Shipping CSV, SKU costs, custom fee rules" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

export default function Landing() {
  const { showForm } = useLoaderData<typeof loader>();
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <span className={styles.mark}>
          <img src="/brand/icon.svg" alt="" width={28} height={28} className={styles.logo} />
          Penni
        </span>
        <a href="#pricing">Pricing</a>
      </header>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Flat monthly pricing. No per-order fees.</p>
        <h1>Accurate profit, with VAT kept out of revenue.</h1>
        <p className={styles.lead}>
          Penni is a Shopify embedded app for merchants who want the number they can take to the bank:
          revenue after discounts and returns, minus COGS, fees, shipping, ads, and expenses.
        </p>
        {showForm ? (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label} htmlFor="shop">
              Shop domain
              <input id="shop" className={styles.input} type="text" name="shop" placeholder="my-shop.myshopify.com" autoComplete="url" required />
            </label>
            <button className={styles.button} type="submit">Open the app</button>
          </Form>
        ) : null}
      </section>
      <section className={styles.section} aria-labelledby="compare">
        <h2 id="compare">What merchants asked for after BeProfit and Triple Whale</h2>
        <div className={styles.grid}>
          <article>
            <h3>VAT-exclusive profit</h3>
            <p>Tax-inclusive orders subtract tax before revenue. Tax is never treated as sales, which is the complaint that follows Triple Whale-style dashboards.</p>
          </article>
          <article>
            <h3>Every ad dollar counts</h3>
            <p>Ad spend is not filtered by attribution. If you paid for it, it hits contribution margin. That is the gap merchants hit in BeProfit.</p>
          </article>
          <article>
            <h3>$9, $19, or $29</h3>
            <p>One flat price. Starter still counts orders past 300 and shows a banner. It never adds a per-order surcharge the way TrueProfit-style billing does.</p>
          </article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="features">
        <h2 id="features">What you get</h2>
        <ul className={styles.features}>
          <li>Daily profit in the shop&apos;s currency and timezone</li>
          <li>Refunds booked on the refund date, not the order date</li>
          <li>COGS from effective-dated cost history, with restock reversals</li>
          <li>Shopify Payments fees when Shopify sends them, otherwise a gateway rule</li>
          <li>Product margins with fees split inside the order, not smeared with ads</li>
          <li>No buyer name, email, phone, or address stored</li>
        </ul>
      </section>
      <section className={styles.section} id="pricing" aria-labelledby="pricing-heading">
        <h2 id="pricing-heading">Pricing</h2>
        <div className={styles.plans}>
          {PLANS.map((plan) => (
            <article key={plan.name} className={styles.plan}>
              <h3>{plan.name}</h3>
              <p className={styles.price}>{plan.price}<span>/mo</span></p>
              <p>{plan.detail}</p>
              <p className={styles.fine}>No per-order fees</p>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="faq">
        <h2 id="faq">FAQ</h2>
        <details>
          <summary>Does tax count as revenue?</summary>
          <p>No. On tax-inclusive orders the tax is removed from the line before net sales. Duties, tips, and gift card sales are excluded too.</p>
        </details>
        <details>
          <summary>When is a refund counted?</summary>
          <p>On the refund&apos;s local date in the shop timezone, including across midnight in Los Angeles or Karachi.</p>
        </details>
        <details>
          <summary>Do you store customer data?</summary>
          <p>No. Order queries skip name, email, phone, and address. Protected customer data Level 1 is still required by Shopify for order access.</p>
        </details>
      </section>
    </div>
  );
}
