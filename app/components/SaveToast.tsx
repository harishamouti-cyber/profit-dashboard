import { useEffect } from "react";
import { Alert } from "./ui";

/** App Bridge toast when the admin host is present, plus an inline alert the merchant can read. */
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
  const shown = errors.slice(0, 8);
  return (
    <Alert tone={errors.length > 0 ? "warning" : "success"} title={message ?? "Check the form"}>
      {shown.length > 0 ? (
        <>
          {shown.map((error) => (
            <span key={error} style={{ display: "block" }}>{error}</span>
          ))}
          {errors.length > shown.length ? <span style={{ display: "block" }}>…and {errors.length - shown.length} more</span> : null}
        </>
      ) : null}
    </Alert>
  );
}
