import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PROVIDERS,
  TRENDING_SEARCH_PROVIDERS,
} from "../constants/appConstants.js";
import { getLogicalRoute } from "../utils/routes.js";
import { useFavorites } from "./useFavorites.js";
import { useHashRoute } from "./useHashRoute.js";
import { useProviderQueries } from "./useProviderQueries.js";
import { rankSimilarMedia } from "../services/visualSimilarity.js";
import { readMemeShareFromHash } from "../services/memeShare.js";

const RECENT_SEARCHES_KEY = "memes:recent-searches:v1";

function readEditorSourceFromHash() {
  const query = globalThis.location?.hash?.split("?").slice(1).join("?") ?? "";
  const params = new URLSearchParams(query);
  const source = params.get("source");
  if (!source) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== "https:") return null;
    return {
      id: `external-${url.href}`,
      title: params.get("title")?.slice(0, 100) || "Shared image",
      imageUrl: url.href,
      provider: "browser-extension",
      kind: "gif",
    };
  } catch {
    return null;
  }
}

function loadRecentSearches() {
  try {
    const saved = globalThis.localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return {
      searches: Array.isArray(parsed)
        ? parsed.filter((term) => typeof term === "string").slice(0, 8)
        : [],
      error: "",
    };
  } catch (cause) {
    return {
      searches: [],
      error: `Recent searches could not be loaded. ${cause instanceof Error ? cause.message : ""}`,
    };
  }
}

