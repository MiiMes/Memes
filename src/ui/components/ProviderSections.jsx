import { useEffect, useRef } from "react";
import { PROVIDER_NAMES } from "../constants/appConstants.js";
import { ExploreSections } from "./ExploreSections.jsx";
import { MediaCard } from "./MediaComponents.jsx";

function PaginationControl({
  mode,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  currentPage,
  totalPages,
  onPreviousPage,
  onNextPage,
}) {
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!isFetchingNextPage) loadingRef.current = false;
  }, [isFetchingNextPage]);

  useEffect(() => {
    if (
      mode !== "infinite" ||
      !hasNextPage ||
      isFetchingNextPage ||
      typeof globalThis.IntersectionObserver !== "function" ||
      !sentinelRef.current
    ) {
      return undefined;
    }
    const observer = new globalThis.IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadNextPage();
    }, { rootMargin: "600px" });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [mode, hasNextPage, isFetchingNextPage, onLoadMore]);

  function loadNextPage() {
    if (mode !== "infinite" || !hasNextPage || isFetchingNextPage || loadingRef.current) return;
    loadingRef.current = true;
    onLoadMore();
  }

  if (mode === "paged") {
    const canGoNext = currentPage < totalPages || hasNextPage;
    return (
      <div className="results-pagination results-pagination-paged">
        <button
          className="meme-editor-secondary"
          type="button"
          onClick={onPreviousPage}
          disabled={currentPage <= 1 || isFetchingNextPage}
        >
          Previous
        </button>
        <span>
          Page {currentPage} of {totalPages}{hasNextPage ? "+" : ""}
          {isFetchingNextPage ? " · Loading next page..." : ""}
        </span>
        <button
          className="meme-editor-secondary"
          type="button"
          onClick={onNextPage}
          disabled={!canGoNext || isFetchingNextPage}
        >
          Next
        </button>
      </div>
    );
  }

  if (!hasNextPage) return null;
  return (
    <div className="results-pagination" ref={sentinelRef}>
      <button
        className="meme-editor-secondary"
        type="button"
        onClick={loadNextPage}
        disabled={isFetchingNextPage}
      >
        {isFetchingNextPage ? "Loading more results..." : "Load next page"}
      </button>
      <span>{isFetchingNextPage ? "Fetching more from selected providers..." : "Scroll for more or load the next page."}</span>
    </div>
  );
}

export function ProviderSections({
  providers,
  results,
  loading,
  onSelect,
  categoryView = false,
  kind,
  locale,
  logRequest,
  isFavorite,
  onToggleFavorite,
  onEdit,
  onFindSimilar,
  layout = "providers",
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  paginationMode = "infinite",
  currentPage = 1,
  totalPages = 1,
  onPreviousPage,
  onNextPage,
}) {
  if (categoryView) {
    return (
      <ExploreSections
        providers={providers}
        results={results}
        loading={loading}
        kind={kind}
        locale={locale}
        logRequest={logRequest}
        onSelect={onSelect}
      />
    );
  }
  if (loading) {
    return <div className="loading-state"><span className="loader" /> Contacting selected providers...</div>;
  }
  if (!providers.length) {
    return <div className="empty-state">Choose at least one provider above to get started.</div>;
  }
  if (layout === "unified") {
    const itemsByUrl = new Map();
    const failures = [];
    for (const provider of providers) {
      const result = results[provider];
      if (result?.error) failures.push({ provider, error: result.error });
      for (const item of result?.items ?? []) {
        const key = `${item.kind}:${item.imageUrl || `${provider}:${item.id}`}`;
        const existing = itemsByUrl.get(key);
        if (existing) {
          if (!existing.providers.includes(provider)) existing.providers.push(provider);
        } else {
          itemsByUrl.set(key, { ...item, provider, providers: [provider] });
        }
      }
    }
    const items = Array.from(itemsByUrl.values());
    return (
      <section className="provider-section unified-results">
        <div className="provider-section-heading">
          <h3>All providers</h3>
          <span className="provider-count">{items.length} results</span>
        </div>
        {failures.map(({ provider, error }) => (
          <div className="provider-error" key={provider} role="status">
            {PROVIDER_NAMES[provider]}: {error}
          </div>
        ))}
        {items.length ? (
          <div className="mosaic-grid">
            {items.map((item, index) => (
              <MediaCard
                item={item}
                key={`${item.provider}-${item.id}-${index}`}
                copyOnClick={!item.video && item.kind !== "clip"}
                isFavorite={isFavorite(item)}
                onToggleFavorite={onToggleFavorite}
                onEdit={onEdit}
                onFindSimilar={onFindSimilar}
              />
            ))}
          </div>
        ) : !failures.length ? (
          <div className="provider-empty">No results yet. Try another search or provider.</div>
        ) : null}
        <PaginationControl
          mode={paginationMode}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={onLoadMore}
          currentPage={currentPage}
          totalPages={totalPages}
          onPreviousPage={onPreviousPage}
          onNextPage={onNextPage}
        />
      </section>
    );
  }
  return (
    <div className="provider-sections">
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
                  <MediaCard
                    item={item}
                    key={`${provider}-${item.id}-${index}`}
                    copyOnClick={!item.video && item.kind !== "clip"}
                    isFavorite={isFavorite(item)}
                    onToggleFavorite={onToggleFavorite}
                    onEdit={onEdit}
                    onFindSimilar={onFindSimilar}
                  />
                ))}
              </div>
            ) : !result?.error ? (
              <div className="provider-empty">
                {result?.exhausted
                  ? "No more results from this provider."
                  : "No results yet. Try another search or provider."}
              </div>
            ) : null}
          </section>
        );
      })}
      <PaginationControl
        mode={paginationMode}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
        currentPage={currentPage}
        totalPages={totalPages}
        onPreviousPage={onPreviousPage}
        onNextPage={onNextPage}
      />
    </div>
  );
}
