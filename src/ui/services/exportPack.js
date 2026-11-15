const MAX_PACK_BYTES = 80 * 1024 * 1024;
const encoder = new TextEncoder();

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeHeader(length, fields) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  fields(view);
  return bytes;
}

export async function createExportPack(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 10) {
    throw new Error("An export pack must contain between 1 and 10 files.");
  }
  const names = new Set();
  const files = [];
  let totalSize = 0;
  for (const entry of entries) {
    if (
      typeof entry?.name !== "string" ||
      !/^[\w.-]+$/.test(entry.name) ||
      !(entry.blob instanceof Blob) ||
      names.has(entry.name)
    ) {
      throw new Error("The export pack contains an invalid or duplicate filename.");
    }
    names.add(entry.name);
    totalSize += entry.blob.size;
    if (totalSize > MAX_PACK_BYTES) {
      throw new Error("The export pack is larger than the 80 MB browser limit.");
    }
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    files.push({ name: encoder.encode(entry.name), data, crc: crc32(data) });
  }

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const file of files) {
    const localHeader = makeHeader(30, (view) => {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint32(14, file.crc, true);
      view.setUint32(18, file.data.length, true);
      view.setUint32(22, file.data.length, true);
      view.setUint16(26, file.name.length, true);
    });
    localParts.push(localHeader, file.name, file.data);

    const centralHeader = makeHeader(46, (view) => {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint32(16, file.crc, true);
      view.setUint32(20, file.data.length, true);
      view.setUint32(24, file.data.length, true);
      view.setUint16(28, file.name.length, true);
      view.setUint32(42, localOffset, true);
    });
    centralParts.push(centralHeader, file.name);
    localOffset += localHeader.length + file.name.length + file.data.length;
  }

  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  const endRecord = makeHeader(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, files.length, true);
    view.setUint16(10, files.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, localOffset, true);
  });
  return new Blob([...localParts, ...centralParts, endRecord], { type: "application/zip" });
}
