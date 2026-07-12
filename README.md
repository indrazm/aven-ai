# Aven AI

A terminal-native coding agent built with TypeScript, React, Ink, and [Anvia](https://anvia.dev).

Aven AI keeps the entire coding workflow in your terminal: chat with an AI model, inspect streamed tool calls, edit files, run commands, search conversation history, and resume project-specific sessions without leaving the keyboard.

## Highlights

- Full-screen, responsive terminal interface with Markdown and fenced code-block rendering
- OpenAI and Anthropic provider support with in-app setup and model selection
- Built-in `Read`, `Edit`, and `Write` tools with stale-read protection and inline diffs
- Real PTY command execution for agent tools and direct shell commands
- Project-scoped sessions and local conversation memory backed by SQLite
- Searchable prompts, transcripts, commands, sessions, and model lists
- Mouse scrolling and text selection with OSC 52 clipboard support

## Requirements

- Node.js 22 or newer
- pnpm 11 or newer
- An interactive terminal with ANSI and Unicode support

## Quick start

```sh
pnpm install
pnpm dev
```

Once Aven AI opens, run `/setup` to choose a provider and add an API key. The key is verified before it is saved.

If `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is already set in your environment, run `/connect` instead and select the configured provider.

## Local installation

Build the CLI and add an `aven-ai` symlink to `~/.local/bin`:

```sh
pnpm install:local
aven-ai
```

Set `AVEN_BIN_DIR` to install the symlink elsewhere. Reinstalling refreshes stale build links from the same checkout, but the installer will not overwrite regular files or symlinks owned by another project.

To remove the local symlink:

```sh
pnpm uninstall:local
```

## Using Aven AI

Type a prompt and press `Enter` to start a turn. Responses and tool activity stream into the transcript as they happen.

Prefix an input with `!` to run it directly in the project shell:

```text
!git status
```

Slash commands open searchable overlays or perform session actions:

| Command        | Description                            |
| -------------- | -------------------------------------- |
| `/setup`       | Add or replace a provider API key      |
| `/connect`     | Connect a configured provider          |
| `/model`       | View or change the active model        |
| `/new`         | Start a new project session            |
| `/resume`      | Search and resume project sessions     |
| `/resume-last` | Resume the most recent project session |
| `/history`     | Search local prompt history            |
| `/search`      | Search the visible transcript          |
| `/commands`    | Browse available commands              |
| `/help`        | Show keyboard and interaction help     |
| `/theme`       | Preview the current terminal theme     |

### Keyboard and mouse controls

| Input                       | Action                                                 |
| --------------------------- | ------------------------------------------------------ |
| `Enter`                     | Submit a prompt                                        |
| `Shift+Enter` / `Alt+Enter` | Insert a newline                                       |
| `\` then `Enter`            | Insert a newline in terminals without modifier support |
| `Ctrl+O`                    | Toggle transcript navigation and tool output           |
| `Page Up` / `Page Down`     | Scroll the transcript                                  |
| `Ctrl+Home` / `Ctrl+End`    | Jump to the start or end                               |
| `Ctrl+R`                    | Open prompt history                                    |
| Mouse wheel                 | Scroll the transcript                                  |
| Mouse drag                  | Select transcript text                                 |
| Double-click / triple-click | Select a word or line                                  |
| `Ctrl+Shift+C`              | Copy selected text through OSC 52                      |
| `Esc`                       | Close or cancel the current UI context                 |
| `Ctrl+C`                    | Interrupt active work; press twice while idle to exit  |
| `Ctrl+D`                    | Delete forward; press twice on empty input to exit     |

Typing `?` or `!` into an empty composer opens help or direct command mode. Session changes are disabled while a turn is active or prompts are queued.

## Sessions and local data

Sessions are scoped to the directory where Aven AI starts. Each launch begins a fresh session; use `/resume-last` or `/resume` to continue earlier work for the same project.

Local data lives under `${XDG_CONFIG_HOME:-~/.config}/aven-ai`:

| File              | Contents                                     |
| ----------------- | -------------------------------------------- |
| `config.toml`     | Provider settings, model cache, and API keys |
| `memory.sqlite`   | Agent conversation memory                    |
| `sessions.sqlite` | Project and session metadata                 |

Configuration files are written with owner-only permissions. Existing `config.json` files are migrated automatically. Aven AI does not create session metadata inside your project.

## Tools and permissions

The agent can read and modify UTF-8 and UTF-16LE text files. A file must be read before it can be edited or overwritten, and Aven AI rejects the mutation if the file changed after that read. Successful changes appear as a before-and-after diff in the transcript.

Command execution is intentionally powerful: `exec_command` tool calls and direct `!` commands run with the same permissions as the Aven AI process. They are not sandboxed. Commands do not receive interactive input, time out after 120 seconds, and return up to 64 KiB of output.

## Architecture

The application is split into focused modules under `src/modules`, with process, persistence, SDK, and terminal adapters under `src/libs`:

```text
src/
  index.ts          CLI entrypoint
  libs/             config, SDK, PTY, storage, and terminal adapters
  modules/
    agent/          runtime, prompts, tools, and events
    app/            application composition and state
    commands/       slash-command registry
    composer/       editor and input behavior
    conversation/   transcript rendering and selection
    overlays/       searchable overlay models and views
    providers/      provider connections and model selection
    sessions/       project-session lifecycle
  utils/            dependency-free shared helpers
test/
  integration/      cross-feature integration tests
  support/          shared test fakes and helpers
```

The UI depends on a small `AgentRuntime` contract, which keeps alternate runtimes and deterministic tests isolated from the production Anvia implementation. Cross-module imports go through public `index.ts` files, and architecture tests enforce dependency direction and reject circular source dependencies.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module responsibilities and boundary rules.

## Development

Useful commands:

```sh
pnpm dev             # Run from source
pnpm test            # Run the test suite
pnpm test:watch      # Run tests in watch mode
pnpm format          # Format the repository
pnpm typecheck       # Check TypeScript
pnpm lint            # Run ESLint
pnpm build           # Build the production CLI
pnpm check           # Run the complete local quality gate
```

`pnpm check` runs formatting checks, type checking, linting, coverage tests, and a production build. The tracked pre-push hook runs the same gate after `pnpm install` configures it.

See [CONTRIBUTING.md](./CONTRIBUTING.md) before making structural changes or adding dependencies.
