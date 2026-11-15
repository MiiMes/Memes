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
  if (!mimeType) throw new Error("This result does not have a recognizable image format.");
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  if (typeof ClipboardItemConstructor !== "function") {
    throw new Error("This browser cannot copy media to the clipboard.");
  }

  const imageBlob = fetch(mediaUrl).then(async (response) => {
    if (!response.ok) throw new Error(`Media request returned HTTP ${response.status}.`);
    const blob = await response.blob();
    const blobType = blob.type?.split(";")[0].toLowerCase();
    if (blobType && mimeType && blobType !== mimeType) {
      throw new Error(`Expected ${mimeType} but received ${blobType}.`);
    }
    if (!blobType?.startsWith("image/")) {
      throw new Error("The result URL did not return a recognizable image.");
    }
    return blob;
  });

  try {
    await clipboard.write([new ClipboardItemConstructor({ [mimeType]: imageBlob })]);
    return "native";
  } catch (nativeError) {
    const customMimeType = `web ${mimeType}`;
    const supportsCustomFormat =
      typeof ClipboardItemConstructor.supports === "function" &&
      ClipboardItemConstructor.supports(customMimeType);
    if (!supportsCustomFormat) {
      throw new Error(
        "This browser cannot place animated GIF data on the system clipboard. A native clipboard integration is required.",
        { cause: nativeError },
      );
    }

    try {
      await clipboard.write([
        new ClipboardItemConstructor({ [customMimeType]: imageBlob }),
      ]);
      return "web-custom";
    } catch (customError) {
      throw new AggregateError(
        [nativeError, customError],
        "This browser could not copy the GIF in a format the clipboard accepts.",
      );
    }
  }
}
