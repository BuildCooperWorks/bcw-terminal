# Recent Updates (2026-04-26)

This document summarizes the latest fixes and behavior changes.

## Terminal / Command behavior

- `dir` shortcut commands now run through `cmd /d /c dir ...` on Windows.
  - This avoids PowerShell parsing differences for options like `/a`, `/q`, `/o:-d`, `/s`.
- Command shortcut execution now returns focus to the terminal so users can keep typing immediately.
- Copy action now clears selected range after successful copy.

## Selection / Focus fixes

- Selection-copy flow was adjusted to avoid losing selection when clicking menu items.
- Focus restore logic was tuned to avoid blocking mouse drag range selection.

## Native module stability (`node-pty`)

- Added `postinstall` patch script:
  - `scripts/patch-node-pty-spectre.cjs`
- The patch adjusts Spectre-related settings used by `@homebridge/node-pty-prebuilt-multiarch` build files to improve rebuild success on Windows environments where Spectre libs are not present.

## Build and packaging

- Verified commands:
  - `npm run typecheck`
  - `npm run build:main`
  - `npm run dist:win`
- Portable output:
  - `release/BcwTerminal-0.1.0-portable.exe`
