import { useEffect, useRef, useState } from "react";
import { copyAnimatedGifToClipboard } from "../services/clipboard.js";
import { createCaptionedGif, drawCaption } from "../services/memeEditor.js";

function createGeneratedFavoriteId() {
  const uniqueId = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `edited-${uniqueId}`;
}

export function MemeEditor({
  item,
  onClose,
  isFavorite,
  onToggleFavorite,
  favoritesError = "",
}) {
  const [topText, setTopText] = useState("");
  const [bottomText, setBottomText] = useState("");
  const [fontSizePercent, setFontSizePercent] = useState(8);
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [exportError, setExportError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [outputUrl, setOutputUrl] = useState("");
  const [outputBlob, setOutputBlob] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [generatedFavoriteItem, setGeneratedFavoriteItem] = useState(null);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [favoriteActionError, setFavoriteActionError] = useState("");
  const previewRef = useRef(null);
  const previewImageRef = useRef(null);
  const captionCanvasRef = useRef(null);

  useEffect(() => {
    if (!outputUrl) return undefined;
    return () => URL.revokeObjectURL(outputUrl);
  }, [outputUrl]);

  useEffect(() => {
    if (outputUrl) return undefined;

    function renderCaptionPreview() {
      const preview = previewRef.current;
      const image = previewImageRef.current;
      const canvas = captionCanvasRef.current;
      if (!preview || !image?.naturalWidth || !image.naturalHeight || !canvas) return;

      const previewBounds = preview.getBoundingClientRect();
      const imageBounds = image.getBoundingClientRect();
      const pixelRatio = globalThis.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(imageBounds.width * pixelRatio));
      canvas.height = Math.max(1, Math.round(imageBounds.height * pixelRatio));
      canvas.style.left = `${imageBounds.left - previewBounds.left}px`;
      canvas.style.top = `${imageBounds.top - previewBounds.top}px`;
      canvas.style.width = `${imageBounds.width}px`;
      canvas.style.height = `${imageBounds.height}px`;

      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      drawCaption(context, topText, "top", image.naturalWidth, image.naturalHeight, fontSizePercent);
      drawCaption(context, bottomText, "bottom", image.naturalWidth, image.naturalHeight, fontSizePercent);
    }

    const image = previewImageRef.current;
    image?.addEventListener("load", renderCaptionPreview);
    renderCaptionPreview();

    const observer = typeof globalThis.ResizeObserver === "function"
      ? new globalThis.ResizeObserver(renderCaptionPreview)
      : null;
    if (previewRef.current) observer?.observe(previewRef.current);
    if (image) observer?.observe(image);
    if (!observer) globalThis.addEventListener("resize", renderCaptionPreview);

    return () => {
      image?.removeEventListener("load", renderCaptionPreview);
      observer?.disconnect();
      if (!observer) globalThis.removeEventListener("resize", renderCaptionPreview);
    };
  }, [bottomText, fontSizePercent, item?.imageUrl, outputUrl, topText]);

  function updateCaption(setter, value) {
    setter(value);
    setOutputUrl("");
    setOutputBlob(null);
    setGeneratedFavoriteItem(null);
    setExportError("");
    setCopyFeedback(null);
    setFavoriteActionError("");
  }

  async function createMeme(event) {
    event.preventDefault();
    setIsExporting(true);
    setIsPreviewOpen(true);
    setExportError("");
    setOutputUrl("");
    setOutputBlob(null);
    setGeneratedFavoriteItem(null);
    setCopyFeedback(null);
    setFavoriteActionError("");
    try {
      const blob = await createCaptionedGif(item.imageUrl, {
        topText,
        bottomText,
        fontSizePercent,
      });
      setOutputUrl(URL.createObjectURL(blob));
      setOutputBlob(blob);
      setGeneratedFavoriteItem({
        id: createGeneratedFavoriteId(),
        title: `Edited ${item.title || "GIF"}`,
        imageUrl: item.imageUrl,
        provider: "meme-editor",
        kind: "gif",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setExportError(message);
      setIsPreviewOpen(false);
    } finally {
      setIsExporting(false);
    }
  }

  async function copyMeme() {
    if (!outputBlob) return;
    setIsCopying(true);
    setCopyFeedback(null);
    try {
      await copyAnimatedGifToClipboard(outputBlob);
      setCopyFeedback({
        tone: "success",
        message: "Animated GIF copied. Paste it into your target app to check support.",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setCopyFeedback({ tone: "error", message });
    } finally {
      setIsCopying(false);
    }
  }

  async function toggleGeneratedFavorite() {
    if (!generatedFavoriteItem || !outputBlob || !onToggleFavorite) return;
    setIsSavingFavorite(true);
    setFavoriteActionError("");
    try {
      const saved = await onToggleFavorite(generatedFavoriteItem, outputBlob);
      if (!saved) setFavoriteActionError("Could not update this favorite. Check the favorites error message.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setFavoriteActionError(message);
    } finally {
      setIsSavingFavorite(false);
    }
  }

  if (!item) {
    return (
      <section className="meme-editor-empty">
        <p>Open the editor from a GIF card to start making a meme.</p>
        <button className="meme-editor-secondary" type="button" onClick={onClose}>
          Back to GIFs
        </button>
      </section>
    );
  }

  return (
    <section className="meme-editor" aria-label="Meme editor">
      <div className="meme-editor-workspace">
        <button className="meme-editor-back" type="button" onClick={onClose}>← Back</button>
        <div className="meme-editor-preview" ref={previewRef}>
          <img
            ref={previewImageRef}
            src={outputUrl || item.imageUrl}
            alt={item.title || "GIF meme preview"}
          />
          {!outputUrl && <canvas ref={captionCanvasRef} className="meme-editor-caption-canvas" aria-hidden="true" />}
        </div>
        <p className="meme-editor-preview-note">
          {outputUrl ? "Previewing your animated GIF." : "Caption preview updates as you type."}
        </p>
      </div>
      <form className="meme-editor-controls" onSubmit={createMeme}>
        <div>
          <p className="eyebrow dark-eyebrow">MAKE IT YOURS</p>
          <h2>Edit meme</h2>
        </div>
        <label className="meme-editor-field">
          <span>Top text</span>
          <textarea
            value={topText}
            onChange={(event) => updateCaption(setTopText, event.target.value)}
            maxLength={100}
            placeholder="WHEN THE MEME IS PERFECT"
            disabled={isExporting}
          />
        </label>
        <label className="meme-editor-field">
          <span>Bottom text</span>
          <textarea
            value={bottomText}
            onChange={(event) => updateCaption(setBottomText, event.target.value)}
            maxLength={100}
            placeholder="BUT THE CAPTION IS BETTER"
            disabled={isExporting}
          />
        </label>
        <label className="meme-editor-field meme-font-size">
          <span>Caption size <strong>{fontSizePercent}%</strong></span>
          <input
            type="range"
            min="5"
            max="14"
            value={fontSizePercent}
            onChange={(event) => {
              setFontSizePercent(Number(event.target.value));
              setOutputUrl("");
              setOutputBlob(null);
              setGeneratedFavoriteItem(null);
              setExportError("");
              setCopyFeedback(null);
              setFavoriteActionError("");
            }}
            disabled={isExporting}
          />
        </label>
        {exportError && <p className="meme-editor-error" role="alert">{exportError}</p>}
        <div className="meme-editor-actions">
          <button className="meme-editor-primary" type="submit" disabled={isExporting}>
            {isExporting ? "Creating GIF…" : "Create animated GIF"}
          </button>
          {outputBlob && (
            <button
              className="meme-editor-secondary"
              type="button"
              onClick={copyMeme}
              disabled={isCopying}
            >
              {isCopying ? "Copying GIF…" : "Copy animated GIF"}
            </button>
          )}
        </div>
        {copyFeedback && (
          <p
            className={`meme-editor-copy-feedback ${copyFeedback.tone}`}
            role={copyFeedback.tone === "error" ? "alert" : "status"}
          >
            {copyFeedback.message}
          </p>
        )}
      </form>
      {isPreviewOpen && (
        <div
          className="meme-editor-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsPreviewOpen(false);
          }}
        >
          <section
            className="meme-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meme-editor-dialog-title"
          >
            <div className="meme-editor-dialog-heading">
              <h2 id="meme-editor-dialog-title">
                {isExporting ? "Creating your GIF…" : "Your animated meme"}
              </h2>
              <button
                className="meme-editor-dialog-close"
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                aria-label="Close GIF preview"
              >
                ×
              </button>
            </div>
            {isExporting ? (
              <div className="meme-editor-dialog-loading" role="status">
                <span className="loader" />
                <span>Generating your GIF with the edited text…</span>
              </div>
            ) : outputUrl && (
              <>
                <img
                  className="meme-editor-dialog-image"
                  src={outputUrl}
                  alt={item.title || "Your animated meme"}
                />
                <p className="meme-editor-dialog-note">
                  Right-click the GIF to copy it, then paste it where you want.
                </p>
                <button
                  className="meme-editor-primary meme-editor-dialog-copy"
                  type="button"
                  onClick={copyMeme}
                  disabled={isCopying}
                >
                  {isCopying ? "Copying GIF…" : "Click to Copy"}
                </button>
                {generatedFavoriteItem && onToggleFavorite && (
                  <button
                    className="meme-editor-secondary meme-editor-dialog-favorite"
                    type="button"
                    onClick={toggleGeneratedFavorite}
                    disabled={isSavingFavorite}
                    aria-pressed={isFavorite?.(generatedFavoriteItem) ?? false}
                  >
                    {isSavingFavorite
                      ? "Saving favorite…"
                      : isFavorite?.(generatedFavoriteItem)
                        ? "♥ Remove from Favorites"
                        : "♡ Add to Favorites"}
                  </button>
                )}
                {(favoritesError || favoriteActionError) && (
                  <p className="meme-editor-error" role="alert">
                    {favoritesError || favoriteActionError}
                  </p>
                )}
                {copyFeedback && (
                  <p
                    className={`meme-editor-copy-feedback ${copyFeedback.tone}`}
                    role={copyFeedback.tone === "error" ? "alert" : "status"}
                  >
                    {copyFeedback.message}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
