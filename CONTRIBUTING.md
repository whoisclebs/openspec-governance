# Contributing

Thanks for helping. This is a small mod; the workflow is short.

## Setup

There is nothing to install. Load the folder in Claude Code with `claude --plugin-dir .`, which also lets the engine lay the API types under `.claude-plugin/types/` (git-ignored) for your editor.

## Before you open a pull request

```sh
claude plugin validate .
claude plugin test .
```

Both must pass. A behaviour change needs a test: pure logic goes in `tests/lib.test.ts`, anything that goes through the hooks in `tests/governance.test.ts`, which uses the in-memory file system in `tests/memory-fs.ts`.

## Code layout

* `hooks/lib/` holds pure functions with no `$`. Keep new logic here so it is testable without the engine.
* `hooks/register.tsx` is the only module that touches `$`. The validator requires `$` to be spelled `$.noun.method(...)` at every call site, so helpers that need the file system take the small `Fs` view that `fsOf($)` builds, not `$.fs` itself.
* `types/index.d.ts` is the contract for every value kept in `$.state`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, with an optional scope such as `feat(gate):`. Breaking changes get a `!` or a `BREAKING CHANGE:` footer. Keep the subject in the imperative and under about 72 characters.
