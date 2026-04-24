# Kindred

Kindred is a zero-setup desktop coding environment for fast experimentation. It keeps the editor first, execution local, and the workflow lightweight enough to trust.

Kindred — Zero-setup coding for fast experimentation.

## Features

- Editor-first layout with multi-file tabs
- Auto language detection for Python, C, Java, and JavaScript
- Inline diagnostics with click-to-line navigation
- Integrated output, problems, terminal, and logs views
- Interactive stdin in the terminal tab
- Local runtime execution with managed fallbacks
- Windows packaging with branded application assets

## Screenshots

Release screenshots live in [docs/screenshots](docs/screenshots/). Add these files before publishing:

- `kindred-editor.png`
- `kindred-run-output.png`
- `kindred-error-analysis.png`

## Installation

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run verify:core
npm run verify:intelligence
npm run dist:win
npm run dist:win:portable
```

## Keyboard Shortcuts

- `Ctrl+O` / `Cmd+O` open a folder
- `Ctrl+Shift+O` / `Cmd+Shift+O` open a file
- `Ctrl+S` / `Cmd+S` save the active document
- `Ctrl+Enter` / `Cmd+Enter` run code
- `Ctrl+R` / `Cmd+R` / `F5` run code
- `Ctrl+B` / `Cmd+B` toggle the explorer
- `Ctrl+`` toggle the terminal tab

## Roadmap

- Auto-save toggle
- Export current file
- Download/save code bundle
- Command palette refinements
- Additional language/runtime hardening

## Project Layout

- `src/` renderer UI and Monaco integration
- `electron/` main process, IPC, file handling, and runtime execution
- `resources/` packaged runtime assets
- `build/` packaged icons and release assets
- `docs/screenshots/` release screenshot placeholders

## License

MIT
