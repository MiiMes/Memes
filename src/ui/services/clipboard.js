const MAX_STATIC_PNG_PIXELS = 16_000_000;

function imageMimeType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  return "";
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

async function createStaticPng(gifBlob, logger) {
  const image = new globalThis.Image();
  const objectUrl = globalThis.URL.createObjectURL(gifBlob);
  try {
    if (typeof image.decode === "function") {
      image.src = objectUrl;
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("The GIF's first frame could not be decoded."));
        image.src = objectUrl;
      });
    }

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > MAX_STATIC_PNG_PIXELS) {
      throw new Error("The GIF is too large to safely copy as a static image.");
    }

    const canvas = globalThis.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot create a PNG clipboard image.");
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not export the GIF frame as PNG."));
      }, "image/png");
    });
    logger.log("GIF converted to static PNG", {
      width,
      height,
      byteLength: pngBlob.size,
      animationPreserved: false,
    });
    return pngBlob;
  } finally {
    globalThis.URL.revokeObjectURL(objectUrl);
  }
}

function copyWithLegacyHtmlSelection(item) {
  const documentApi = globalThis.document;
  const selection = documentApi?.getSelection?.();
  if (!documentApi?.body || !selection || typeof documentApi.execCommand !== "function") {
    throw new Error("Legacy rich HTML copying is not available in this browser.");
  }

  const previousRanges = Array.from(
    { length: selection.rangeCount },
    (_, index) => selection.getRangeAt(index).cloneRange(),
  );
  const previouslyFocused = documentApi.activeElement;
  const container = documentApi.createElement("div");
  container.contentEditable = "true";
  container.tabIndex = -1;
  container.setAttribute("aria-hidden", "true");
  container.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0;";

  const image = documentApi.createElement("img");
  image.src = item.imageUrl;
  image.alt = item.title || "GIF";
  container.appendChild(image);
  documentApi.body.appendChild(container);

  try {
    container.focus({ preventScroll: true });
    const range = documentApi.createRange();
    range.selectNodeContents(container);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!documentApi.execCommand("copy")) {
      throw new Error("The browser rejected the legacy rich HTML copy command.");
    }
  } finally {
    selection.removeAllRanges();
    container.remove();
    previousRanges.forEach((range) => selection.addRange(range));
    previouslyFocused?.focus({ preventScroll: true });
  }
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

export async function copyMediaToClipboard(item) {
  const mediaUrl = item.imageUrl;
  if (!mediaUrl) throw new Error("This result has no media URL to copy.");

  const mimeType = imageMimeType(mediaUrl);
  if (!mimeType) throw new Error("This result does not have a recognizable image format.");

  const clipboard = globalThis.navigator?.clipboard;
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  const logger = createClipboardLogger(item, mediaUrl, mimeType);
  if (mimeType === "image/gif") {
    try {
      copyWithLegacyHtmlSelection(item);
      logger.log("Legacy contenteditable copy command accepted", {
        selectedContent: "GIF image element",
        note: "The browser does not expose the copied native clipboard formats to this page.",
      });
      logger.close();
      return { method: "legacy-html", mimeType };
    } catch (error) {
      logger.log("Legacy contenteditable copy failed", errorDetails(error));
    }
  }

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
  let imageBlob;
  let staticPngBlob;
  const getImageBlob = () => {
    if (!imageBlob) {
      imageBlob = fetch(mediaUrl)
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
    }
    return imageBlob;
  };
  const getStaticPngBlob = () => {
    if (!staticPngBlob) {
      staticPngBlob = getImageBlob().then((blob) => createStaticPng(blob, logger));
    }
    return staticPngBlob;
  };

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
  const pngFormatSupport = supports("image/png");
  const richHtmlSupport = supports("text/html");
  logger.log("Clipboard format support", {
    native: { format: mimeType, supported: nativeFormatSupport },
    custom: { format: customMimeType, supported: customFormatSupport },
    staticImageFallback: { format: "image/png", supported: pngFormatSupport },
    richHtml: { format: "text/html", supported: richHtmlSupport },
  });

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
    if (mimeType === "image/gif") {
      const formats = {};
      if (richHtmlSupport !== false) {
        const html = `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(item.title || "GIF")}">`;
        formats["text/html"] = new Blob([html], { type: "text/html" });
      }
      if (nativeFormatSupport === true) {
        formats[mimeType] = getImageBlob();
      }
      if (customFormatSupport === true) {
        formats[customMimeType] = getImageBlob();
      }

      if (Object.keys(formats).length > 0) {
        const multiFormatResult = await writeCandidate(
          "GIF multi-format clipboard write",
          formats,
          { method: "multi-format", mimeType, formats: Object.keys(formats) },
        );
        if (multiFormatResult) return multiFormatResult;
      }
    }

    if (mimeType === "image/gif" && richHtmlSupport !== false) {
      const html = `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(item.title || "GIF")}">`;
      const richHtmlResult = await writeCandidate(
        "GIF rich HTML clipboard write",
        {
          "text/html": new Blob([html], { type: "text/html" }),
        },
        { method: "rich-html", mimeType },
      );
      if (richHtmlResult) return richHtmlResult;
    }

    const writeStaticPng = async () => {
      if (mimeType !== "image/gif" || pngFormatSupport === false) return null;
      return writeCandidate(
        "Static PNG image/png write",
        { "image/png": getStaticPngBlob() },
        { method: "static-png", mimeType: "image/png" },
      );
    };

    if (mimeType === "image/gif" && nativeFormatSupport === false) {
      const pngResult = await writeStaticPng();
      if (pngResult) return pngResult;
    }

    const nativeResult = await writeCandidate(
      `Native ${mimeType} Blob write`,
      { [mimeType]: getImageBlob() },
      { method: "native", mimeType },
    );
    if (nativeResult) return nativeResult;

    if (mimeType === "image/gif" && nativeFormatSupport !== false) {
      const pngResult = await writeStaticPng();
      if (pngResult) return pngResult;
    }

    if (customFormatSupport === true) {
      const customResult = await writeCandidate(
        `Browser custom ${customMimeType} write`,
        { [customMimeType]: getImageBlob() },
        { method: "web-custom", mimeType },
      );
      if (customResult) return customResult;
    }

    if (fetchError) {
      throw new Error(
        `Could not fetch the media bytes: ${errorDetails(fetchError).message}`,
        { cause: fetchError },
      );
    }
    const lastError = errors.at(-1);
    throw new Error(
      `This browser rejected ${mimeType} clipboard data${lastError ? `: ${lastError.message}` : "."} Use the image's browser context menu (right-click > Copy image) instead.`,
      { cause: new AggregateError(errors, "Clipboard strategies failed.") },
    );
  } finally {
    logger.close();
  }
}
