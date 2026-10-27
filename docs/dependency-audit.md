# Dependency audit

Checked 27 October 2026 with `npm audit --omit=dev` against the release lockfile.

The production dependency tree reports **8 high and 12 moderate affected packages**, with no critical advisories. These counts include packages reported through transitive dependencies; they are not 20 separately validated application vulnerabilities.

`npm audit fix --package-lock-only --ignore-scripts` did not resolve these advisories without dependency changes outside the existing version constraints. The affected dependency paths remain in this release.

The source release has not undergone an independent security audit. Review reachability and upstream SDK compatibility before relying on it for a new production deployment.

## Advisory sources

| Package | Advisory |
| --- | --- |
| `bigint-buffer` | [bigint-buffer Vulnerable to Buffer Overflow via toBigIntLE() Function](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg) |
| `stream-json` | [stream-json: pick/ignore/filter/replace filters are O(depth²) on nested input — small crafted JSON blocks the event loop for seconds→minutes (DoS)](https://github.com/advisories/GHSA-528h-pc64-c93x) |
| `stream-json` | [stream-json: JSONC parser and verifier re-scan the whole accumulated comment on every input chunk](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x) |
| `stream-json` | [stream-json has a prototype pollution issue: Assembler writes this.current[this.key] on plain objects](https://github.com/advisories/GHSA-mjw6-4jj6-33hc) |
| `toml` | [toml-node: Uncontrolled Recursion](https://github.com/advisories/GHSA-82x6-q7mm-w9cf) |
| `toml` | [toml-node: Prototype Pollution Leads to `Object.prototype` Corruption via `__proto__` Key-Path Desynchronization](https://github.com/advisories/GHSA-v5mp-jgw5-2x6j) |
| `toml` | [toml-node: Quadratic-complexity DoS via many array-of-tables headers in toml.parse()](https://github.com/advisories/GHSA-4qx8-w7c3-pj3p) |
| `toml` | [toml-node: Quadratic-complexity DoS via long dotted keys or table paths in toml.parse()](https://github.com/advisories/GHSA-9j65-hcg3-gc64) |
| `toml` | [toml-node: Uncontrolled resource consumption (CPU DoS) via unbounded-length integer literals in toml.parse()](https://github.com/advisories/GHSA-9qmh-m7c6-f92p) |
| `uuid` | [uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |

## Recheck

```sh
npm audit --omit=dev
```

Do not silence the audit or force a major dependency upgrade without checking the Meteora/Solana interfaces and rerunning the transaction construction, review, fork and form suites.
