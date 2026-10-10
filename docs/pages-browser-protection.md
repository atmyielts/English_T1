# Browser protections across Pages applications

Every one of the 13 Pages workspaces now supplies a `public/_headers` rule for every static path, including deep links and assets. Cloudflare Pages reads this file from the built output. Existing Platform cache exceptions and immutable asset caching are retained.

The policy rejects framing of Schood pages with both `frame-ancestors 'none'` and `X-Frame-Options: DENY`, restricts base URLs to the same origin, disables legacy object/plugin embedding, upgrades insecure resource requests, and explicitly prevents MIME sniffing. External links send only the origin as the referrer. Geolocation is disabled; camera and microphone remain available to the application itself, preserving recording and dictation. Existing lesson video iframes and the payment widget retain their resource and feature permissions.

HSTS initially lasts one day per responding host, without subdomain inheritance or preload. Verify every live hostname before increasing its duration. A rollback can remove the policy file, but an HSTS preference already received by a browser lasts until its max-age expires.

This is an enforced browser-protection foundation. It does not yet restrict every script, style, media or connection source. A complete source policy still requires qualification of the card-payment widget, fonts, private S3/R2 media, video providers and calculator resources. Do not describe the presence of a CSP header as proof that all XSS risks are addressed.

Before merging: production verification and all frontend builds must pass; built `_headers` files must retain the policy. Check actual Chromium frame rejection, same-origin base handling and microphone/camera policy without requesting hardware access. After the CI deployment: inspect root HTML, a deep link and an asset on every production hostname and verify the public screens remain usable. `_headers` does not cover server-generated Pages Functions responses; any future SSR/function routes must set response headers themselves.

Reference: [Cloudflare Pages header rules](https://developers.cloudflare.com/pages/configuration/headers/).
