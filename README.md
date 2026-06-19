<div align="center">

# changelog-generator

**Turn git history into a formatted CHANGELOG in one command — conventional commits, zero dependencies.**

[![License: MIT](https://img.shields.io/badge/License-MIT-0B0A09?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-0B0A09?style=flat-square)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D18-0B0A09?style=flat-square&logo=node.js&logoColor=white)](package.json)

</div>

## Install

```bash
npx github:NickCirv/changelog-generator
```

## Usage

```bash
# Print changelog to stdout
npx github:NickCirv/changelog-generator

# Write to file
npx github:NickCirv/changelog-generator --output CHANGELOG.md

# Commits since a tag
npx github:NickCirv/changelog-generator --since v1.0.0 --output CHANGELOG.md

# Compare two tags
npx github:NickCirv/changelog-generator --from v1.0.0 --to v2.0.0

# Label unreleased commits
npx github:NickCirv/changelog-generator --next-version 2.0.0 --output CHANGELOG.md

# JSON output
npx github:NickCirv/changelog-generator --format json

# Include non-conventional commits
npx github:NickCirv/changelog-generator --include-all
```

| Flag | Description |
|------|-------------|
| `--since <tag>` | Commits since a tag |
| `--from <tag>` | Start of range (use with `--to`) |
| `--to <tag>` | End of range |
| `--output <file>` | Write to file instead of stdout |
| `--format <fmt>` | `markdown` (default) or `json` |
| `--repo-url <url>` | GitHub URL for commit/PR links (auto-detected) |
| `--next-version <ver>` | Label for unreleased commits |
| `--include-all` | Include non-conventional commits |
| `--include-merges` | Include merge commits |
| `-h, --help` | Show help |

## What it does

Reads your git log, groups commits by semver tag, and renders them into sectioned Markdown (or JSON) grouped by conventional commit type — `feat`, `fix`, `perf`, `refactor`, `docs`, and more. Breaking changes always appear first. GitHub remote is auto-detected so commit and PR links are generated automatically. Uses `execFileSync` throughout — no shell injection risk, no network calls.

---

<sub>Zero dependencies · Node >=18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
