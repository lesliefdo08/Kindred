# Kindred

Kindred is a local-first desktop IDE for running Python, C, Java, and JavaScript with managed runtimes, confidence-based language detection, Monaco editing, and a control-oriented multi-file workspace.

![Kindred](kindred_logo_name.png)

## Highlights

- Multi-file tabs with document state and quick file switching
- Collapsible utility drawer for input, diagnostics, and workspace tools
- Monaco editor with inline diagnostics markers
- Run, stop, and keyboard shortcut control from the toolbar and menus
- Confidence-scored language detection with manual override
- Java auto-wrapping for main-only snippets
- Local execution with TinyCC fallback for C

## Getting Started

```bash
npm install
npm run dev
```

### Useful Commands

```bash
npm run build
npm run verify:core
npm run dist:win
npm run dist:win:portable
```

## Keyboard Shortcuts

- `Ctrl+O` / `Cmd+O` open a file
- `Ctrl+S` / `Cmd+S` save the active document
- `Ctrl+R` / `Cmd+R` / `F5` run code
- `Ctrl+1` focus Files
- `Ctrl+2` focus Diagnostics
- `Ctrl+3` focus Settings
- `Ctrl+`` focus the console

## Project Layout

- `src/` renderer UI and Monaco integration
- `electron/` main process, IPC, file handling, and runtime execution
- `resources/` packaged runtime assets
- `release/` local build output, ignored from git history

## Release Notes

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for the latest UX and packaging changes.

## License

MIT
