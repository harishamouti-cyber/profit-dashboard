import { Outlet } from "react-router";

export const loader = () => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PREVIEW !== "1") {
    throw new Response("Not found", { status: 404 });
  }
  return null;
};

export default function PreviewLayout() {
  return (
    <>
      <script src="https://cdn.shopify.com/shopifycloud/polaris.js" />
      <Outlet />
    </>
  );
}
