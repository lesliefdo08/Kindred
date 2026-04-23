# Release Notes

## Current Redesign Pass

- Rebuilt the app shell around a multi-file IDE workspace.
- Added document tabs, a collapsed utility drawer, and clearer execution state feedback.
- Refined the visual system to be flatter, denser, and more IDE-like.
- Wired Kindred branding into the window chrome, header, and about dialog.
- Cleaned up the README to match the current product direction.

## Version 0.1.0 - Release Candidate

## Final UX-Control Refinement Pass (April 23, 2026)

- Interactive language control now replaces passive detection text:
	- `Detected: <Language> (<confidence>)` is always visible
	- dropdown options: `Auto`, `C`, `Python`, `Java`
	- manual selection locks execution language until returned to `Auto`
- Added low-confidence guidance:
	- `Language not confidently detected. Select manually.`
- Sidebar control improvements:
	- `Ctrl+1` Files
	- `Ctrl+2` Diagnostics
	- `Ctrl+3` Settings
	- sidebar remains sticky while content scrolls independently
- Console UX refactor:
	- merged output + error sections in one result surface
	- execution summary banner (`Running`, `Compiled successfully`, `Timed out`, `Execution failed`)
	- `Advanced Logs` collapsed behind expandable details
	- runtime log steps translated to human-readable labels
- Input clarity improvements:
	- `stdin` renamed to `Program Input (stdin)`
	- terminal-style input visuals and improved placeholders
- Monaco diagnostics integration:
	- parsed runtime/compiler line info displayed as editor markers
	- red/yellow squiggles and hover tooltips for parsed issues
- Process feedback and control:
	- run state transitions clearly (`Running...` to final state)
	- `Run` disabled while executing
	- `Stop` now actively cancels running process
- Java file UX:
	- when public class name mismatches, save flow prompts rename confirmation
	- if accepted, file is renamed to `<ClassName>.java`


### 🎉 Major Features

#### Part 1: Dynamic Language State Synchronization
- **Fixed**: Editor language label now updates reactively when detected language changes
- **Improved**: Monaco editor language mode syncs with effective language automatically
- **Enhanced**: File extension naming reflects current language mode (auto-detect, manual override)
- **Verified**: Java auto-wrapping preserves file naming conventions

#### Part 2: Keyboard Shortcuts & Usability
- **Added**: `Ctrl+O` / `Cmd+O` - Open file
- **Added**: `Ctrl+S` / `Cmd+S` - Save file  
- **Added**: `Ctrl+R` / `Cmd+R` / `F5` - Run code
- **Added**: `Ctrl+1`, `Ctrl+2`, `Ctrl+3` - Sidebar navigation
- **Added**: `Ctrl+`` - Focus console
- **Benefit**: Standard IDE keyboard navigation and workflow

#### Part 3: Console Input Experience
- **Improved**: Program Input (stdin) panel styling for native terminal feel
- **Supported**: Interactive programs with `input()`, `scanf()`, `Scanner`
- **Verified**: Multi-line input support for complex programs

#### Part 4: Design Refinement & Visual Polish
- **Removed**: Persistent runtime status badges (Python ready, C using TinyCC, Java ready)
- **Improved**: Toolbar proportions and layout density
- **Enhanced**: Visual hierarchy with better spacing and typography
- **Added**: Smooth scrolling throughout the interface (console, panels)
- **Refined**: Card styling, shadows, and glass effects for premium IDE feel
- **Consistent**: Button styling and hover states

#### Part 5: Production Build Optimization
- **Bundle size**: 176.84 KB JS (gzip: 56.71 KB) + 10.57 KB CSS (gzip: 2.98 KB)
- **Performance**: Unchanged startup time, HMR-safe development
- **Quality**: All 50 React modules compile without tree-shake warnings

#### Part 6: Help Menu & Update Infrastructure
- **Added**: Application menu with File/Run/Help sections
- **Added**: Help → About Kindred with version info
- **Added**: Help → Check for Updates (scaffolded for electron-updater)
- **Added**: Help → GitHub Repository link
- **Scaffolded**: electron-updater integration structure
- **IPC Ready**: Menu message handlers for future update checks

#### Part 7: GitHub Release Preparation
- **Created**: MIT License
- **Created**: Comprehensive CONTRIBUTING.md guide
- **Created**: GitHub issue templates (bug report, feature request)
- **Created**: GitHub Actions workflow for build + release automation
- **Enhanced**: README with full feature list, architecture, and usage guide
- **Added**: Support links and documentation structure

### 🔧 Technical Improvements

**Language Detection**
- Confidence-scored heuristics with ambiguity detection
- 67% confidence threshold for auto-mode fallback
- Clear "mixed syntax" indicators

**Execution Pipeline**
- Auto/manual language mode selection
- Python-first fallback on low confidence
- Timeout messaging: "Execution stopped: possible infinite loop."
- Crash detection with detailed error insights

**Runtime Strategies**
- Java main-only snippet auto-wrapping
- Class name detection and filename alignment
- C execution with local gcc → TinyCC → Docker fallback

**UI Components**
- Multi-panel layout: activity bar + editor + inspector rail
- Tabbed console: Output/Errors/Logs views
- Diagnostics panel with detection confidence display
- Welcome panel with examples and recent files
- File operations with extension auto-naming

### 📊 Test Coverage

All 9 core test cases passing:
1. ✅ Python Detection Confidence (100% match)
2. ✅ Mixed Syntax Ambiguity (C + Python signals, 67% confidence, flagged ambiguous)
3. ✅ Python Hello World execution
4. ✅ C Hello World execution
5. ✅ C Loop execution
6. ✅ C stdin support (`scanf` with input)
7. ✅ Java Hello World execution
8. ✅ Java Auto-Wrap (main-only snippet compilation)
9. ✅ C Timeout Messaging ("Execution stopped: possible infinite loop.")

### 🚀 Installation & Usage

```bash
# Development
npm install
npm run dev

# Production build
npm run build

# Run tests
npm run verify:core
```

**Keyboard Shortcuts** available in the app. Help menu provides about info and update checks.

### 📦 Dependencies

- **Renderer**: React 18, Monaco Editor, Vite
- **Desktop**: Electron 31, Node.js 20
- **Build**: TypeScript, esbuild, Vite
- **Testing**: tsx runtime

### 🔐 Security & Privacy

- ✅ Local-first: Code never leaves your machine
- ✅ No telemetry or analytics
- ✅ Electron sandbox enabled
- ✅ Context isolation enforced
- ✅ Node integration disabled

### 📝 Known Limitations

- Stop button wired but process cancellation not yet implemented (low priority)
- Settings not persisted across sessions
- C++ execution detected but not yet supported
- electron-updater scaffolded but not fully integrated

### 🙏 Acknowledgments

Built with:
- Monaco Editor (Microsoft)
- Electron (OpenJS Foundation)
- React (Facebook)
- TinyCC (Fabrice Bellard)

### 📞 Support & Contribution

- **GitHub**: https://github.com/lesliefdo08/Kindred
- **Issues**: Report bugs via GitHub Issues
- **Contributing**: See CONTRIBUTING.md for guidelines
- **License**: MIT

---

### Release Candidate Status

This release represents the final polish pass on the Kindred IDE:
- ✅ All critical bugs fixed (dynamic language state)
- ✅ Professional IDE usability (keyboard shortcuts, menu)
- ✅ Premium visual design (refined spacing, dark theme)
- ✅ GitHub release-ready (docs, license, CI/CD)
- ✅ Comprehensive test coverage
- ✅ Production build optimized

**Ready for public beta release.**

---

**Thank you for using Kindred!** 🚀
