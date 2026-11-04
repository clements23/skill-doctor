#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const MAX_DESCRIPTION = 1024;
const MIN_DESCRIPTION = 20;
const WARN_LINES = 400;
const WARN_TOKENS = 6000;
const MAX_LINK_DEPTH = 4;

function usage() {
  console.log(`
skill-doctor [paths...]

Audit SKILL.md files for the issues that break AI agent skills.

Checks:
  error  missing YAML frontmatter, missing name or description, empty body
  warn   bad name format, name mismatch with folder, short or long description,
         oversized skill files, placeholder text, broken relative links,
         duplicate skill names

Options:
  --strict     treat warnings as errors (exit code 1)
  -h, --help   show this help

Examples:
  skill-doctor ./skills
  skill-doctor . --strict
  skill-doctor path/to/SKILL.md
`);
}

function parseArgs(argv) {
  const paths = [];
  let strict = false;
  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') { usage(); process.exit(0); }
    else if (arg === '--strict') strict = true;
    else if (arg.startsWith('-')) { console.error(`Unknown option: ${arg}`); process.exit(1); }
    else paths.push(arg);
  }
  return { paths: paths.length > 0 ? paths : ['.'], strict };
}

function isSkillFile(file) {
  return /skill\.md$/i.test(file);
}

function collectSkillFiles(target, found = [], depth = 0) {
  const abs = resolve(target);
  if (!existsSync(abs)) return found;
  if (statSync(abs).isFile()) {
    if (isSkillFile(abs)) found.push(abs);
    return found;
  }
  if (depth > MAX_LINK_DEPTH) return found;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    collectSkillFiles(join(abs, entry.name), found, depth + 1);
  }
  return found;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: null, body: content };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) data[pair[1].toLowerCase()] = pair[2].replace(/^["']|["']$/g, '').trim();
  }
  return { data, body: content.slice(match[0].length) };
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function auditFile(file, root) {
  const issues = [];
  const content = readFileSync(file, 'utf8');
  const rel = relative(root, file) || file;
  const { data, body } = parseFrontmatter(content);

  if (!data) {
    issues.push({ level: 'error', file: rel, message: 'missing YAML frontmatter (--- block with name and description)' });
    return { issues, name: null };
  }

  const name = data.name || null;
  if (!name) issues.push({ level: 'error', file: rel, message: 'frontmatter is missing "name"' });
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) issues.push({ level: 'warn', file: rel, message: `name "${name}" should be lowercase kebab-case` });

  const dirName = dirname(file).split('/').pop();
  if (name && dirName !== 'skills' && dirName !== '.' && name !== dirName) {
    issues.push({ level: 'warn', file: rel, message: `name "${name}" does not match folder "${dirName}"` });
  }

  const description = data.description || '';
  if (!description) issues.push({ level: 'error', file: rel, message: 'frontmatter is missing "description"' });
  else {
    if (description.length < MIN_DESCRIPTION) issues.push({ level: 'warn', file: rel, message: `description is only ${description.length} chars, agents need context to load the skill` });
    if (description.length > MAX_DESCRIPTION) issues.push({ level: 'warn', file: rel, message: `description is ${description.length} chars, max recommended is ${MAX_DESCRIPTION}` });
  }

  const trimmedBody = body.trim();
  if (!trimmedBody) issues.push({ level: 'error', file: rel, message: 'skill body is empty' });

  const lines = content.split(/\r?\n/).length;
  if (lines > WARN_LINES) issues.push({ level: 'warn', file: rel, message: `${lines} lines, over the ${WARN_LINES} line budget` });

  const tokens = estimateTokens(content);
  if (tokens > WARN_TOKENS) issues.push({ level: 'warn', file: rel, message: `~${tokens} tokens, over the ${WARN_TOKENS} token budget` });

  if (/\b(TODO|FIXME|TBD|PLACEHOLDER)\b/.test(content)) issues.push({ level: 'warn', file: rel, message: 'contains placeholder text (TODO/FIXME/TBD)' });

  const linkPattern = /\]\((?!https?:|#|mailto:)([^)]+)\)/g;
  let linkMatch;
  while ((linkMatch = linkPattern.exec(content)) !== null) {
    const target = linkMatch[1].split('#')[0].trim();
    if (!target) continue;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) issues.push({ level: 'warn', file: rel, message: `broken relative link: ${target}` });
  }

  return { issues, name };
}

function main() {
  const { paths, strict } = parseArgs(process.argv.slice(2));
  const files = [];
  for (const p of paths) collectSkillFiles(p, files);

  if (files.length === 0) {
    console.error('No SKILL.md files found.');
    process.exit(1);
  }

  const root = resolve(process.cwd());
  const allIssues = [];
  const names = new Map();

  for (const file of files.sort()) {
    const { issues, name } = auditFile(file, root);
    allIssues.push(...issues);
    if (name) {
      if (names.has(name)) allIssues.push({ level: 'warn', file: relative(root, file), message: `duplicate skill name "${name}" also used in ${names.get(name)}` });
      else names.set(name, relative(root, file));
    }
  }

  const errors = allIssues.filter((i) => i.level === 'error');
  const warnings = allIssues.filter((i) => i.level === 'warn');

  for (const issue of errors) console.error(`error  ${issue.file}: ${issue.message}`);
  for (const issue of warnings) console.warn(`warn   ${issue.file}: ${issue.message}`);

  console.log(`\n${files.length} skill file(s) checked, ${errors.length} error(s), ${warnings.length} warning(s).`);

  if (errors.length > 0 || (strict && warnings.length > 0)) process.exit(1);
}

main();
