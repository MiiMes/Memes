import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PROVIDER_NAMES } from "../constants/appConstants.js";
import { providerIsConfigured, requestProvider } from "../services/providerApi.js";
import { reactionKey } from "../utils/searchTerms.js";
import { MediaCard } from "./MediaComponents.jsx";

export function ExploreSections({ providers, results, loading, kind, locale, logRequest, onSelect }) {
  if (loading) {
    return <div className="loading-state"><span className="loader" /> Contacting selected providers...</div>;
  }
  if (!providers.length) {
    return <div className="empty-state">Choose at least one provider above to explore categories.</div>;
  }

  const categoriesByQuery = new Map();
  for (const provider of providers) {
    for (const item of results[provider]?.items ?? []) {
      const query = String(item.query ?? item.title ?? "").trim();
      const key = reactionKey(query);
      if (!key) continue;

      const existing = categoriesByQuery.get(key);
      if (existing) {
        if (!existing.providers.includes(provider)) existing.providers.push(provider);
        existing.sources.push({ provider, item });
      } else {
        categoriesByQuery.set(key, {
          key,
          title: item.title || query,
          query: query || item.title,
          providers: [provider],
          sources: [{ provider, item }],
        });
      }
    }
  }

  const categories = [...categoriesByQuery.values()];
  const errors = providers.flatMap((provider) =>
    results[provider]?.error ? [{ provider, error: results[provider].error }] : [],
  );

  return (
    <div className="explore-results">
      <header className="explore-results-heading">
        <h3>All categories</h3>
        <span>{categories.length} unique categories</span>
      </header>
      {errors.map(({ provider, error }) => (
        <div className="provider-error" key={provider} role="status">
          {PROVIDER_NAMES[provider]} categories unavailable: {error}
        </div>
      ))}
      {categories.length ? (
        <div className="mosaic-grid">
          {categories.map((category) => (
            <ExploreCategoryCard
              key={category.key}
              category={category}
              kind={kind}
              locale={locale}
              logRequest={logRequest}
              onSelect={() => onSelect?.(category.query)}
            />
          ))}
        </div>
      ) : !errors.length ? (
        <div className="provider-empty">No categories returned for this media type.</div>
      ) : null}
    </div>
  );
}

function providerCanSearch(provider, kind) {
  if (provider === "tenor") return kind === "gif";
  if (provider === "giphy") return kind !== "clip";
  return true;
}

export function ExploreCategoryCard({ category, kind, locale, logRequest, onSelect }) {
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

  const categoryPreview =
    category.sources.map(({ item }) => item.imageUrl).find(Boolean) ?? "";
  const hasCategoryPreview = Boolean(categoryPreview) && !categoryPreviewFailed;
  const previewProvider = category.providers.find((provider) => providerCanSearch(provider, kind));
  const previewQuery = useQuery({
    queryKey: ["explore-category-preview", previewProvider, category.query, kind, locale],
    queryFn: () => requestProvider(previewProvider, "search", {
      q: category.query,
      kind,
      locale,
      limit: 1,
    }, logRequest),
    enabled:
      isVisible &&
      !hasCategoryPreview &&
      !searchPreviewFailed &&
      Boolean(previewProvider) &&
      providerIsConfigured(previewProvider),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
  const searchPreview = previewQuery.data?.items?.[0]?.imageUrl ?? "";
  const imageUrl = hasCategoryPreview
    ? categoryPreview
    : searchPreviewFailed ? "" : searchPreview;

  return (
    <MediaCard
      cardRef={tileRef}
      item={{
        id: category.key,
        title: category.title,
        imageUrl,
        provider: category.providers[0],
        providers: category.providers,
        kind,
      }}
      onSelect={onSelect}
      copyOnClick={Boolean(imageUrl)}
      overlayAlwaysVisible
      onImageError={() => {
        if (hasCategoryPreview) setCategoryPreviewFailed(true);
        else setSearchPreviewFailed(true);
      }}
    />
  );
}
