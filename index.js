#!/usr/bin/env node
/**
 * changelog-generator
 * Generate CHANGELOG.md from git history. Conventional commits. Zero dependencies.
 * https://github.com/NickCirv/changelog-generator
 */

import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// ─── Conventional commit type → section label ────────────────────────────────
const TYPE_MAP = {
  feat:     { emoji: '✨', label: 'Features',       order: 2 },
  fix:      { emoji: '🐛', label: 'Bug Fixes',      order: 3 },
  perf:     { emoji: '⚡', label: 'Performance',    order: 4 },
  refactor: { emoji: '♻️', label: 'Refactoring',    order: 5 },
  docs:     { emoji: '📝', label: 'Documentation',  order: 6 },
  test:     { emoji: '🧪', label: 'Tests',          order: 7 },
  chore:    { emoji: '🔧', label: 'Maintenance',    order: 8 },
  ci:       { emoji: '👷', label: 'CI/CD',          order: 9 },
  build:    { emoji: '📦', label: 'Build',          order: 10 },
  revert:   { emoji: '⏪', label: 'Reverts',        order: 11 },
};

const BREAKING_SECTION = { emoji: '💥', label: 'Breaking Changes', order: 1 };

// ─── Regexes ─────────────────────────────────────────────────────────────────
const CONV_REGEX  = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?\s*:\s*(?<desc>.+)$/;
const SEMVER_TAG  = /^v?\d+\.\d+(\.\d+)?(-[\w.]+)?(\+[\w.]+)?$/;
const PR_REF      = /\(#(\d+)\)/g;

// ─── CLI argument parser ──────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    since: null, from: null, to: null, output: null,
    format: 'markdown', repoUrl: null, nextVersion: null,
    includeAll: false, includeMerges: false, help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    switch (a) {
      case '--since':          opts.since        = next; i++; break;
      case '--from':           opts.from         = next; i++; break;
      case '--to':             opts.to           = next; i++; break;
      case '--output':         opts.output       = next; i++; break;
      case '--format':         opts.format       = next; i++; break;
      case '--repo-url':       opts.repoUrl      = next; i++; break;
      case '--next-version':   opts.nextVersion  = next; i++; break;
      case '--include-all':    opts.includeAll    = true; break;
      case '--include-merges': opts.includeMerges = true; break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (a.startsWith('--')) {
          process.stderr.write(`Unknown option: ${a}\n`);
          process.exit(1);
        }
    }
  }
  return opts;
}

// ─── Git helpers — execFileSync only, never exec ──────────────────────────────
function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function getRemoteUrl() { return git('remote', 'get-url', 'origin'); }

function parseGitHubUrl(remote) {
  if (!remote) return null;
  const ssh = remote.match(/git@github\.com[:/](.+?)(?:\.git)?$/);
  if (ssh) return `https://github.com/${ssh[1]}`;
  const https = remote.match(/https:\/\/github\.com\/(.+?)(?:\.git)?$/);
  if (https) return `https://github.com/${https[1]}`;
  return null;
}

function getTags() {
  const raw = git('tag', '--sort=-version:refname');
  return raw ? raw.split('\n').filter(t => SEMVER_TAG.test(t)) : [];
}

function getTagDate(tag) {
  const d = git('log', '-1', '--format=%ai', tag);
  return d ? d.split(' ')[0] : new Date().toISOString().split('T')[0];
}

function fetchCommits(range, includeMerges) {
  const sep = '\x1f';
  const rec = '\x1e';
  const fmt = `%H${sep}%an${sep}%ae${sep}%as${sep}%s${sep}%b${rec}`;
  const baseArgs = ['log', `--format=${fmt}`];
  if (!includeMerges) baseArgs.push('--no-merges');
  if (range) baseArgs.push(range);
  const raw = git(...baseArgs);
  if (!raw) return [];
  return raw.split(rec).map(r => r.trim()).filter(Boolean).map(r => {
    const p = r.split(sep);
    return { hash: p[0]||'', author: p[1]||'', email: p[2]||'', date: p[3]||'', subject: p[4]||'', body: p[5]||'' };
  });
}

