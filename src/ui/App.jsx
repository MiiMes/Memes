import { useCallback, useEffect, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const PROVIDERS = ["giphy", "tenor", "klipy"];
const PROVIDER_NAMES = { giphy: "GIPHY", tenor: "Tenor", klipy: "KLIPY" };
const LOCALES = [
  ["en_US", "English · United States"],
  ["en_GB", "English · United Kingdom"],
  ["es_ES", "Español · España"],
  ["es_MX", "Español · México"],
  ["fr_FR", "Français · France"],
  ["de_DE", "Deutsch · Deutschland"],
  ["pt_BR", "Português · Brasil"],
  ["ja_JP", "日本語 · 日本"],
];
const REACTIONS = [
  "happy", "sad", "angry", "facepalm", "laughing", "love", "confused",
  "eye roll", "clapping", "celebrate", "awkward", "sorry", "good morning",
  "thank you", "mind blown", "shrug",
];
const MEDIA_TYPES = [
  ["gif", "GIFs"],
  ["sticker", "Stickers"],
  ["clip", "Clips"],
];
const API_ACTIONS = [
  ["search", "Search"],
  ["trending", "Trending media"],
  ["trending-searches", "Trending searches"],
  ["categories", "Categories"],
];
const PROVIDER_CONFIG = {
  giphy: {
    key: import.meta.env.VITE_GIPHY_API_KEY ?? "",
  },
  tenor: {
    key: import.meta.env.VITE_TENOR_API_KEY ?? "",
    clientKey: import.meta.env.VITE_TENOR_CLIENT_KEY ?? "",
  },
  klipy: {
    key: import.meta.env.VITE_KLIPY_API_KEY ?? "",
  },
};

function readPage() {
  const page = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return ["explore", "reactions", "api"].includes(page) ? page : "home";
}

function getLogicalRoute(action, { q, kind, locale, providers }) {
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

function safeRequestUrl(value) {
  const url = new URL(value);
  for (const key of ["api_key", "key", "client_key"]) {
    if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
  }
  url.pathname = url.pathname.replace(/(\/api\/v1\/)[^/]+(?=\/)/, "$1[redacted]");
  return `${url.origin}${url.pathname}${url.search}`;
}

function normalizeGiphy(item, kind) {
  const images = item.images ?? {};
  const imageUrl =
    images.fixed_width?.url ??
    images.fixed_height?.url ??
    images.original?.url ??
    "";
  return {
    id: String(item.id ?? item.slug ?? imageUrl),
    title: item.title || item.slug || "GIPHY result",
    imageUrl,
    pageUrl: item.url ?? "",
    provider: "giphy",
    kind,
    username: item.username || item.user?.username || "",
  };
}

function normalizeTenor(item) {
  const formats = item.media_formats ?? {};
  const imageUrl =
    formats.tinygif?.url ??
    formats.gif?.url ??
    formats.mediumgif?.url ??
    "";
  return {
    id: String(item.id ?? imageUrl),
    title: item.content_description || item.title || "Tenor result",
    imageUrl,
    pageUrl: item.url ?? "",
    provider: "tenor",
    kind: "gif",
    username: item.creator?.name ?? "",
  };
}

function normalizeKlipy(item, kind) {
  const sizes = kind === "clip"
    ? [item.file?.hd, item.file?.md, item.file?.sm, item.file?.xs]
    : [item.file?.sm, item.file?.md, item.file?.xs, item.file?.hd];
  const files = sizes.filter(Boolean);
  const videoUrl = files.map((file) => file.mp4?.url ?? file.webm?.url).find(Boolean);
  const imageUrl = kind === "clip"
    ? videoUrl ?? ""
    : files.map((file) => file.webp?.url ?? file.gif?.url).find(Boolean) ?? item.preview_url ?? "";
  return {
    id: String(item.id ?? item.slug ?? imageUrl),
    title: item.title ?? item.slug ?? "KLIPY result",
    imageUrl,
    pageUrl: item.url ?? "",
    provider: "klipy",
    kind,
    username: item.username ?? "",
    video: Boolean(videoUrl),
  };
}

function mediaItems(provider, action, payload, kind) {
  if (action === "trending-searches") {
    const terms = provider === "giphy" ? payload.data : payload.results;
    return (terms ?? []).map((term) => ({ title: String(term), query: String(term) }));
  }
  if (action === "categories") {
    const entries = provider === "giphy" ? payload.data : provider === "tenor" ? payload.tags : payload.data?.categories;
    return (entries ?? []).map((item, index) => ({
      id: `${provider}-category-${index}`,
      title: item.name ?? item.searchterm ?? item.category ?? item.slug ?? "Category",
      query: item.searchterm ?? item.query ?? item.name ?? item.category ?? item.slug ?? "",
      imageUrl:
        item.gif?.images?.fixed_width?.url ??
        item.image ??
        item.preview_url ??
        "",
      provider,
      kind,
    }));
  }
  const entries = provider === "giphy"
    ? payload.data
    : provider === "tenor"
      ? payload.results
      : payload.data?.data;
  const normalize = provider === "giphy"
    ? (item) => normalizeGiphy(item, kind)
    : provider === "tenor"
      ? normalizeTenor
      : (item) => normalizeKlipy(item, kind);
  return (entries ?? []).map(normalize);
}

function makeRequest(provider, action, options) {
  const { q, kind, locale, limit } = options;
  if (provider === "giphy") {
    if (!PROVIDER_CONFIG.giphy.key) {
      return { error: "Set VITE_GIPHY_API_KEY to enable GIPHY." };
    }
    if (kind === "clip" && action !== "trending-searches") {
      return { unsupported: "GIPHY Clips are available through its SDK, not this public API." };
    }
    if (action === "categories" && kind !== "gif") {
      return { unsupported: "GIPHY categories in this starter are available for GIFs only." };
    }
    const path = action === "categories"
      ? "/v1/gifs/categories"
      : action === "trending-searches"
        ? "/v1/trending/searches"
        : `/v1/${kind === "sticker" ? "stickers" : "gifs"}/${action === "search" ? "search" : "trending"}`;
    const url = new URL(`https://api.giphy.com${path}`);
    url.searchParams.set("api_key", PROVIDER_CONFIG.giphy.key);
    if (action !== "categories") url.searchParams.set("limit", String(limit));
    if (action === "search") url.searchParams.set("q", q);
    if (action === "search" || action === "trending") {
      url.searchParams.set("rating", "g");
      url.searchParams.set("lang", locale.split("_")[0]);
      if (locale.includes("_")) url.searchParams.set("country_code", locale.split("_")[1]);
    }
    if (action === "categories") url.searchParams.set("lang", locale.split("_")[0]);
    return { url };
  }

  if (provider === "tenor") {
    if (!PROVIDER_CONFIG.tenor.key || !PROVIDER_CONFIG.tenor.clientKey) {
      return { error: "Set VITE_TENOR_API_KEY and VITE_TENOR_CLIENT_KEY to enable Tenor." };
    }
    if (action !== "trending-searches" && kind !== "gif") {
      return { unsupported: "Tenor results in this starter are GIF-only." };
    }
    const path = {
      search: "/v2/search",
      trending: "/v2/trending",
      "trending-searches": "/v2/trending_terms",
      categories: "/v2/categories",
    }[action];
    const url = new URL(`https://tenor.googleapis.com${path}`);
    url.searchParams.set("key", PROVIDER_CONFIG.tenor.key);
    url.searchParams.set("client_key", PROVIDER_CONFIG.tenor.clientKey);
    url.searchParams.set("locale", locale);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("contentfilter", "medium");
    if (action === "search") {
      url.searchParams.set("q", q);
      url.searchParams.set("media_filter", "tinygif,gif");
    }
    return { url };
  }

  if (!PROVIDER_CONFIG.klipy.key) {
    return { error: "Set VITE_KLIPY_API_KEY to enable KLIPY." };
  }
  if (action === "trending-searches") {
    return { unsupported: "KLIPY does not provide a trending-searches endpoint." };
  }
  const resource = kind === "gif" ? "gifs" : kind === "sticker" ? "stickers" : "clips";
  const url = new URL(
    `https://api.klipy.com/api/v1/${encodeURIComponent(PROVIDER_CONFIG.klipy.key)}/${resource}/${action}`,
  );
  url.searchParams.set("locale", locale);
  if (action !== "categories") url.searchParams.set("per_page", String(limit));
  if (action === "search") url.searchParams.set("q", q);
  return { url };
}

async function requestProvider(provider, action, options, logRequest) {
  const logicalRoute = getLogicalRoute(action, { ...options, providers: [provider] });
  const request = makeRequest(provider, action, options);
  const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (request.error || request.unsupported) {
    const message = request.error ?? request.unsupported;
    logRequest({
      requestId,
      time: new Date().toISOString(),
      provider,
      route: logicalRoute,
      endpoint: "",
      status: request.error ? "not configured" : "unsupported",
      durationMs: 0,
      itemCount: 0,
      error: message,
    });
    return { items: [], raw: { error: message }, error: message };
  }

  const startedAt = performance.now();
  let status = "network error";
  try {
    const response = await fetch(request.url, { signal: AbortSignal.timeout(12000) });
    status = response.status;
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        payload.message ??
        payload.meta?.msg ??
        payload.error?.message ??
        `${PROVIDER_NAMES[provider]} returned HTTP ${response.status}.`,
      );
    }
    const items = mediaItems(provider, action, payload, options.kind);
    logRequest({
      requestId,
      time: new Date().toISOString(),
      provider,
      route: logicalRoute,
      endpoint: safeRequestUrl(request.url.href),
      status,
      durationMs: Math.round(performance.now() - startedAt),
      itemCount: items.length,
      error: "",
    });
    return { items, raw: payload, endpoint: safeRequestUrl(request.url.href) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    logRequest({
      requestId,
      time: new Date().toISOString(),
      provider,
      route: logicalRoute,
      endpoint: safeRequestUrl(request.url.href),
      status,
      durationMs: Math.round(performance.now() - startedAt),
      itemCount: 0,
      error: message,
    });
    return { items: [], raw: { error: message }, error: message, endpoint: safeRequestUrl(request.url.href) };
  }
}

async function requestProviders({ providers, action, q = "", kind, locale, logRequest }) {
  const options = { q, kind, locale, limit: 30 };
  const entries = await Promise.all(
    providers.map(async (provider) => [
      provider,
      await requestProvider(provider, action, options, logRequest),
    ]),
  );
  return Object.fromEntries(entries);
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MemeApp />
      <ReactQueryDevtools buttonPosition="bottom-right" />
    </QueryClientProvider>
  );
}

