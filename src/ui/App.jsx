import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { LOCALES } from "./constants/appConstants.js";
import { ApiConsole } from "./components/ApiConsole.jsx";
import { FavoritesSection } from "./components/FavoritesSection.jsx";
import { MediaSwitch, ProviderFilters } from "./components/MediaComponents.jsx";
import { ProviderSections } from "./components/ProviderSections.jsx";
import { ReactionSections } from "./components/ReactionSections.jsx";
import { TrendingSearchStrip } from "./components/TrendingSearchStrip.jsx";
import { useAppController } from "./hooks/useAppController.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MemeApp />
      <ReactQueryDevtools buttonPosition="bottom-right" />
    </QueryClientProvider>
  );
}

function MemeApp() {
  const {
    page, query, setQuery, submittedQuery, kind, setKind, locale, setLocale,
    providers, logs, logRequest, mediaQuery, visibleResults, trendingSearchTerms,
    trendingSearchErrors, visibleCategories, categoriesQuery, apiAction, setApiAction,
    apiQuery, setApiQuery, apiQueryResult, consoleRoute, consoleJson, copied,
    copyJson, submitSearch, chooseSearch, toggleProvider, runApi, clearLogs,
    favorites, favoritesError, isFavorite, toggleFavorite,
  } = useAppController();
  const pageHeading = page === "explore"
    ? "Explore"
    : page === "reactions"
      ? "Reaction GIFs"
      : page === "favorites"
        ? "Favorites"
        : "API console";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Memes home">
          <span className="brand-mark">m</span> memes
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className={page === "explore" ? "active" : ""} href="#/explore">Explore</a>
          <a className={page === "reactions" ? "active" : ""} href="#/reactions">Reactions</a>
          <a className={page === "favorites" ? "active" : ""} href="#/favorites">Favorites</a>
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
                    : page === "favorites"
                      ? "Your favorite GIFs, all in one place."
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
          {favoritesError && (
            <p className="favorites-storage-error" role="status">{favoritesError}</p>
          )}
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
              run={runApi}
              result={apiQueryResult}
              route={consoleRoute}
              json={consoleJson}
              copied={copied}
              copyJson={copyJson}
              logs={logs}
              clearLogs={clearLogs}
            />
          ) : page === "favorites" ? (
            <FavoritesSection
              favorites={favorites}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
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
                  onSelect={(term) => {
                    setKind("gif");
                    chooseSearch(term);
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
                  kind={kind}
                  locale={locale}
                  logRequest={logRequest}
                />
              ) : (
                <ProviderSections
                  providers={providers}
                  results={visibleResults}
                  loading={mediaQuery.isPending || mediaQuery.isFetching}
                  isFavorite={isFavorite}
                  onToggleFavorite={toggleFavorite}
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

export default App;
