function imageMimeType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

function errorDetails(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
  };
}

function mediaLocation(url) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return "unparseable media URL";
  }
}

function createClipboardLogger(item, mediaUrl, mimeType) {
  const consoleApi = globalThis.console;
  consoleApi?.groupCollapsed?.(
    `%c📋 Clipboard debug: ${item.title || "media result"}`,
    "color: #8b5cf6; font-weight: bold",
  );
  consoleApi?.info?.("Media source", {
    url: mediaLocation(mediaUrl),
    mimeType,
    secureContext: globalThis.isSecureContext,
    userAgent: globalThis.navigator?.userAgent ?? "unknown",
  });

  return {
    log(label, details) {
      consoleApi?.info?.(`📋 ${label}`, details);
    },
    close() {
      consoleApi?.groupEnd?.();
    },
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("Could not encode media as a data URL."));
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function tryLegacyImageCopy(imageElement, logger) {
  const document = imageElement?.ownerDocument;
  if (!imageElement?.isConnected || !document || typeof document.execCommand !== "function") {
    logger.log("Legacy selected-image copy unavailable", {
      hasConnectedImage: Boolean(imageElement?.isConnected),
      hasExecCommand: typeof document?.execCommand === "function",
    });
    return false;
  }

  const selection = document.getSelection?.();
  if (!selection) {
    logger.log("Legacy selected-image copy unavailable", { hasSelection: false });
    return false;
  }

  const previousRanges = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    previousRanges.push(selection.getRangeAt(index).cloneRange());
  }
  let copied = false;

  try {
    const range = document.createRange();
    range.selectNode(imageElement);
    selection.removeAllRanges();
    selection.addRange(range);
    copied = document.execCommand("copy");
    logger.log("Legacy selected-image copy", {
      acceptedByBrowser: copied,
      selectedImage: {
        tagName: imageElement.tagName,
        loaded: imageElement.complete && imageElement.naturalWidth > 0,
        width: imageElement.naturalWidth,
        height: imageElement.naturalHeight,
      },
      note: "The browser does not expose the resulting native clipboard formats to this page.",
    });
  } catch (error) {
    logger.log("Legacy selected-image copy failed", errorDetails(error));
  } finally {
    selection.removeAllRanges();
    for (const range of previousRanges) selection.addRange(range);
  }

  return copied;
}

