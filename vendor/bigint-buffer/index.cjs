'use strict';

const { Buffer } = require('buffer');

function read(bytes, littleEndian) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected a Buffer or Uint8Array');
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[littleEndian ? bytes.length - 1 - i : i]);
  }
  return result;
}

function write(value, width, littleEndian) {
  if (typeof value !== 'bigint') throw new TypeError('Expected a BigInt');
  if (!Number.isSafeInteger(width) || width < 0) throw new RangeError('Width must be a nonnegative safe integer');
  if (value < 0n || (value >> (8n * BigInt(width))) !== 0n) throw new RangeError('Unsigned integer does not fit the requested width');
  const bytes = Buffer.alloc(width);
  for (let i = 0; i < width; i++) {
    bytes[littleEndian ? i : width - 1 - i] = Number(value & 255n);
    value >>= 8n;
  }
  return bytes;
}

// Explicit CommonJS assignments also support the ESM named imports used by buffer-layout-utils's browser build.
exports.toBigIntLE = bytes => read(bytes, true);
exports.toBigIntBE = bytes => read(bytes, false);
exports.toBufferLE = (value, width) => write(value, width, true);
exports.toBufferBE = (value, width) => write(value, width, false);
