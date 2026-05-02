# Security

## Reporting a vulnerability

Please report security issues privately to the maintainers (repository contact or organization security channel) instead of using public issues, so we can coordinate a fix and disclosure.

Include:

- Affected component (desktop app, build pipeline, etc.)
- Steps to reproduce
- Impact assessment if known

## Threat model (high level)

- Maguna is a **local-first** app: prompts and generations are intended to stay on the user’s machine when using the local inference backend.
- **Downloading** models over HTTPS introduces supply-chain considerations; the app verifies **SHA-256** when the catalog provides a hash. Prefer curated entries with pinned hashes for releases.

## Telemetry

There is **no** analytics or crash reporting enabled by default in this repository snapshot.
