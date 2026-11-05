export default function PropertyMetadataStatus({ property, detailed = false }) {
  const info = property.metadataInfo;
  if (property.sample || !info) return null;
  const source = info.source === "api" ? `Published metadata · version ${info.version}` : info.source === "local" ? "Local presentation metadata" : info.status === "not_published" ? "No published metadata" : "Metadata unavailable";
  const missing = info.status === "not_indexed" ? "This listing is not indexed yet." : info.status === "not_published" ? "No metadata version has been published for this listing." : ["stale", "mismatch", "unavailable"].includes(info.status) ? "API metadata is unavailable or could not be verified." : null;
  return (
    <div className={detailed ? "metadata-provenance panel" : "metadata-provenance compact"}>
      <p><strong>{source}</strong></p>
      {detailed && <>
        <p>Price, supply, availability and your holdings come from blockchain RPC reads.</p>
        {info.source === "api" && <p>Indexed snapshot at block {info.indexedBlock} · local and unfinalized. Operator content does not verify property title.</p>}
        {info.source === "api" && info.title && <p>Published title: {info.title}</p>}
        {info.usedLocalFallback && <p>Some presentation fields use the local metadata catalog.</p>}
        {missing && <p>{missing} Wallet actions continue through the contract.</p>}
        {info.unavailableAssets > 0 && <p>{info.unavailableAssets} published asset reference(s) have no usable public URL.</p>}
      </>}
    </div>
  );
}
