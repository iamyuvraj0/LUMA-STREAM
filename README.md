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
```
