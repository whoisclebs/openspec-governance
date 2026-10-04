<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]



<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h3 align="center">openspec-governance</h3>

  <p align="center">
    OpenSpec lifecycle governance for Claude Code: a stage band, a fail-closed edit gate, task progress and an append-only execution log.
    <br />
    <a href="#usage"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/whoisclebs/openspec-governance/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/whoisclebs/openspec-governance/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li>
      <a href="#usage">Usage</a>
      <ul>
        <li><a href="#the-stage-band">The stage band</a></li>
        <li><a href="#the-fail-closed-gate">The fail-closed gate</a></li>
        <li><a href="#the-execution-log">The execution log</a></li>
        <li><a href="#the-detail-pane">The detail pane</a></li>
        <li><a href="#configuration">Configuration</a></li>
        <li><a href="#limitations">Limitations</a></li>
      </ul>
    </li>
    <li><a href="#development">Development</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

Spec-driven workflows tend to rely on the model remembering the rules: do not implement without a plan, do not ship with a CRITICAL finding open, keep a record of what happened. `openspec-governance` moves those rules out of prose and into hooks, so they hold whichever model is driving the session.

It is a Claude Code **mod**: a plugin of function hooks that loads into a running session. It reads the physical artifacts of the active [OpenSpec](https://github.com/Fission-AI/OpenSpec) change under `openspec/changes/<name>/` and gives you four things:

* **Stage band.** A row above the prompt with the change name, its stage (`discovery` to `done`), what is still missing, and whether the gate is open.
* **Fail-closed gate.** `Write`, `Edit` and `NotebookEdit` outside `openspec/` are denied while the change has no `tasks.md`, no acceptance criteria, or an open CRITICAL finding.
* **Task progress.** An `x/total` bar read from the checkboxes of `tasks.md`.
* **Execution log.** An append-only `execution-log.md` filled by a hook after each edit, with stage changes, findings, verifications and gate decisions.
* **Live detail pane.** The `/openspec` command (or the band's `Details` button) opens a pane with a filter box, every active change of the project, and for the changes in view the stage checklist, gate reasons, every task, the specs with their requirements, the findings and the recent log rows. It re-reads the artifacts every few seconds while it is open.

Nothing here touches projects that do not use OpenSpec: a file is only governed when a folder above it contains `openspec/changes`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

* [![TypeScript][TypeScript]][TypeScript-url]
* [Claude Code function hooks][claude-code-url] (early access API)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

The mod is a folder with a `.claude-plugin/plugin.json` manifest and a hooks module. There is nothing to build.

### Prerequisites

* Claude Code with function-hook plugins (the build this was written against is 2.1.289)
* A project that uses [OpenSpec](https://github.com/Fission-AI/OpenSpec), that is, one with an `openspec/changes/` folder

### Installation

Install it like any other Claude Code plugin, from inside Claude Code:

1. Add the marketplace
   ```
   /plugin marketplace add whoisclebs/openspec-governance
   ```
2. Install the plugin
   ```
   /plugin install openspec-governance@openspec-governance
   ```

The same two steps work from a shell as `claude plugin marketplace add whoisclebs/openspec-governance` and `claude plugin install openspec-governance@openspec-governance`. Both options have defaults, so there is nothing to configure; see [Configuration](#configuration) to change them. Run `/reload-plugins` if the session was already open.

To try a local checkout instead, point Claude Code at the folder:

```sh
git clone https://github.com/whoisclebs/openspec-governance.git
claude --plugin-dir ./openspec-governance
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

Open a session inside a project that has `openspec/changes/<name>/`. The mod picks the change from, in order: the path being edited, the only active change, the one you last read or edited, then the most recently touched one. Archived changes are ignored.

### The stage band

```text
OpenSpec add-search · specified · ░░░░░░░░░░ 0/0 · gate closed (1) · next: tasks.md (stable task IDs)
```

The stage is derived from files, never from conversation. Each stage needs every artifact before it:

| Stage | Evidence |
| --- | --- |
| `discovery` | `scout-notes.md`, or a file starting with `investigat` |
| `proposed` | `proposal.md` with `Why` and `What Changes` headings |
| `designed` | `design.md` with `Context`, `Decisions` and `Migration Plan` headings |
| `specified` | one or more `.md` files under `specs/` |
| `planned` | `tasks.md` where every task has a stable ID such as `1.1` |
| `ready-to-implement` | all of the above and no open CRITICAL finding |
| `implemented` | every task checkbox is `[x]` |
| `verified` | implemented, a `verif*` file in the change or in `findings/`, no open CRITICAL |
| `done` | the change sits under `openspec/changes/archive/` |

### The fail-closed gate

An edit outside `openspec/` is denied, with the reasons, while any of these holds for the active change:

| Check | Fails when |
| --- | --- |
| Plan | `tasks.md` is missing, empty, or has tasks without a stable ID |
| Acceptance criteria | no `#### Scenario:` heading exists under the change's `specs/` |
| Findings | a finding under `findings/` has `severity: CRITICAL` and is not resolved |

Edits inside `openspec/` are always allowed, so the artifacts that open the gate can be written. A finding counts as resolved when its `status` says `resolved`, `closed`, `fixed`, `done`, `mitigated`, `accepted`, `invalid`, `duplicate` or `wontfix`. A CRITICAL finding with no `status` counts as open.

### The execution log

After a successful edit the mod appends a row to `openspec/changes/<name>/execution-log.md`:

```markdown
| Time (UTC) | Kind | Detail |
| --- | --- | --- |
| 2026-10-03T12:00:00.000Z | gate-denied | Write `src/search.go`: tasks.md is missing or has no tasks |
| 2026-10-03T12:04:10.000Z | stage-check | `specified` → `ready-to-implement` |
| 2026-10-03T12:05:31.000Z | implementation | Edit `src/search.go` (tasks 1/2, stage ready-to-implement) |
```

Kinds are `stage-check`, `implementation`, `gate-denied`, `gate-warned`, `finding` and `verification`. The log is append-only: `Write`, `Edit` and `NotebookEdit` on `execution-log.md` are denied, and the mod serializes its own writes so parallel tool calls do not drop rows.

### The detail pane

Run `/openspec`, or press `Details` on the band, to open a pane. It takes the keys when it opens, so you can type in the filter box straight away; `Esc` returns to the prompt.

```text
[ filter changes, tasks, specs, findings           ]
[ Clear ] [ Refresh ]  live: re-reads every few seconds while open

Changes (2)
[ ▶ add-search ] planned ███░░░░░░░ 1/3 gate closed
[   other      ] proposed ░░░░░░░░░░ 0/1 gate closed   [ Show ]

━━ add-search  (focus)
Stage
✔ proposed   proposal.md with Why and What Changes
✔ designed   design.md with Context, Decisions, Migration Plan
✔ specified  one or more .md files under specs/
▶ planned    tasks.md with stable task IDs
○ ready-to-implement  everything above, no open CRITICAL finding
...

Gate
closed: edits outside openspec/ are denied
  • open CRITICAL finding(s): findings/sqli.md

Tasks ███░░░░░░░ 1/3
  [x] 1.1 Add the index in `search.go`
  [ ] 1.2 Add tests
  [ ] 1.3 Document the flag

Specs 1 file(s) · 2 requirement(s) · 3 scenario(s)
  search  search/spec.md
    + Search by name  2 scenario(s)
    ~ Ranking         1 scenario(s)

Findings
  CRITICAL  open        sqli.md

Recent activity
  12:04:10 stage-check    `planned` → `ready-to-implement`
```

* **Filter box.** Words are matched in any order, ignoring case, against change names, tasks (ID and text), specs (capability, file and requirement names), findings and log rows. While a filter is set the stage and gate checklists are hidden, each change list row shows how many items match, and the task header reads `showing 2 of 14`.
* **Changes.** Every active change of the project is listed with its stage, progress and gate. The band shows `(+N)` when there are others.
* **Focus.** The change you read or edit is focused automatically. Press its name in the list to focus another one by hand; the band follows.
* **Several at once.** `Show` adds a change's full detail below the focused one, `Hide` removes it again, so you can compare changes until you drop one.
* **Tasks.** All of them, with no cap; the pane scrolls.
* **Specs.** Each spec file with its requirements, marked `+` added, `~` modified, `-` removed, `→` renamed or `•` for a plain spec, and the number of scenarios each one has. A requirement with no scenario is drawn in red, since the gate counts scenarios as acceptance criteria.
* **Live.** While the pane is open it re-reads the artifacts every 3 seconds, and it also refreshes after each governed edit and when a turn completes. `Refresh` forces it.

### Configuration

Set these under the plugin's options (the `/config` menu, or `pluginConfigs` in settings).

| Option | Values | Default | Effect |
| --- | --- | --- | --- |
| `gate` | `enforce`, `warn`, `off` | `enforce` | `warn` shows a toast and logs `gate-warned` instead of denying; `off` disables the gate |
| `strict` | `true`, `false` | `false` | also deny edits outside `openspec/` in an OpenSpec project that has no active change |

### Limitations

* The gate hooks `Write`, `Edit` and `NotebookEdit`. A file changed through `Bash` (`sed -i`, redirection) is not gated and not logged; the band catches up when the turn ends.
* Findings are read as free-form Markdown: `severity:` and `status:` lines, in front matter, bold or bulleted.
* The gate does not check that tasks name files or modules, nor that a migration strategy exists.
* Paths are POSIX; Windows paths are not handled.
* The function-hooks API is early access and moves between Claude Code releases.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- DEVELOPMENT -->
## Development

```sh
claude plugin validate .   # reads the manifest and the hooks module the way the engine will
claude plugin test .       # runs tests/*.test.ts against the engine
```

The logic lives in pure functions under `hooks/lib/`, which the tests cover with an in-memory file system; `hooks/register.tsx` is the only file that talks to `$`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [x] Stage band
- [x] Fail-closed gate for `Write`, `Edit` and `NotebookEdit`
- [x] Task progress bar
- [x] Append-only execution log
- [ ] Require a migration strategy when the design says migrations are needed
- [ ] Check that tasks name scoped files or modules
- [x] Live detail pane: filter box, changes, focus, every task, specs, findings and recent activity
- [x] Install through a plugin marketplace

See the [open issues](https://github.com/whoisclebs/openspec-governance/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feat/amazing-feature`)
3. Commit your Changes using [Conventional Commits](https://www.conventionalcommits.org/) (`git commit -m 'feat: add some amazing feature'`)
4. Push to the Branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

whoisclebs - [@whoisclebs](https://github.com/whoisclebs)

Project Link: [https://github.com/whoisclebs/openspec-governance](https://github.com/whoisclebs/openspec-governance)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [Best-README-Template](https://github.com/othneildrew/Best-README-Template)
* [OpenSpec](https://github.com/Fission-AI/OpenSpec)
* [Conventional Commits](https://www.conventionalcommits.org/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contributors-shield]: https://img.shields.io/github/contributors/whoisclebs/openspec-governance.svg?style=for-the-badge
[contributors-url]: https://github.com/whoisclebs/openspec-governance/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/whoisclebs/openspec-governance.svg?style=for-the-badge
[forks-url]: https://github.com/whoisclebs/openspec-governance/network/members
[stars-shield]: https://img.shields.io/github/stars/whoisclebs/openspec-governance.svg?style=for-the-badge
[stars-url]: https://github.com/whoisclebs/openspec-governance/stargazers
[issues-shield]: https://img.shields.io/github/issues/whoisclebs/openspec-governance.svg?style=for-the-badge
[issues-url]: https://github.com/whoisclebs/openspec-governance/issues
[license-shield]: https://img.shields.io/github/license/whoisclebs/openspec-governance.svg?style=for-the-badge
[license-url]: https://github.com/whoisclebs/openspec-governance/blob/main/LICENSE
[TypeScript]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[claude-code-url]: https://code.claude.com/docs
