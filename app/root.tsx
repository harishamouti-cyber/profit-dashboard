import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" type="image/png" sizes="32x32" href="/brand/profit-icon-32.png" />
        <link rel="icon" type="image/png" sizes="64x64" href="/brand/profit-icon-64.png" />
        <link rel="icon" type="image/svg+xml" href="/brand/icon.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/brand/profit-icon-180.png" />
        <meta name="theme-color" content="#0b0d12" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{notFound ? "Page not found" : "Something went wrong"} · Penni</title>
        <link rel="icon" type="image/png" sizes="32x32" href="/brand/profit-icon-32.png" />
        <Meta />
        <Links />
      </head>
      <body style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#0b0d12", background: "#f6f6f7", margin: 0 }}>
        <main style={{ maxWidth: 520, margin: "15vh auto", padding: "0 24px" }}>
          <img src="/brand/icon.svg" alt="" width={48} height={48} style={{ borderRadius: 12 }} />
          <h1 style={{ letterSpacing: "-0.03em" }}>{notFound ? "Page not found" : "Something went wrong"}</h1>
          <p style={{ color: "#52525b" }}>
            {notFound
              ? "This page doesn't exist. Open Penni from your Shopify admin."
              : "Please refresh the page. If it keeps happening, reopen the app from your Shopify admin."}
          </p>
          <a href="/" style={{ color: "#0b0d12", fontWeight: 600 }}>Go to the home page</a>
        </main>
        <Scripts />
      </body>
    </html>
  );
}