// ─── Commit parser ────────────────────────────────────────────────────────────
function parseCommit(c) {
  const m = CONV_REGEX.exec(c.subject);
  const isBreaking = c.body.includes('BREAKING CHANGE') || (m && m.groups.breaking === '!');
  if (!m) return { ...c, conventional: false, type: 'other', scope: null, isBreaking, desc: c.subject };
  return { ...c, conventional: true, type: m.groups.type, scope: m.groups.scope || null, isBreaking, desc: m.groups.desc };
}

// ─── Link builders ────────────────────────────────────────────────────────────
const short     = h => h.slice(0, 7);
const cLink     = (h, u) => u ? `[\`${short(h)}\`](${u}/commit/${h})` : `\`${short(h)}\``;
const prLink    = (n, u) => u ? `[#${n}](${u}/pull/${n})` : `#${n}`;

function formatEntry(p, repoUrl) {
  const prefix = p.isBreaking ? '**BREAKING:** ' : '';
  const scope  = p.scope ? `(${p.scope})` : '';
  const type   = p.conventional ? `${p.type}${scope}: ` : '';
  const prs    = [];
  p.subject.replace(PR_REF, (_, n) => { prs.push(n); return ''; });
  const link   = cLink(p.hash, repoUrl);
  const prStr  = prs.length ? ' ' + prs.map(n => prLink(n, repoUrl)).join(', ') : '';
  const by     = `@${p.author.replace(/\s+/g, '')}`;
  return `- ${prefix}${type}${p.desc}${prStr} (${link}) by ${by}`;
}

// ─── Markdown renderer for one version block ──────────────────────────────────
function renderBlock(version, date, commits, repoUrl, includeAll, compareUrl) {
  const sections = {};
  const breaking = [];

  for (const raw of commits) {
    const p = parseCommit(raw);
    if (p.isBreaking) breaking.push(formatEntry(p, repoUrl));
    if (!p.conventional) {
      if (includeAll) (sections['other'] = sections['other'] || []).push(formatEntry(p, repoUrl));
      continue;
    }
    (sections[p.type] = sections[p.type] || []).push(formatEntry(p, repoUrl));
  }

  const lines = [`## ${version}${date ? ` — ${date}` : ''}`];
  if (compareUrl) lines.push(`> [Full diff](${compareUrl})\n`);

  if (breaking.length) {
    lines.push(`\n### ${BREAKING_SECTION.emoji} ${BREAKING_SECTION.label}`);
    breaking.forEach(e => lines.push(e));
  }

  const ordered = Object.keys(TYPE_MAP).sort((a, b) => TYPE_MAP[a].order - TYPE_MAP[b].order);
  for (const t of ordered) {
    if (!sections[t]?.length) continue;
    const { emoji, label } = TYPE_MAP[t];
    lines.push(`\n### ${emoji} ${label}`);
    sections[t].forEach(e => lines.push(e));
  }
  if (sections['other']?.length) {
    lines.push('\n### 📋 Other Changes');
    sections['other'].forEach(e => lines.push(e));
  }
  return lines.join('\n');
}

