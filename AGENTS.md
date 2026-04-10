# Repository Guidelines

## Project Structure & Module Organization
`manifest.json` defines the Chrome Extension entry points and permissions. Runtime logic is split by surface: `background.js` handles commands and tab messaging, `content.js` injects reading styles into pages, `popup.html` + `popup.js` power the popup UI, and `options.html` + `options.js` provide the full settings page. Shared defaults, storage helpers, and validators live in `shared.js`. Static assets stay at the repo root, such as `icon.png`. `build.py` packages the release zip.

## Build, Test, and Development Commands
Use the repo as an unpacked extension during development:

- `python build.py`: creates `PureRead-v<version>.zip` from the files listed in `build.py`.
- `chrome://extensions/`: enable Developer Mode, then choose `Load unpacked` and select the repository root.
- `git diff`: review UI and storage changes before packaging.

There is no Node-based build pipeline in this repository; changes take effect after reloading the extension in the browser.

## Coding Style & Naming Conventions
Follow the existing plain JavaScript style: 2-space indentation, semicolons, and `camelCase` for variables/functions. Keep filenames lowercase and surface-oriented, matching the current pattern like `popup.js` and `content.js`. Prefer small helpers in `shared.js` for reusable storage or validation logic instead of duplicating code across popup, options, and content scripts.

## Testing Guidelines
No automated test suite is configured yet. Validate changes manually in Chromium after every update:

- reload the unpacked extension;
- verify popup interactions, options persistence, and content script injection on a real page;
- re-test shortcuts such as `Alt+Shift+P` and `Alt+Shift+F`;
- confirm `chrome.storage.sync` changes propagate across popup, options, and active tabs.

If you add automated tests later, place them under a dedicated `tests/` directory and keep names aligned with the module under test, for example `content.spec.js`.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit prefixes such as `feat:`, `fix:`, and `docs:`. Keep commit subjects short and imperative, for example `fix: unify storage sync flow`. For pull requests, include:

- a concise summary of user-visible behavior changes;
- linked issues when applicable;
- screenshots or GIFs for popup/options UI updates;
- a short manual test checklist covering affected pages, shortcuts, and storage flows.

## Security & Configuration Tips
Treat `manifest.json` permissions as a stable contract: keep additions minimal and justify them in the PR. When changing storage shape, preserve backward compatibility through normalization in `shared.js` so existing user settings do not break after upgrade.
