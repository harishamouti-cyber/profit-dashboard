import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { CsvDropZone } from "../components/CsvDropZone";
import { EmptyState } from "../components/EmptyState";
import { SaveToast } from "../components/SaveToast";
import { UpgradeCard } from "../components/UpgradeCard";
import { Card, Field, Icon, PageHeader, Pill, PremiumPage, RouteErrorBoundary } from "../components/ui";
import db from "../db.server";
import { enqueue } from "../jobs/queue.server";
import { parseCostsCsv } from "../lib/csv";
import { D, fmt, isMoney } from "../lib/money";
import { getPlanLimits, requirePlan } from "../lib/plan.server";
import { requireShop } from "../lib/shop.server";
import { fromDbDate, isIsoDay, todayInZone, toDbDate } from "../lib/tz";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const missingOnly = url.searchParams.get("missing") === "1";
  const costed = await db.variantCost.findMany({
    where: { shopId: shop.id },
    distinct: ["variantGid"],
    select: { variantGid: true },
  });
  const costedGids = costed.map((row) => row.variantGid);
  const missingWhere = { shopifyUnitCost: null, variantGid: { notIn: costedGids } };
  // Search in the database so filters cover the whole catalog, not just the first page.
  const where = {
    shopId: shop.id,
    ...(q
      ? {
          OR: [
            { productTitle: { contains: q, mode: "insensitive" as const } },
            { variantTitle: { contains: q, mode: "insensitive" as const } },
            { sku: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(missingOnly ? missingWhere : {}),
  };
  const [variants, matching, total, missing] = await Promise.all([
    db.variant.findMany({ where, orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }], take: 200 }),
    db.variant.count({ where }),
    db.variant.count({ where: { shopId: shop.id } }),
    db.variant.count({ where: { shopId: shop.id, ...missingWhere } }),
  ]);
  const costs = variants.length
    ? await db.variantCost.findMany({
        where: { shopId: shop.id, variantGid: { in: variants.map((variant) => variant.variantGid) } },
        orderBy: { effectiveFrom: "desc" },
      })
    : [];
  const limits = getPlanLimits(shop.plan);
  const rows = variants.map((variant) => {
    const history = costs.filter((cost) => cost.variantGid === variant.variantGid);
    return {
      id: variant.id,
      variantGid: variant.variantGid,
      title: variant.productTitle,
      variantTitle: variant.variantTitle ?? "",
      sku: variant.sku ?? "",
      shopifyCost: variant.shopifyUnitCost == null ? null : fmt(variant.shopifyUnitCost, shop.currencyCode),
      current: history[0] ? fmt(history[0].unitCost, shop.currencyCode) : null,
      history: history
        .slice(0, 8)
        .map((cost) => `${fromDbDate(cost.effectiveFrom)} · ${cost.source.toLowerCase()} · ${fmt(cost.unitCost, shop.currencyCode)}`),
    };
  });
  return {
    rows,
    q,
    matching,
    total,
    missing,
    coverage: total === 0 ? 0 : Math.round(((total - missing) / total) * 100),
    today: todayInZone(shop.ianaTimezone),
    canImport: limits.csvImport,
    canRecalc: limits.recalcHistory,
    canSkuFallback: limits.skuFallback,
    currency: shop.currencyCode,
    missingOnly,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const limits = getPlanLimits(shop.plan);

  if (intent === "override") {
    const variantGid = String(form.get("variantGid") ?? "");
    const unitCost = String(form.get("unitCost") ?? "");
    const effectiveFrom = String(form.get("effectiveFrom") ?? "");
    if (!variantGid || !isMoney(unitCost) || D(unitCost).isNegative() || !isIsoDay(effectiveFrom)) {
      return { message: "Variant, a numeric cost, and an effective date (YYYY-MM-DD) are required.", errors: ["Variant, a numeric cost, and an effective date (YYYY-MM-DD) are required."] };
    }
    await db.variantCost.create({
      data: {
        shopId: shop.id,
        variantGid,
        unitCost,
        effectiveFrom: toDbDate(effectiveFrom),
        source: "MANUAL",
      },
    });
    return { message: "Override saved. Past orders keep their stored cost until you recalculate history." };
  }

  if (intent === "bulk_apply") {
    const unitCost = String(form.get("unitCost") ?? "");
    const effectiveFrom = String(form.get("effectiveFrom") ?? "");
    const filter = String(form.get("filter") ?? "").toLowerCase();
    if (!isMoney(unitCost) || D(unitCost).isNegative() || !isIsoDay(effectiveFrom)) {
      return { message: "Bulk apply needs a numeric cost and an effective date.", errors: ["Bulk apply needs a numeric cost and an effective date."] };
    }
    const variants = await db.variant.findMany({ where: { shopId: shop.id } });
    const matches = variants.filter((variant) => {
      const haystack = `${variant.sku ?? ""} ${variant.productTitle}`.toLowerCase();
      return !filter || haystack.includes(filter);
    });
    if (matches.length === 0) return { message: "No variants match that filter.", errors: ["No variants match that filter."] };
    await db.variantCost.createMany({
      data: matches.map((variant) => ({
        shopId: shop.id,
        variantGid: variant.variantGid,
        unitCost,
        effectiveFrom: toDbDate(effectiveFrom),
        source: "MANUAL",
      })),
    });
    return { message: `Applied a cost to ${matches.length} variants.` };
  }

  if (intent === "import_csv") {
    const gate = requirePlan(shop.plan, "GROWTH");
    if (!gate.ok || !limits.csvImport) return { upgrade: true, message: "Cost CSV import is on Growth and Pro." };
    const parsed = parseCostsCsv(String(form.get("csv") ?? ""));
    // One query for every SKU in the file instead of one per row, so large files stay fast.
    const skus = [...new Set(parsed.rows.map((row) => row.sku))];
    const matches = skus.length
      ? await db.variant.findMany({ where: { shopId: shop.id, sku: { in: skus } }, select: { sku: true, variantGid: true } })
      : [];
    const bySku = new Map<string, string>();
    for (const variant of matches) if (variant.sku && !bySku.has(variant.sku)) bySku.set(variant.sku, variant.variantGid);
    const data: Array<{ shopId: string; variantGid: string; unitCost: string; effectiveFrom: Date; source: "CSV" }> = [];
    const unknown = new Set<string>();
    for (const row of parsed.rows) {
      const variantGid = bySku.get(row.sku);
      if (!variantGid) {
        unknown.add(row.sku);
        continue;
      }
      data.push({ shopId: shop.id, variantGid, unitCost: row.unitCost, effectiveFrom: toDbDate(row.effectiveFrom), source: "CSV" });
    }
    for (let index = 0; index < data.length; index += 1000) {
      await db.variantCost.createMany({ data: data.slice(index, index + 1000) });
    }
    const applied = data.length;
    if (unknown.size > 0) {
      const list = [...unknown];
      parsed.errors.push({ row: 0, message: `No variant with SKU ${list.slice(0, 5).join(", ")}${list.length > 5 ? ` and ${list.length - 5} more` : ""}` });
    }
    return {
      message: applied > 0 ? `Imported ${applied} costs. Run "Recalculate history" to update past orders.` : "No costs were imported.",
      errors: parsed.errors.slice(0, 20).map((error) => (error.row ? `Row ${error.row}: ${error.message}` : error.message)),
    };
  }

  if (intent === "recalc") {
    const gate = requirePlan(shop.plan, "GROWTH");
    if (!gate.ok) return { upgrade: true, message: "Recalculate history is on Growth and Pro." };
    await enqueue({ shopDomain: shop.shopDomain, type: "recalc_costs", payload: {} });
    return { message: "Recalculation queued. Dashboards update when the job finishes." };
  }

  if (intent === "sku_fallback") {
    const gate = requirePlan(shop.plan, "PRO");
    if (!gate.ok) return { upgrade: true, message: "SKU fallback costs are a Pro feature." };
    const sku = String(form.get("sku") ?? "").trim();
    const unitCost = String(form.get("unitCost") ?? "");
    const effectiveFrom = String(form.get("effectiveFrom") ?? "");
    if (!sku || !isMoney(unitCost) || D(unitCost).isNegative() || !isIsoDay(effectiveFrom)) {
      return { message: "SKU, a numeric cost, and an effective date are required.", errors: ["SKU, a numeric cost, and an effective date are required."] };
    }
    await db.variantCost.create({
      data: {
        shopId: shop.id,
        variantGid: `sku:${sku}`,
        unitCost,
        effectiveFrom: toDbDate(effectiveFrom),
        source: "SKU_FALLBACK",
        note: "Fallback for lines with no variant",
      },
    });
    return { message: `SKU fallback saved for ${sku}.` };
  }

  return { message: "Nothing to save." };
};

function Submit({ intent, children, variant = "primary" }: { intent: string; children: ReactNode; variant?: "primary" | "ghost" | "dark" }) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting" && navigation.formData?.get("intent") === intent;
  return (
    <button type="submit" className={`pd-btn ${variant}`} disabled={busy}>
      {busy ? "Saving…" : children}
    </button>
  );
}

export default function Costs() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const savingRow = navigation.state === "submitting" && navigation.formData?.get("intent") === "override" ? String(navigation.formData.get("variantGid")) : null;
  const filterBase = data.q ? `q=${encodeURIComponent(data.q)}&` : "";
  return (
    <s-page heading="Costs">
      <PremiumPage>
        <PageHeader
          eyebrow="Product costs"
          icon="tag"
          title="Give every product a true cost"
          subtitle="Costs come from Shopify automatically. Add an override when your real cost is different. The newest effective date wins, and on the same date a manual or CSV cost beats Shopify's."
        />
        <SaveToast message={result?.message} errors={result && "errors" in result ? result.errors : []} />

        <div className="pd-grid pd-g3">
          <div className="pd-card pd-kpi sm"><div className="pd-kpi-l">Variants</div><div className="pd-kpi-v">{data.total}</div></div>
          <div className="pd-card pd-kpi sm">
            <div className="pd-kpi-l">Missing a cost</div>
            <div className="pd-kpi-v" style={{ color: data.missing > 0 ? "var(--warn)" : undefined }}>{data.missing}</div>
          </div>
          <div className="pd-card pd-kpi sm">
            <div className="pd-kpi-l"><span>Cost coverage</span><span>{data.coverage}%</span></div>
            <div className="pd-bar" style={{ marginTop: 10 }}><i style={{ width: `${data.coverage}%` }} /></div>
          </div>
        </div>

        <div className="pd-grid pd-g2">
          <Card title="Bulk apply" icon="layers" subtitle="Set one cost for every variant whose title or SKU contains the text">
            <Form method="post" className="pd-form">
              <input type="hidden" name="intent" value="bulk_apply" />
              <Field label="Title or SKU contains" hint="Leave empty to apply to all variants">
                <input className="pd-input" name="filter" placeholder="e.g. TEE-" />
              </Field>
              <Field label={`Unit cost (${data.currency})`}>
                <input className="pd-input" name="unitCost" type="number" step="0.01" min="0" required placeholder="0.00" />
              </Field>
              <Field label="Effective from">
                <input className="pd-input" name="effectiveFrom" type="date" defaultValue={data.today} required />
              </Field>
              <div className="pd-form-actions"><Submit intent="bulk_apply">Apply cost</Submit></div>
            </Form>
          </Card>
          {data.canImport ? (
            <Card title="Import from CSV" icon="upload" subtitle={<>Columns: <span className="pd-code">sku</span> <span className="pd-code">unit_cost</span> <span className="pd-code">effective_from</span> (YYYY-MM-DD, optional)</>}>
              <CsvDropZone intent="import_csv" label="Drop a cost CSV" />
            </Card>
          ) : (
            <Card title="Import from CSV" icon="upload">
              <UpgradeCard feature="Import costs for your whole catalog from a spreadsheet, with effective dates." />
            </Card>
          )}
        </div>

        <div className="pd-grid pd-g2">
          <Card title="Recalculate history" icon="refresh" subtitle="Past orders keep the cost they had when they were imported. Recalculate to apply new costs to them.">
            {data.canRecalc ? (
              <Form method="post">
                <input type="hidden" name="intent" value="recalc" />
                <Submit intent="recalc" variant="dark">Recalculate past orders</Submit>
              </Form>
            ) : (
              <UpgradeCard feature="Apply cost changes to every past order in one click." />
            )}
          </Card>
          <Card title="SKU fallback" icon="box" subtitle="A cost for order lines that no longer link to a product, matched by SKU">
            {data.canSkuFallback ? (
              <Form method="post" className="pd-form">
                <input type="hidden" name="intent" value="sku_fallback" />
                <Field label="SKU"><input className="pd-input" name="sku" required /></Field>
                <Field label={`Unit cost (${data.currency})`}><input className="pd-input" name="unitCost" type="number" step="0.01" min="0" required /></Field>
                <Field label="Effective from"><input className="pd-input" name="effectiveFrom" type="date" defaultValue={data.today} required /></Field>
                <div className="pd-form-actions"><Submit intent="sku_fallback" variant="ghost">Save fallback</Submit></div>
              </Form>
            ) : (
              <UpgradeCard required="Pro" feature="Cover deleted products and custom lines with SKU-based costs." />
            )}
          </Card>
        </div>

        <Card
          flush
          title="Variants"
          icon="tag"
          subtitle={data.matching > data.rows.length ? `Showing ${data.rows.length} of ${data.matching}. Search to narrow it down.` : `${data.matching} variant${data.matching === 1 ? "" : "s"}`}
          actions={
            <nav className="pd-seg" aria-label="Filter">
              <Link to={`?${filterBase}`} className={!data.missingOnly ? "on" : ""} preventScrollReset>All</Link>
              <Link to={`?${filterBase}missing=1`} className={data.missingOnly ? "on" : ""} preventScrollReset>Missing cost</Link>
            </nav>
          }
        >
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
            <Form method="get" className="pd-toolbar">
              {data.missingOnly ? <input type="hidden" name="missing" value="1" /> : null}
              <div className="pd-search">
                <Icon name="search" size={14} />
                <input className="pd-input" type="search" name="q" defaultValue={data.q} placeholder="Search by product, variant, or SKU" aria-label="Search variants" />
              </div>
              <button type="submit" className="pd-btn dark sm">Search</button>
            </Form>
          </div>
          {data.rows.length === 0 ? (
            <EmptyState
              heading={data.missingOnly ? "Every variant has a cost" : data.q ? "No variants match" : "No variants yet"}
              icon="product"
              body={
                data.missingOnly
                  ? "Nice work. Every variant in this filter has a cost, so your margins are accurate."
                  : data.q
                    ? "Try a different search term."
                    : "Your catalog imports right after install. Refresh in a minute, or check progress on the onboarding page."
              }
              href={data.missingOnly || data.q ? "/app/costs" : "/app/onboarding"}
              action={data.missingOnly || data.q ? "Show all variants" : "Check import progress"}
            />
          ) : (
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>SKU</th>
                    <th className="r">Shopify cost</th>
                    <th className="r">Your cost</th>
                    <th>Set a new cost</th>
                    <th>History</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="strong">{row.title}</div>
                        {row.variantTitle ? <div className="pd-muted pd-small">{row.variantTitle}</div> : null}
                      </td>
                      <td>{row.sku ? <span className="pd-code">{row.sku}</span> : <span className="pd-muted">—</span>}</td>
                      <td className="r">{row.shopifyCost ?? <Pill tone="warning">Missing</Pill>}</td>
                      <td className="r">{row.current ? <span className="strong">{row.current}</span> : <span className="pd-muted">—</span>}</td>
                      <td>
                        <Form method="post" className="pd-inline">
                          <input type="hidden" name="intent" value="override" />
                          <input type="hidden" name="variantGid" value={row.variantGid} />
                          <input className="pd-input" name="unitCost" type="number" step="0.01" min="0" required placeholder="Cost" aria-label={`New cost for ${row.title}`} />
                          <input className="pd-input" name="effectiveFrom" type="date" defaultValue={data.today} required aria-label="Effective from" style={{ width: 150 }} />
                          <button type="submit" className="pd-btn ghost sm" disabled={savingRow === row.variantGid}>
                            {savingRow === row.variantGid ? "Saving…" : "Save"}
                          </button>
                        </Form>
                      </td>
                      <td>
                        {row.history.length === 0 ? (
                          <span className="pd-muted pd-small">No overrides</span>
                        ) : (
                          <details className="pd-details">
                            <summary>{row.history.length} change{row.history.length === 1 ? "" : "s"}</summary>
                            <ul>{row.history.map((entry) => <li key={entry}>{entry}</li>)}</ul>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PremiumPage>
    </s-page>
  );
}

export const ErrorBoundary = RouteErrorBoundary;

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
