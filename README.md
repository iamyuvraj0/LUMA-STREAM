# LUMA

Updated from the latest smooth build.

## This pass
- Hover-only card metadata overlay on desktop, touch-friendly overlay on mobile.
- Smooth inner poster zoom on hover.
- Vertical season selection via a theme-matched dropdown on TV title/watch pages.
- Image-first episode cards with stills, episode numbers, titles and metadata.
- Home hero now draws randomly from a larger pool of TMDB movie releases from the last year instead of a fixed six-title list.
- Removed obsolete episode-view and placeholder playback settings.

## Run
```bash
npm install
npm start
```

Create `.env`:
```env
TMDB_TOKEN=your_full_tmdb_api_read_access_token
PORT=3000
TMDB_REGION=NP
PUBLIC_SITE_URL=https://your-domain.example  # replace with your deployed HTTPS origin
```


## External download provider pages

The Download dialog also links out to VidVault for the selected TMDB title, even when LUMA has no direct file configured. The links open in a new tab and let those providers display their own currently available resolutions and mirror choices. Movie links use the TMDB movie ID; TV episode links include the series ID, season, and episode. Redflix is not included. These are provider-page links, not a claim that the HTML page itself is a video file or that LUMA controls the provider's conversion/download process. Existing LUMA library downloads and verified direct-file provider downloads remain available in the same dialog.

## Downloads and provider integration

The watch page has a real download picker. It merges files in LUMA's local download library with direct-file renditions returned by an optional provider adapter, ranks them by resolution, bitrate and file size, and preselects the best available rendition. Local files are served by `/api/downloads/:media/:id/file` with attachment headers, MIME detection, HEAD support and HTTP byte-range handling. Remote provider files are proxied through a short-lived server-side token, exact hostname allowlisting, redirect validation and range forwarding. Direct HLS/DASH manifests are rejected instead of being mislabeled as MP4 files.

### Local media library

1. Copy `data/download-catalog.example.json` to `data/download-catalog.json` and replace the example IDs, labels and paths with your media IDs and files.
2. Place video files under `media/downloads/` (or set `MEDIA_DOWNLOADS_DIR` to a dedicated directory). Catalogue paths must be relative to that root.
3. For movies, add options under `movies["TMDB_ID"].qualities`. For series, add options under `tv["TMDB_ID"].seasons["SEASON"].episodes["EPISODE"].qualities`.
4. Give every option a unique `id`, `label`, real `height`, optional `bitrate`, relative `file` path, and optional `filename`. Size is measured from disk, not trusted from the JSON.

### Direct-file provider adapter

Set these variables in `.env` to connect a provider endpoint that explicitly returns downloadable video files:

```env
LUMA_DOWNLOAD_RESOLVER_URL=https://your-provider.example/api/downloads
LUMA_DOWNLOAD_RESOLVER_TOKEN=your-secret-if-required
LUMA_DOWNLOAD_ALLOWED_HOSTS=cdn.your-provider.example;media.your-provider.example
```

The resolver is called using `GET` query parameters `type=movie|tv`, `id=TMDB_ID`, and (for TV) `season` and `episode`; LUMA also sends the selected embed provider name as `provider`. The optional token is sent as a Bearer token. The resolver must return JSON like:

```json
{
  "title": "Example title",
  "qualities": [
    {
      "id": "1080p",
      "label": "1080p Full HD",
      "height": 1080,
      "bitrate": 6500000,
      "sizeBytes": 2400000000,
      "filename": "Example-1080p.mp4",
      "url": "https://cdn.your-provider.example/files/signed-video-url",
      "mimeType": "video/mp4",
      "format": "mp4",
      "downloadable": true
    }
  ]
}
```

A rendition is shown only when it is explicitly marked `downloadable: true`, its URL uses HTTPS (HTTP is allowed only for loopback tests), its hostname exactly matches `LUMA_DOWNLOAD_ALLOWED_HOSTS`, and it identifies a direct video file using a supported MIME type, file extension or format. Playlists (`.m3u8`, `.mpd`, etc.) and cross-host redirects are rejected. Temporary rendition tokens expire after a few minutes; reopen the Download dialog to obtain fresh ones. Keep the resolver token secret and expose only hostnames that you trust. The adapter accepts rendition arrays named `qualities`, `renditions`, or `sources` (also under `data`). A source entry must still explicitly declare `downloadable: true` and identify a direct file; a DEVIDEOSRC/VidSrc embed URL or source-discovery record is not itself a downloadable file. DEVIDEOSRC documents `/api/resolve` as returning active source records, not a guaranteed direct-download inventory, so it cannot be used as `LUMA_DOWNLOAD_RESOLVER_URL` unless an adapter in front of it converts verified direct-file records into this contract. No built-in scraper extracts hidden player streams.