// ─── Main generator ───────────────────────────────────────────────────────────
function generate(opts) {
  const repoUrl = opts.repoUrl || parseGitHubUrl(getRemoteUrl()) || null;
  const tags    = getTags();
  const today   = new Date().toISOString().split('T')[0];

  let windows;
  if (opts.from && opts.to) {
    windows = [{ version: opts.nextVersion || `${opts.from}..${opts.to}`, date: getTagDate(opts.to) || today, range: `${opts.from}..${opts.to}`, fromTag: opts.from, toTag: opts.to }];
  } else if (opts.since) {
    windows = [{ version: opts.nextVersion || 'Unreleased', date: today, range: `${opts.since}..HEAD`, fromTag: opts.since, toTag: null }];
  } else if (tags.length === 0) {
    windows = [{ version: opts.nextVersion || 'Unreleased', date: today, range: null, fromTag: null, toTag: null }];
  } else {
    windows = [{ version: opts.nextVersion || 'Unreleased', date: today, range: `${tags[0]}..HEAD`, fromTag: tags[0], toTag: null }];
    for (let i = 0; i < tags.length; i++) {
      const toTag = tags[i];
      const fromTag = tags[i + 1] || null;
      windows.push({ version: toTag, date: getTagDate(toTag), range: fromTag ? `${fromTag}..${toTag}` : toTag, fromTag, toTag });
    }
  }

  if (opts.format === 'json') {
    const blocks = windows.map(w => {
      const commits = fetchCommits(w.range, opts.includeMerges).map(parseCommit);
      return {
        version: w.version, date: w.date,
        commits: commits.map(c => ({
          hash: c.hash, short: short(c.hash), type: c.type, scope: c.scope,
          description: c.desc, breaking: c.isBreaking, conventional: c.conventional,
          author: c.author, date: c.date,
          commitUrl: repoUrl ? `${repoUrl}/commit/${c.hash}` : null,
        })),
      };
    }).filter(b => b.commits.length > 0);
    return JSON.stringify(blocks, null, 2);
  }

  // Markdown
  const parts = [
    '# Changelog\n',
    '> Generated by [changelog-generator](https://github.com/NickCirv/changelog-generator). Conventional commits.\n',
  ];
  let hasContent = false;
  for (const w of windows) {
    const commits = fetchCommits(w.range, opts.includeMerges);
    if (!commits.length) continue;
    hasContent = true;
    let compareUrl = null;
    if (repoUrl && w.fromTag && w.toTag)    compareUrl = `${repoUrl}/compare/${w.fromTag}...${w.toTag}`;
    else if (repoUrl && w.fromTag)          compareUrl = `${repoUrl}/compare/${w.fromTag}...HEAD`;
    parts.push(renderBlock(w.version, w.date, commits, repoUrl, opts.includeAll, compareUrl));
    parts.push('\n');
  }
  if (!hasContent) parts.push('_No commits found for the specified range._\n');
  return parts.join('\n');
}

// ─── Help ────────────────────────────────────────────────────────────────────
function printHelp() {
  process.stdout.write(`changelog-generator — Generate CHANGELOG.md from git history

USAGE
  chlog [options]
  changelog-generator [options]

OPTIONS
  --since <tag>           Commits since a tag        (e.g. --since v1.0.0)
  --from <tag>            Start of range             (use with --to)
  --to <tag>              End of range               (use with --from)
  --output <file>         Write to file              (e.g. --output CHANGELOG.md)
  --format <fmt>          Output format: markdown (default) | json
  --repo-url <url>        GitHub repo URL for commit/PR links
                          (auto-detected from git remote when possible)
  --next-version <ver>    Label for unreleased commits (e.g. --next-version 2.0.0)
  --include-all           Include non-conventional commits under "Other Changes"
  --include-merges        Include merge commits (excluded by default)
  -h, --help              Show this help

EXAMPLES
  chlog
  chlog --output CHANGELOG.md
  chlog --since v1.0.0 --output CHANGELOG.md
  chlog --from v1.0.0 --to v2.0.0
  chlog --next-version 2.0.0 --output CHANGELOG.md
  chlog --format json
  chlog --include-all --repo-url https://github.com/user/repo

CONVENTIONAL COMMIT TYPES
  feat      → ✨ Features
  fix       → 🐛 Bug Fixes
  perf      → ⚡ Performance
  refactor  → ♻️  Refactoring
  docs      → 📝 Documentation
  test      → 🧪 Tests
  chore     → 🔧 Maintenance
  ci        → 👷 CI/CD
  build     → 📦 Build
  revert    → ⏪ Reverts
  BREAKING  → 💥 Breaking Changes (always first)
`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────
(function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) { printHelp(); process.exit(0); }
  if (!['markdown', 'json'].includes(opts.format)) {
    process.stderr.write(`Invalid format: ${opts.format}. Use markdown or json.\n`);
    process.exit(1);
  }
  let output;
  try { output = generate(opts); }
  catch (err) { process.stderr.write(`Error: ${err.message}\n`); process.exit(1); }
  if (opts.output) {
    const dest = resolve(process.cwd(), opts.output);
    writeFileSync(dest, output, 'utf8');
    process.stderr.write(`Changelog written to ${dest}\n`);
  } else {
    process.stdout.write(output);
  }
})();
