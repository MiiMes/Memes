function imageMimeType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

export async function copyMediaToClipboard(item) {
  const mediaUrl = item.imageUrl;
  const clipboard = globalThis.navigator?.clipboard;
  if (!mediaUrl) throw new Error("This result has no media URL to copy.");
  if (!clipboard || typeof clipboard.write !== "function") {
    throw new Error("This browser cannot copy media to the clipboard.");
  }

  const mimeType = imageMimeType(mediaUrl);
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  if (!mimeType) {
    throw new Error("This result's image format cannot be copied as media.");
  }
  if (typeof ClipboardItemConstructor !== "function") {
    throw new Error("This browser cannot copy media to the clipboard.");
  }
  if (
    typeof ClipboardItemConstructor.supports === "function" &&
    !ClipboardItemConstructor.supports(mimeType)
  ) {
    const mediaType = mimeType === "image/gif" ? "animated GIFs" : `${mimeType} media`;
    throw new Error(`This browser does not support copying ${mediaType} directly to the clipboard.`);
  }

  const imageBlob = fetch(mediaUrl).then(async (response) => {
    if (!response.ok) throw new Error(`Media request returned HTTP ${response.status}.`);
    const blob = await response.blob();
    if (blob.type && blob.type.toLowerCase() !== mimeType) {
      throw new Error(`Expected ${mimeType} but received ${blob.type}.`);
    }
    return blob;
  });
  await clipboard.write([new ClipboardItemConstructor({ [mimeType]: imageBlob })]);

  return "media";
}
