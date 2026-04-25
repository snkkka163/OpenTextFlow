# OpenTextFlow (English)

<img src="./src/assets/logo.png" alt="OpenTextFlow Logo" width="220" />

[View/Open logo file](./src/assets/logo.png)

OpenTextFlow is an **AI-powered Word document optimizer** designed to improve document quality, editing efficiency, and revision traceability.

## Features

- DOCX rendering and editing assistance (powered by `docx-preview`)
- AI optimization suggestions for selected text
- Inline diff preview for AI suggestions
- Yellow highlight for AI-edited text regions
- In-document search with `Ctrl+F` / `Cmd+F`, plus `Enter` / `Shift+Enter` navigation
- Edit history storage (SQLite)
- Multi-agent prompt profile configuration
- Chinese / English UI switch

## Getting Started

### Prerequisites

- Node.js 18+
- npm 10+

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview (web build)

```bash
npm run preview
```

## Keyboard Shortcuts

- `Ctrl+F` / `Cmd+F`: Open in-document search
- `Enter`: Jump to next match
- `Shift+Enter`: Jump to previous match
- `Esc` (inside search input): Close search bar

## Project Structure

```text
OpenTextFlow/
  electron/                 # Electron main process
  public/                   # Static assets (favicon, etc.)
  src/
    assets/                 # App assets (logo, background, etc.)
    components/             # Core UI components
    i18n/                   # Localization messages
  index.html
  package.json
```

## Links

- 中文 README: [README.zh-CN.md](README.zh-CN.md)
- Main README index: [README.md](README.md)

## Notes

- Runtime user database path: `.open-text-flow/opentextflow.db` under user home directory
- This repository contains source code and static assets
