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
