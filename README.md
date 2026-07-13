# Aven AI

A terminal-native AI coding agent built with TypeScript, React, Ink, and [Anvia](https://anvia.dev).

Aven lets you chat with AI models, inspect tool calls, edit files, run commands, and resume project sessions without leaving the terminal.

## Install

Requires Node.js 22 or newer.

```sh
npm install --global aven-ai
aven
```

On first launch, run `/setup` to choose a provider and add its API key.

## Features

- Full-screen terminal interface with Markdown rendering
- File reading, editing, and writing with inline diffs
- PTY-backed shell command execution
- Project-scoped sessions and searchable history
- Mouse scrolling, text selection, and clipboard support
- Multiple model providers, including OpenAI, Anthropic, OpenRouter, DeepSeek, GitHub Models, and more

## Usage

Type a prompt and press `Enter`. Prefix a command with `!` to run it directly in the project shell:

```text
!git status
```

Common slash commands:

| Command        | Action                               |
| -------------- | ------------------------------------ |
| `/setup`       | Configure provider credentials       |
| `/connect`     | Connect to a configured provider     |
| `/model`       | Change the active model              |
| `/new`         | Start a new session                  |
| `/resume`      | Find and resume a previous session   |
| `/resume-last` | Resume the most recent session       |
| `/history`     | Search prompt history                |
| `/commands`    | Browse all available commands        |
| `/help`        | Show controls and keyboard shortcuts |

Useful controls:

| Input                       | Action                       |
| --------------------------- | ---------------------------- |
| `Enter`                     | Submit a prompt              |
| `Shift+Enter` / `Alt+Enter` | Insert a newline             |
| `Ctrl+O`                    | Toggle transcript navigation |
| `Page Up` / `Page Down`     | Scroll the transcript        |
| `Ctrl+R`                    | Open prompt history          |
| `Esc`                       | Close or cancel              |
| `Ctrl+C`                    | Interrupt active work        |

## Local data

Aven stores configuration and project-scoped session data under:

```text
${XDG_CONFIG_HOME:-~/.config}/aven-ai
```

Provider credentials are stored locally in `config.toml` with owner-only permissions. Add or replace credentials through `/setup`.

Commands run with the same permissions as the Aven process and are not sandboxed. Review commands and file changes before accepting them.

## Development

```sh
pnpm install
pnpm dev
```

Useful commands:

```sh
pnpm test        # Run tests
pnpm typecheck   # Check TypeScript
pnpm lint        # Run ESLint
pnpm build       # Build the CLI
pnpm check       # Run the complete quality gate
```

Install a development build as the `aven` command:

```sh
pnpm install:local
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [CONTRIBUTING.md](./CONTRIBUTING.md) for project details.
