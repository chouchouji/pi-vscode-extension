# Changelog

## [Unreleased]

### Added

- Added provider login and logout from the chat view: new `Pi: Login` / `Pi: Logout` commands, a login button in the chat view title, and a "Login..." retry action when selecting a model that is not authenticated.
- Added an assistant message header with avatar and author name in the chat webview.

### Changed

- Split chat view state management out of `PiChatViewProvider`.
- Split Pi agent session history and event mapping out of `PiAgentService`.
- Smoothed streaming responses with a typewriter reveal and animation-frame-coalesced renders; messages now fade in when appended and fade out when removed.
- Error messages in chat now share the user message bubble style.

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
