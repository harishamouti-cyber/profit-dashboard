import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config();

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://profit:profit@localhost:5432/profit_dashboard",
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY ?? "test",
      SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET ?? "test",
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL ?? "https://example.com",
      SCOPES: process.env.SCOPES ?? "read_orders,read_products,read_inventory",
    },
  },
});
