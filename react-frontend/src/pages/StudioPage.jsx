import { useEffect, useRef, useState } from "react";
import {
  Button,
  EmptyState,
  LoadingSkeleton,
  Notice,
  PageHeader,
} from "../components/ui";
import "../styles/studio.css";
import { studioDemo } from "../data/studio-demo";

const empty = {
  title: "",
  location: "",
  description: "",
  characteristics: {},
  assets: [],
};
const draftForm = (version) => ({
  title: version.title,
  location: version.location,
  description: version.description,
  characteristics: { ...version.characteristics },
  assets: version.assets.map((a) => ({ ...a })),
});
const canDiscard = (dirty) =>
  !dirty || window.confirm("Discard the unsaved draft changes?");
export default function StudioPage({ auth, navigate }) {
  const [organizations, setOrganizations] = useState([]);
  const [org, setOrg] = useState("");
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (!auth.session) {
      setLoading(false);
      return;
    }
    auth.client
      .organizations(controller.signal)
      .then(({ data }) => {
        if (active) {
          setOrganizations(data);
          setOrg(data[0]?.id || "");
        }
      })
      .catch((e) => {
        if (active && e.code !== "aborted") setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [auth.session?.user.id, auth.client]);
  if (!auth.session)
    return (
      <div className="page">
        <PageHeader
          eyebrow="BRICKSHARE STUDIO"
          title="A workspace for every property."
        />
        <EmptyState title="Sign in to open Studio">
          Connect your wallet, then sign in with a message to access your
          organization's content.
        </EmptyState>
      </div>
    );
  return (
    <div className="page studio-page">
      <PageHeader
        eyebrow="BRICKSHARE STUDIO"
        title="Property management"
        description="Shape the story. Keep the chain as the source of truth."
        actions={
          <Button variant="secondary" onClick={() => navigate("organizations")}>
            Manage organizations
          </Button>
        }
      />
      <div className="studio-context">
        <div>
          <label htmlFor="studio-organization">Organization workspace</label>
          <select
            id="studio-organization"
            value={org}
            onChange={(e) => { if (canDiscard(hasUnsaved)) { setOrg(e.target.value); setHasUnsaved(false); } }}
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.role}
              </option>
            ))}
          </select>
        </div>
        <span className="studio-private-badge">
          Private workspace · local development
        </span>
      </div>
      {error && (
        <Notice tone="warning" role="alert">
          {error}
        </Notice>
      )}
      {loading ? (
        <LoadingSkeleton />
      ) : org ? (
        <StudioWorkspace key={org} org={org} client={auth.client} onDirty={setHasUnsaved} />
      ) : (
        <EmptyState
          title="Start with an organization"
          action={
            <Button onClick={() => navigate("organizations")}>
              Create an organization
            </Button>
          }
        >
          Create a fictional organization or accept an invitation before
          managing metadata.
        </EmptyState>
      )}
    </div>
  );
}