export async function copyMediaToClipboard(item, imageElement) {
  const mediaUrl = item.imageUrl;
  if (!mediaUrl) throw new Error("This result has no media URL to copy.");

  const mimeType = imageMimeType(mediaUrl);
  if (!mimeType) throw new Error("This result does not have a recognizable image format.");

  const clipboard = globalThis.navigator?.clipboard;
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  const logger = createClipboardLogger(item, mediaUrl, mimeType);
  if (!clipboard || typeof clipboard.write !== "function" ||
    typeof ClipboardItemConstructor !== "function") {
    logger.log("Async Clipboard API unavailable", {
      hasClipboardWrite: typeof clipboard?.write === "function",
      hasClipboardItem: typeof ClipboardItemConstructor === "function",
    });
    logger.close();
    throw new Error("This browser does not expose the Clipboard API required for media copying.");
  }

  const errors = [];
  let fetchError;
  const imageBlob = fetch(mediaUrl)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Media request returned HTTP ${response.status}.`);
      const blob = await response.blob();
      const blobType = blob.type?.split(";")[0].toLowerCase();
      if (blobType && blobType !== mimeType) {
        throw new Error(`Expected ${mimeType} but received ${blobType}.`);
      }
      if (!blobType?.startsWith("image/")) {
        throw new Error("The result URL did not return a recognizable image.");
      }
      logger.log("Media fetched", {
        byteLength: blob.size,
        responseMimeType: blobType,
      });
      return blob;
    })
    .catch((error) => {
      fetchError = error;
      logger.log("Media fetch failed", errorDetails(error));
      throw error;
    });
  imageBlob.catch(() => {});

  const supports = (format) => {
    if (typeof ClipboardItemConstructor.supports !== "function") return "unknown";
    try {
      return ClipboardItemConstructor.supports(format);
    } catch (error) {
      logger.log(`Format support check failed: ${format}`, errorDetails(error));
      return false;
    }
  };
  const customMimeType = `web ${mimeType}`;
  const customFormatSupport = supports(customMimeType);
  const nativeFormatSupport = supports(mimeType);
  logger.log("Clipboard format support", {
    native: { format: mimeType, supported: nativeFormatSupport },
    custom: { format: customMimeType, supported: customFormatSupport },
    richText: { format: "text/html", supported: supports("text/html") },
  });

  const legacyCopyAccepted = tryLegacyImageCopy(imageElement, logger);
  const writeCandidate = async (label, formats, result) => {
    try {
      const clipboardItem = new ClipboardItemConstructor(formats);
      await clipboard.write([clipboardItem]);
      logger.log(`${label} accepted by browser`, {
        formats: Object.keys(formats),
        note: "Clipboard API acceptance does not verify that another app can paste this representation.",
      });
      return result;
    } catch (error) {
      errors.push(error);
      logger.log(`${label} rejected`, errorDetails(error));
      return null;
    }
  };

  try {
    if (legacyCopyAccepted) {
      const nativeResult = await writeCandidate(
        `Native ${mimeType} Blob write`,
        { [mimeType]: imageBlob },
        { method: "native", mimeType },
      );
      if (nativeResult) return nativeResult;
      logger.log("Preserving selected-image clipboard result", {
        reason: "The legacy copy command accepted the actual rendered image; HTML fallbacks are skipped.",
      });
      return { method: "legacy-image", mimeType };
    }

    const dataUrl = imageBlob.then(blobToDataUrl);
    const htmlBlob = dataUrl.then((value) => new Blob([
      `<img src="${value}" alt="${escapeHtml(item.title || "GIF")}">`,
    ], { type: "text/html" }));
    const allFormats = { [mimeType]: imageBlob, "text/html": htmlBlob };
    if (customFormatSupport === true) allFormats[customMimeType] = imageBlob;
    const multiFormatResult = await writeCandidate(
      "Multi-format Blob + rich HTML write",
      allFormats,
      { method: "multi-format", mimeType, formats: Object.keys(allFormats) },
    );
    if (multiFormatResult) return multiFormatResult;

    const nativeResult = await writeCandidate(
      `Native ${mimeType} Blob write`,
      { [mimeType]: imageBlob },
      { method: "native", mimeType },
    );
    if (nativeResult) return nativeResult;

    if (customFormatSupport === true) {
      const richAndCustomResult = await writeCandidate(
        "Rich HTML + browser custom GIF write",
        { "text/html": htmlBlob, [customMimeType]: imageBlob },
        { method: "rich-html-custom", mimeType },
      );
      if (richAndCustomResult) return richAndCustomResult;

      const customResult = await writeCandidate(
        `Browser custom ${customMimeType} write`,
        { [customMimeType]: imageBlob },
        { method: "web-custom", mimeType },
      );
      if (customResult) return customResult;
    }

    const richTextResult = await writeCandidate(
      "Rich HTML data-URL write",
      { "text/html": htmlBlob },
      { method: "rich-html", mimeType },
    );
    if (richTextResult) return richTextResult;

    if (fetchError) {
      throw new Error(
        `Could not fetch the media bytes: ${errorDetails(fetchError).message}`,
        { cause: fetchError },
      );
    }
    const lastError = errors.at(-1);
    throw new Error(
      `All clipboard strategies failed${lastError ? `: ${lastError.message}` : "."} See the console for per-strategy details.`,
      { cause: new AggregateError(errors, "Clipboard strategies failed.") },
    );
  } finally {
    logger.close();
  }
}
