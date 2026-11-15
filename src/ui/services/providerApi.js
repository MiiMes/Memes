import { GIPHY_LANGUAGES, PROVIDER_CONFIG, PROVIDER_NAMES } from "../constants/appConstants.js";
import { getLogicalRoute } from "../utils/routes.js";

export function providerIsConfigured(provider) {
  if (provider === "giphy") return Boolean(PROVIDER_CONFIG.giphy.key);
  if (provider === "tenor") {
    return Boolean(PROVIDER_CONFIG.tenor.key && PROVIDER_CONFIG.tenor.clientKey);
  }
  return Boolean(PROVIDER_CONFIG.klipy.key);
}

function giphyLanguage(locale) {
  const [language] = locale.split("_");
  if (!GIPHY_LANGUAGES.has(language)) return "";
  if (language === "zh") return locale === "zh_CN" ? "zh-CN" : "zh-TW";
  return language;
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
  const posterUrl =
    images.fixed_width_still?.url ??
    images.fixed_height_still?.url ??
    imageUrl;
  const videoUrl = kind === "clip"
    ? [
      item.mp4,
      item.video,
      images.fixed_width?.mp4,
      images.fixed_height?.mp4,
      images.original?.mp4,
    ].map(mediaFileUrl).find(Boolean) ?? ""
    : "";
  return {
    id: String(item.id ?? item.slug ?? imageUrl),
    title: item.title || item.slug || "GIPHY result",
    imageUrl: videoUrl || (kind === "clip" ? posterUrl : imageUrl),
    posterUrl: kind === "clip" ? posterUrl : "",
    pageUrl: item.url ?? "",
    provider: "giphy",
    kind,
    video: Boolean(videoUrl),
    username: item.username || item.user?.username || "",
  };
}

function mediaFileUrl(file) {
  return typeof file === "string" ? file : file?.url ?? "";
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
  const videoUrl = mediaFileUrl(item.file?.mp4) ||
    files.map((file) => mediaFileUrl(file.mp4) || mediaFileUrl(file.webm)).find(Boolean) ||
    "";
  const previewUrl = mediaFileUrl(item.file?.gif) ||
    mediaFileUrl(item.file?.webp) ||
    files.map((file) => mediaFileUrl(file.gif) || mediaFileUrl(file.webp)).find(Boolean) ||
    item.preview_url ||
    item.blur_preview ||
    "";
  const imageUrl = kind === "clip"
    ? videoUrl || previewUrl
    : files.map((file) => mediaFileUrl(file.gif) || mediaFileUrl(file.webp)).find(Boolean) ?? item.preview_url ?? "";
  return {
    id: String(item.id ?? item.slug ?? imageUrl),
    title: item.title ?? item.slug ?? "KLIPY result",
    imageUrl,
    posterUrl: kind === "clip" ? previewUrl : "",
    pageUrl: item.url ?? "",
    provider: "klipy",
    kind,
    username: item.username ?? "",
    video: kind === "clip" && Boolean(videoUrl),
  };
}

function mediaItems(provider, action, payload, kind) {
  if (action === "trending-searches") {
    const terms = provider === "giphy"
      ? payload.data
      : provider === "tenor"
        ? payload.tags
        : payload.results;
    return (terms ?? []).map((term) => {
      const query = String(
        term.searchterm ?? term.name ?? term.slug ?? term,
      );
      return { title: query, query };
    });
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
    if (kind === "clip" && action !== "trending" && action !== "trending-searches") {
      return { unsupported: "GIPHY Clips in this app are available through trending only." };
    }
    if (action === "categories" && kind !== "gif") {
      return { unsupported: "GIPHY categories in this starter are available for GIFs only." };
    }
    const path = action === "categories"
      ? "/v1/gifs/categories"
      : action === "trending-searches"
        ? "/v1/trending/searches"
        : kind === "clip"
          ? "/v1/clips/trending"
        : `/v1/${kind === "sticker" ? "stickers" : "gifs"}/${action === "search" ? "search" : "trending"}`;
    const url = new URL(`https://api.giphy.com${path}`);
    url.searchParams.set("api_key", PROVIDER_CONFIG.giphy.key);
    if (action !== "categories" && action !== "trending-searches") {
      url.searchParams.set("limit", String(limit));
    }
    if (action === "search") url.searchParams.set("q", q);
    if (action === "search" || action === "trending") {
      url.searchParams.set("rating", "g");
      const language = giphyLanguage(locale);
      if (language) url.searchParams.set("lang", language);
      if (locale.includes("_")) url.searchParams.set("country_code", locale.split("_")[1]);
    }
    if (action === "categories") {
      const language = giphyLanguage(locale);
      if (language) url.searchParams.set("lang", language);
    }
    return { url };
  }

  if (provider === "tenor") {
    if (!PROVIDER_CONFIG.tenor.key || !PROVIDER_CONFIG.tenor.clientKey) {
      return { error: "Set VITE_TENOR_API_KEY to enable Tenor." };
    }
    if (action !== "trending-searches" && kind !== "gif") {
      return { unsupported: "Tenor results in this starter are GIF-only." };
    }
    const path = {
      search: "/v2/search",
      trending: "/v2/featured",
      "trending-searches": "/v2/categories",
      categories: "/v2/categories",
    }[action];
    const url = new URL(`https://tenor.googleapis.com${path}`);
    url.searchParams.set("key", PROVIDER_CONFIG.tenor.key);
    url.searchParams.set("client_key", PROVIDER_CONFIG.tenor.clientKey);
    url.searchParams.set("locale", locale);
    if (locale.includes("_")) url.searchParams.set("country", locale.split("_")[1]);
    if (action !== "trending-searches") url.searchParams.set("limit", String(limit));
    url.searchParams.set("contentfilter", "medium");
    if (action === "trending-searches") url.searchParams.set("type", "trending");
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

export async function requestProvider(provider, action, options, logRequest) {
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

export async function requestProviders({ providers, action, q = "", kind, locale, logRequest }) {
  const options = { q, kind, locale, limit: 30 };
  const entries = await Promise.all(
    providers.map(async (provider) => [
      provider,
      await requestProvider(provider, action, options, logRequest),
    ]),
  );
  return Object.fromEntries(entries);
}
