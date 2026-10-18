import { useEffect } from "react";

/** App Bridge toast when the admin host is present, plus a banner the merchant can read. */
export function SaveToast({
  message,
  errors = [],
}: {
  message?: string | null;
  errors?: string[];
}) {
  useEffect(() => {
    if (!message || typeof shopify === "undefined") return;
    shopify.toast.show(message, { isError: errors.length > 0 });
  }, [message, errors.length]);

  if (!message && errors.length === 0) return null;
  return (
    <s-banner tone={errors.length > 0 ? "critical" : "success"} heading={message ?? "Check the form"}>
      {errors.map((error) => (
        <s-paragraph key={error}>{error}</s-paragraph>
      ))}
    </s-banner>
  );
}
