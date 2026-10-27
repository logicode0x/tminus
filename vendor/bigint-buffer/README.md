# Native-free integer conversion

This repository-owned adapter replaces `bigint-buffer` for `@solana/buffer-layout-utils` through the root npm override. The upstream native addon has no patched release for CVE-2025-3194. This implementation contains no native code, optional binding loader, install script or dependencies.

It implements the four unsigned conversion functions required by Solana's integer layouts, using JavaScript BigInt and Buffer/Uint8Array. Valid values preserve their byte order and width. Empty input decodes to zero; zero encodes at width zero. Negative values, overflow, invalid widths and invalid input types throw rather than truncate or reinterpret input.

The package uses its own name and version; it is not represented as an upstream release. `install-links=true` packs this file dependency into `node_modules`, so production images do not depend on a symlink back to the source tree.

Regression coverage lives in `test/dependency-security.test.mjs`, including the actual u64/u128/u192/u256 Solana layouts, both byte orders, nonzero offsets and maximum values.
