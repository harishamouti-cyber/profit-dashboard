import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy | Penni: Net Profit Tracker" },
  { name: "description", content: "How Penni: Net Profit Tracker collects, uses and deletes Shopify store data." },
];

const UPDATED = "October 19, 2026";

export default function Privacy() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 80px", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#0b0d12", lineHeight: 1.65, fontSize: 15 }}>
      <p style={{ fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>Penni: Net Profit Tracker</p>
      <h1 style={{ fontSize: 32, letterSpacing: "-0.02em", margin: "8px 0 4px" }}>Privacy Policy</h1>
      <p style={{ color: "#667085", marginTop: 0 }}>Last updated {UPDATED}</p>

      <p>Penni: Net Profit Tracker ("Penni", "we", "us") is a Shopify app that shows merchants their net profit. This policy explains what data Penni accesses when you install it, how we use it, and how it is deleted.</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Data we access</h2>
      <p>When you install Penni, you grant it read-only access to your store's orders, products and inventory through the Shopify API. From that we store only what is needed to calculate profit:</p>
      <ul>
        <li>Order totals, discounts, shipping charged, taxes, transaction fees and refunds, with their dates.</li>
        <li>Product and variant titles, SKUs and cost per item.</li>
        <li>Your shop domain, currency and time zone.</li>
        <li>Costs, ad spend and expenses you enter or import into Penni yourself.</li>
      </ul>
      <p>Penni does not store your customers' names, email addresses, phone numbers or addresses, and it never writes to or changes your store's data.</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>How we use it</h2>
      <p>We use this data only to calculate and show your profit, margins and reports inside the app, and to produce the CSV exports you request. We do not sell, rent or share your data with third parties, and we do not use it for advertising.</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Where it is stored</h2>
      <p>Data is stored in a managed database with our hosting provider, encrypted in transit. Access is limited to what is needed to run and support the app.</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Billing</h2>
      <p>Subscriptions are billed through Shopify. We never see or store your payment card details.</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Retention and deletion</h2>
      <p>When you uninstall Penni, your store's data is deleted within 48 hours of Shopify's shop redaction request. We also respond to Shopify's customer data request and customer redaction webhooks as required.</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Your rights</h2>
      <p>You can ask us at any time what data we hold for your store, or ask us to delete it. If you are in the EU, UK or another region with data protection laws, you have the right to access, correct and delete your data.</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Changes</h2>
      <p>If we change this policy, we will update the date above. Material changes will be shown inside the app.</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Contact</h2>
      <p>For privacy questions or requests, contact us through the support email on Penni's Shopify App Store listing.</p>
    </main>
  );
}
