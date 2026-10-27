# Dependency audit

Checked 27 October 2026 against the committed lockfile with `npm audit --audit-level=low`. The complete installed dependency tree, including development packages, reports **zero vulnerabilities**.

## Remediation

| Dependency path | Change | Compatibility boundary |
| --- | --- | --- |
| Solana Web3 → Jayson → stream-json / uuid 8 | Pin Jayson 5.0.0, whose dependency tree removes stream-json and the affected UUID release. | Web3 uses `jayson/lib/client/browser`; its constructor, callbacks, batch calls and JSON-RPC behavior are exercised through the installed client and Web3 Connection. |
| Meteora → Anchor → TOML | Pin TOML 5.0.1. | Anchor's Buffer-based workspace configuration parsing remains supported. Regression checks cover excessive array and inline-table nesting and prototype traversal. |
| SPL Token → buffer-layout-utils → bigint-buffer | Replace the unpatched native addon with the repository-owned `@tminus/bigint-buffer` adapter. | The four required unsigned conversion functions preserve endian order and valid widths. Negative, malformed and overflowing inputs throw instead of truncating. |

The original audit reported 8 high and 12 moderate affected packages, including propagated findings on the Meteora and Solana SDKs. These dependencies were fixed without changing the SDK versions or suppressing audit results.

## Native-free adapter

Upstream `bigint-buffer` has no patched release for [CVE-2025-3194](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg). Its native binding is removed from the dependency graph rather than disabled conditionally. The replacement has its own package name and version and contains no native code, binding loader, dependencies or install script.

The root npm override resolves every `bigint-buffer` consumer to `vendor/bigint-buffer`. `.npmrc` sets `install-links=true` so clean installs pack the adapter into `node_modules`; Docker copies the adapter source before installing dependencies. This also keeps the pruned production image independent of a symlink back to the source checkout.

## Validation

`test/dependency-security.test.mjs` covers CommonJS and ESM exports, empty and odd-length buffers, sliced inputs, both endian orders, unsigned integer bounds, and the real Solana u64/u128/u192/u256 layouts at nonzero offsets. It also exercises patched TOML parsing and the installed Jayson/Web3 request path.

CI runs the full dependency audit before the application tests, PostgreSQL API tests and browser/server-rendering builds. The audit fails on any reported severity. The optional on-chain fork suites remain available through manual workflow dispatch; a zero audit result is not a substitute for an independent application security assessment.

## Recheck

```sh
npm ci
npm audit --audit-level=low
npm test
npm run build
```

## Advisory references

- [bigint-buffer native buffer overflow](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg)
- [TOML uncontrolled recursion](https://github.com/advisories/GHSA-82x6-q7mm-w9cf)
- [TOML prototype traversal](https://github.com/advisories/GHSA-v5mp-jgw5-2x6j)
- [TOML array-of-tables resource consumption](https://github.com/advisories/GHSA-4qx8-w7c3-pj3p)
- [TOML dotted-key resource consumption](https://github.com/advisories/GHSA-9j65-hcg3-gc64)
- [TOML integer resource consumption](https://github.com/advisories/GHSA-9qmh-m7c6-f92p)
- [stream-json prototype pollution](https://github.com/advisories/GHSA-mjw6-4jj6-33hc)
- [stream-json nested-filter resource consumption](https://github.com/advisories/GHSA-528h-pc64-c93x)
- [stream-json JSONC comment resource consumption](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x)
- [UUID output-buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
