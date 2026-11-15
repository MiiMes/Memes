function imageMimeType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

function blobDataUrl(blob, mimeType) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:${blob.type || mimeType};base64,${btoa(binary)}`;
  });
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
    if (!blobType?.startsWith("image/") && !mimeType) {
      throw new Error("The result URL did not return a recognizable image.");
    }
    return blob;
  });

  const htmlImage = imageBlob.then(async (blob) => {
    const dataUrl = await blobDataUrl(blob, mimeType);
    return new Blob([`<img src="${dataUrl}" alt="GIF">`], { type: "text/html" });
  });
  const representations = { "text/html": htmlImage };
  const actualMimeTypeSupported =
    mimeType &&
    typeof ClipboardItemConstructor.supports === "function" &&
    ClipboardItemConstructor.supports(mimeType);

  if (actualMimeTypeSupported) representations[mimeType] = imageBlob;

  try {
    await clipboard.write([new ClipboardItemConstructor(representations)]);
  } catch {
    if (!actualMimeTypeSupported) throw new Error("The GIF could not be written to the clipboard.");
    await clipboard.write([
      new ClipboardItemConstructor({ "text/html": htmlImage }),
    ]);
  }

  return "media";
}
