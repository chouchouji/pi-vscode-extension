# Changelog

## [Unreleased]

### Added

- Added pan and zoom for mermaid diagrams in chat: drag to pan, mouse wheel or trackpad pinch to zoom around the cursor, and zoom in/out/reset buttons overlaid on the diagram.
- Added provider login and logout from the chat view: new `Pi: Login` / `Pi: Logout` commands, a login button in the chat view title, and a "Login..." retry action when selecting a model that is not authenticated.
- Added an assistant message header with avatar and author name in the chat webview.
- Added `@` file mention and `/` slash command autocomplete in the chat input, with keyboard navigation and IME-aware triggering.
- Added a drag handle above the chat input to resize it between the default height and twice that height.
- Added folder candidates to `@` file completion: matching folders appear with a trailing `/` and can be completed into without closing the menu.
- Added bold (`**text**`) and italic (`*text*`) rendering in chat messages.

### Changed

- Chat prompts expand `@file` mentions into file contents before sending; only real workspace files are expanded, `@@path` handles paths starting with `@`.
- Split chat view state management out of `PiChatViewProvider`.
- Split Pi agent session history and event mapping out of `PiAgentService`.
- Smoothed streaming responses with a typewriter reveal and animation-frame-coalesced renders; messages now fade in when appended and fade out when removed.
- Error messages in chat now render like regular assistant messages, including the avatar header.
- User messages now render as right-aligned bubbles that shrink to fit their content, without a border and with a square bottom-right corner.

### Fixed

- Fixed mermaid diagrams rendering with black filled edge shapes and missing node/arrow styling: the webview CSP nonce caused `'unsafe-inline'` to be ignored, blocking the SVG's `<style>` element and inline styles; `style-src` now uses `'unsafe-inline'`.
- Fixed code blocks rendering blank for unsupported languages (e.g. mermaid); the DOM source is hidden only when the canvas draw succeeds.
- Fixed user messages showing raw `<file>` blocks of expanded `@file` mentions.
- Fixed code blocks flickering while streaming.
- Fixed the chat view jumping to the bottom while scrolling up.
- Fixed failed assistant turns rendering as an empty message with no visible error; the chat now shows the provider error text in place of the reply.
- Fixed `@scope/name` tokens with a file extension (e.g. `@pro-uni/package.json`) rendering as yellow package names instead of clickable file links.
- Fixed `@` mention edge cases: paths really starting with `@` (e.g. a top-level `@scope` folder) round-trip as `@@path` and open correctly, completion matches files by any path segment instead of just the filename, and caret movement no longer leaves the completion menu anchored to a stale position.

## [0.0.5] - 2026-08-24

### Added

- Replaced the in-webview chat history panel with a native QuickPick for switching sessions.
- Improved webview rendering with batched streaming updates, collapsible long code blocks, and truncated tool output previews with a "Show full output" toggle.
- Added support for sending steer and follow-up messages while Pi is running: `Cmd+Enter` sends a steer, `Alt+Enter` queues a follow-up, with a pending queue display and restore-to-input action.

### Changed

- Shortened the model status label in the chat composer to show the model name only; the full provider/model path remains available on hover.

## [0.0.4] - 2026-08-21

### Added

- Added chat input history navigation with the up and down arrow keys.

## [0.0.3] - 2026-08-21

### Fixed

- Fixed packaged VSIX changelogs to omit development-only Unreleased sections.

## [0.0.2] - 2026-08-21

### Fixed

- Fixed packaged VSIX artifacts to exclude generated declaration files and source maps.
