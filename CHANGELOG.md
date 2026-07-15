# aven-ai

## 0.1.0

### Minor Changes

- af486e0: Add fuzzy `@` mentions for non-ignored project files and folders, with structured path references for agent prompts. Consolidate provider setup into `/connect`, remove the redundant `/commands` command, prevent agents from rediscovering automatically loaded project instructions, keep agent communication pragmatic and concise by default, and add vertical spacing around command execution rows.

### Patch Changes

- e47bda7: Document Lexa reverse-dependency syntax, make all tools consistently project-root-aware, execute up to eight tool calls concurrently, render command activity without surrounding gaps, hide command output until transcript expansion, truncate tool previews to one line, automatically copy completed transcript selections, and keep unrelated command failures from sharing the same recovery streak while retaining a global circuit breaker.

## 0.0.3

### Patch Changes

- 978f180: Improve the terminal status layout and transcript navigation, including the working path, compact activity spinner, persistent provider/model label, and direct Page Up/Page Down scrolling.

  Strengthen agent runs with hierarchical `AGENTS.md` guidance, a 50-turn budget, and recovery from repeated or failed tool calls.

  Install and verify Lexa 0.10.0 with Aven on supported macOS and Linux systems, expose the managed binary to agent commands, and include its version-matched skill in the system prompt.

  Remove the `/history` command and its dedicated shortcuts while retaining Up/Down prompt recall in the composer.

## 0.0.2

### Patch Changes

- 9b90852: Add automated Changesets versioning, pull request checks, and manually dispatched npm releases.
