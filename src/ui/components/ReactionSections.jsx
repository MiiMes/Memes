import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PROVIDER_NAMES, REACTIONS_BY_PROVIDER } from "../constants/appConstants.js";
import { providerIsConfigured, requestProvider } from "../services/providerApi.js";
import { findReactionPreview, reactionKey } from "../utils/searchTerms.js";

export function ReactionSections({ providers, results, loading, onSelect, locale, logRequest }) {
  if (!providers.length) {
    return <div className="empty-state">Choose at least one provider above to browse its reactions.</div>;
  }

  const reactionsByTerm = new Map();
  for (const provider of providers) {
    for (const term of REACTIONS_BY_PROVIDER[provider] ?? []) {
      const key = reactionKey(term);
      const existing = reactionsByTerm.get(key);
      if (existing) {
        if (!existing.providers.includes(provider)) existing.providers.push(provider);
      } else {
        reactionsByTerm.set(key, { term, providers: [provider] });
      }
    }
  }
  const reactions = [...reactionsByTerm.values()];
  const previewErrors = providers.flatMap((provider) =>
    results[provider]?.error ? [{ provider, error: results[provider].error }] : [],
  );

  return (
    <div className="reaction-results">
      <p className="reaction-help">
        Preview GIFs load as you scroll. Missing category thumbnails are searched one at a time.
      </p>
      <header className="reaction-results-heading">
        <h3>All reactions</h3>
        <span>{reactions.length} unique terms</span>
        {loading && <span>Loading category previews…</span>}
      </header>
      {previewErrors.map(({ provider, error }) => (
        <div className="reaction-preview-error" key={provider} role="status">
          {PROVIDER_NAMES[provider]} category previews unavailable: {error}
        </div>
      ))}
      <div className="reaction-catalog">
        {reactions.map(({ term, providers: sources }, index) => {
          const categoryPreview = sources
            .map((provider) => findReactionPreview(term, results[provider]?.items ?? []))
            .find(Boolean) ?? "";
          const previewProvider = sources.find(providerIsConfigured) ?? sources[0];
          return (
            <ReactionTile
              key={reactionKey(term)}
              providers={sources}
              previewProvider={previewProvider}
              reaction={term}
              index={index}
              locale={locale}
              categoryPreview={categoryPreview}
              logRequest={logRequest}
              onSelect={() => onSelect(term)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ReactionTile({
  providers,
  previewProvider,
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
    queryKey: ["reaction-preview", previewProvider, reaction, locale],
    queryFn: () => requestProvider(
      previewProvider,
      "search",
      { q: reaction, kind: "gif", locale, limit: 1 },
      logRequest,
    ),
    enabled:
      isVisible &&
      providerIsConfigured(previewProvider) &&
      (!categoryPreview || categoryPreviewFailed),
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
      aria-label={`Search for ${reaction} on ${providers.map((provider) => PROVIDER_NAMES[provider]).join(" and ")}`}
    >
      <span className={`reaction-tile-art hue-${index % 6}`}>
        {imageUrl ? (
          <meta charSet="utf-8">
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              onError={() => {
                if (categoryPreview && !categoryPreviewFailed) setCategoryPreviewFailed(true);
                else setSearchPreviewFailed(true);
              }}
            />
          </meta>
        ) : (
          <span aria-hidden="true">{["✦", "☺", "♥", "✳", "☁", "✧"][index % 6]}</span>
        )}
        {previewQuery.isFetching && !imageUrl && <span className="reaction-preview-loader" />}
        <span className="reaction-tile-arrow" aria-hidden="true">↗</span>
      </span>
      <span className="reaction-tile-name">{reaction}</span>
      <span className="reaction-tile-sources">
        {providers.map((provider) => PROVIDER_NAMES[provider]).join(" + ")}
      </span>
    </button>
  );
}
