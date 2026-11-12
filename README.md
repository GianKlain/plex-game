# Plex — Patterns of the Mind

Website and web app for the board game Plex. Static files only, made for GitHub Pages.

| Path | What |
|---|---|
| `index.html` | Landing page (text from the old plex.swiss site) |
| `rules.html` | Rules, with diagrams drawn by the game engine |
| `play/` | The web app: vs computer, two players on one device. Installable (PWA) |
| `play/engine.js` | Game rules, no DOM. Spec: `docs/rules-for-app.md` |
| `play/ai.js` | Computer opponent (easy / medium / hard) |
| `docs/` | Rules spec, video narration transcript, original terms and privacy text |
| `test/engine_test.js` | Engine tests: `osascript -l JavaScript -e "$(cat test/engine_test.js); run()"` on macOS |

Run locally: `python3 -m http.server 8765` then open http://127.0.0.1:8765/

Not built yet: online play (accounts, invite link, owner registry, verified wins), game clock, interactive tutorial.

## Game log and patterns

Every game is logged in the browser (`localStorage` key `plex-games`: date, mode, move list, result). "Copy game" on the game-over dialog and "Copy game log" on the home screen put it on the clipboard as JSON; `Plex.replay(moves)` rebuilds a game.

A finished game leaves a pattern. `Plex.patternKey(state)` describes it exactly (stones with colour and seams, point stones, voids), the same for a pattern and its mirror image; `Plex.patternId(state)` is its short code (`PX-XXXXX-XXXXX`). The winner of a pattern that has not been played before may name it (`plex-patterns`). For now "not played before" means on this device; a shared registry needs the phase 2 backend and can use the same keys.
