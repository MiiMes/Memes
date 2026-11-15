import { useEffect, useRef, useState } from "react";
import { MediaCard } from "./MediaComponents.jsx";
import { copyMediaToClipboard } from "../services/clipboard.js";
import { readMemeDrafts } from "../services/favorites.js";

export function FavoritesSection({
  favorites,
  collections,
  collectionsError = "",
  onCreateCollection,
  onUpdateFavorite,
  isFavorite,
  onToggleFavorite,
  onEdit,
  onFindSimilar,
  onOpenDraft,
  onExportData,
  onImportData,
}) {
  const [collectionName, setCollectionName] = useState("");
  const [actionError, setActionError] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [expandedSearchTerms, setExpandedSearchTerms] = useState([]);
  const [isExpandingSearch, setIsExpandingSearch] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState("");
  const [isDeckOpen, setIsDeckOpen] = useState(false);
  const [deckIndex, setDeckIndex] = useState(0);
  const [deckFeedback, setDeckFeedback] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [draftError, setDraftError] = useState("");
  const [backupFeedback, setBackupFeedback] = useState("");
  const [isBackingUp, setIsBackingUp] = useState(false);
  const deckRef = useRef(null);
  const backupInputRef = useRef(null);
  const normalizedTagFilter = tagFilter.trim().toLocaleLowerCase();
  const normalizedLibraryQuery = libraryQuery.trim().toLocaleLowerCase();
  const expandedTerms = expandedSearchTerms.map((term) => term.toLocaleLowerCase());
  const visibleDrafts = drafts.filter((draft) => {
    const searchableText = [
      draft.title,
      ...(draft.textLayers ?? []).map((layer) => layer.text),
    ].join(" ").toLocaleLowerCase();
    return !normalizedLibraryQuery ||
      searchableText.includes(normalizedLibraryQuery) ||
      expandedTerms.some((term) => searchableText.includes(term));
  });
  const visibleFavorites = favorites.filter((item) => {
    const matchesCollection = collectionFilter === ""
      ? true
      : collectionFilter === "unsorted"
        ? !item.collectionIds?.length
        : item.collectionIds?.includes(collectionFilter);
    const matchesTag = !normalizedTagFilter ||
      item.tags?.some((tag) => tag.toLocaleLowerCase().includes(normalizedTagFilter));
    const searchableText = [
      item.title,
      item.provider,
      item.captionText,
      ...(item.tags ?? []),
    ].join(" ").toLocaleLowerCase();
    return matchesCollection && matchesTag &&
      (!normalizedLibraryQuery ||
        searchableText.includes(normalizedLibraryQuery) ||
        expandedTerms.some((term) => searchableText.includes(term)));
  });
  const currentDeckItem = visibleFavorites[deckIndex];

  useEffect(() => {
    let active = true;
    readMemeDrafts().then((savedDrafts) => {
      if (active) setDrafts(savedDrafts.sort((left, right) => right.updatedAt - left.updatedAt));
    }).catch((cause) => {
      if (active) {
        setDraftError(`Local drafts could not be loaded. ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isDeckOpen) return undefined;
    function onKeyDown(event) {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        setDeckIndex((current) => (current + 1) % Math.max(1, visibleFavorites.length));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setDeckIndex((current) =>
          (current - 1 + visibleFavorites.length) % Math.max(1, visibleFavorites.length),
        );
      } else if (event.key === "Escape") {
        setIsDeckOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDeckOpen, visibleFavorites.length]);

  useEffect(() => {
    if (!visibleFavorites.length) setDeckIndex(0);
    else setDeckIndex((current) => Math.min(current, visibleFavorites.length - 1));
  }, [visibleFavorites.length]);

  function createCollection(event) {
    event.preventDefault();
    try {
      onCreateCollection(collectionName);
      setCollectionName("");
      setActionError("");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function updateDetails(item, details) {
    if (!onUpdateFavorite(item, details)) {
      setActionError("Favorite details could not be saved in this browser.");
    } else {
      setActionError("");
    }
  }

  async function copyDeckItem() {
    if (!currentDeckItem) return;
    setDeckFeedback("Copying GIF…");
    try {
      await copyMediaToClipboard(currentDeckItem);
      setDeckFeedback("GIF copied. Paste it into the target app to check support.");
    } catch (cause) {
      setDeckFeedback(`Copy failed. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async function enterFullscreen() {
    if (typeof deckRef.current?.requestFullscreen !== "function") {
      setDeckFeedback("Fullscreen is not supported in this browser.");
      return;
    }
    try {
      await deckRef.current.requestFullscreen();
      setDeckFeedback("");
    } catch (cause) {
      setDeckFeedback(`Fullscreen could not be opened. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async function expandLibrarySearch() {
    const languageModel = globalThis.LanguageModel ?? globalThis.ai?.languageModel;
    if (!libraryQuery.trim()) {
      setSearchFeedback("Enter a mood or phrase to expand.");
      return;
    }
    if (typeof languageModel?.create !== "function") {
      setSearchFeedback("On-device AI search is not available in this browser. Exact title, caption, provider, and tag search still works.");
      return;
    }
    setIsExpandingSearch(true);
    setSearchFeedback("Finding related local search terms on this device…");
    let session;
    try {
      const options = {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      };
      const availability = await languageModel.availability?.(options);
      if (availability === "unavailable") throw new Error("The on-device language model is unavailable.");
      session = await languageModel.create(options);
      const response = await session.prompt(
        `Suggest up to eight concise related words or short phrases for searching a personal meme library by mood or meaning. Search phrase: "${libraryQuery.trim()}". Return only comma-separated terms.`,
      );
      const terms = [...new Set(String(response)
        .split(/[,\n]+/)
        .map((term) => term.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
        .filter((term) => term && term.toLocaleLowerCase() !== libraryQuery.trim().toLocaleLowerCase()))]
        .slice(0, 8);
      if (!terms.length) throw new Error("The model returned no related search terms.");
      setExpandedSearchTerms(terms);
      setSearchFeedback(`Expanded locally with: ${terms.join(", ")}`);
    } catch (cause) {
      setExpandedSearchTerms([]);
      setSearchFeedback(`Search expansion failed. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      session?.destroy?.();
      setIsExpandingSearch(false);
    }
  }

  async function exportBackup() {
    setIsBackingUp(true);
    setBackupFeedback("");
    try {
      const backup = await onExportData();
      const url = URL.createObjectURL(backup);
      const link = document.createElement("a");
      link.href = url;
      link.download = "miimes-data-backup.json";
      link.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupFeedback("Favorites, collections, and favorite fonts exported.");
    } catch (cause) {
      setBackupFeedback(`Backup could not be exported. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsBackingUp(false);
    }
  }

  async function importBackup(file) {
    if (!file) return;
    setIsBackingUp(true);
    setBackupFeedback("");
    try {
      const imported = await onImportData(file);
      setBackupFeedback(
        `Backup merged: ${imported.favorites.length} favorite(s), ${imported.collections.length} collection(s), and ${imported.favoriteFonts.length} favorite font(s).`,
      );
    } catch (cause) {
      setBackupFeedback(`Backup could not be imported. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsBackingUp(false);
    }
  }

  return (
    <section className="favorites-section" aria-labelledby="favorites-heading">
      <header className="section-heading">
        <div>
          <p className="eyebrow dark-eyebrow">YOUR COLLECTION</p>
          <h2 id="favorites-heading">Favorite GIFs</h2>
        </div>
        <span className="favorites-count">
          {favorites.length} {favorites.length === 1 ? "GIF" : "GIFs"}
        </span>
        <div className="favorites-backup-actions">
          <button type="button" onClick={exportBackup} disabled={isBackingUp}>
            {isBackingUp ? "Working…" : "Export My Data"}
          </button>
          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            disabled={isBackingUp}
          >
            Import backup
          </button>
          <input
            ref={backupInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              void importBackup(event.target.files[0]);
              event.target.value = "";
            }}
          />
        </div>
      </header>
      <p className="favorites-backup-note">
        Backups merge into this browser. Generated GIFs are included; local drafts and source files stay on this device.
      </p>
      {backupFeedback && <p className="meme-editor-copy-feedback" role="status">{backupFeedback}</p>}
      <form className="favorite-collection-form" onSubmit={createCollection}>
        <label>
          <span>New collection</span>
          <input
            value={collectionName}
            onChange={(event) => setCollectionName(event.target.value)}
            maxLength={40}
            placeholder="e.g. Work reactions"
          />
        </label>
        <button type="submit" disabled={!collectionName.trim()}>Create collection</button>
      </form>
      {actionError && <p className="favorites-storage-error" role="alert">{actionError}</p>}
      {collectionsError && <p className="favorites-storage-error" role="status">{collectionsError}</p>}
      {(favorites.length > 0 || drafts.length > 0) && (
        <div className="favorite-filters">
          <label>
            <span>Search your library</span>
            <input
              value={libraryQuery}
              maxLength={100}
              onChange={(event) => {
                setLibraryQuery(event.target.value);
                setExpandedSearchTerms([]);
                setSearchFeedback("");
              }}
              placeholder="Titles, captions, providers, tags"
            />
          </label>
          <button
            className="meme-editor-secondary"
            type="button"
            onClick={expandLibrarySearch}
            disabled={isExpandingSearch}
          >
            {isExpandingSearch ? "Expanding…" : "Search by meaning"}
          </button>
          <label>
            <span>Collection</span>
            <select value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)}>
              <option value="">All collections</option>
              <option value="unsorted">Unsorted</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>{collection.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Filter by tag</span>
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="Search tags"
            />
          </label>
          <span>{visibleFavorites.length} shown</span>
        </div>
      )}
      {searchFeedback && <p className="meme-editor-copy-feedback" role="status">{searchFeedback}</p>}
      {favorites.length ? (
        visibleFavorites.length ? (
          <div className="mosaic-grid">
            {visibleFavorites.map((item) => (
              <div className="favorite-tile" key={`${item.provider}-${item.id}`}>
                <MediaCard
                  item={item}
                  copyOnClick
                  isFavorite={isFavorite(item)}
                  onToggleFavorite={onToggleFavorite}
                  onEdit={onEdit}
                  onFindSimilar={onFindSimilar}
                />
                <div className="favorite-details">
                  <label>
                    <span>Collection</span>
                    <select
                      value={item.collectionIds?.[0] ?? ""}
                      onChange={(event) => updateDetails(
                        item,
                        { collectionIds: event.target.value ? [event.target.value] : [] },
                      )}
                    >
                      <option value="">Unsorted</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>{collection.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Tags (comma-separated)</span>
                    <input
                      key={`${item.id}-${(item.tags ?? []).join(",")}`}
                      defaultValue={(item.tags ?? []).join(", ")}
                      maxLength={160}
                      onBlur={(event) => updateDetails(item, {
                        tags: [...new Set(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 12),
                      })}
                      aria-label={`Tags for ${item.title}`}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state favorites-empty">No favorites match these filters.</div>
        )
      ) : (
        <div className="empty-state favorites-empty">
          <p>You haven’t saved any GIFs yet.</p>
          <a href="#/">Search for GIFs to start your collection <span aria-hidden="true">↗</span></a>
        </div>
      )}
      {draftError && <p className="favorites-storage-error" role="status">{draftError}</p>}
      {drafts.length > 0 && (
        <section className="local-drafts-library" aria-labelledby="local-drafts-heading">
          <header>
            <div>
              <p className="eyebrow dark-eyebrow">STORED ON THIS DEVICE</p>
              <h3 id="local-drafts-heading">Meme drafts</h3>
            </div>
            <span>{visibleDrafts.length} shown</span>
          </header>
          {visibleDrafts.length ? visibleDrafts.map((draft) => (
            <article key={draft.id}>
              <div>
                <strong>{draft.title}</strong>
                <span>{(draft.textLayers ?? []).map((layer) => layer.text).filter(Boolean).join(" · ") || "No captions yet"}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenDraft?.(draft)}
                disabled={!onOpenDraft}
              >
                Continue editing
              </button>
            </article>
          )) : <p>No local drafts match this search.</p>}
        </section>
      )}
      {visibleFavorites.length > 0 && (
        <button
          className="meme-editor-secondary favorites-deck-launch"
          type="button"
          onClick={() => {
            setDeckIndex(0);
            setDeckFeedback("");
            setIsDeckOpen(true);
          }}
        >
          Open reaction deck ({visibleFavorites.length})
        </button>
      )}
      {isDeckOpen && currentDeckItem && (
        <div className="reaction-deck-backdrop">
          <section
            ref={deckRef}
            className="reaction-deck"
            role="dialog"
            aria-modal="true"
            aria-label="Reaction GIF deck"
          >
            <header>
              <span>{deckIndex + 1} / {visibleFavorites.length} · {currentDeckItem.title}</span>
              <button type="button" onClick={() => setIsDeckOpen(false)} aria-label="Close reaction deck">×</button>
            </header>
            <img src={currentDeckItem.imageUrl} alt={currentDeckItem.title} />
            <nav aria-label="Reaction deck controls">
              <button
                type="button"
                onClick={() => setDeckIndex((current) =>
                  (current - 1 + visibleFavorites.length) % visibleFavorites.length,
                )}
              >
                ← Previous
              </button>
              <button type="button" onClick={copyDeckItem}>Copy GIF</button>
              <button type="button" onClick={enterFullscreen}>Fullscreen</button>
              <button
                type="button"
                onClick={() => setDeckIndex((current) => (current + 1) % visibleFavorites.length)}
              >
                Next →
              </button>
            </nav>
            <p>Use ← / → or Space to switch reactions. Escape closes the deck.</p>
            {deckFeedback && <p role="status">{deckFeedback}</p>}
          </section>
        </div>
      )}
    </section>
  );
}
