import { PROVIDER_NAMES } from "../constants/appConstants.js";
import { ExploreSections } from "./ExploreSections.jsx";
import { MediaCard } from "./MediaComponents.jsx";

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
  layout = "providers",
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
              />
            ))}
          </div>
        ) : !failures.length ? (
          <div className="provider-empty">No results yet. Try another search or provider.</div>
        ) : null}
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
                  />
                ))}
              </div>
            ) : !result?.error ? (
              <div className="provider-empty">
                No results yet. Try another search or provider.
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
