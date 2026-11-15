import { useCallback, useEffect, useRef, useState } from "react";
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
const TRENDING_SEARCH_PROVIDERS = ["giphy", "tenor"];
const PROVIDER_NAMES = { giphy: "GIPHY", tenor: "Tenor", klipy: "KLIPY" };
const LOCALES = [
  ["sq_AL", "Albanian · Albania"],
  ["ar_EG", "Arabic · Egypt"],
  ["ar_SA", "Arabic · Saudi Arabia"],
  ["be_BY", "Belarusian · Belarus"],
  ["bn_BD", "Bengali · Bangladesh"],
  ["bs_BA", "Bosnian · Bosnia and Herzegovina"],
  ["zh_HK", "Cantonese · Hong Kong"],
  ["ca_ES", "Catalan · Spain"],
  ["zh_CN", "Chinese (Simplified) · China"],
  ["zh_TW", "Chinese (Traditional) · Taiwan"],
  ["hr_HR", "Croatian · Croatia"],
  ["cs_CZ", "Czech · Czechia"],
  ["da_DK", "Danish · Denmark"],
  ["nl_NL", "Dutch · Netherlands"],
  ["en_US", "English · United States"],
  ["en_GB", "English · United Kingdom"],
  ["en_CA", "English · Canada"],
  ["en_AU", "English · Australia"],
  ["en_IN", "English · India"],
  ["en_IE", "English · Ireland"],
  ["en_NZ", "English · New Zealand"],
  ["en_ZA", "English · South Africa"],
  ["fa_IR", "Farsi · Iran"],
  ["fi_FI", "Finnish · Finland"],
  ["fr_FR", "French · France"],
  ["fr_BE", "French · Belgium"],
  ["fr_CA", "French · Canada"],
  ["fr_CH", "French · Switzerland"],
  ["de_DE", "German · Germany"],
  ["de_AT", "German · Austria"],
  ["de_CH", "German · Switzerland"],
  ["el_GR", "Greek · Greece"],
  ["he_IL", "Hebrew · Israel"],
  ["hi_IN", "Hindi · India"],
  ["hu_HU", "Hungarian · Hungary"],
  ["id_ID", "Indonesian · Indonesia"],
  ["it_IT", "Italian · Italy"],
  ["ja_JP", "Japanese · Japan"],
  ["ko_KR", "Korean · South Korea"],
  ["lo_LA", "Lao · Laos"],
  ["ms_MY", "Malay · Malaysia"],
  ["mn_MN", "Mongolian · Mongolia"],
  ["no_NO", "Norwegian Bokmål · Norway"],
  ["nn_NO", "Norwegian Nynorsk · Norway"],
  ["pl_PL", "Polish · Poland"],
  ["pt_BR", "Portuguese · Brazil"],
  ["pt_PT", "Portuguese · Portugal"],
  ["ro_RO", "Romanian · Romania"],
  ["ru_RU", "Russian · Russia"],
  ["sr_RS", "Serbian · Serbia"],
  ["sk_SK", "Slovak · Slovakia"],
  ["es_ES", "Spanish · Spain"],
  ["es_MX", "Spanish · Mexico"],
  ["es_AR", "Spanish · Argentina"],
  ["es_CO", "Spanish · Colombia"],
  ["es_US", "Spanish · United States"],
  ["sv_SE", "Swedish · Sweden"],
  ["tl_PH", "Filipino/Tagalog · Philippines"],
  ["th_TH", "Thai · Thailand"],
  ["tr_TR", "Turkish · Türkiye"],
  ["uk_UA", "Ukrainian · Ukraine"],
  ["ur_PK", "Urdu · Pakistan"],
  ["vi_VN", "Vietnamese · Vietnam"],
];
const GIPHY_LANGUAGES = new Set([
  "ar", "bn", "cs", "da", "de", "en", "es", "fa", "fi", "fr",
  "he", "hi", "hu", "id", "it", "ja", "ko", "ms", "nl", "no", "pl",
  "pt", "ro", "ru", "sv", "th", "tl", "tr", "uk", "vi", "zh",
]);
const REACTIONS_BY_PROVIDER = {
  tenor: [
    "Good night", "Good morning", "Confused", "Chill out", "Love", "Happy",
    "Cry", "Yes", "No", "LOL", "Excited", "Bye", "Sorry", "Congratulations",
    "Sleepy", "Hello", "Hugs", "OK", "Please", "Thank you", "Miss you", "Wink",
    "Whatever", "Hungry", "Dance", "Annoyed", "OMG", "Crazy", "Shrug", "Smile",
    "Awkward", "EW", "Angry", "Surprised", "Why", "Thumbs up", "Wow", "Ouch",
    "Oops", "You're welcome", "Lazy", "Stressed", "Embarrassed", "Clapping",
    "Awesome", "JK", "Good luck", "High five", "Nervous", "Duh", "Aww", "Scared",
    "Bored", "Sigh", "Kiss", "Sad",
  ],
  giphy: [
    "Thank You", "Love", "Funny", "Yes", "Excited", "Kiss", "Hello", "Happy",
    "Sad", "No", "Crying", "Waiting", "Congratulations", "Yay", "Hug", "What",
    "Laughing", "Dancing", "Confused", "Wow", "Celebrate", "Shocked", "Thumbs Up",
    "WTF", "Tired", "LOL", "Nope", "Bye", "Angry", "Welcome", "OK", "Cute",
    "Miss You", "Sleepy", "Thinking", "Eye Roll", "Do It", "Side Eye", "Crazy",
    "Fire", "Scared", "Huh",
  ],
  klipy: [
    "Ok", "Win", "Laughing", "Confused", "Shocked", "Thank you", "Hug", "Awesome",
    "Hearts", "Drunk", "Help", "Sleepy", "Wow", "Hello", "Sexy", "Excited", "Omg",
    "Angry", "Wtf", "Mad", "Scared", "Sorry", "Whatever", "Good job", "Goodbye",
    "Proud", "Ugh", "Oops", "Rage", "Flirt", "Frustrated", "Popcorn", "Success",
    "Smh", "Disappointed", "Seriously", "Serious", "Shut up", "Burn", "Middle finger",
    "Sigh", "Deal with it", "Sarcastic", "Yawn", "Hair flip", "Want", "Yolo",
    "Thumbs down", "Meh", "Suspicious", "Mic drop", "Embarrassed", "Nom", "Good luck",
    "You got this", "Disgusted", "Awww", "Fist bump", "Eww", "Applause", "Happy dance",
    "Idk", "Do not want", "Amused", "Slow clap", "Oh snap", "Frown", "Pleased",
    "Rejected", "Not bad", "Judging you", "I give up", "Cool story bro", "Aroused",
    "Abandon thread", "Oh no you didnt", "Fml", "Interested", "What", "Bored", "Please",
    "Nod", "Agree", "Party hard", "Finger guns", "Table flip", "Love", "Dancing",
    "Smile", "Incredulous",
  ],
};
const MEDIA_TYPES = [
  ["gif", "GIFs"],
  ["sticker", "Stickers"],
  ["clip", "Clips"],
];
const TENOR_GIF_EXPLORE_CATEGORIES = [
  "Movies",
  "TV Shows",
  "Animals",
  "Food & Drink",
  "Greetings & Sayings",
  "Holidays",
  "Gestures",
  "Sports",
  "Celebrities",
  "Music",
  "Interests",
  "Internet",
  "Weather",
  "Places",
  "Memes",
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
    clientKey: import.meta.env.VITE_TENOR_CLIENT_KEY || "tenor_web",
  },
  klipy: {
    key: import.meta.env.VITE_KLIPY_API_KEY ?? "",
  },
};

