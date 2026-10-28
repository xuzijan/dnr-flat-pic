import jpeg from "../runtime/node_modules/jpeg-js/index.js";
import { jpegExifOrientation, preparePhotoRaster } from "../scripts/lib/raster.mjs";

const pixels = Buffer.alloc(4 * 2 * 4);
for (let y = 0; y < 2; y += 1) {
  for (let x = 0; x < 4; x += 1) {
    const offset = (y * 4 + x) * 4;
    pixels[offset] = x < 2 ? 255 : 0;
    pixels[offset + 2] = x < 2 ? 0 : 255;
    pixels[offset + 3] = 255;
  }
}
const encoded = Buffer.from(jpeg.encode({ data: pixels, width: 4, height: 2 }, 100).data);
const exif = Buffer.alloc(6 + 8 + 2 + 12 + 4);
exif.write("Exif\0\0", 0, "ascii");
exif.write("II", 6, "ascii");
exif.writeUInt16LE(42, 8);
exif.writeUInt32LE(8, 10);
exif.writeUInt16LE(1, 14);
exif.writeUInt16LE(0x0112, 16);
exif.writeUInt16LE(3, 18);
exif.writeUInt32LE(1, 20);
exif.writeUInt16LE(6, 24);
const segment = Buffer.alloc(2 + 2 + exif.length);
segment.writeUInt16BE(0xffe1, 0);
segment.writeUInt16BE(exif.length + 2, 2);
exif.copy(segment, 4);
const jpegWithOrientation = Buffer.concat([encoded.subarray(0, 2), segment, encoded.subarray(2)]);

if (jpegExifOrientation(jpegWithOrientation) !== 6) throw new Error("EXIF orientation fixture was not encoded as orientation 6.");
const prepared = preparePhotoRaster(jpegWithOrientation, "image/jpeg");
if (prepared.orientation !== 6 || prepared.mime !== "image/png") throw new Error("JPEG EXIF orientation was not normalized to PNG.");
if (prepared.buffer.readUInt32BE(16) !== 2 || prepared.buffer.readUInt32BE(20) !== 4) {
  throw new Error("EXIF orientation normalization did not rotate the raster dimensions.");
}
console.log("JPEG EXIF normalization passed");
