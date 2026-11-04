# skill-doctor: Lint and Audit SKILL.md Files for AI Agent Skills

[![GitHub stars](https://img.shields.io/github/stars/clements23/skill-doctor?style=flat&label=stars)](https://github.com/clements23/skill-doctor/stargazers)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

`skill-doctor` is a zero-dependency linter for `SKILL.md` files, the packaging format used by Claude Code, Codex, Cursor and other AI agents. It catches the mistakes that keep a skill from loading, being selected by the agent, or behaving once loaded.

Broken skills fail silently: the agent either ignores the file or half-follows it. `skill-doctor` turns that into a clear pass or fail before you publish.

## Install

Requires Node.js 18 or newer. No npm publish needed, it installs straight from GitHub:

```bash
npm install -g github:clements23/skill-doctor
```

Or run ad hoc: `npx -y github:clements23/skill-doctor ./skills`

## Usage

```bash
# Audit every SKILL.md under a directory
skill-doctor ./skills

# Audit the current repository
skill-doctor .

# Audit a single skill
skill-doctor ./skills/seo-audit/SKILL.md

# Fail CI on warnings too
skill-doctor . --strict
```

## What it checks

**Errors (always fail the build):**

- Missing YAML frontmatter `---` block
- Missing `name` field
- Missing `description` field
- Empty skill body

**Warnings:**

- `name` not in lowercase kebab-case
- `name` does not match the containing folder
- `description` shorter than 20 chars or longer than the recommended 1024 char limit
- Skill over 400 lines or roughly 6000 tokens (skills load into context, so bloat costs money and attention on every session)
- Placeholder text left behind (`TODO`, `FIXME`, `TBD`)
- Relative markdown links pointing at files that do not exist
- Duplicate `name` values across skills in the same run

## CI example

```yaml
- name: Lint skills
  run: npx -y github:clements23/skill-doctor ./skills --strict
```

Exit code is `1` when errors are found (or when `--strict` and any warning is found), so it drops straight into any pipeline.

## Related projects

- [skills-install](https://github.com/clements23/skills-install): install the skills you just audited into Claude Code, Codex, Cursor or Gemini.
- [agent-guardrail-skill](https://github.com/clements23/agent-guardrail-skill): safety guardrails for coding agents.
- [claude-skills-leaderboard](https://github.com/clements23/claude-skills-leaderboard): live ranking of the most starred skill repos.
- [marketing-agency-skills](https://github.com/clements23/marketing-agency-skills): production-ready agency skills.

## License

MIT. See [LICENSE](LICENSE).
