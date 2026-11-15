import { useEffect, useState } from "react";
import { copyAnimatedGifToClipboard } from "../services/clipboard.js";
import { createCaptionedGif } from "../services/memeEditor.js";

export function MemeEditor({ item, onClose }) {
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

  useEffect(() => {
    if (!outputUrl) return undefined;
    return () => URL.revokeObjectURL(outputUrl);
  }, [outputUrl]);

  function updateCaption(setter, value) {
    setter(value);
    setOutputUrl("");
    setOutputBlob(null);
    setExportError("");
    setCopyFeedback(null);
  }

  async function createMeme(event) {
    event.preventDefault();
    setIsExporting(true);
    setIsPreviewOpen(true);
    setExportError("");
    setOutputUrl("");
    setOutputBlob(null);
    setCopyFeedback(null);
    try {
      const blob = await createCaptionedGif(item.imageUrl, {
        topText,
        bottomText,
        fontSizePercent,
      });
      setOutputUrl(URL.createObjectURL(blob));
      setOutputBlob(blob);
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
        <div className="meme-editor-preview">
          <img
            src={outputUrl || item.imageUrl}
            alt={item.title || "GIF meme preview"}
          />
          {!outputUrl && (
            <div className="meme-editor-caption-preview" aria-hidden="true">
              {topText && <span className="caption-top">{topText}</span>}
              {bottomText && <span className="caption-bottom">{bottomText}</span>}
            </div>
          )}
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
              setExportError("");
              setCopyFeedback(null);
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
