import { useCallback, useState } from "react";
import {
  PROVIDERS,
  TRENDING_SEARCH_PROVIDERS,
} from "../constants/appConstants.js";
import { getLogicalRoute } from "../utils/routes.js";
import { useFavorites } from "./useFavorites.js";
import { useHashRoute } from "./useHashRoute.js";
import { useProviderQueries } from "./useProviderQueries.js";

const RECENT_SEARCHES_KEY = "memes:recent-searches:v1";

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
  const {
    favorites, favoritesError, isFavorite, toggleFavorite,
    collections, collectionsError, createCollection, updateFavorite,
  } = useFavorites();
  const [editorItem, setEditorItem] = useState(null);
  const [editorReturnPage, setEditorReturnPage] = useState("home");
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
  const [recentSearchState, setRecentSearchState] = useState(loadRecentSearches);
  const { searches: recentSearches, error: recentSearchError } = recentSearchState;

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
    setEditorReturnPage(page === "editor" ? "home" : page);
    navigate("editor");
  }

  function closeEditor() {
    navigate(editorReturnPage);
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

  return {
    page, query, setQuery, submittedQuery, kind, setKind, locale, setLocale,
    providers, logs, logRequest, mediaQuery, visibleResults,
    favorites, favoritesError, isFavorite, toggleFavorite,
    collections, collectionsError, createCollection, updateFavorite,
    editorItem, openEditor, closeEditor,
    trendingSearchTerms, trendingSearchErrors, visibleCategories, categoriesQuery,
    apiAction, setApiAction, apiQuery, setApiQuery, apiQueryResult,
    consoleRoute, consoleJson, copied, copyJson, submitSearch, chooseSearch,
    recentSearches, recentSearchError, clearRecentSearches,
    resultsLayout, setResultsLayout,
    toggleProvider, runApi: () => setApiRunId((current) => current + 1),
    clearLogs: () => setLogs([]),
  };
}
