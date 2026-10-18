import type { AdminClient } from "./billing.server";

export async function adminQuery<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message ?? "GraphQL error").join("; "));
  }
  if (!json.data) throw new Error("Empty Admin API response");
  return json.data;
}
