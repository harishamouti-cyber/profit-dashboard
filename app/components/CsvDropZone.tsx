import { useRef, useState } from "react";
import { useFetcher } from "react-router";
import { SaveToast } from "./SaveToast";
import { Icon } from "./ui";

const MAX_BYTES = 5 * 1024 * 1024;

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
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const data = fetcher.data && typeof fetcher.data === "object" ? (fetcher.data as { message?: string; errors?: string[] }) : null;
  const busy = fetcher.state !== "idle";

  const send = (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setLocalError("Please choose a .csv file.");
      return;
    }
    if (file.size === 0) {
      setLocalError("That file is empty.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("That file is larger than 5 MB. Split it into smaller files and upload them one by one.");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const body = new FormData();
      body.set("intent", intent);
      body.set("csv", String(reader.result ?? ""));
      fetcher.submit(body, { method: "post" });
    };
    reader.onerror = () => setLocalError("The file could not be read. Try again.");
    reader.readAsText(file);
  };

  return (
    <div className="pd-stack" style={{ gap: 12 }}>
      <label
        className={`pd-drop${over ? " over" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          send(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={input}
          type="file"
          accept={accept}
          disabled={busy}
          onChange={(event) => {
            send(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <span className="pd-ico"><Icon name="upload" size={16} /></span>
        <b>{busy ? `Importing ${fileName ?? "file"}…` : label}</b>
        <span>{busy ? "This can take a few seconds for large files." : "Drag a CSV here, or click to choose one. Max 5 MB."}</span>
      </label>
      {localError ? <SaveToast message={localError} errors={[localError]} /> : null}
      {!busy ? <SaveToast message={data?.message} errors={data?.errors ?? []} /> : null}
    </div>
  );
}
