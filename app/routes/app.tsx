import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { RouteErrorBoundary } from "../components/ui";
import { requireFreshShop } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, redirect } = await requireFreshShop(request);
  // No active subscription (new install, reinstall, or cancelled): send the merchant to choose a plan.
  const path = new URL(request.url).pathname;
  if (shop.plan === "NONE" && !path.startsWith("/app/billing") && typeof redirect === "function") {
    throw redirect("/app/billing");
  }
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    plan: shop.plan,
    onboardingDone: shop.onboardingDone,
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  useEffect(() => {
    if (typeof shopify === "undefined") return;
    shopify.loading(navigation.state !== "idle");
  }, [navigation.state]);

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/products">Products</s-link>
        <s-link href="/app/costs">Costs</s-link>
        <s-link href="/app/ad-spend">Ad spend</s-link>
        <s-link href="/app/expenses">Expenses</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/billing">Plan</s-link>
        <s-link href="/app/onboarding">Onboarding</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export const ErrorBoundary = RouteErrorBoundary;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
