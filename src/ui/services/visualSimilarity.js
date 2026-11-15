function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be loaded for local visual comparison."));
    image.src = url;
  });
}

async function averageHash(url) {
  const image = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot compare image pixels.");
  context.drawImage(image, 0, 0, 8, 8);
  const { data } = context.getImageData(0, 0, 8, 8);
  const luminance = [];
  for (let index = 0; index < data.length; index += 4) {
    luminance.push(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
  }
  const average = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
  return luminance.map((value) => value >= average);
}

function similarity(left, right) {
  let matches = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) matches += 1;
  }
  return Math.round((matches / left.length) * 100);
}

export async function rankSimilarMedia(reference, candidates) {
  if (!reference?.imageUrl) throw new Error("Choose an image to find similar results.");
  const referenceHash = await averageHash(reference.imageUrl);
  const ranked = [];
  const eligible = Array.from(new Map(candidates
    .filter((item) => item?.imageUrl && !item.video && item.imageUrl !== reference.imageUrl)
    .map((item) => [item.imageUrl, item])).values());
  const comparable = eligible.slice(0, 60);
  let skipped = eligible.length - comparable.length;
  for (let index = 0; index < comparable.length; index += 4) {
    const batch = comparable.slice(index, index + 4);
    const comparisons = await Promise.all(batch.map(async (item) => {
      try {
        return { item, score: similarity(referenceHash, await averageHash(item.imageUrl)) };
      } catch {
        return null;
      }
    }));
    for (const comparison of comparisons) {
      if (comparison) ranked.push(comparison);
      else skipped += 1;
    }
  }
  ranked.sort((left, right) => right.score - left.score);
  return { results: ranked.slice(0, 12), skipped };
}
