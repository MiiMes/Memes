function mediaUrl(item) {
  if (!item.imageUrl) throw new Error("This result has no media URL.");
  const url = new URL(item.imageUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("This result does not have a shareable web URL.");
  }
  return url.href;
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

export async function shareMediaFile(item) {
  const navigatorApi = globalThis.navigator;
  if (typeof navigatorApi?.share !== "function" ||
    typeof navigatorApi.canShare !== "function") {
    throw new Error("File sharing is not available in this browser.");
  }

  const url = mediaUrl(item);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Media request returned HTTP ${response.status}.`);
  const blob = await response.blob();
  const mimeType = blob.type?.split(";")[0] || "image/gif";
  if (!mimeType.startsWith("image/")) {
    throw new Error("The result URL did not return an image file.");
  }

  const extension = mimeType.slice("image/".length).replace("jpeg", "jpg");
  const file = new File([blob], `miimes-media.${extension}`, { type: mimeType });
  if (!navigatorApi.canShare({ files: [file] })) {
    throw new Error("This browser cannot share image files.");
  }

  await navigatorApi.share({
    files: [file],
    title: item.title || "GIF",
  });
}

export async function copyMediaAsHtml(item) {
  const clipboard = globalThis.navigator?.clipboard;
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  if (typeof clipboard?.write !== "function" ||
    typeof ClipboardItemConstructor !== "function") {
    throw new Error("Rich clipboard writing is not available in this browser.");
  }

  const url = mediaUrl(item);
  const html = `<img src="${escapeHtml(url)}" alt="${escapeHtml(item.title || "GIF")}">`;
  const clipboardItem = new ClipboardItemConstructor({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([url], { type: "text/plain" }),
  });
  await clipboard.write([clipboardItem]);
}

export async function copyMediaLink(item) {
  const clipboard = globalThis.navigator?.clipboard;
  if (typeof clipboard?.writeText !== "function") {
    throw new Error("Text clipboard writing is not available in this browser.");
  }
  await clipboard.writeText(mediaUrl(item));
}
