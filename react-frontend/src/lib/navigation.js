export function parseRoute(hash) {
  const raw = hash.replace(/^#/, "");
  const [path, query] = raw.split("?");
  const params = new URLSearchParams(query);
  const mode = params.get("catalog") === "sample" ? "sample" : "live";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "property" && parts.length === 2) {
    try {
      return { page: "property", id: decodeURIComponent(parts[1]), mode };
    } catch {
      return { page: "home", mode: "live" };
    }
  }
  const page = ["marketplace", "portfolio", "admin"].includes(parts[0])
    ? parts[0]
    : "home";
  return { page, mode: page === "marketplace" ? mode : "live" };
}

export function routeHref(page, { id, mode = "live" } = {}) {
  const path =
    page === "property"
      ? `/property/${encodeURIComponent(id)}`
      : page === "home"
      ? "/"
      : `/${page}`;
  return `#${path}${
    mode === "sample" && ["property", "marketplace"].includes(page)
      ? "?catalog=sample"
      : ""
  }`;
}
