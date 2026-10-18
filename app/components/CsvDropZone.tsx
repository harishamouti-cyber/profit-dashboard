import { useFetcher } from "react-router";
import { SaveToast } from "./SaveToast";

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
  const data = fetcher.data && typeof fetcher.data === "object" ? (fetcher.data as { message?: string; errors?: string[] }) : null;
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
      <SaveToast message={data?.message} errors={data?.errors ?? []} />
    </fetcher.Form>
  );
}
