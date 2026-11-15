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

export async function copyMediaToClipboard(item) {
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
    const nativeResult = await writeCandidate(
      `Native ${mimeType} Blob write`,
      { [mimeType]: imageBlob },
      { method: "native", mimeType },
    );
    if (nativeResult) return nativeResult;

    if (customFormatSupport === true) {
      const customResult = await writeCandidate(
        `Browser custom ${customMimeType} write`,
        { [customMimeType]: imageBlob },
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
