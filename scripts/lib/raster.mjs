import zlib from "node:zlib";
import jpeg from "../../runtime/node_modules/jpeg-js/index.js";

function read16(buffer, offset, little) {
  return little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function read32(buffer, offset, little) {
  return little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

export function jpegExifOrientation(buffer) {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    const dataStart = offset + 2;
    const dataEnd = offset + segmentLength;
    if (marker === 0xe1 && buffer.subarray(dataStart, dataStart + 6).toString("ascii") === "Exif\0\0") {
      const tiff = dataStart + 6;
      if (tiff + 8 <= dataEnd) {
        const endian = buffer.toString("ascii", tiff, tiff + 2);
        const little = endian === "II";
        const validEndian = little || endian === "MM";
        if (validEndian && read16(buffer, tiff + 2, little) === 42) {
          const ifd = tiff + read32(buffer, tiff + 4, little);
          if (ifd + 2 <= dataEnd) {
            const count = read16(buffer, ifd, little);
            for (let index = 0; index < count; index += 1) {
              const entry = ifd + 2 + index * 12;
              if (entry + 12 > dataEnd) break;
              const tag = read16(buffer, entry, little);
              const type = read16(buffer, entry + 2, little);
              const valueCount = read32(buffer, entry + 4, little);
              if (tag === 0x0112 && type === 3 && valueCount >= 1) {
                const orientation = read16(buffer, entry + 8, little);
                return orientation >= 1 && orientation <= 8 ? orientation : 1;
              }
            }
          }
        }
      }
    }
    offset = dataEnd;
  }
  return 1;
}

function orientRgba(data, width, height, orientation) {
  const swapped = orientation >= 5;
  const outWidth = swapped ? height : width;
  const outHeight = swapped ? width : height;
  const output = Buffer.alloc(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      let sourceX = x;
      let sourceY = y;
      if (orientation === 2) sourceX = width - 1 - x;
      else if (orientation === 3) {
        sourceX = width - 1 - x;
        sourceY = height - 1 - y;
      } else if (orientation === 4) sourceY = height - 1 - y;
      else if (orientation === 5) {
        sourceX = y;
        sourceY = x;
      } else if (orientation === 6) {
        sourceX = y;
        sourceY = height - 1 - x;
      } else if (orientation === 7) {
        sourceX = width - 1 - y;
        sourceY = height - 1 - x;
      } else if (orientation === 8) {
        sourceX = width - 1 - y;
        sourceY = x;
      }
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const targetOffset = (y * outWidth + x) * 4;
      data.copy(output, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return { data: output, width: outWidth, height: outHeight };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePngRgba({ data, width, height }) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;
    data.copy(rows, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function preparePhotoRaster(buffer, mime) {
  if (mime !== "image/jpeg") return { buffer, mime, orientation: 1 };
  const orientation = jpegExifOrientation(buffer);
  if (orientation === 1) return { buffer, mime, orientation };
  let decoded;
  try {
    decoded = jpeg.decode(buffer, { useTArray: true, tolerantDecoding: true });
  } catch (error) {
    throw new Error(`Unable to normalize JPEG EXIF orientation: ${error.message}`);
  }
  const oriented = orientRgba(Buffer.from(decoded.data), decoded.width, decoded.height, orientation);
  return { buffer: encodePngRgba(oriented), mime: "image/png", orientation };
}
