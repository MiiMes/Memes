const MAX_STATIC_PNG_PIXELS = 16_000_000;
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/webp",
  "image/png",
  "image/jpeg",
]);

function imageMimeType(url, knownMimeType) {
  if (SUPPORTED_IMAGE_MIME_TYPES.has(knownMimeType)) return knownMimeType;
  if (typeof url !== "string" || !url) return "";
  if (/^data:/i.test(url)) {
    const commaIndex = url.indexOf(",");
    if (commaIndex < 0) return "";
    const [mimeType, ...parameters] = url.slice(5, commaIndex).split(";");
    const normalizedMimeType = mimeType.toLowerCase();
    return parameters.some((parameter) => parameter.toLowerCase() === "base64") &&
      SUPPORTED_IMAGE_MIME_TYPES.has(normalizedMimeType)
      ? normalizedMimeType
      : "";
  }

  try {
    const pathname = new URL(url, globalThis.location?.origin).pathname.toLowerCase();
    if (pathname.endsWith(".gif")) return "image/gif";
    if (pathname.endsWith(".webp")) return "image/webp";
    if (pathname.endsWith(".png")) return "image/png";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  } catch {
    return "";
  }
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

async function createStaticPng(blob) {
  const image = new globalThis.Image();
  const objectUrl = globalThis.URL.createObjectURL(blob);
  try {
    image.src = objectUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("The image could not be decoded."));
      });
    }

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > MAX_STATIC_PNG_PIXELS) {
      throw new Error("The image is too large to safely copy as a static PNG.");
    }

    const canvas = globalThis.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot create a PNG clipboard image.");
    context.drawImage(image, 0, 0, width, height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error("The browser could not export the frame as PNG."));
      }, "image/png");
    });
  } finally {
    globalThis.URL.revokeObjectURL(objectUrl);
  }
}

export async function copyMediaToClipboard(item) {
  const mediaUrl = item.gifUrl || item.imageUrl;
  if (!mediaUrl) throw new Error("This result has no media URL to copy.");

  const mimeType = item.gifUrl ? "image/gif" : imageMimeType(mediaUrl, item.mimeType);
  if (!mimeType) throw new Error("This result does not have a recognizable image format.");

  const clipboard = globalThis.navigator?.clipboard;
  const ClipboardItemConstructor = globalThis.ClipboardItem;

  // 1. For hosted GIFs (Giphy, Tenor, Klipy, etc.):
  // Omit `image/png` so Discord, Slack, Gmail, and Notion embed/unfurl the animated GIF
  // instead of grabbing a static first-frame PNG.
  if (mimeType === "image/gif" && !/^data:/i.test(mediaUrl)) {
    const html = `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(item.title || "GIF")}">`;

    if (typeof clipboard?.write === "function" && typeof ClipboardItemConstructor === "function") {
      try {
        await clipboard.write([
          new ClipboardItemConstructor({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([mediaUrl], { type: "text/plain" }),
          }),
        ]);
        return { method: "animated-embed", mimeType: "image/gif" };
      } catch {
        // Fall through to plain-text URL copy (works in Firefox even with strict clipboard settings)
      }
    }

    if (typeof clipboard?.writeText === "function") {
      await clipboard.writeText(mediaUrl);
      return { method: "url-only", mimeType: "text/plain" };
    }

    throw new Error("This browser does not allow clipboard access.");
  }

  // 2. For static stickers/images (PNG, JPEG, WebP) or base64 data URLs:
  // Copy actual image bytes as `image/png` so they paste directly as image attachments.
  if (typeof clipboard?.write !== "function" || typeof ClipboardItemConstructor !== "function") {
    throw new Error("This browser does not support copying image data to the clipboard.");
  }

  const pngPromise = fetch(mediaUrl, { mode: "cors" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    })
    .then((blob) => (blob.type === "image/png" ? blob : createStaticPng(blob)));

  pngPromise.catch(() => {});

  try {
    await clipboard.write([
      new ClipboardItemConstructor({ "image/png": pngPromise }),
    ]);
    return { method: "static-png", mimeType: "image/png" };
  } catch (cause) {
    // Fallback to URL if a third-party image host blocks CORS
    if (!/^data:/i.test(mediaUrl) && typeof clipboard.writeText === "function") {
      await clipboard.writeText(mediaUrl);
      return { method: "url-only", mimeType: "text/plain" };
    }
    throw new Error(
      "Could not copy image bytes. Use right-click > Copy image instead.",
      { cause },
    );
  }
}

export async function copyAnimatedGifToClipboard(blob) {
  if (!blob || blob.type !== "image/gif") {
    throw new Error("The generated meme is not an animated GIF.");
  }
  const clipboard = globalThis.navigator?.clipboard;
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  if (typeof clipboard?.write !== "function" || typeof ClipboardItemConstructor !== "function") {
    throw new Error("This browser does not support copying animated GIFs to the clipboard.");
  }

  const formats = {};

  if (Object.keys(formats).length > 0) {
    try {
      await clipboard.write([new ClipboardItemConstructor(formats)]);
      return;
    } catch {
      // Fall through to static PNG fallback below
    }
  }

  const pngBlob = await createStaticPng(blob);
  await clipboard.write([new ClipboardItemConstructor({ "image/png": pngBlob })]);
}

export async function copyPngToClipboard(blob) {
  if (!blob || blob.type !== "image/png") {
    throw new Error("The generated image is not a PNG.");
  }
  const clipboard = globalThis.navigator?.clipboard;
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  if (typeof clipboard?.write !== "function" || typeof ClipboardItemConstructor !== "function") {
    throw new Error("This browser does not support copying images to the clipboard.");
  }
  await clipboard.write([new ClipboardItemConstructor({ "image/png": blob })]);
}