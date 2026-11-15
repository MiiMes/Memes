import { MediaCard } from "./MediaComponents.jsx";

export function SimilarResults({
  reference,
  results,
  loading,
  error,
  skipped,
  onClear,
  onFindSimilar,
  isFavorite,
  onToggleFavorite,
  onEdit,
}) {
  if (!reference) return null;
  return (
    <section className="similar-results" aria-live="polite">
      <header>
        <div>
          <p className="eyebrow dark-eyebrow">LOCAL VISUAL MATCHING</p>
          <h2>Similar to “{reference.title}”</h2>
        </div>
        <button type="button" className="meme-editor-secondary" onClick={onClear}>Clear</button>
      </header>
      {loading ? (
        <div className="loading-state"><span className="loader" /> Comparing loaded images on this device…</div>
      ) : error ? (
        <p className="provider-error" role="status">{error}</p>
      ) : (
        <>
          <p className="similar-results-note">
            Similarity is estimated from image pixels in currently loaded results and favorites; it is not a provider-wide search.
            {skipped ? ` ${skipped} image${skipped === 1 ? " was" : "s were"} skipped because this browser could not read them.` : ""}
          </p>
          <div className="mosaic-grid">
            {results.map(({ item, score }, index) => (
              <MediaCard
                key={`${item.provider}-${item.id}-${index}`}
                item={item}
                similarityScore={score}
                copyOnClick={!item.video && item.kind !== "clip"}
                isFavorite={isFavorite(item)}
                onToggleFavorite={onToggleFavorite}
                onEdit={onEdit}
                onFindSimilar={onFindSimilar}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
