---
created: 2026-03-22T05:02:48.995Z
title: Run GSD commands via claude CLI as unix commands
area: tooling
files:
  - .claude/commands/gsd/add-todo.md
---

## Problem

Currently GSD slash commands (like `/gsd:add-todo`) can only be invoked interactively inside a Claude Code session. There's no way to run them as one-shot unix commands from a shell script, cron job, or pipeline — e.g. `claude -p @.claude/commands/gsd/add-todo.md "some task"`.

Being able to invoke `claude -p` (or `claude` with piped input) referencing a command file would enable:
- Scripting GSD workflows from shell
- Integrating GSD commands into git hooks or CI
- Running commands non-interactively (headless)

## Solution

Investigate how `claude -p` handles `@file` references and slash command expansion. Options:
- Wrapper script that reads the command .md, constructs the right `claude -p` invocation with the prompt content
- A thin CLI shim (e.g. `gsd <command> [args]`) that maps to `claude -p` calls
- Document the exact `claude -p` incantation that works today, if any