**Important for the current embeds:** VidKing and VidSrc's public integration documentation describes iframe player URLs, playback controls and embed/catalogue endpoints, but it does not document a direct MP4 download API. LUMA therefore does not pretend to download from those embeds by default. To make provider downloads work, configure an integration endpoint that genuinely returns direct downloadable files for the selected title, or use the local library. The adapter does not scrape hidden iframe internals, claim playlists are MP4 files, or extract protected streams.

## SEO
- Detail and person routes now return server-rendered semantic fallback content, concise route-specific title/description metadata, canonical URLs, Open Graph/Twitter tags, and JSON-LD (`Movie`, `TVSeries`, `Person`, `WebPage`, or `WebSite`) before client JavaScript runs.
- `/robots.txt` points crawlers to `/sitemap.xml`; the sitemap includes public catalogue routes and, when TMDB is configured, a six-hour cached set of trending titles, popular movies/series, and people. Partial TMDB failures do not prevent a sitemap from being served. It does not include watch routes, personal pages, settings, or API endpoints.
- Public detail routes include useful initial HTML content and a link to viewing options; the SPA replaces that fallback after boot. Unknown routes return HTTP 404 and `noindex` metadata.
- A branded SVG favicon is included, and large poster/backdrop image URLs are used for social previews.
- Set `PUBLIC_SITE_URL` to the real canonical HTTPS origin before deployment (for example `https://luma.example`, without a trailing slash). The example value is a placeholder; when it is left unchanged, the server falls back to the request origin for local development.
- Search engines cannot be promised rankings by code alone. Submit `https://YOUR-DOMAIN/sitemap.xml` in Google Search Console and Bing Webmaster Tools, verify the canonical host, inspect representative detail pages, and monitor crawl/index coverage after deployment.
- Hero backdrops use TMDB `w1280` artwork rather than the `original` image size. Below-the-fold posters remain lazy-loaded.
- LUMA uses Google Fonts via a stylesheet `<link>` in the document head; the CSS no longer blocks parsing with `@import`.


## Security, reliability and checks
- Security headers include a Content Security Policy with an explicit iframe-origin allowlist, `X-Content-Type-Options`, `X-Frame-Options`, a restrictive referrer policy and a limited Permissions Policy. The theme bootstrap is allowed by a SHA-256 CSP hash instead of enabling arbitrary inline scripts.
- Text responses use bounded gzip compression implemented with Node's built-in `zlib`; buffering is capped at 1 MiB per response and switches to passthrough above that limit. This was used because the npm registry timed out during the hardening pass; no unverified compression package was added to the lockfile.
- API requests are rate-limited per IP (120/minute general API; 30/minute search). The limiter is in-memory and per-process; use a shared reverse-proxy/API-gateway or Redis-backed limiter for multi-instance deployment. Do not enable Express proxy trust broadly. If behind a reverse proxy, configure trust only for the known proxy hops/IPs.
- TMDB response caching is TTL + LRU and hard-bounded by `TMDB_CACHE_MAX` (defaults to 500; the app clamps it to 5,000 maximum entries). Upstream requests have a timeout, and API errors no longer return raw upstream messages to clients.
- The HTTP server sets request/header/keep-alive timeouts and avoids importing the app from automatically starting a listener, so tests can run without a separate process.

Run verification locally with Node.js 20 or newer:
```bash
npm run check
npm test
```

For production, set a real `PUBLIC_SITE_URL`, use HTTPS at the edge, protect `.env`, and run the app behind a maintained reverse proxy or platform ingress. HSTS is emitted only when the direct request is recognized as HTTPS; behind a proxy, configure TLS and proxy trust deliberately before relying on it. The in-memory rate limiter and cache are per process and are not a substitute for shared controls in horizontally scaled deployments.

## Built-in embed fallbacks

`data/embed-providers.json` is shipped pre-populated with the requested additional movie and TV embed templates. No copy or setup step is needed. The watch page loads this file by default, displays the configured sources in the watch player, and the Settings → Server Order screen lets users change their order.

Supported placeholders are `{id}` for the numeric TMDB ID, `{imdb}` for a TMDB-supplied IMDb ID, and `{season}` / `{episode}` for TV episodes. Only HTTPS templates are accepted. A source may still fail because a host is offline, blocks iframe embedding, lacks a title, or changes its URL format; LUMA marks these hosts as unverified because it cannot reliably inspect errors inside cross-origin players. Edit `data/embed-providers.json` to disable a provider or correct an endpoint.
