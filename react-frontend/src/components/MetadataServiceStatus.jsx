import { Button, Notice } from "./ui";

export default function MetadataServiceStatus({ metadata, readAt }) {
  if (!metadata) return null;
  const title = metadata.state === "ready" ? "Metadata API connected" : metadata.state === "loading" ? "Checking property metadata" : "Blockchain browsing available";
  return (
    <Notice
      title={title}
      tone={["unavailable", "stale", "mismatch"].includes(metadata.state) ? "warning" : "info"}
      role="status"
      action={metadata.state !== "disabled" && <Button type="button" variant="secondary" disabled={metadata.loading} onClick={metadata.refresh}>{metadata.loading ? "Checking…" : "Retry metadata"}</Button>}
    >
      {metadata.message}
      {readAt && <div className="small">Blockchain values last read {new Date(readAt).toLocaleTimeString()}. Refresh listings for the latest state.</div>}
    </Notice>
  );
}