export function useAppController() {
  const { page, navigate } = useHashRoute();
  const [sharedMeme] = useState(readMemeShareFromHash);
  const {
    favorites, favoritesError, isFavorite, toggleFavorite,
    collections, collectionsError, createCollection, updateFavorite,
    favoriteFonts, favoriteFontsError, toggleFavoriteFont, exportData, importData,
  } = useFavorites();
  const [editorItem, setEditorItem] = useState(() =>
    sharedMeme.item ?? readEditorSourceFromHash(),
  );
  const [editorSettings, setEditorSettings] = useState(sharedMeme.settings);
  const [editorFile, setEditorFile] = useState(null);
  const [editorDraft, setEditorDraft] = useState(null);
  const [fileOpenError, setFileOpenError] = useState(sharedMeme.error);
  const [editorReturnPage, setEditorReturnPage] = useState("home");
  const sharedHashRef = useRef(globalThis.location?.hash ?? "");
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
  const [resultsLayout, setResultsLayout] = useState("providers");
  const [paginationMode, setPaginationMode] = useState("infinite");
  const [resultsPageIndex, setResultsPageIndex] = useState(0);
  const [similarityState, setSimilarityState] = useState({
    reference: null,
    results: [],
    loading: false,
    error: "",
    skipped: 0,
  });
  const similarityRequestRef = useRef(0);
  const [recentSearchState, setRecentSearchState] = useState(loadRecentSearches);
  const { searches: recentSearches, error: recentSearchError } = recentSearchState;

  useEffect(() => {
    function handleSharedHash() {
      const hash = globalThis.location.hash;
      if (hash === sharedHashRef.current) return;
      sharedHashRef.current = hash;
      const shared = readMemeShareFromHash(hash);
      if (!shared.item && !shared.error) return;
      setEditorItem(shared.item);
      setEditorSettings(shared.settings);
      setEditorFile(null);
      setEditorDraft(null);
      setFileOpenError(shared.error);
      setEditorReturnPage("home");
    }
    globalThis.addEventListener("hashchange", handleSharedHash);
    return () => globalThis.removeEventListener("hashchange", handleSharedHash);
  }, []);

  const openLocalFile = useCallback((file) => {
    setFileOpenError("");
    setEditorItem(null);
    setEditorSettings(null);
    setEditorFile(file);
    setEditorDraft(null);
    setEditorReturnPage(page === "editor" ? "home" : page);
    navigate("editor");
  }, [navigate, page]);

  useEffect(() => {
    function handleFileOpen(event) {
      if (!(event.detail instanceof Blob)) return;
      if (globalThis.__memesPendingFile === event.detail) {
        globalThis.__memesPendingFile = null;
      }
      openLocalFile(event.detail);
    }
    const handleFileOpenError = (event) => {
      setFileOpenError(`The selected file could not be opened. ${event.detail}`);
      globalThis.__memesFileOpenError = null;
    };
    globalThis.addEventListener("memes:file-open", handleFileOpen);
    globalThis.addEventListener("memes:file-open-error", handleFileOpenError);
    if (globalThis.__memesPendingFile instanceof Blob) {
      handleFileOpen({ detail: globalThis.__memesPendingFile });
    }
    if (globalThis.__memesFileOpenError) {
      handleFileOpenError({ detail: globalThis.__memesFileOpenError });
    }
    return () => {
      globalThis.removeEventListener("memes:file-open", handleFileOpen);
      globalThis.removeEventListener("memes:file-open-error", handleFileOpenError);
    };
  }, [openLocalFile]);

  const logRequest = useCallback((entry) => {
    setLogs((current) => [entry, ...current].slice(0, 100));
  }, []);

  const {
    mediaQuery,
    trendingQuery,
    categoriesQuery,
    apiQueryResult,
  } = useProviderQueries({
    page,
    providers,
    submittedQuery,
    kind,
    locale,
    apiRunId,
    apiAction,
    apiQuery,
    logRequest,
  });

  useEffect(() => {
    setResultsPageIndex(0);
  }, [submittedQuery, kind, locale, providers]);

  function submitSearch(event) {
    event.preventDefault();
    const term = query.trim();
    if (term) {
      setSubmittedQuery(term);
      rememberSearch(term);
    }
  }

  function chooseSearch(term, provider) {
    if (provider) setProviders([provider]);
    setQuery(term);
    setSubmittedQuery(term);
    rememberSearch(term);
    navigate("home");
  }

  function rememberSearch(term) {
    const normalized = term.trim().replace(/\s+/g, " ");
    if (!normalized) return;
    const nextSearches = [
      normalized,
      ...recentSearches.filter((entry) => entry.toLocaleLowerCase() !== normalized.toLocaleLowerCase()),
    ].slice(0, 8);
    try {
      globalThis.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextSearches));
      setRecentSearchState({ searches: nextSearches, error: "" });
    } catch (cause) {
      setRecentSearchState({
        searches: nextSearches,
        error: `Recent searches could not be saved. ${cause instanceof Error ? cause.message : ""}`,
      });
    }
  }

  function clearRecentSearches() {
    try {
      globalThis.localStorage.removeItem(RECENT_SEARCHES_KEY);
      setRecentSearchState({ searches: [], error: "" });
    } catch (cause) {
      setRecentSearchState({
        searches: recentSearches,
        error: `Recent searches could not be cleared. ${cause instanceof Error ? cause.message : ""}`,
      });
    }
  }

  function openEditor(item) {
    setEditorItem(item);
    setEditorSettings(null);
    setEditorFile(null);
    setEditorDraft(null);
    setEditorReturnPage(page === "editor" ? "home" : page);
    navigate("editor");
  }

  function openDraftInEditor(draft) {
    setEditorItem(null);
    setEditorSettings(null);
    setEditorFile(null);
    setEditorDraft(draft);
    setEditorReturnPage(page === "editor" ? "favorites" : page);
    navigate("editor");
  }

  function closeEditor() {
    setEditorSettings(null);
    setEditorFile(null);
    setEditorDraft(null);
    navigate(editorReturnPage);
  }

  function toggleProvider(provider) {
    setProviders((current) =>
      current.includes(provider)
        ? current.filter((entry) => entry !== provider)
        : [...current, provider],
    );
  }

  const visibleResults = useMemo(() => {
    const pages = mediaQuery.data?.pages ?? [];
    return Object.fromEntries(providers.map((provider) => {
      const providerPages = pages.map((pageResult) => pageResult[provider]).filter(Boolean);
      const seenItems = new Set();
      const items = providerPages.flatMap((result) => result.items ?? []).filter((item) => {
        const key = item.id || item.imageUrl;
        if (seenItems.has(key)) return false;
        seenItems.add(key);
        return true;
      });
      return [provider, {
        ...(providerPages.at(-1) ?? {}),
        items,
      }];
    }));
  }, [mediaQuery.data, providers]);

  const pagedResults = useMemo(() => {
    const pages = mediaQuery.data?.pages ?? [];
    const currentPage = pages[resultsPageIndex] ?? {};
    return Object.fromEntries(providers.map((provider) => [
      provider,
      currentPage[provider] ?? { items: [], exhausted: resultsPageIndex > 0 },
    ]));
  }, [mediaQuery.data, providers, resultsPageIndex]);

  const goToPreviousResultsPage = useCallback(() => {
    setResultsPageIndex((current) => Math.max(0, current - 1));
  }, []);

  const goToNextResultsPage = useCallback(async () => {
    const pages = mediaQuery.data?.pages ?? [];
    if (resultsPageIndex < pages.length - 1) {
      setResultsPageIndex(resultsPageIndex + 1);
      return;
    }
    if (!mediaQuery.hasNextPage || mediaQuery.isFetchingNextPage) return;
    const result = await mediaQuery.fetchNextPage();
    if ((result.data?.pages?.length ?? 0) > resultsPageIndex + 1) {
      setResultsPageIndex(resultsPageIndex + 1);
    }
  }, [
    mediaQuery.data,
    mediaQuery.fetchNextPage,
    mediaQuery.hasNextPage,
    mediaQuery.isFetchingNextPage,
    resultsPageIndex,
  ]);

  async function findSimilar(reference) {
    const requestId = similarityRequestRef.current + 1;
    similarityRequestRef.current = requestId;
    setSimilarityState({
      reference,
      results: [],
      loading: true,
      error: "",
      skipped: 0,
    });
    const candidates = [
      ...Object.values(visibleResults).flatMap((result) => result?.items ?? []),
      ...favorites,
    ];
    try {
      const ranked = await rankSimilarMedia(reference, candidates);
      if (requestId !== similarityRequestRef.current) return;
      setSimilarityState({
        reference,
        results: ranked.results,
        loading: false,
        error: ranked.results.length
          ? ""
          : ranked.skipped
            ? `No comparable images were readable. ${ranked.skipped} candidate image(s) may restrict local pixel access.`
            : "No comparable loaded images were found.",
        skipped: ranked.skipped,
      });
    } catch (cause) {
      if (requestId !== similarityRequestRef.current) return;
      setSimilarityState({
        reference,
        results: [],
        loading: false,
        error: cause instanceof Error ? cause.message : String(cause),
        skipped: 0,
      });
    }
  }

  function clearSimilarResults() {
    similarityRequestRef.current += 1;
    setSimilarityState({ reference: null, results: [], loading: false, error: "", skipped: 0 });
  }
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

  return {
    page, query, setQuery, submittedQuery, kind, setKind, locale, setLocale,
    providers, logs, logRequest, mediaQuery, visibleResults, pagedResults,
    favorites, favoritesError, isFavorite, toggleFavorite,
    favoriteFonts, favoriteFontsError, toggleFavoriteFont, exportData, importData,
    collections, collectionsError, createCollection, updateFavorite,
    editorItem, editorSettings, editorFile, editorDraft, fileOpenError,
    openEditor, openDraftInEditor, closeEditor,
    trendingSearchTerms, trendingSearchErrors, visibleCategories, categoriesQuery,
    apiAction, setApiAction, apiQuery, setApiQuery, apiQueryResult,
    consoleRoute, consoleJson, copied, copyJson, submitSearch, chooseSearch,
    recentSearches, recentSearchError, clearRecentSearches,
    resultsLayout, setResultsLayout, paginationMode, setPaginationMode,
    resultsPageIndex, goToPreviousResultsPage, goToNextResultsPage,
    similarityState, findSimilar, clearSimilarResults,
    toggleProvider, runApi: () => setApiRunId((current) => current + 1),
    clearLogs: () => setLogs([]),
  };
}
