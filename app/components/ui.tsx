import { useState, type ReactNode } from "react";
import { Link, isRouteErrorResponse, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

/**
 * Shared premium styling for embedded pages. Every class is prefixed with "pd-"
 * so nothing leaks into Polaris web components.
 */
export const PREMIUM_CSS = `
.pd{--ink:#0b0d12;--muted:#5c6170;--line:#e6e8ee;--soft:#f6f7fb;--brand:#4f46e5;--brand2:#06b6d4;--good:#067647;--goodbg:#dcfae6;--bad:#b42318;--badbg:#fee4e2;--warn:#b54708;--warnbg:#fef0c7;--info:#3538cd;--infobg:#eef2ff;font-family:Inter,system-ui,-apple-system,sans-serif;color:var(--ink);font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
.pd *{box-sizing:border-box}
.pd a{color:inherit}
.pd-stack{display:grid;gap:18px}
.pd-hero{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between;padding:6px 0 4px}
.pd-eyebrow{display:inline-flex;gap:6px;align-items:center;font-size:11.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--brand);background:var(--infobg);border-radius:999px;padding:5px 11px}
.pd-title{font-size:26px;line-height:1.15;font-weight:720;letter-spacing:-.02em;margin:10px 0 6px}
.pd-sub{color:var(--muted);font-size:14px;margin:0;max-width:620px}
.pd-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.pd-card{position:relative;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.03);transition:transform .2s ease,box-shadow .2s ease}
.pd-card.lift:hover{transform:translateY(-2px);box-shadow:0 14px 34px -14px rgba(16,24,40,.2)}
.pd-card-h{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--line)}
.pd-card-h h3{margin:0;font-size:15px;font-weight:650;display:flex;gap:10px;align-items:center}
.pd-card-h p{margin:2px 0 0;color:var(--muted);font-size:13px}
.pd-card-b{padding:20px 22px}
.pd-card-b.flush{padding:0}
.pd-ico{flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--infobg);color:var(--brand)}
.pd-grid{display:grid;gap:18px}
.pd-g2{grid-template-columns:repeat(2,minmax(0,1fr))}
.pd-g3{grid-template-columns:repeat(3,minmax(0,1fr))}
.pd-g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.pd-g6{grid-template-columns:repeat(6,minmax(0,1fr))}
.pd-main{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr)}
@media (max-width:1200px){.pd-g6{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:900px){.pd-g2,.pd-g3,.pd-g4,.pd-g6,.pd-main{grid-template-columns:1fr}.pd-title{font-size:22px}}
.pd-kpi{padding:18px 20px;display:flex;flex-direction:column;gap:6px;min-height:118px}
.pd-kpi-l{display:flex;justify-content:space-between;align-items:center;color:var(--muted);font-size:12.5px;font-weight:600;letter-spacing:.01em}
.pd-kpi-v{font-size:28px;font-weight:740;letter-spacing:-.025em;line-height:1.1;font-variant-numeric:tabular-nums}
.pd-kpi.sm{min-height:0;padding:14px 16px}
.pd-kpi.sm .pd-kpi-v{font-size:19px}
.pd-kpi-f{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:12px;margin-top:auto}
.pd-kpi.feat{border:1.5px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--brand),var(--brand2)) border-box;box-shadow:0 18px 40px -22px rgba(79,70,229,.55)}
.pd-kpi.feat .pd-kpi-v{background:linear-gradient(135deg,var(--brand),var(--brand2));-webkit-background-clip:text;background-clip:text;color:transparent}
.pd-pill{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:650;border-radius:999px;padding:3px 9px;white-space:nowrap;background:var(--soft);color:var(--muted)}
.pd-pill.success{background:var(--goodbg);color:var(--good)}
.pd-pill.critical{background:var(--badbg);color:var(--bad)}
.pd-pill.warning{background:var(--warnbg);color:var(--warn)}
.pd-pill.info{background:var(--infobg);color:var(--info)}
.pd-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid transparent;border-radius:11px;padding:9px 15px;font:600 13.5px Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none;white-space:nowrap;transition:filter .15s ease,transform .15s ease,background .15s ease}
.pd-btn:active{transform:scale(.98)}
.pd-btn.primary{background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;box-shadow:0 8px 20px -10px rgba(79,70,229,.7)}
.pd-btn.dark{background:var(--ink);color:#fff}
.pd-btn.ghost{background:#fff;border-color:var(--line);color:var(--ink)}
.pd-btn.ghost:hover{background:var(--soft)}
.pd-btn.danger{background:#fff;border-color:#fecdca;color:var(--bad)}
.pd-btn.danger:hover{background:#fef3f2}
.pd-btn:hover{filter:brightness(1.05)}
.pd-btn[disabled]{opacity:.55;cursor:default;filter:none}
.pd-btn.sm{padding:6px 11px;font-size:12.5px;border-radius:9px}
.pd-seg{display:inline-flex;flex-wrap:wrap;gap:2px;background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:3px}
.pd-seg a{font-size:12.5px;font-weight:600;color:var(--muted);text-decoration:none;padding:6px 11px;border-radius:9px;transition:background .15s ease,color .15s ease}
.pd-seg a:hover{color:var(--ink)}
.pd-seg a.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(16,24,40,.08),0 0 0 1px rgba(16,24,40,.04)}
.pd-range{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.pd-dates{display:inline-flex;gap:6px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:12px;padding:3px 4px 3px 10px}
.pd-dates span{color:var(--muted);font-size:12px}
.pd-input{font:500 13.5px Inter,system-ui,sans-serif;color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:8px 11px;background:#fff;outline:none;min-width:0}
.pd-input:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(79,70,229,.15)}
.pd-dates .pd-input{border:0;padding:6px 4px;box-shadow:none}
.pd-search{position:relative;flex:1;min-width:200px;max-width:380px}
.pd-search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted)}
.pd-search .pd-input{width:100%;padding-left:34px}
.pd-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.pd-form{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));align-items:end}
.pd-form .full{grid-column:1/-1}
.pd-field{display:grid;gap:6px;min-width:0}
.pd-field>span{font-size:12.5px;font-weight:600;color:var(--ink)}
.pd-field>em{font-style:normal;font-size:12px;color:var(--muted)}
.pd-field .pd-input{width:100%}
select.pd-input{appearance:none;background-image:linear-gradient(45deg,transparent 50%,#5c6170 50%),linear-gradient(135deg,#5c6170 50%,transparent 50%);background-position:calc(100% - 16px) 50%,calc(100% - 11px) 50%;background-size:5px 5px;background-repeat:no-repeat;padding-right:30px}
.pd-form-actions{display:flex;gap:10px;justify-content:flex-end;grid-column:1/-1}
.pd-table-wrap{overflow-x:auto}
.pd-table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}
.pd-table th{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;text-align:left;padding:11px 16px;background:#fafbfc;border-bottom:1px solid var(--line);white-space:nowrap}
.pd-table td{padding:12px 16px;border-bottom:1px solid #f1f2f5;vertical-align:middle}
.pd-table th.r,.pd-table td.r{text-align:right}
.pd-table tbody tr{transition:background .12s ease}
.pd-table tbody tr:hover{background:#fafbff}
.pd-table tr:last-child td{border-bottom:0}
.pd-table .strong{font-weight:650}
.pd-pos{color:var(--good);font-weight:650}
.pd-neg{color:var(--bad);font-weight:650}
.pd-muted{color:var(--muted)}
.pd-small{font-size:12.5px}
.pd-alert{display:flex;gap:12px;align-items:flex-start;border-radius:14px;padding:13px 16px;border:1px solid;font-size:13.5px}
.pd-alert b{display:block;margin-bottom:2px}
.pd-alert p{margin:0}
.pd-alert a{font-weight:600;text-decoration:underline;text-underline-offset:2px}
.pd-alert.info{background:#f5f7ff;border-color:#dfe3ff;color:#2d31a6}
.pd-alert.warning{background:#fffaeb;border-color:#fedf89;color:#93370d}
.pd-alert.critical{background:#fef3f2;border-color:#fecdca;color:#b42318}
.pd-alert.success{background:#ecfdf3;border-color:#abefc6;color:#067647}
.pd-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:40px 24px;gap:8px}
.pd-empty-ico{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand2));box-shadow:0 14px 30px -14px rgba(79,70,229,.7);margin-bottom:8px}
.pd-empty h3{margin:0;font-size:17px;font-weight:680}
.pd-empty p{margin:0 0 10px;color:var(--muted);max-width:420px}
.pd-upgrade{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;padding:18px 20px;border-radius:18px;border:1.5px solid transparent;background:linear-gradient(#fbfbff,#fbfbff) padding-box,linear-gradient(135deg,var(--brand),var(--brand2)) border-box}
.pd-upgrade .t{display:flex;gap:12px;align-items:center}
.pd-upgrade b{display:block}
.pd-upgrade p{margin:2px 0 0;color:var(--muted);font-size:13px}
.pd-bar{height:8px;border-radius:999px;background:#eef0f4;overflow:hidden}
.pd-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--brand),var(--brand2))}
.pd-brk{display:grid;gap:14px}
.pd-brk-row{display:grid;gap:6px}
.pd-brk-top{display:flex;justify-content:space-between;font-size:13.5px}
.pd-brk-top b{font-variant-numeric:tabular-nums}
.pd-drop{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;border:1.5px dashed #c9cdf8;background:#fafaff;border-radius:16px;padding:26px 18px;cursor:pointer;transition:background .15s ease,border-color .15s ease}
.pd-drop:hover,.pd-drop.over{background:#f2f3ff;border-color:var(--brand)}
.pd-drop input{display:none}
.pd-drop b{font-size:14px}
.pd-drop span{color:var(--muted);font-size:12.5px}
.pd-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:var(--soft);border:1px solid var(--line);border-radius:7px;padding:2px 6px}
.pd-details summary{cursor:pointer;color:var(--brand);font-weight:600;font-size:12.5px;list-style:none}
.pd-details summary::-webkit-details-marker{display:none}
.pd-details ul{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:4px;font-size:12.5px;color:var(--muted)}
.pd-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pd-inline .pd-input{width:110px}
.pd-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:50;overflow:hidden;background:transparent}
.pd-progress i{position:absolute;top:0;bottom:0;width:40%;background:linear-gradient(90deg,transparent,var(--brand),var(--brand2),transparent);animation:pd-slide 1.1s ease-in-out infinite}
@keyframes pd-slide{0%{left:-40%}100%{left:100%}}
.pd-busy{opacity:.55;pointer-events:none;transition:opacity .2s ease}
.pd-skel{border-radius:10px;background:linear-gradient(90deg,#eef0f4 25%,#f6f7fa 37%,#eef0f4 63%);background-size:400% 100%;animation:pd-shim 1.3s ease infinite}
@keyframes pd-shim{0%{background-position:100% 50%}100%{background-position:0 50%}}
.pd-legend{display:flex;gap:16px;color:var(--muted);font-size:12.5px}
.pd-legend span{display:inline-flex;gap:6px;align-items:center}
.pd-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
.pd-meter{display:grid;gap:8px;min-width:220px}
.pd-meter-top{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted)}
.pd-foot{color:var(--muted);font-size:12.5px;padding:14px 22px;border-top:1px solid var(--line)}
`;

export function PremiumStyles() {
  return <style dangerouslySetInnerHTML={{ __html: PREMIUM_CSS }} />;
}

const ICONS = {
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  trend: "M3 17l6-6 4 4 8-8M14 7h7v7",
  box: "M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
  tag: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  receipt: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zM9 8h6M9 12h6M9 16h4",
  calendar: "M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  check: "M20 6 9 17l-5-5",
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z",
  sparkle: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z",
  refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  plus: "M12 5v14M5 12h14",
  layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  wallet: "M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01",
  percent: "M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  cart: "M6 6h15l-1.5 9h-12L6 6zM6 6 5 3H2M9 20h.01M18 20h.01",
  truck: "M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  card: "M2 5h20v14H2zM2 10h20",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Wraps page content with the shared stylesheet, a top progress bar, and a dimmed state while loading. */
export function PremiumPage({ children }: { children: ReactNode }) {
  const navigation = useNavigation();
  const loading = navigation.state === "loading";
  return (
    <>
      <PremiumStyles />
      {navigation.state !== "idle" ? <div className="pd-progress" aria-hidden="true"><i /></div> : null}
      <div className={`pd pd-stack${loading ? " pd-busy" : ""}`} aria-busy={loading}>
        {children}
      </div>
    </>
  );
}

export function PageHeader({
  eyebrow,
  icon,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  icon?: IconName;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pd-hero">
      <div>
        <span className="pd-eyebrow">{icon ? <Icon name={icon} size={13} /> : null}{eyebrow}</span>
        <h1 className="pd-title">{title}</h1>
        {subtitle ? <p className="pd-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="pd-actions">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  icon,
  actions,
  children,
  flush = false,
  lift = false,
  footer,
}: {
  title?: string;
  subtitle?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  lift?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section className={`pd-card${lift ? " lift" : ""}`}>
      {title ? (
        <div className="pd-card-h">
          <div>
            <h3>{icon ? <span className="pd-ico"><Icon name={icon} size={15} /></span> : null}{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="pd-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={`pd-card-b${flush ? " flush" : ""}`}>{children}</div>
      {footer ? <div className="pd-foot">{footer}</div> : null}
    </section>
  );
}

export type Tone = "success" | "critical" | "warning" | "info" | "neutral";

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pd-pill ${tone}`}>{children}</span>;
}

export function Alert({ tone = "info", title, children }: { tone?: Exclude<Tone, "neutral">; title?: string; children?: ReactNode }) {
  const icon: IconName = tone === "success" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <div className={`pd-alert ${tone}`} role={tone === "critical" ? "alert" : "status"}>
      <Icon name={icon} size={17} />
      <div>
        {title ? <b>{title}</b> : null}
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}

export function ButtonLink({ to, children, variant = "ghost", icon, small = false }: { to: string; children: ReactNode; variant?: "primary" | "ghost" | "dark"; icon?: IconName; small?: boolean }) {
  return (
    <Link to={to} className={`pd-btn ${variant}${small ? " sm" : ""}`}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </Link>
  );
}

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: number | string }) {
  return <div className="pd-skel" style={{ height, width }} />;
}

/**
 * Per-route error boundary. Shopify auth responses still go through boundary.error
 * so embedded re-auth keeps working; everything else gets a friendly card instead of
 * a raw "Application Error" page.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return boundary.error(error);
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <s-page heading="Something went wrong">
      <PremiumStyles />
      <div className="pd pd-stack">
        <section className="pd-card">
          <div className="pd-empty">
            <div className="pd-empty-ico"><Icon name="alert" size={24} /></div>
            <h3>This page could not load</h3>
            <p>Your data is safe. Try again in a moment. If it keeps happening, contact support and mention: <span className="pd-code">{message.slice(0, 160)}</span></p>
            <div className="pd-actions">
              <button type="button" className="pd-btn primary" onClick={() => window.location.reload()}>
                <Icon name="refresh" size={14} />Try again
              </button>
              <Link to="/app" className="pd-btn ghost">Back to dashboard</Link>
            </div>
          </div>
        </section>
      </div>
    </s-page>
  );
}

/**
 * Downloads a CSV from an authenticated resource route. A plain link would open without
 * the App Bridge session token, so the file is fetched (App Bridge adds the token) and saved.
 */
export function ExportButton({ href, filename, label = "Export CSV" }: { href: string; filename: string; label?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  return (
    <button
      type="button"
      className="pd-btn ghost"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          const response = await fetch(href);
          if (!response.ok) throw new Error(String(response.status));
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          setState("idle");
          if (typeof shopify !== "undefined") shopify.toast.show("Export downloaded");
        } catch {
          setState("error");
          if (typeof shopify !== "undefined") shopify.toast.show("Export failed. Try again.", { isError: true });
        }
      }}
    >
      <Icon name="download" size={14} />
      {state === "busy" ? "Preparing…" : state === "error" ? "Retry export" : label}
    </button>
  );
}

export function Field({ label, children, hint, full = false }: { label: string; children: ReactNode; hint?: string; full?: boolean }) {
  return (
    <label className={`pd-field${full ? " full" : ""}`}>
      <span>{label}</span>
      {children}
      {hint ? <em>{hint}</em> : null}
    </label>
  );
}