export function StudioWorkspace({ org, client, onDirty }) {
  const [rows, setRows] = useState([]);
  const [permissions, setPermissions] = useState(null);
  const [id, setId] = useState("");
  const [detail, setDetail] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [form, setForm] = useState(empty);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState("content");
  const [historyId, setHistoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [filter, setFilter] = useState("");
  const [confirm, setConfirm] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const alive = useRef(true);
  const requests = useRef(new Set());
  const generation = useRef(0);
  const locked = useRef(false);
  const controller = () => {
    const c = new AbortController();
    requests.current.add(c);
    return c;
  };
  const loadList = async (signal) => {
    const response = await client.studioRecords(org, signal);
    if (alive.current) {
      setRows(response.data);
      setPermissions(response.permissions);
    }
    if (response.permissions.canPublish) {
      const options = await client.studioCandidates(org, signal);
      if (alive.current) setCandidates(options.data);
    }
    return response;
  };
  const loadDetail = async (recordId, signal) => {
    const version = ++generation.current;
    const response = await client.studioRecord(org, recordId, signal);
    if (alive.current && version === generation.current) {
      setDetail(response);
      setPermissions(response.permissions);
      const draft = response.data.versions.find((v) => v.state === "draft");
      setForm(draft ? draftForm(draft) : draftForm(response.data.versions[0]));
      setDirty(false);
      setHistoryId(response.data.versions[0]?.id || "");
    }
    return response;
  };
  useEffect(() => {
    alive.current = true;
    const c = controller();
    loadList(c.signal)
      .catch((e) => {
        if (alive.current && e.code !== "aborted") setError(e.message);
      })
      .finally(() => {
        requests.current.delete(c);
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
      generation.current++;
      for (const r of requests.current) r.abort();
      requests.current.clear();
    };
  }, [org, client]);
  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    const c = controller();
    setDetail(null);
    setLoading(true);
    loadDetail(id, c.signal)
      .catch((e) => {
        if (alive.current && !c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        requests.current.delete(c);
        if (alive.current && !c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id]);
  const action = async (task, success, { refresh = true } = {}) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    const c = controller();
    try {
      await task(c.signal);
      if (!alive.current) return;
      if (refresh) {
        await loadList(c.signal);
        if (id) await loadDetail(id, c.signal);
      }
      setConfirm("");
      setMessage(success);
    } catch (e) {
      if (alive.current && e.code !== "aborted") setError(e.message);
    } finally {
      requests.current.delete(c);
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const choose = (recordId) => {
    if (busy || !canDiscard(dirty)) return;
    setId(recordId);
    setCreating(false);
    setDirty(false);
    setConfirm("");
    setError(null);
    setMessage(null);
    setTab("content");
  };
  const version = detail?.data.versions.find((v) => v.state === "draft");
  const editable =
    permissions?.canEdit && (creating || !!version) && !detail?.data.archived;
  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setConfirm("");
  };
  const submit = (e) => {
    e.preventDefault();
    if (!editable) return;
    action(
      async (signal) => {
        if (creating) {
          const result = await client.studioCreate(
            org,
            {
              title: form.title,
              location: form.location,
              description: form.description,
              characteristics: form.characteristics,
            },
            signal,
          );
          if (alive.current) {
            setCreating(false);
            setId(result.id);
            setDirty(false);
          }
          await loadList(signal);
        } else
          await client.studioSave(
            org,
            id,
            { ...form, expectedRevision: version.revision },
            signal,
          );
      },
      creating
        ? "Fictional draft created. It has no blockchain identity."
        : "Draft saved.",
      { refresh: !creating },
    );
  };
  const previewAsset = async (asset) =>
    action(
      async (signal) => {
        const blob = await client.studioAsset(org, id, asset.id, signal);
        if (!alive.current) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = asset.name;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      "File downloaded.",
      { refresh: false },
    );
  const attach = (asset) => {
    if (form.assets.some((a) => a.assetId === asset.id))
      update(
        "assets",
        form.assets.filter((a) => a.assetId !== asset.id),
      );
    else
      update("assets", [
        ...form.assets,
        {
          assetId: asset.id,
          purpose:
            asset.kind === "document"
              ? "supporting_document"
              : form.assets.some((a) => a.purpose === "hero")
                ? "gallery"
                : "hero",
          altText: "",
          caption: asset.name,
        },
      ]);
  };
  const upload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (dirty) {
      setError("Save your draft before uploading a file.");
      return;
    }
    if (file.size > 1048576) {
      setError("Files must be at most 1 MiB.");
      return;
    }
    action(async (signal) => {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () =>
          reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });
      await client.studioUpload(
        org,
        id,
        { name: file.name, mimeType: file.type, base64 },
        signal,
      );
    }, "File stored privately. Select it as an attachment, add alt text and save the draft.");
  };
  const shownHistory = detail?.data.versions.find((v) => v.id === historyId);
  return (
    <>
      <div className="studio-stats">
        {[
          ["Properties", rows.length],
          [
            "Drafts",
            rows.filter((r) => r.state === "draft" && !r.archived).length,
          ],
          [
            "Published",
            rows.filter((r) => r.state === "published" && !r.archived).length,
          ],
          ["Archived", rows.filter((r) => r.archived).length],
        ].map(([label, count]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
      {error && (
        <Notice tone="warning" role="alert">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              if (canDiscard(dirty)) {
                setDirty(false);
                action(
                  async (signal) => {
                    await loadList(signal);
                    if (id) await loadDetail(id, signal);
                  },
                  "Workspace refreshed.",
                  { refresh: false },
                );
              }
            }}
          >
            Reload workspace
          </button>
        </Notice>
      )}
      {message && <Notice role="status">{message}</Notice>}
      <div className="studio-layout">
        <section className="panel studio-library" aria-label="Property library">
          <div className="studio-section-head">
            <div>
              <span className="eyebrow">YOUR COLLECTION</span>
              <h2>Properties</h2>
            </div>
            {permissions?.canEdit && (
              <Button
                disabled={busy}
                onClick={() => {
                  if (canDiscard(dirty)) {
                    setCreating(true);
                    setId("");
                    setDetail(null);
                    setForm({ ...empty, characteristics: {}, assets: [] });
                    setDirty(false);
                    setTab("content");
                    setError(null);
                  }
                }}
              >
                New draft
              </Button>
            )}
          </div>
          <label className="sr-only" htmlFor="studio-search">
            Search properties
          </label>
          <input
            id="studio-search"
            placeholder="Find a property…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {loading && !id ? (
            <LoadingSkeleton />
          ) : (
            <div className="studio-table-scroll">
              <table className="studio-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((r) =>
                      r.title.toLowerCase().includes(filter.toLowerCase()),
                    )
                    .map((r) => (
                      <tr key={r.id} className={id === r.id ? "selected" : ""}>
                        <td>
                          <button
                            className="studio-record-link"
                            disabled={busy}
                            onClick={() => choose(r.id)}
                          >
                            {r.title}
                          </button>
                          <small>
                            {r.propertyId
                              ? "Linked chain identity"
                              : "Fictional · unlinked"}{" "}
                            · v{r.version}
                          </small>
                        </td>
                        <td>
                          <span
                            className={
                              "studio-state " +
                              (r.archived ? "archived" : r.state)
                            }
                          >
                            {r.archived ? "archived" : r.state}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {!rows.length && !loading && (
            <p className="muted small">
              Your collection starts here. Create a fictional draft to explore
              the workflow.
            </p>
          )}
          <p className="studio-library-note">
            Drafts are private to this organization. Metadata cannot change
            prices, supply or wallet permissions.
          </p>
        </section>
        <section className="panel studio-editor" aria-label="Property editor">
          {!creating && !id ? (
            <EmptyState title="Give a property its story">
              Select a record or create a fictional draft. Published metadata
              reaches the consumer catalog only after an owner links a verified
              chain identity.
            </EmptyState>
          ) : loading && !creating ? (
            <LoadingSkeleton />
          ) : (
            (creating || detail) && (
              <>
                <div className="studio-section-head">
                  <div>
                    <span className="eyebrow">
                      {creating
                        ? "NEW FICTIONAL DRAFT"
                        : `VERSION ${version?.version || detail.data.versions[0].version} · ${permissions?.role}`}
                    </span>
                    <h2>
                      {creating
                        ? "Create a property draft"
                        : detail.data.versions[0].title}
                    </h2>
                  </div>
                  <span
                    className={
                      "studio-state " +
                      (detail?.data.archived
                        ? "archived"
                        : version
                          ? "draft"
                          : "published")
                    }
                  >
                    {dirty
                      ? "Unsaved changes"
                      : detail?.data.archived
                        ? "Archived"
                        : version
                          ? "Private draft"
                          : "Read-only version"}
                  </span>
                </div>
                {detail?.data.association && (
                  <div className="studio-association">
                    <strong>
                      {detail.data.association.canonical
                        ? "Indexed chain identity"
                        : "Invalidated chain identity"}
                    </strong>
                    <span>
                      Chain {detail.data.association.chainId} · property #
                      {detail.data.association.onChainId}
                    </span>
                    <code>{detail.data.association.contractAddress}</code>
                    <small>
                      Identity: {detail.data.propertyId}. Publication checks
                      live provenance and freshness.
                    </small>
                  </div>
                )}
                <div
                  className="studio-tabs"
                  role="tablist"
                  aria-label="Studio sections"
                >
                  {["content", "media", "preview", "history"]
                    .filter(
                      (t) => !creating || ["content", "preview"].includes(t),
                    )
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setTab(t)}
                      >
                        {t === "content"
                          ? "Details"
                          : t === "media"
                            ? "Images & documents"
                            : t === "preview"
                              ? "Preview"
                              : "Version history"}
                      </button>
                    ))}
                </div>
                {tab === "content" && (
                  <form className="studio-form" onSubmit={submit}>
                    {creating && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setForm({
                            ...studioDemo,
                            characteristics: { ...studioDemo.characteristics },
                            assets: [],
                          });
                          setDirty(true);
                        }}
                      >
                        Use fictional example
                      </Button>
                    )}
                    <fieldset disabled={!editable || busy}>
                      <label htmlFor="studio-title">Property title</label>
                      <input
                        id="studio-title"
                        value={form.title}
                        onChange={(e) => update("title", e.target.value)}
                        minLength={3}
                        maxLength={160}
                        placeholder="FICTIONAL Cedar Residence"
                        required
                      />
                      <label htmlFor="studio-location">Location</label>
                      <input
                        id="studio-location"
                        value={form.location}
                        maxLength={200}
                        onChange={(e) => update("location", e.target.value)}
                        placeholder="Fictional City"
                      />
                      <label htmlFor="studio-description">Description</label>
                      <textarea
                        id="studio-description"
                        value={form.description}
                        onChange={(e) => update("description", e.target.value)}
                        maxLength={10000}
                        rows={8}
                        placeholder="Describe the property. Avoid financial promises or personal information."
                      />
                      <small>
                        {form.description.length.toLocaleString()} / 10,000
                        characters
                      </small>
                      <div className="studio-characteristics">
                        <div>
                          <label htmlFor="studio-type">Property type</label>
                          <select
                            id="studio-type"
                            value={form.characteristics.propertyType || ""}
                            onChange={(e) => {
                              const next = { ...form.characteristics };
                              if (e.target.value)
                                next.propertyType = e.target.value;
                              else delete next.propertyType;
                              update("characteristics", next);
                            }}
                          >
                            <option value="">Not specified</option>
                            {[
                              "apartment",
                              "house",
                              "commercial",
                              "land",
                              "other",
                            ].map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        {[
                          ["bedrooms", "Bedrooms", 0, 100, 1],
                          ["bathrooms", "Bathrooms", 0, 100, 0.1],
                          ["areaSqm", "Area (m²)", 1, 1000000, 0.01],
                          ["yearBuilt", "Year built", 1600, 2200, 1],
                        ].map(([key, label, min, max, step]) => (
                          <div key={key}>
                            <label htmlFor={"studio-" + key}>{label}</label>
                            <input
                              id={"studio-" + key}
                              type="number"
                              min={min}
                              max={max}
                              step={step}
                              value={form.characteristics[key] ?? ""}
                              onChange={(e) => {
                                const next = { ...form.characteristics };
                                if (e.target.value === "") delete next[key];
                                else next[key] = Number(e.target.value);
                                update("characteristics", next);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </fieldset>
                    {editable && (
                      <div className="studio-action-row">
                        <Button type="submit" disabled={busy}>
                          {busy
                            ? "Saving…"
                            : creating
                              ? "Create fictional draft"
                              : "Save draft"}
                        </Button>
                        <span className="small muted">
                          Saving never publishes or signs a transaction.
                        </span>
                      </div>
                    )}
                  </form>
                )}
                {tab === "media" && detail && (
                  <div className="studio-media">
                    <p className="small muted">
                      PNG, JPEG and WebP are re-encoded. PDF and TXT are
                      download-only. Maximum 1 MiB per file. No identity
                      documents.
                    </p>
                    {editable && (
                      <label className="studio-upload">
                        Add a private file
                        <input
                          aria-label="Upload image or document"
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp,.pdf,.txt"
                          disabled={busy}
                          onChange={upload}
                        />
                      </label>
                    )}
                    {detail.data.assets.length === 0 && (
                      <EmptyState title="No files yet">
                        Upload an image or supporting document. Files stay
                        private until attached to a published, verified
                        property.
                      </EmptyState>
                    )}
                    {detail.data.assets.map((asset) => {
                      const link = form.assets.find(
                        (a) => a.assetId === asset.id,
                      );
                      return (
                        <article className="studio-asset" key={asset.id}>
                          {asset.kind === "image" && (
                            <PrivateImage
                              client={client}
                              org={org}
                              record={id}
                              asset={asset}
                            />
                          )}
                          <div className="studio-asset-body">
                            <strong>{asset.name}</strong>
                            <small>
                              {asset.mimeType} ·{" "}
                              {(asset.byteSize / 1024).toFixed(1)} KiB
                            </small>
                            <code title={asset.sha256}>{asset.sha256}</code>
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => previewAsset(asset)}
                            >
                              Download file
                            </Button>
                            {editable && (
                              <label className="studio-checkbox">
                                <input
                                  type="checkbox"
                                  checked={!!link}
                                  disabled={busy}
                                  onChange={() => attach(asset)}
                                />{" "}
                                Include in this version
                              </label>
                            )}
                            {link && (
                              <div className="studio-attachment-fields">
                                {asset.kind === "image" && (
                                  <>
                                    <label>
                                      Image purpose
                                      <select
                                        value={link.purpose}
                                        disabled={!editable || busy}
                                        onChange={(e) =>
                                          update(
                                            "assets",
                                            form.assets.map((a) =>
                                              a.assetId === asset.id
                                                ? {
                                                    ...a,
                                                    purpose: e.target.value,
                                                  }
                                                : a,
                                            ),
                                          )
                                        }
                                      >
                                        <option value="hero">
                                          Cover image
                                        </option>
                                        <option value="gallery">Gallery</option>
                                      </select>
                                    </label>
                                    <label>
                                      Alternative text
                                      <input
                                        value={link.altText}
                                        maxLength={240}
                                        disabled={!editable || busy}
                                        onChange={(e) =>
                                          update(
                                            "assets",
                                            form.assets.map((a) =>
                                              a.assetId === asset.id
                                                ? {
                                                    ...a,
                                                    altText: e.target.value,
                                                  }
                                                : a,
                                            ),
                                          )
                                        }
                                      />
                                    </label>
                                  </>
                                )}
                                <label>
                                  Caption / document title
                                  <input
                                    value={link.caption}
                                    maxLength={240}
                                    disabled={!editable || busy}
                                    onChange={(e) =>
                                      update(
                                        "assets",
                                        form.assets.map((a) =>
                                          a.assetId === asset.id
                                            ? { ...a, caption: e.target.value }
                                            : a,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                    {editable && (
                      <Button disabled={busy} onClick={submit}>
                        Save attachments
                      </Button>
                    )}
                  </div>
                )}
                {tab === "preview" && (
                  <div className="studio-preview">
                    <span className="studio-private-badge">
                      Private metadata preview
                      {dirty ? " · includes unsaved edits" : ""}
                    </span>
                    <h2>{form.title || "Untitled property"}</h2>
                    <p className="muted">
                      {form.location || "Location not supplied"}
                    </p>
                    {form.assets
                      .filter((a) => a.purpose === "hero")
                      .map((link) => {
                        const asset = detail?.data.assets.find(
                          (a) => a.id === link.assetId,
                        );
                        return asset ? (
                          <PrivateImage
                            key={asset.id}
                            client={client}
                            org={org}
                            record={id}
                            asset={asset}
                            alt={link.altText}
                          />
                        ) : null;
                      })}
                    <p className="studio-description">
                      {form.description ||
                        "Add a description to tell the story."}
                    </p>
                    <dl className="studio-preview-facts">
                      {Object.entries(form.characteristics).map(
                        ([key, value]) => (
                          <div key={key}>
                            <dt>
                              {
                                {
                                  propertyType: "Property type",
                                  bedrooms: "Bedrooms",
                                  bathrooms: "Bathrooms",
                                  areaSqm: "Area (m²)",
                                  yearBuilt: "Year built",
                                }[key]
                              }
                            </dt>
                            <dd>{String(value)}</dd>
                          </div>
                        ),
                      )}
                    </dl>
                    <p className="small muted">
                      Operator-supplied content. Preview does not create a
                      blockchain property or establish legal ownership.
                    </p>
                  </div>
                )}
                {tab === "history" && detail && (
                  <div className="studio-history">
                    <label htmlFor="studio-history">Version</label>
                    <select
                      id="studio-history"
                      value={historyId}
                      onChange={(e) => setHistoryId(e.target.value)}
                    >
                      {detail.data.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          Version {v.version} · {v.state} · revision{" "}
                          {v.revision}
                        </option>
                      ))}
                    </select>
                    {shownHistory && (
                      <article>
                        <h3>{shownHistory.title}</h3>
                        <p>{shownHistory.location}</p>
                        <p className="studio-description">
                          {shownHistory.description}
                        </p>
                        <p className="small muted">
                          {shownHistory.assets.length} attachments ·{" "}
                          {shownHistory.publishedAt
                            ? "Published " +
                              new Date(
                                shownHistory.publishedAt,
                              ).toLocaleString()
                            : "Never published"}
                        </p>
                      </article>
                    )}
                    <h3>Activity</h3>
                    <ol>
                      {detail.data.history.map((entry, index) => (
                        <li key={index}>
                          <span>{entry.action}</span>
                          <time>
                            {new Date(entry.createdAt).toLocaleString()}
                          </time>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {!creating && detail && (
                  <div className="studio-publication">
                    <h3>Publication controls</h3>
                    <p className="small muted">
                      {detail.data.propertyId
                        ? "Linked metadata can appear in the consumer marketplace after verification."
                        : "Unlinked fictional content stays inside this workspace, including after publication."}{" "}
                      Only organization owners can publish, archive or associate
                      records.
                    </p>
                    {permissions?.canEdit && !version && (
                      <Button
                        disabled={busy}
                        variant="secondary"
                        onClick={() =>
                          action(
                            (signal) => client.studioRevise(org, id, signal),
                            "A new editable version is ready.",
                          )
                        }
                      >
                        Create new version
                      </Button>
                    )}
                    {permissions?.canPublish && (
                      <>
                        <div className="studio-action-row">
                          {version && !detail.data.archived && (
                            <Button
                              disabled={busy || dirty}
                              onClick={() => setConfirm("publish")}
                            >
                              Review publication
                            </Button>
                          )}
                          {!detail.data.archived && (
                            <Button
                              variant="secondary"
                              disabled={busy || dirty}
                              onClick={() => setConfirm("archive")}
                            >
                              Archive record
                            </Button>
                          )}
                        </div>
                        {!detail.data.propertyId && !detail.data.archived && (
                          <details>
                            <summary>
                              Link a verified blockchain property
                            </summary>
                            <p className="small muted">
                              Sign in as both an organization owner and the
                              contract-owner wallet. Choose an indexed identity;
                              names are labels only. This identity cannot be
                              changed after association. Run the indexer if no
                              candidates appear.
                            </p>
                            <label htmlFor="studio-property-id">
                              Indexed property identity
                            </label>
                            <select
                              id="studio-property-id"
                              value={propertyId}
                              onChange={(e) => setPropertyId(e.target.value)}
                            >
                              <option value="">
                                Select a verified deployment / property
                              </option>
                              {candidates.map((p) => (
                                <option key={p.propertyId} value={p.propertyId}>
                                  {p.name} · chain {p.chainId} · #{p.onChainId}{" "}
                                  · {p.contractAddress} · {p.propertyId}
                                </option>
                              ))}
                            </select>
                            <Button
                              variant="secondary"
                              disabled={busy || dirty || !propertyId}
                              onClick={() =>
                                action(
                                  (signal) =>
                                    client.studioAssociate(
                                      org,
                                      id,
                                      propertyId.trim(),
                                      signal,
                                    ),
                                  "Verified property identity associated.",
                                )
                              }
                            >
                              Verify and associate
                            </Button>
                          </details>
                        )}
                        {confirm && (
                          <div className="studio-confirm" role="alert">
                            <strong>
                              {confirm === "publish"
                                ? "Publish this saved metadata version?"
                                : "Archive this record and withdraw its public metadata?"}
                            </strong>
                            <p>
                              {confirm === "publish"
                                ? "Attached files may become publicly downloadable for a linked property. Check content, file attachments and alt text."
                                : "Previously downloaded files cannot be recalled. Version history remains available."}
                            </p>
                            <div className="studio-action-row">
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  action(
                                    (signal) =>
                                      confirm === "publish"
                                        ? client.studioPublish(
                                            org,
                                            id,
                                            version.revision,
                                            signal,
                                          )
                                        : client.studioArchive(org, id, signal),
                                    confirm === "publish"
                                      ? "Metadata published."
                                      : "Record archived.",
                                  )
                                }
                              >
                                Confirm{" "}
                                {confirm === "publish"
                                  ? "publication"
                                  : "archive"}
                              </Button>
                              <Button
                                variant="secondary"
                                disabled={busy}
                                onClick={() => setConfirm("")}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )
          )}
        </section>
      </div>
    </>
  );
}

function PrivateImage({ client, org, record, asset, alt }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let valid = true;
    let objectUrl;
    const c = new AbortController();
    client
      .studioAsset(org, record, asset.id, c.signal)
      .then((blob) => {
        if (valid) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch((e) => {
        if (valid && e.code !== "aborted")
          setError("Image unavailable. Check API access or file integrity.");
      });
    return () => {
      valid = false;
      c.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, org, record, asset.id]);
  return url ? (
    <img className="studio-private-image" src={url} alt={alt || asset.name} />
  ) : (
    <div className="studio-image-placeholder">
      {error || "Loading private image…"}
    </div>
  );
}
