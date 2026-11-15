function imageMimeType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

export async function copyMediaToClipboard(item) {
  const mediaUrl = item.imageUrl || item.pageUrl;
  const clipboard = globalThis.navigator?.clipboard;
  if (!mediaUrl) throw new Error("This result has no media URL to copy.");
  if (!clipboard) throw new Error("Clipboard access is unavailable in this browser.");

  const mimeType = imageMimeType(mediaUrl);
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  const canWriteImage =
    mimeType &&
    typeof clipboard.write === "function" &&
    typeof ClipboardItemConstructor === "function" &&
    (typeof ClipboardItemConstructor.supports !== "function" ||
      ClipboardItemConstructor.supports(mimeType));

  if (canWriteImage) {
    try {
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
    } catch {
      // Some providers or browsers do not allow writing the media bytes; copy the direct URL instead.
    }
  }

  await clipboard.writeText(mediaUrl);
  return "link";
}
