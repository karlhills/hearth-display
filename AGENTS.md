# Agent Notes (Token Hygiene)

## Context hygiene checklist
- Load only files needed for the current task; avoid broad file dumps.
- Prefer ripgrep (`rg`) over slower search tools.
- Summarize long outputs instead of pasting them verbatim.
- Avoid deep reference-chasing; open only directly relevant files.
- Use existing templates/assets/scripts when available.

## Google Photos / OAuth setup (quick reference)
- Redirect URI: `http://localhost:8787/api/control/photos/google/callback`
- Dev control redirect: set `DEV_CONTROL_ORIGIN=http://localhost:5174/control/`
- If scopes are wrong, revoke Hearth in https://myaccount.google.com/permissions and reconnect.

## Local Photos (quick reference)
- Mount host folder to `/data/photos` (see `docker-compose.yml`)
- In `/control` → Photos → Local Photos, set `/data/photos` and **Save & Scan**

## Google Photos cache
- Cached under `GOOGLE_PHOTOS_CACHE_DIR` (default `/data/google-cache`)
- Cache URLs are relative (e.g. `/api/photos/cache?...`) and resolve based on the host used for `/display`

## Custom theme
- Theme can be `dark`, `light`, or `custom`
- Custom theme values stored in state and applied via CSS variables
- Background image upload stored under `THEME_ASSETS_DIR` (default `/data/theme`)
