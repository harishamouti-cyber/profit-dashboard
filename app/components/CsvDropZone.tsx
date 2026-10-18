import { useFetcher } from "react-router";

export function CsvDropZone({
  intent,
  label,
  accept = ".csv,text/csv",
}: {
  intent: string;
  label: string;
  accept?: string;
}) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <s-drop-zone
        accept={accept}
        label={label}
        name="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const body = new FormData();
            body.set("intent", intent);
            body.set("csv", String(reader.result ?? ""));
            fetcher.submit(body, { method: "post" });
          };
          reader.readAsText(file);
        }}
      />
      {fetcher.data && typeof fetcher.data === "object" && "message" in fetcher.data ? (
        <s-paragraph>{String((fetcher.data as { message: string }).message)}</s-paragraph>
      ) : null}
    </fetcher.Form>
  );
}
