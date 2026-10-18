import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { requireFreshShop } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireFreshShop(request);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    plan: shop.plan,
    onboardingDone: shop.onboardingDone,
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

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

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
