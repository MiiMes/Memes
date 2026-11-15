import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PROVIDER_NAMES } from "../constants/appConstants.js";
import { providerIsConfigured, requestProvider } from "../services/providerApi.js";

export function TrendingSearchStrip({ searches, errors, locale, logRequest, onSelect }) {
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

export function TrendingSearchCard({ term, index, locale, logRequest, onSelect }) {
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
