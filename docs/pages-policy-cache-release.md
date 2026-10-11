# Response policies and immutable asset identity

After PR227 deployed, all twenty public service URLs and their deep links returned the new browser-protection policy. Chromium confirmed that the Platform and English Hub guest screens loaded and rejected external framing. However, the existing Academy and Academy Docs entry scripts returned older headers from Cloudflare's cache. Fetching the same files with a fresh query returned the current policy. Application bytes had not changed, so their content-hashed URLs had stayed the same across the header-only deployment.

Every Pages Vite configuration now includes a normalized SHA-256 revision of its `public/_headers` in entry, lazy-chunk, stylesheet and emitted-media filenames. Application content hashes remain present. A response-policy change therefore produces new immutable asset URLs even when the JavaScript itself is unchanged; the new HTML and generated imports reference those files. CRLF and LF produce the same revision. Existing manual vendor chunks, aliases, environment checks, development ports and cache durations are preserved.

The shared build helper reads only the response-policy file. It does not read credentials, provider configuration or runtime customer data. Builds fail if the required universal policy is absent. The regression test runs actual Vite builds over identical application bytes, with entry/lazy JavaScript, CSS and emitted SVG files; every asset and the HTML references must change after a policy-only update. Line-ending changes must preserve their identity. The existing nineteen Chromium protection checks remain mandatory in the same test suite.

Deploy through a reviewed PR and the existing Pages workflow. No DNS, cache-wide purge, Edge function, migration or secret change is required. After deployment, verify the exact root, deep-link and currently referenced asset response policy across all twenty public URLs, including the two previously stale Academy URLs. Recheck actual guest screens and frame rejection. Older immutable URLs may remain cached; new HTML must reference the current generation. HSTS lasts one day and is not cleared by a rollback.

This addresses policy delivery through immutable caches. The foundational CSP still does not restrict every script, style, media or connection source; provider/widget qualification and a complete source policy remain separate work. Public reachability and guest-screen checks do not establish credentialed customer journeys.

Rollback: use a tracked revert PR and the Pages workflow from the previous source `051ca03fcbacc3c80e0fc10d4f55feae10051df8`. Keep the existing protection headers. Never publish locally or delete older artifacts needed by open sessions.

Reference: [Cloudflare Pages response header rules](https://developers.cloudflare.com/pages/configuration/headers/).
