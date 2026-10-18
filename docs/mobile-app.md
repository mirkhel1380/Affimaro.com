# Installable Affimaro web app

The independent host provides `/install`, an English installation guide for Android Chrome, iPhone/iPad Safari, and desktop Chrome/Edge. Its manifest opens `/account` in a standalone window using the same verified Supabase account and existing business data. The website remains usable without installation. This is an installable web app; native App Store/Play Store packages and push notifications remain planned.

## Installation

Open `/install` over HTTPS. When the browser fires `beforeinstallprompt`, the installation button becomes available. The prompt is consumed once, only after the user clicks. Manual browser instructions remain visible when no prompt is available. Chrome can require engagement before offering its prompt; a missing button alone does not establish that installation is broken.

The manifest supplies a stable relative ID, account start URL, business/affiliate shortcuts, and 192/512-pixel PNG icons. The maskable icon has a solid background and uses the existing Affimaro mark; an Apple touch icon is also included. Asset paths are relative to the selected host and contain no account identifiers or provider credentials.

Native Sites keeps its authentication and does not register the independent service worker. Its `/install` page points to the selected independent installation. The native source remains owner-private and paused, with export access disabled and its original payment key retained.

## Offline behavior and private data

The service worker installs only the public reconnect page, manifest and icons. Install downloads omit credentials, reject redirects, validate content types, and reject `private` or `no-store` responses before writing anything to Cache Storage. Activation deletes only older `affimaro-public-*` caches.

The reconnect asset is requested as `/offline`, the canonical Cloudflare URL for `public/offline.html`. Using `/offline.html` would trigger an HTML-normalization redirect and fail the worker's strict installation check. Verify `/offline` and all other install assets return 200 directly on the deployed host.

Navigation uses the network with `cache: no-store`. If disconnected, the worker serves a generic reconnect screen; it never stores account HTML. API fetches, sign-in form POSTs and other writes pass through without interception. There is no offline payment queue, cached financial dashboard, local account-token store or background synchronization. The server's session checks, exact-Origin CSRF checks, tenant isolation and payment authorization are unchanged.

The automated mobile tests exercise valid icon files and portable URLs, public-only cache installation, private-response rejection, online/offline navigation, unhandled API/form requests, cache cleanup boundaries and one-use install prompting. Both builds also include these assets. A real browser installation, home-screen launch and sign-in on Android/iOS still need device verification; the worker/DOM fixtures are not a substitute for that walkthrough.

Primary references: [Chrome installation criteria](https://web.dev/articles/install-criteria), [installation prompting](https://web.dev/learn/pwa/installation-prompt), [network/cache strategies](https://web.dev/learn/pwa/serving), and [Edge PWA setup](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/).
