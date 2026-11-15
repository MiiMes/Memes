export function readPage() {
  const page = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return ["explore", "reactions", "favorites", "api"].includes(page) ? page : "home";
}

export function getLogicalRoute(action, { q, kind, locale, providers }) {
  const route = {
    search: "/api/media/search",
    trending: "/api/media/trending",
    "trending-searches": "/api/trending-searches",
    categories: "/api/categories",
  }[action];
  const params = new URLSearchParams({ providers: providers.join(","), locale });
  if (action === "search") params.set("q", q);
  if (action === "search" || action === "trending" || action === "categories") {
    params.set("kind", kind);
  }
  return `GET ${route}?${params}`;
}
