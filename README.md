# WoWs Monitor Desktop

Standalone Electron client for [wows-monitor.com](https://wows-monitor.com). Isolated browser profile, so the replay folder permission sticks between sessions.

Not affiliated with or endorsed by wows-monitor.com or its developers.

## Features

- Shows/hides with the game, unloads the page between sessions
- Match view scales to fit the window
- Tray menu for settings, `Ctrl+Alt+M` to toggle

## Build

```
npm install
npm start
npm run dist
```

Page tweaks live in `inject/`. They hot-reload under `npm start`.
