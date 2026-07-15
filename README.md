# Aven AI

A terminal-native AI coding agent built with TypeScript, React, Ink, and [Anvia](https://anvia.dev).

Aven lets you chat with AI models, inspect tool calls, edit files, run commands, and resume project sessions without leaving the terminal.

## Install

Requires Node.js 22 or newer and a supported platform: macOS on Apple Silicon or Intel, or Linux x64 with glibc 2.39 or newer.

```sh
npm install --global aven-ai
aven
```

The install includes the matching [Lexa](https://github.com/anvia-hq/lexa) native code-intelligence binary. Aven verifies that required binary before opening the terminal interface.

On first launch, run `/connect` to choose a provider and add its API key.

## Features

- Full-screen terminal interface with Markdown rendering
- Fuzzy `@` mentions for project files and folders
- File reading, editing, and writing with inline diffs
- PTY-backed shell command execution
- Project-scoped sessions and searchable history
- Mouse scrolling with drag, word, and line selections that copy automatically
- Multiple model providers, including OpenAI, Anthropic, OpenRouter, DeepSeek, GitHub Models, and more

## Usage

Type a prompt and press `Enter`. While Aven is responding, press `Enter` to steer the active turn or `Tab` to queue the prompt for the next turn. Prefix a command with `!` to run it directly in the project shell:

```text
!git status
```

Type `@` anywhere at a token boundary to find a non-ignored project file or folder. Use the arrow keys to choose a result, then press `Tab` or `Enter` to insert it:

```text
Review @src/modules/app/ and @"docs/release notes.md"
```

Mentions are project-relative references. Aven tells the agent which paths you selected, and the agent reads only what it needs with the existing file and search tools.

Common slash commands:

| Command        | Action                               |
| -------------- | ------------------------------------ |
| `/connect`     | Connect or configure a provider      |
| `/model`       | Change the active model              |
| `/new`         | Start a new session                  |
| `/resume`      | Find and resume a previous session   |
| `/resume-last` | Resume the most recent session       |
| `/help`        | Show controls and keyboard shortcuts |

Useful controls:

| Input                       | Action                               |
| --------------------------- | ------------------------------------ |
| `Enter`                     | Submit; steer while a turn is active |
| `Tab` during an active turn | Queue the prompt for the next turn   |
| `Shift+Enter` / `Alt+Enter` | Insert a newline                     |
| `@`, then `Tab` / `Enter`   | Mention a project path while idle    |
| `Page Up` / `Page Down`     | Scroll the transcript                |
| `Esc`                       | Close or cancel                      |
| `Ctrl+C`                    | Interrupt active work                |

## Local data

Aven stores configuration and project-scoped session data under:

```text
${XDG_CONFIG_HOME:-~/.config}/aven-ai
```

Provider credentials are stored locally in `config.toml` with owner-only permissions. Add credentials through `/connect`; if a saved credential fails, `/connect` prompts for a replacement.

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
