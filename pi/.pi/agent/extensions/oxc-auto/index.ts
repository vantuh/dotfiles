import fs from 'node:fs';
import path from 'node:path';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  createEditToolDefinition,
  createWriteToolDefinition,
  isEditToolResult,
  isWriteToolResult,
  withFileMutationQueue,
} from '@earendil-works/pi-coding-agent';

import { withNotesRenderer } from './notes-renderer.ts';
import { parseEslint, parseOxlint } from './parsers.ts';
import type { Finding } from './parsers.ts';

const TS_RE = /\.(?:ts|tsx|mts|cts)$/;
const MAX_FINDINGS = 10;

const OX_CONFIGS = [
  '.oxlintrc.json',
  '.oxfmtrc.json',
  '.oxfmtrc.jsonc',
  'oxfmt.config.ts',
  'oxfmt.config.mts',
];
const PRETTIER_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.ts',
  '.prettierrc.mts',
  '.prettierrc.cts',
  '.prettierrc.mjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.toml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'prettier.config.ts',
  'prettier.config.mts',
  'prettier.config.cts',
];
const ESLINT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  '.eslintrc.cjs',
];

interface Toolchain {
  formatter: 'oxfmt' | 'prettier';
  linter: 'oxlint' | 'eslint';
  lintRoot: string | null;
}

const hasPrettierKey = (dir: string): boolean => {
  try {
    const pkg: unknown = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    );
    return typeof pkg === 'object' && pkg !== null && 'prettier' in pkg;
  } catch {
    return false;
  }
};

const scanCache = new Map<string, Toolchain>();

/** ONE upward scan; nearest dir with any relevant config decides all roles. */
function resolveToolchain(startDir: string): Toolchain {
  const cached = scanCache.get(startDir);
  if (cached) return cached;

  let result: Toolchain = {
    formatter: 'oxfmt',
    linter: 'oxlint',
    lintRoot: null,
  };
  let dir = startDir;
  while (true) {
    // Check each family independently: one dir may hold both .prettierrc and
    // eslint.config.ts — formatter and linter must be resolved separately.
    const hasOx = OX_CONFIGS.some((c) => fs.existsSync(path.join(dir, c)));
    const hasPrettier =
      !hasOx &&
      (PRETTIER_CONFIGS.some((c) => fs.existsSync(path.join(dir, c))) ||
        hasPrettierKey(dir));
    const hasEslint =
      !hasOx && ESLINT_CONFIGS.some((c) => fs.existsSync(path.join(dir, c)));
    if (hasOx || hasPrettier || hasEslint) {
      result = {
        formatter: hasOx || !hasPrettier ? 'oxfmt' : 'prettier',
        linter: hasOx ? 'oxlint' : hasEslint ? 'eslint' : 'oxlint',
        lintRoot: dir,
      };
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  scanCache.set(startDir, result);
  return result;
}

/**
 * After the model edits a .ts file: run the project's linter with --fix, then
 * its formatter, then feed remaining lint findings back into the tool result —
 * so the model sees and fixes its own violations without being asked.
 */
export default function oxcAuto(pi: ExtensionAPI) {
  pi.on('tool_result', async (event, ctx) => {
    if (!isEditToolResult(event) && !isWriteToolResult(event)) return undefined;
    if (event.isError) return undefined;
    if (!ctx.isProjectTrusted()) return undefined; // never execute repo-controlled binaries in untrusted projects
    // edit/write inputs both carry `path: string` — typed, no assertion needed
    const file = event.input.path;
    if (typeof file !== 'string' || !TS_RE.test(file)) return undefined;
    // Canonicalize: edit tool may pass relative paths; everything below
    // (walk-up scan, bin paths, sh commands) must be rooted at one absolute path.
    const absFile = path.resolve(file);

    return withFileMutationQueue(absFile, async () => {
      const toolchain = resolveToolchain(path.dirname(absFile));

      const checksum = () =>
        pi
          .exec('md5sum', [absFile])
          .then((r) => r.stdout.trim().split(' ')[0])
          .catch(() => null);
      const before = await checksum();

      // Lint --fix (output parsed after fixes; exec always resolves with stdout —
      // dist/core/exec.js never rejects, even on non-zero exit), then format
      // (lint fixes can unformat code). Ignores are respected for explicitly
      // passed paths (herdr-agent-state.ts etc. stay untouched).
      let findings: Finding[] = [];
      if (toolchain.linter === 'oxlint') {
        const r = await pi
          .exec('sh', [
            '-c',
            'oxlint --fix --format github "$1" || true',
            'sh',
            absFile,
          ])
          .catch(() => null);
        if (r) findings = parseOxlint(r.stdout);
      } else if (toolchain.linter === 'eslint' && toolchain.lintRoot) {
        // Global eslint binary; rules come from the project's config resolved
        // relative to lintRoot, so the binary version is irrelevant.
        const r = await pi
          .exec('sh', [
            '-c',
            'cd "$1" && eslint --fix --format json "$2" || true',
            'sh',
            toolchain.lintRoot,
            absFile,
          ])
          .catch(() => null);
        if (r) findings = parseEslint(r.stdout);
      }

      let usedFormatter = toolchain.formatter;
      const fmt = await pi.exec(usedFormatter, ['--write', absFile]);
      if (fmt.code !== 0 && usedFormatter === 'prettier') {
        usedFormatter = 'oxfmt'; // prettier binary unavailable → global fallback
        await pi.exec('oxfmt', ['--write', absFile]).catch(() => {});
      }

      const after = await checksum();
      const notes: string[] = [];
      const tools = [`${toolchain.linter} --fix`, usedFormatter].join(' / ');
      if (before !== null && after !== null && before !== after) {
        notes.push(
          `[oxc-auto] ${tools} rewrote this file — re-read it before further edits, your oldText anchors may be stale.`,
        );
      }
      if (findings.length > 0) {
        const shown = findings
          .slice(0, MAX_FINDINGS)
          .map((f) => `- L${f.line} [${f.severity}] ${f.rule}: ${f.message}`);
        const more =
          findings.length > MAX_FINDINGS
            ? `\n- ...and ${findings.length - MAX_FINDINGS} more`
            : '';
        notes.push(
          `[oxc-auto] ${toolchain.linter} reports ${findings.length} remaining issue(s) in this file — fix them before finishing:\n${shown.join('\n')}${more}`,
        );
      }

      // Brief footer flash: ✎ when the file was rewritten, ⚠ when lint findings remain.
      if (ctx.hasUI) {
        const rewrote = before !== null && after !== null && before !== after;
        const icon = rewrote ? '✎' : '·';
        const warn = findings.length > 0 ? ` ⚠${findings.length}` : '';
        ctx.ui.setStatus('oxc-auto', `${icon} ${tools}${warn}`);
        setTimeout(() => ctx.ui.setStatus('oxc-auto', undefined), 6000);
      }

      if (notes.length > 0) {
        return {
          content: [
            ...event.content,
            { type: 'text', text: notes.join('\n\n') },
          ],
        };
      }
      return undefined; // consistent-return: no findings → keep original result
    });
  });

  // Draw [oxc-auto] notes directly under the built-in edit/write blocks.
  const cwd = process.cwd();
  pi.registerTool(withNotesRenderer(createEditToolDefinition(cwd)));
  pi.registerTool(withNotesRenderer(createWriteToolDefinition(cwd)));
}