function MemeApp() {
  const [page, setPage] = useState(readPage);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [kind, setKind] = useState("gif");
  const [locale, setLocale] = useState("en_US");
  const [providers, setProviders] = useState([...PROVIDERS]);
  const [logs, setLogs] = useState([]);
  const [apiAction, setApiAction] = useState("search");
  const [apiQuery, setApiQuery] = useState("hello");
  const [apiRunId, setApiRunId] = useState(0);
  const [copied, setCopied] = useState(false);

  const logRequest = useCallback((entry) => {
    setLogs((current) => [entry, ...current].slice(0, 100));
  }, []);

  const mediaAction = submittedQuery ? "search" : "trending";
  const mediaQuery = useQuery({
    queryKey: ["media", mediaAction, submittedQuery, kind, locale, providers],
    queryFn: () => requestProviders({
      providers, action: mediaAction, q: submittedQuery, kind, locale, logRequest,
    }),
    enabled: page === "home",
  });
  const trendingQuery = useQuery({
    queryKey: ["trending-searches", locale, providers],
    queryFn: () => requestProviders({
      providers, action: "trending-searches", kind, locale, logRequest,
    }),
    enabled: page === "home",
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", kind, locale, providers],
    queryFn: () => requestProviders({
      providers, action: "categories", kind, locale, logRequest,
    }),
    enabled: page === "explore",
  });
  const apiQueryResult = useQuery({
    queryKey: ["api-console", apiRunId, apiAction, apiQuery, kind, locale, providers],
    queryFn: () => requestProviders({
      providers,
      action: apiAction,
      q: apiQuery.trim(),
      kind,
      locale,
      logRequest,
    }),
    enabled: page === "api" && apiRunId > 0,
  });

  useEffect(() => {
    const onHashChange = () => setPage(readPage());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function submitSearch(event) {
    event.preventDefault();
    const term = query.trim();
    if (term) setSubmittedQuery(term);
  }

  function chooseSearch(term) {
    setQuery(term);
    setSubmittedQuery(term);
    setPage("home");
    window.location.hash = "#/";
  }

  function toggleProvider(provider) {
    setProviders((current) =>
      current.includes(provider)
        ? current.filter((entry) => entry !== provider)
        : [...current, provider],
    );
  }

  const visibleResults = mediaQuery.data ?? {};
  const visibleTrendingSearches = trendingQuery.data ?? {};
  const visibleCategories = categoriesQuery.data ?? {};
  const consoleRoute = getLogicalRoute(apiAction, {
    q: apiQuery.trim(),
    kind,
    locale,
    providers,
  });
  const consoleJson = apiQueryResult.data
    ? {
        routePreview: consoleRoute,
        note: "Client-side provider responses; this static site does not serve this route as an HTTP API.",
        providers: Object.fromEntries(
          Object.entries(apiQueryResult.data).map(([provider, result]) => [
            provider,
            { data: result.raw, error: result.error, endpoint: result.endpoint },
          ]),
        ),
      }
    : null;

  async function copyJson() {
    if (!consoleJson) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(consoleJson, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (cause) {
      setCopied(false);
    }
  }

  const pageHeading = page === "explore" ? "Explore" : page === "reactions" ? "Reactions" : "API console";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Memes home">
          <span className="brand-mark">m</span> memes
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className={page === "explore" ? "active" : ""} href="#/explore">Explore</a>
          <a className={page === "reactions" ? "active" : ""} href="#/reactions">Reactions</a>
          <a className={page === "api" ? "active" : ""} href="#/api">API console</a>
        </nav>
        <label className="locale-select">
          <span aria-hidden="true">◎</span>
          <select value={locale} onChange={(event) => setLocale(event.target.value)} aria-label="Language and region">
            {LOCALES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </header>

      <main>
        <section className={`hero ${page !== "home" ? "compact" : ""}`}>
          <div className="hero-glow" />
          <div className="hero-content">
            <p className="eyebrow"><span className="eyebrow-dot" /> THE INTERNET, IN MOTION</p>
            <h1>
              {page === "home" ? <>Say it with<br /><span>a little more.</span></> : pageHeading}
            </h1>
            <p className="hero-copy">
              {page === "home"
                ? "The perfect GIF is out there. Let's find it."
                : page === "explore"
                  ? "A whole world of moods, moments, and memes."
                  : page === "reactions"
                    ? "Every feeling has a GIF. Find yours."
                    : "Run provider requests and inspect JSON, status, and timing."}
            </p>
            {page === "home" && (
              <>
                <form className="search-form" onSubmit={submitSearch}>
                  <span className="search-icon" aria-hidden="true">⌕</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search GIFs, stickers, clips..."
                    aria-label="Search memes"
                  />
                  <button type="submit" disabled={!query.trim() || mediaQuery.isFetching}>
                    Search <span>↗</span>
                  </button>
                </form>
                <ProviderFilters providers={providers} onToggle={toggleProvider} />
                {Object.values(visibleTrendingSearches).some((entry) => entry.items?.length) && (
                  <div className="trending-searches">
                    <span className="trending-label">TRENDING</span>
                    {Object.entries(visibleTrendingSearches).flatMap(([provider, result]) =>
                      (result.items ?? []).slice(0, 5).map((term, index) => (
                        <button
                          key={`${provider}-${term.query}-${index}`}
                          onClick={() => chooseSearch(term.query)}
                          title={`Trending on ${PROVIDER_NAMES[provider]}`}
                        >{term.title}</button>
                      )),
                    ).slice(0, 8)}
                  </div>
                )}
              </>
            )}
          </div>
          {page === "home" && <div className="hero-art" aria-hidden="true"><span>✦</span><span>☺</span><span>✳</span></div>}
        </section>

        <section className="content-section">
          {page === "api" ? (
            <ApiConsole
              action={apiAction}
              setAction={setApiAction}
              query={apiQuery}
              setQuery={setApiQuery}
              kind={kind}
              setKind={setKind}
              providers={providers}
              onToggleProvider={toggleProvider}
              locale={locale}
              run={() => setApiRunId((current) => current + 1)}
              result={apiQueryResult}
              route={consoleRoute}
              json={consoleJson}
              copied={copied}
              copyJson={copyJson}
              logs={logs}
              clearLogs={() => setLogs([])}
            />
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow dark-eyebrow">
                    {submittedQuery ? "YOUR SEARCH" : page === "home" ? "RIGHT NOW" : "BROWSE THE FEELINGS"}
                  </p>
                  <h2>
                    {page === "home"
                      ? submittedQuery ? `Results for “${submittedQuery}”` : "Trending now"
                      : page === "explore" ? "Find your thing" : "Pick a feeling"}
                  </h2>
                </div>
                {(page === "home" || page === "explore") && (
                  <MediaSwitch kind={kind} setKind={setKind} />
                )}
              </div>
              {page !== "home" && (
                <ProviderFilters
                  providers={providers}
                  onToggle={toggleProvider}
                  className="light-provider-filters"
                />
              )}
              {page === "reactions" ? (
                <div className="reaction-grid">
                  {REACTIONS.map((reaction, index) => (
                    <button className="reaction-card" key={reaction} onClick={() => chooseSearch(reaction)}>
                      <span className={`reaction-emoji hue-${index % 6}`}>{["☺", "☹", "☹", "🙈", "◉", "♥"][index % 6]}</span>
                      <span>{reaction}</span><span className="card-arrow">↗</span>
                    </button>
                  ))}
                </div>
              ) : page === "explore" ? (
                <ProviderSections
                  providers={providers}
                  results={visibleCategories}
                  loading={categoriesQuery.isPending}
                  onSelect={chooseSearch}
                  categoryView
                />
              ) : (
                <ProviderSections
                  providers={providers}
                  results={visibleResults}
                  loading={mediaQuery.isPending || mediaQuery.isFetching}
                />
              )}
            </>
          )}
        </section>
      </main>

      <footer>
        <a className="brand footer-brand" href="#/"><span className="brand-mark">m</span> memes</a>
        <span>One search. All the right reactions.</span>
        <div className="footer-providers">GIPHY · TENOR · KLIPY</div>
      </footer>
    </div>
  );
}

function MediaSwitch({ kind, setKind }) {
  return (
    <div className="media-switch" role="group" aria-label="Media type">
      {MEDIA_TYPES.map(([value, label]) => (
        <button className={kind === value ? "active" : ""} key={value} onClick={() => setKind(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ProviderFilters({ providers, onToggle, className = "" }) {
  return (
    <div className={`provider-filters ${className}`} aria-label="Content providers">
      <span>SEARCH WITH</span>
      {PROVIDERS.map((provider) => (
        <label className={`provider-pill ${providers.includes(provider) ? "selected" : ""}`} key={provider}>
          <input
            type="checkbox"
            checked={providers.includes(provider)}
            onChange={() => onToggle(provider)}
          />
          <span className={`provider-dot ${provider}`} />
          {PROVIDER_NAMES[provider]}
        </label>
      ))}
    </div>
  );
}

function ProviderSections({ providers, results, loading, onSelect, categoryView = false }) {
  if (loading) {
    return <div className="loading-state"><span className="loader" /> Contacting selected providers...</div>;
  }
  if (!providers.length) {
    return <div className="empty-state">Choose at least one provider above to get started.</div>;
  }
  return (
    <div className={`provider-sections ${categoryView ? "categories-view" : ""}`}>
      {providers.map((provider) => {
        const result = results[provider];
        const items = result?.items ?? [];
        return (
          <section className={`provider-section ${provider}`} key={provider}>
            <div className="provider-section-heading">
              <span className={`provider-dot ${provider}`} />
              <h3>{PROVIDER_NAMES[provider]}</h3>
              <span className="provider-count">
                {result?.error ? "Unavailable" : items.length ? `${items.length} results` : ""}
              </span>
            </div>
            {result?.error ? (
              <div className="provider-error" role="status">{result.error}</div>
            ) : items.length ? (
              <div className="mosaic-grid">
                {items.map((item, index) => (
                  <MediaCard
                    item={item}
                    key={`${provider}-${item.id}-${index}`}
                    onSelect={categoryView ? () => onSelect?.(item.query) : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="provider-empty">
                {categoryView ? "No categories returned for this media type." : "No results yet. Try another search or provider."}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function MediaCard({ item, onSelect }) {
  const content = item.video ? (
    <video src={item.imageUrl} autoPlay muted loop playsInline aria-label={item.title} />
  ) : (
    item.imageUrl
      ? <img src={item.imageUrl} alt={item.title} loading="lazy" />
      : <span className="media-placeholder">{item.title}</span>
  );
  return (
    <article className="media-card">
      <button className="media-button" onClick={onSelect} type="button" aria-label={`Search ${item.title}`}>
        {content}
        <span className="media-overlay">
          <span>{item.title}</span>
          <span className={`attribution ${item.provider}`}>{PROVIDER_NAMES[item.provider]}</span>
        </span>
      </button>
    </article>
  );
}

function ApiConsole({
  action,
  setAction,
  query,
  setQuery,
  kind,
  setKind,
  providers,
  onToggleProvider,
  locale,
  run,
  result,
  route,
  json,
  copied,
  copyJson,
  logs,
  clearLogs,
}) {
  return (
    <div className="api-console">
      <div className="section-heading api-heading">
        <div>
          <p className="eyebrow dark-eyebrow">CLIENT-SIDE API PLAYGROUND</p>
          <h2>Requests &amp; traces</h2>
        </div>
        <span className="static-badge">STATIC · NO SERVER API</span>
      </div>
      <div className="api-notice">
        <strong>These are request previews, not live REST routes.</strong>
        <span>This GitHub Pages app calls each provider directly from your browser. A reusable <code>/api/…</code> endpoint requires a separately hosted server.</span>
      </div>
      <div className="api-controls">
        <label>
          <span>OPERATION</span>
          <select value={action} onChange={(event) => setAction(event.target.value)}>
            {API_ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {action === "search" && (
          <label className="api-query-control">
            <span>SEARCH QUERY</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. hello" />
          </label>
        )}
        {(action === "search" || action === "trending" || action === "categories") && (
          <label>
            <span>MEDIA TYPE</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              {MEDIA_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        )}
        <button
          className="api-run"
          onClick={run}
          disabled={!providers.length || (action === "search" && !query.trim()) || result.isFetching}
        >{result.isFetching ? "Requesting…" : "Run requests"} <span>↗</span></button>
      </div>
      <ProviderFilters providers={providers} onToggle={onToggleProvider} className="light-provider-filters" />

      <div className="route-preview">
        <span>ROUTE PREVIEW</span>
        <code>{route}</code>
        <small>Locale: {locale}</small>
      </div>

      {result.isError && <div className="provider-error">{result.error.message}</div>}
      {json && (
        <section className="json-panel">
          <div className="console-panel-heading">
            <div><span className="status-live" /> <strong>Response payloads</strong></div>
            <button onClick={copyJson} type="button">{copied ? "Copied" : "Copy JSON"}</button>
          </div>
          <pre>{JSON.stringify(json, null, 2)}</pre>
        </section>
      )}

      <section className="log-panel">
        <div className="console-panel-heading">
          <div><strong>Request log</strong><span className="log-count">{logs.length} / 100</span></div>
          <button onClick={clearLogs} type="button" disabled={!logs.length}>Clear logs</button>
        </div>
        {logs.length ? (
          <div className="log-list">
            {logs.map((entry) => (
              <article className="log-entry" key={entry.requestId}>
                <div className="log-entry-top">
                  <code>{entry.requestId.slice(0, 12)}</code>
                  <span className={`log-status ${typeof entry.status === "number" && entry.status < 400 ? "ok" : ""}`}>
                    {entry.status}
                  </span>
                  <span className={`provider-dot ${entry.provider}`} />
                  <strong>{PROVIDER_NAMES[entry.provider]}</strong>
                  <span>{entry.durationMs} ms</span>
                  <time>{new Date(entry.time).toLocaleTimeString()}</time>
                </div>
                <code className="log-route">{entry.route}</code>
                {entry.endpoint && <code className="log-endpoint">{entry.endpoint}</code>}
                <div className="log-summary">
                  {entry.itemCount} items
                  {entry.error && <span className="log-error">{entry.error}</span>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="log-empty">No requests yet. Run an operation to start a trace.</div>
        )}
      </section>
    </div>
  );
}

export default App;