function providerIsConfigured(provider) {
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

function logTrendingSearchResults(results, locale) {
  const giphyResult = results.giphy ?? { items: [] };
  const tenorResult = results.tenor ?? { items: [] };
  const giphyTerms = (giphyResult.items ?? []).map((term) => term.query || term.title);
  const tenorTerms = (tenorResult.items ?? []).map((term) => term.query || term.title);
  const normalize = (term) => String(term).trim().replace(/\s+/g, " ").toLowerCase();
  const tenorTermSet = new Set(tenorTerms.map(normalize));
  const overlapByTerm = new Map();

  for (const term of giphyTerms) {
    const key = normalize(term);
    if (key && tenorTermSet.has(key)) overlapByTerm.set(key, term);
  }

  console.groupCollapsed(`🔥 Trending searches · ${locale}`);
  console.log(`🟣 GIPHY · ${giphyTerms.length} results`, giphyTerms);
  console.log(`🔵 Tenor · ${tenorTerms.length} results`, tenorTerms);
  console.log(`🤝 Overlap · ${overlapByTerm.size} terms`, [...overlapByTerm.values()]);
  if (giphyResult.error) console.warn(`⚠️ GIPHY request failed: ${giphyResult.error}`);
  if (tenorResult.error) console.warn(`⚠️ Tenor request failed: ${tenorResult.error}`);
  console.groupEnd();
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
    queryKey: ["trending-searches", locale],
    queryFn: async () => {
      const results = await requestProviders({
        providers: TRENDING_SEARCH_PROVIDERS,
        action: "trending-searches",
        kind,
        locale,
        logRequest,
      });
      logTrendingSearchResults(results, locale);
      return results;
    },
    enabled: page === "home",
  });
  const categoryKind = page === "reactions" ? "gif" : kind;
  const categoriesQuery = useQuery({
    queryKey: ["categories", page, categoryKind, locale, providers],
    queryFn: async () => {
      const useStaticTenorCategories =
        page === "explore" && kind === "gif" && providers.includes("tenor");
      const results = await requestProviders({
        providers,
        action: "categories",
        kind: categoryKind,
        locale,
        logRequest,
      });
      if (!useStaticTenorCategories) return results;
      const tenorCategories = results.tenor?.items ?? [];
      const categoryKey = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return {
        ...results,
        tenor: {
          ...results.tenor,
          items: TENOR_GIF_EXPLORE_CATEGORIES.map((title, index) => {
            const key = categoryKey(title);
            const preview = tenorCategories.find((category) =>
              [category.title, category.query].some((value) => categoryKey(value) === key),
            );
            return {
              id: `tenor-explore-${index}`,
              title,
              query: title,
              imageUrl: preview?.imageUrl ?? "",
              provider: "tenor",
              kind: "gif",
            };
          }),
        },
      };
    },
    enabled: page === "explore" || page === "reactions",
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

  function chooseSearch(term, provider) {
    if (provider) setProviders([provider]);
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
  const trendingSearchItems = Object.fromEntries(
    TRENDING_SEARCH_PROVIDERS.map((provider) => [
      provider,
      visibleTrendingSearches[provider]?.items ?? [],
    ]),
  );
  const trendingSearchCount = Math.max(
    0,
    ...Object.values(trendingSearchItems).map((items) => items.length),
  );
  const trendingSearchesByQuery = new Map();
  for (let index = 0; index < trendingSearchCount; index += 1) {
    for (const provider of TRENDING_SEARCH_PROVIDERS) {
      const term = trendingSearchItems[provider][index];
      if (!term) continue;
      const query = String(term.query ?? term.title ?? "").trim().replace(/\s+/g, " ");
      const key = query.toLowerCase();
      if (!key) continue;

      const existing = trendingSearchesByQuery.get(key);
      if (existing) {
        if (!existing.providers.includes(provider)) existing.providers.push(provider);
      } else {
        trendingSearchesByQuery.set(key, {
          ...term,
          title: term.title || query,
          query,
          provider,
          providers: [provider],
        });
      }
    }
  }
  const trendingSearchTerms = Array.from(trendingSearchesByQuery.values())
    .sort((left, right) => right.providers.length - left.providers.length);
  const trendingSearchErrors = TRENDING_SEARCH_PROVIDERS.flatMap((provider) => {
    const error = visibleTrendingSearches[provider]?.error;
    return error ? [{ provider, error }] : [];
  });
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

  const pageHeading = page === "explore" ? "Explore" : page === "reactions" ? "Reaction GIFs" : "API console";

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
              {page === "home" && (trendingSearchTerms.length > 0 || trendingSearchErrors.length > 0) && (
                <TrendingSearchStrip
                  searches={trendingSearchTerms}
                  errors={trendingSearchErrors}
                  locale={locale}
                  logRequest={logRequest}
                  onSelect={(term) => chooseSearch(term)}
                />
              )}
              <div className="section-heading">
                <div>
                  <p className="eyebrow dark-eyebrow">
                    {submittedQuery ? "YOUR SEARCH" : page === "home" ? "RIGHT NOW" : "BROWSE THE FEELINGS"}
                  </p>
                  <h2>
                    {page === "home"
                      ? submittedQuery ? `Results for “${submittedQuery}”` : "Trending now"
                      : page === "explore" ? "Find your thing" : "Browse reactions"}
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
                <ReactionSections
                  providers={providers}
                  results={visibleCategories}
                  loading={categoriesQuery.isPending}
                  onSelect={(term, provider) => {
                    setKind("gif");
                    chooseSearch(term, provider);
                  }}
                  locale={locale}
                  logRequest={logRequest}
                />
              ) : page === "explore" ? (
                <ProviderSections
                  providers={providers}
                  results={visibleCategories}
                  loading={categoriesQuery.isPending}
                  onSelect={chooseSearch}
                  categoryView
                  locale={locale}
                  logRequest={logRequest}
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

function TrendingSearchStrip({ searches, errors, locale, logRequest, onSelect }) {
  const stripRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    setCanScrollLeft(strip.scrollLeft > 1);
    setCanScrollRight(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [searches.length, updateScrollState]);

  function scrollStrip(direction) {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * strip.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section className="trending-search-section" aria-labelledby="trending-search-heading">
      <div className="trending-search-heading">
        <div>
          <p className="eyebrow dark-eyebrow">WHAT'S POPULAR</p>
          <h2 id="trending-search-heading">Trending searches</h2>
        </div>
        <span className="trending-search-count">{searches.length} unique searches</span>
      </div>
      {errors.map(({ provider, error }) => (
        <p className="trending-search-error" key={provider} role="status">
          Could not load {PROVIDER_NAMES[provider]} trending searches: {error}
        </p>
      ))}
      <div className="trending-search-carousel">
        <button
          className="trending-search-arrow"
          type="button"
          aria-label="Scroll trending searches left"
          disabled={!canScrollLeft}
          onClick={() => scrollStrip(-1)}
        >←</button>
        <div
          className="trending-search-strip"
          ref={stripRef}
          onScroll={updateScrollState}
        >
          {searches.map((term, index) => (
            <TrendingSearchCard
              key={`${term.provider}-${term.query}-${index}`}
              term={term}
              index={index}
              locale={locale}
              logRequest={logRequest}
              onSelect={() => onSelect(term.query)}
            />
          ))}
        </div>
        <button
          className="trending-search-arrow"
          type="button"
          aria-label="Scroll trending searches right"
          disabled={!canScrollRight}
          onClick={() => scrollStrip(1)}
        >→</button>
      </div>
    </section>
  );
}

function TrendingSearchCard({ term, index, locale, logRequest, onSelect }) {
  const cardRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return undefined;
    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const previewQuery = useQuery({
    queryKey: ["trending-search-preview", term.provider, term.query, locale],
    queryFn: () => requestProvider(
      term.provider,
      "search",
      { q: term.query, kind: "gif", locale, limit: 1 },
      logRequest,
    ),
    enabled: isVisible && providerIsConfigured(term.provider),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
  const imageUrl = previewQuery.data?.items?.[0]?.imageUrl;

  return (
    <button
      ref={cardRef}
      className="trending-search-card"
      type="button"
      onClick={onSelect}
      aria-label={`Search for ${term.title}`}
      title={`Trending on ${PROVIDER_NAMES[term.provider]}`}
    >
      <span className={`trending-search-art hue-${index % 6}`}>
        {imageUrl
          ? <img src={imageUrl} alt="" loading="lazy" />
          : <span aria-hidden="true">{term.title}</span>}
      </span>
      <span className="trending-search-title">{term.title}</span>
      <span className={`trending-search-provider ${term.providers.length > 1 ? "both" : term.provider}`}>
        {term.providers.map((provider) => PROVIDER_NAMES[provider]).join(" + ")}
      </span>
    </button>
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

function ProviderSections({
  providers,
  results,
  loading,
  onSelect,
  categoryView = false,
  locale,
  logRequest,
}) {
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
                {items.length ? `${items.length} results` : result?.error ? "Unavailable" : ""}
              </span>
            </div>
            {result?.error && <div className="provider-error" role="status">{result.error}</div>}
            {items.length ? (
              <div className="mosaic-grid">
                {items.map((item, index) => (
                  categoryView && provider === "tenor" ? (
                    <TenorExploreCategoryCard
                      item={item}
                      key={`${provider}-${item.id}-${index}`}
                      locale={locale}
                      logRequest={logRequest}
                      onSelect={() => onSelect?.(item.query)}
                    />
                  ) : (
                    <MediaCard
                      item={item}
                      key={`${provider}-${item.id}-${index}`}
                      onSelect={categoryView ? () => onSelect?.(item.query) : undefined}
                    />
                  )
                ))}
              </div>
            ) : !result?.error ? (
              <div className="provider-empty">
                {categoryView ? "No categories returned for this media type." : "No results yet. Try another search or provider."}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function TenorExploreCategoryCard({ item, locale, logRequest, onSelect }) {
  const tileRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [categoryPreviewFailed, setCategoryPreviewFailed] = useState(false);
  const [searchPreviewFailed, setSearchPreviewFailed] = useState(false);

  useEffect(() => {
    const tile = tileRef.current;
    if (!tile) return undefined;
    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    observer.observe(tile);
    return () => observer.disconnect();
  }, []);

  const hasCategoryPreview = Boolean(item.imageUrl) && !categoryPreviewFailed;
  const previewQuery = useQuery({
    queryKey: ["tenor-explore-preview", item.query, locale],
    queryFn: () => requestProvider(
      "tenor",
      "search",
      { q: item.query, kind: "gif", locale, limit: 1 },
      logRequest,
    ),
    enabled:
      isVisible &&
      !hasCategoryPreview &&
      !searchPreviewFailed &&
      providerIsConfigured("tenor"),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
  const searchPreview = previewQuery.data?.items?.[0]?.imageUrl ?? "";
  const imageUrl = hasCategoryPreview
    ? item.imageUrl
    : searchPreviewFailed ? "" : searchPreview;

  return (
    <MediaCard
      cardRef={tileRef}
      item={{ ...item, imageUrl }}
      onSelect={onSelect}
      overlayAlwaysVisible
      onImageError={() => {
        if (hasCategoryPreview) setCategoryPreviewFailed(true);
        else setSearchPreviewFailed(true);
      }}
    />
  );
}

function reactionKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findReactionPreview(reaction, items) {
  const key = reactionKey(reaction);
  const aliases = {
    crying: ["cry"],
    cry: ["crying"],
    dance: ["dancing"],
    dancing: ["dance"],
    hugs: ["hug"],
    hug: ["hugs"],
  };
  const targets = new Set([key, ...(aliases[key] ?? [])]);
  return items.find((item) =>
    [item.title, item.query].some((value) => targets.has(reactionKey(value))),
  )?.imageUrl;
}

function ReactionSections({ providers, results, loading, onSelect, locale, logRequest }) {
  if (!providers.length) {
    return <div className="empty-state">Choose at least one provider above to browse its reactions.</div>;
  }
  return (
    <div className="reaction-provider-list">
      <p className="reaction-help">
        Preview GIFs load as you scroll. Missing category thumbnails are fetched one at a time per reaction.
      </p>
      {providers.map((provider) => {
        const reactions = REACTIONS_BY_PROVIDER[provider] ?? [];
        const previews = results[provider]?.items ?? [];
        return (
          <section className={`reaction-source ${provider}`} key={provider}>
            <header className="reaction-source-heading">
              <span className={`provider-dot ${provider}`} />
              <h3>{PROVIDER_NAMES[provider]} reactions</h3>
              <span>{reactions.length} categories</span>
              {loading && <span className="reaction-preview-status">Loading category data…</span>}
            </header>
            {results[provider]?.error && (
              <div className="reaction-preview-error">
                Categories list is shown; preview images are unavailable: {results[provider].error}
              </div>
            )}
            <div className="reaction-catalog">
              {reactions.map((reaction, index) => {
                const previewUrl = findReactionPreview(reaction, previews);
                return (
                  <ReactionTile
                    key={`${provider}-${reaction}-${index}`}
                    provider={provider}
                    reaction={reaction}
                    index={index}
                    locale={locale}
                    categoryPreview={previewUrl}
                    logRequest={logRequest}
                    onSelect={() => onSelect(reaction, provider)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ReactionTile({
  provider,
  reaction,
  index,
  locale,
  categoryPreview,
  logRequest,
  onSelect,
}) {
  const tileRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [categoryPreviewFailed, setCategoryPreviewFailed] = useState(false);
  const [searchPreviewFailed, setSearchPreviewFailed] = useState(false);

  useEffect(() => {
    const tile = tileRef.current;
    if (!tile) return undefined;
    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    observer.observe(tile);
    return () => observer.disconnect();
  }, []);

  const previewQuery = useQuery({
    queryKey: ["reaction-preview", provider, reaction, locale],
    queryFn: () => requestProvider(
      provider,
      "search",
      { q: reaction, kind: "gif", locale, limit: 1 },
      logRequest,
    ),
    enabled: isVisible && providerIsConfigured(provider) && (!categoryPreview || categoryPreviewFailed),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
  const searchPreview = previewQuery.data?.items?.[0]?.imageUrl;
  const imageUrl = categoryPreview && !categoryPreviewFailed
    ? categoryPreview
    : searchPreviewFailed ? "" : searchPreview;

  return (
    <button
      ref={tileRef}
      className="reaction-tile"
      type="button"
      onClick={onSelect}
      aria-label={`Search ${PROVIDER_NAMES[provider]} for ${reaction}`}
    >
      <span className={`reaction-tile-art hue-${index % 6}`}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => {
              if (categoryPreview && !categoryPreviewFailed) setCategoryPreviewFailed(true);
              else setSearchPreviewFailed(true);
            }}
          />
        ) : (
          <span aria-hidden="true">{["✦", "☺", "♥", "✳", "☁", "✧"][index % 6]}</span>
        )}
        {previewQuery.isFetching && !imageUrl && <span className="reaction-preview-loader" />}
        <span className="reaction-tile-arrow" aria-hidden="true">↗</span>
      </span>
      <span className="reaction-tile-name">{reaction}</span>
    </button>
  );
}

function MediaCard({ item, onSelect, onImageError, cardRef, overlayAlwaysVisible = false }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const playWithSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    video.play().then(
      () => setAudioBlocked(false),
      () => {
        video.muted = true;
        setMuted(true);
        setAudioBlocked(true);
      },
    );
  };

  const muteVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    setMuted(true);
  };

  const content = item.video ? (
    <video
      ref={videoRef}
      src={item.imageUrl}
      poster={item.posterUrl || undefined}
      autoPlay
      muted={muted}
      loop
      playsInline
      aria-label={item.title}
    />
  ) : (
    item.imageUrl
      ? <img src={item.imageUrl} alt={item.title} loading="lazy" onError={onImageError} />
      : <span className="media-placeholder">{item.title}</span>
  );
  return (
    <article className="media-card" ref={cardRef}>
      <button
        className={`media-button ${overlayAlwaysVisible ? "overlay-always-visible" : ""}`}
        onClick={item.video ? playWithSound : onSelect}
        onMouseEnter={item.video ? playWithSound : undefined}
        onMouseLeave={item.video ? muteVideo : undefined}
        type="button"
        aria-label={item.video ? `Play ${item.title} with sound` : `Search ${item.title}`}
      >
        {content}
        <span className="media-overlay">
          <span>{item.title}</span>
          {audioBlocked && <span>Click to enable sound</span>}
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
