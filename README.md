# PaperWall

[English](./README.md) | [简体中文](./README.zh-CN.md)

A local-first, offline paper manager and reading workspace.

PaperWall started as a personal side project: I just wanted something better than dumping PDFs into folders. It gradually grew into a real workflow tool for importing papers, reading, highlighting, and taking structured notes.

If you also collect lots of papers and want a cleaner local workflow, feel free to try it. If anything feels awkward, broken, or weird, please open an issue.

---

## What PaperWall does

PaperWall is currently a **local offline paper management + reading + notes workspace**.

It supports:

- Import local PDF papers and copy them into a managed library (without modifying your original files)
- Browse papers in a card wall view
- Open a right-side detail panel
- Full-text reading
- Text highlighting
- Structured notes / excerpts
- Local metadata enrichment (DOI / arXiv)
- Citation export

---

## Core features

- PDF import, managed copy, thumbnail generation
- Search / filter / sort
- Smart shelves
- Category management
- Favorites and reading status
- Structured notes and excerpts
- Full-text reading and text highlighting
- Citation export (EndNote RIS / GB-T)
- Open PDF / open folder
- Duplicate detection and paper deletion

---

## Tech stack

- Tauri 2 (Rust)
- React + TypeScript + Vite
- Tailwind CSS
- Zustand
- SQLite
- PDF.js / react-pdf

---

## Local development

### Requirements

- Node.js 20+
- npm 10+
- Rust stable
- macOS (currently the primary dev/test platform)

### Install dependencies

```bash
npm install
```

### Run in dev mode

```bash
npm run tauri:dev
```

### Build checks

```bash
npm run build
cd src-tauri && cargo check
```

---

## Packaging (macOS)

### Build DMG

```bash
npm run tauri:build:mac:dmg
```

This command builds `.app` first, then creates `.dmg`.

### Output paths

- App: `src-tauri/target/release/bundle/macos/PaperWall.app`
- DMG: `src-tauri/target/release/bundle/dmg/PaperWall_<version>_<arch>.dmg`

---

## Download

Release installers are published on the repository's **Releases** page. Download the `.dmg` there.

---

## macOS first-launch note

Current builds are test builds (not signed / not notarized yet), so macOS may show an "unidentified developer" warning.

You can allow it by:

1. Right click `PaperWall.app` in Finder -> `Open`
2. Or go to **System Settings -> Privacy & Security** and click “Open Anyway”

---

## Repository notes

Do **not** commit these into the GitHub repository:

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `*.app`
- `*.dmg`
- Local DB/cache files (for example `*.db`)

Keep those locally, or upload installers only in GitHub Releases.

---

## Release notes template

- [RELEASE_TEMPLATE.md](./RELEASE_TEMPLATE.md)

---

## License

No formal `LICENSE` file is included yet.
I will add one after confirming the open-source license choice.
