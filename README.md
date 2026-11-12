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
