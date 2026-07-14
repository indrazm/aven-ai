# Architecture

Aven AI is organized as product modules backed by small infrastructure libraries. `src/index.ts` is the only process entrypoint, and each module exposes an intentional public surface through its own `index.ts`.

## Packages

| Package                | Responsibility                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `utils`                | Small dependency-free helpers shared across packages                                         |
| `libs`                 | Configuration, Lexa, provider, PTY, SQLite session storage, and terminal adapters            |
| `modules/providers`    | Provider catalog, connection lifecycle, and model selection                                  |
| `modules/sessions`     | Project-session identity, titles, persistence coordination, and memory selection             |
| `modules/conversation` | Conversation message contracts, transcript rendering, wrapping, and selection                |
| `modules/agent`        | Runtime contracts, system prompts, tools, Anvia event adaptation, and the production runtime |
| `modules/commands`     | Canonical slash-command definitions                                                          |
| `modules/composer`     | Editor behavior, input intent, suggestions, and the composer view                            |
| `modules/overlays`     | Overlay routes, models, selection policy, and view                                           |
| `modules/app`          | Zustand state, runtime hooks, input priority, application composition, and CLI lifecycle     |

Dependencies point toward infrastructure and focused domain modules. `app` composes the product modules; the root entrypoint invokes only the public app API. Cross-package imports must target the package's `index.ts`. Package internals use direct relative imports.

The architecture test enforces the dependency matrix, public-index imports, and an acyclic source graph.

## Agent runtime

`modules/agent/core.ts` contains `AnviaAgentRuntime`, the facade consumed by the application. It coordinates providers, project sessions, direct commands, prompt turns, memory, file tools, and event translation while the UI depends only on runtime contracts from `modules/agent`.

The system prompt is assembled by `modules/agent/prompts/system.ts` from explicit identity, file-tool, command, and version-matched Lexa instruction sections. Dynamic values are XML-escaped, packaged Lexa guidance is CDATA-safe, and project instructions follow it so their scope remains clear.

## State and effects

The scoped Zustand store owns session, composer, overlay, queue, and lifecycle state. Rendering measurements, transcript selection, mouse subscriptions, and component refs remain local to the relevant UI modules.

Keyboard and overlay decisions are pure intent functions. React hooks establish input priority and execute effects without embedding the full decision tables in components.

## Boundary rules

- Add behavior to the module that owns the user-facing concept; do not create generic shared folders for single-owner code.
- Put concrete process, SDK, persistence, and terminal adapters in `libs`.
- Put only small dependency-free helpers in `utils`.
- Import another module or library through its public `index.ts`; never reach into its internal folders.
- Keep unit tests beside the implementation they protect and integration tests under `test/integration`.
- Do not add compatibility re-exports for obsolete internal paths.
