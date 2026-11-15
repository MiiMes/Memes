import UPNG from "upng-js";

const MAX_APNG_FRAMES = 300;
const MAX_APNG_DECODED_PIXELS = 8_000_000;

function imageMimeType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

async function convertGifToApng(gifBlob, logger) {
  const Decoder = globalThis.ImageDecoder;
  if (typeof Decoder !== "function") {
    throw new Error("This browser cannot decode GIF frames for APNG conversion.");
  }
  if (typeof Decoder.isTypeSupported === "function" &&
    !(await Decoder.isTypeSupported("image/gif"))) {
    throw new Error("This browser's image decoder does not support GIF.");
  }

  const decoder = new Decoder({
    data: await gifBlob.arrayBuffer(),
    type: "image/gif",
  });
  try {
    await decoder.completed;
    const track = decoder.tracks.selectedTrack;
    const frameCount = track?.frameCount;
    if (!Number.isInteger(frameCount) || frameCount < 2) {
      throw new Error("The GIF does not contain multiple decodable frames.");
    }
    if (frameCount > MAX_APNG_FRAMES) {
      throw new Error(`The GIF has too many frames to safely convert (${frameCount}).`);
    }

    const firstFrame = await decoder.decode({ frameIndex: 0 });
    let firstFrameClosed = false;
    try {
      const width = firstFrame.image.displayWidth;
      const height = firstFrame.image.displayHeight;
      if (!width || !height || width * height * frameCount > MAX_APNG_DECODED_PIXELS) {
        throw new Error("The GIF is too large to safely convert for clipboard use.");
      }

      const canvas = typeof globalThis.OffscreenCanvas === "function"
        ? new globalThis.OffscreenCanvas(width, height)
        : globalThis.document?.createElement("canvas");
      if (!canvas) {
        throw new Error("This browser cannot create a canvas for APNG conversion.");
      }
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("This browser cannot read image frames for APNG conversion.");
      }

      const frames = [];
      const delays = [];
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const { image } = frameIndex === 0
          ? firstFrame
          : await decoder.decode({ frameIndex });
        try {
          context.clearRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          const pixels = context.getImageData(0, 0, width, height).data;
          frames.push(pixels.slice().buffer);
          const duration = Number.isFinite(image.duration)
            ? Math.round(image.duration / 1000)
            : 100;
          delays.push(Math.min(65_535, Math.max(10, duration)));
        } finally {
          image.close();
          if (frameIndex === 0) firstFrameClosed = true;
        }
      }

      const encoded = UPNG.encode(frames, width, height, 0, delays);
      validateApng(encoded, frameCount);
      const apngBlob = new Blob([encoded], { type: "image/png" });
      logger.log("GIF converted to APNG", {
        frameCount,
        width,
        height,
        byteLength: apngBlob.size,
      });
      return apngBlob;
    } finally {
      if (!firstFrameClosed) firstFrame.image.close();
    }
  } finally {
    decoder.close();
  }
}

function validateApng(buffer, expectedFrameCount) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset = 8;
  let declaredFrameCount = 0;
  let controlFrameCount = 0;
  let hasEnd = false;

  while (offset + 12 <= bytes.length) {
    const chunkLength = view.getUint32(offset);
    const chunkEnd = offset + chunkLength + 12;
    if (chunkEnd > bytes.length) break;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === "acTL") declaredFrameCount = view.getUint32(offset + 8);
    if (type === "fcTL") controlFrameCount += 1;
    if (type === "IEND") {
      hasEnd = true;
      break;
    }
    offset = chunkEnd;
  }

  if (!hasEnd || declaredFrameCount !== expectedFrameCount ||
    controlFrameCount !== expectedFrameCount) {
    throw new Error("The GIF could not be encoded as a complete animated PNG.");
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
  const pngFormatSupport = supports("image/png");
  logger.log("Clipboard format support", {
    native: { format: mimeType, supported: nativeFormatSupport },
    custom: { format: customMimeType, supported: customFormatSupport },
    apng: { format: "image/png", supported: pngFormatSupport },
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
    const writeApng = async () => {
      if (mimeType !== "image/gif" || pngFormatSupport === false) return null;
      const apngBlob = imageBlob.then((blob) => convertGifToApng(blob, logger));
      return writeCandidate(
        "Animated PNG image/png write",
        { "image/png": apngBlob },
        { method: "apng", mimeType: "image/png" },
      );
    };

    if (nativeFormatSupport !== true) {
      const apngResult = await writeApng();
      if (apngResult) return apngResult;
    }

    const nativeResult = await writeCandidate(
      `Native ${mimeType} Blob write`,
      { [mimeType]: imageBlob },
      { method: "native", mimeType },
    );
    if (nativeResult) return nativeResult;

    if (nativeFormatSupport === true) {
      const apngResult = await writeApng();
      if (apngResult) return apngResult;
    }

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
