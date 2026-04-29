# Kindred Portable-Minimal Release Plan

## Overview
Kindred portable-minimal is a single-executable, no-install release designed to minimize Smart App Control suspicion on Windows by:
- Excluding bundled runtimes (TinyCC, MinGW)
- Excluding helper executables (elevate.exe)
- Skipping post-pack executable modifications (rcedit icon embedding)
- Falling back to system compilers (GCC, Clang, etc.)

## Artifacts

### Primary: `Kindred-portable-minimal.zip` (465MB)
- Single executable: `Kindred.exe` (172MB)
- Electron runtime + app bundle
- No bundled compiler toolchains
- No temporary helper executables

### System Requirements
- Windows 10+
- For C/C++: GCC or Clang must be available on system PATH or installed separately
- For Python/Java: System installations or local PATH
- For JavaScript: Built-in Node.js support

## Runtime Fallback Strategy

Kindred's runtime resolver tries runtimes in this order:

1. **Local System Compilers** (preferred, pre-installed likely):
   - Python: `py -3`, `python`
   - C: `gcc`, `clang`, `cc`
   - C++: `g++`, `clang++`, `c++`
   - Java: `javac`, `java`

2. **Managed Runtimes** (requires `managed-runtimes/runtimes.json`):
   - Custom configured paths (not shipped in portable-minimal)

3. **Container Execution** (optional):
   - Docker if available

## Portable Build Process

```bash
# Build portable-minimal release
npm run dist:win:portable-minimal

# Creates:
# - release/Kindred 0.1.0.exe (standard portable, ~465MB)
# - release/Kindred-portable-minimal.zip (465MB)
```

### What the Build Excludes
- `resources/runtimes/**` (bundled TinyCC)
- `resources/elevate.exe` (Windows privilege elevation helper)
- `managed-runtimes/**` (managed runtime config)
- Post-pack executable edits (icon/manifest patching)

## Auto-Update

When released on GitHub:
1. Push release to GitHub with `Kindred-0.1.0.exe` or matching version artifact
2. Users running portable will auto-check for updates
3. New version downloads in background
4. User is notified and prompted to restart
5. App reinstalls on quit and relaunches

No manual download needed.

## Testing Checklist

- [ ] Extract portable ZIP
- [ ] Run `Kindred.exe` from Downloads
- [ ] Verify no Smart App Control warnings
- [ ] Create desktop shortcut
- [ ] Pin to taskbar
- [ ] Verify icon displays correctly
- [ ] Test Python execution
- [ ] Test C execution (requires system GCC/Clang)
- [ ] Test JavaScript execution
- [ ] Verify Help > About shows correct version

## Distribution

Recommended as primary GitHub release artifact for maximum compatibility and minimal Smart App Control friction.

## Building the Standard NSIS Installer (for comparison)

```bash
npm run dist:win
# Creates: release/Kindred Setup 0.1.0.exe
```

This still includes full icon patching and elevation helper. Use only if installer is required.

## Development Setup

To enable bundled compiler bootstrapping during development:

```bash
npm run bootstrap
```

This downloads TinyCC and MinGW into `resources/runtimes/` for local development/testing.
