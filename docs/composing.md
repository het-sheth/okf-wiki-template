# Composing this template with a rulebook and a second brain

This template is one of three layers. They are distinguished by audience, not by tooling, and
mixing them is what makes each one worse at its job.

| Repository | Is | Audience | Load pattern |
|---|---|---|---|
| `example-agent-rules` | the behavior layer | any machine, any agent | every session, so it stays short |
| `okf-wiki-template` | a domain-neutral knowledge-base engine | anyone building a wiki about a subject | on demand, per subject |
| `example-second-brain` | one person's context layer | a single human, with a journal and a capture workflow | on demand, at task start |

## Where a thing goes

- **A standing instruction** ("never push to main", "run the linter after every change") goes in the
  rulebook. It applies on every task regardless of subject, so it must be short enough to load every
  session.
- **A personal daily note** (what happened today, who asked for what, a half-formed idea) goes in the
  second brain's journal. It is dated, private, and only sometimes worth keeping.
- **Durable knowledge about a subject** (how a protocol works, what a pattern is for, a worked
  example) goes in a wiki built from this template. It is atomic, cited, and outlives the day it was
  written.

The failure mode in both directions is the same. Durable subject knowledge buried in a dated journal
note is unfindable; a day's scratch notes promoted into a concept page make the wiki untrustworthy.
The journal is an inbox, not a destination.

## Wiring a clone into a rulebook

Add one line to the `Paths` section of the machine file that the rulebook assembles:

```markdown
- ~/wiki/<subject> — OKF wiki about <subject>. Navigate by reading its `AGENTS.md` and
  `topics.json` first, then the relevant `wiki/<topic>/<slug>.md`. Never grep the tree.
```

One line, because the rulebook is loaded every session and every line competes with the rest of it.
The pointer is advisory by design: it names where the knowledge is and how to enter it, and the wiki's
own `AGENTS.md` carries the rules that must apply before the first page is written.

Navigation matters more than it looks. A wiki is a graph with an index, so reading `AGENTS.md` then
`topics.json` then one concept page costs three files. Grepping the tree costs the whole tree and
still misses the cross-links.

## What this template deliberately does not ship

No journal directory, no daily-note template, no weekly review, no capture ritual. Those are the
second brain's product, not this one's, and a template that grew them would force one person's
workflow on every clone.

`wiki/journal/` and `wiki/_templates/` are *reserved* here: the profile will not reject them, and the
generator will not publish them, so a clone that wants a capture inbox can add one without forking
the engine. Reserving a name is not the same as shipping the workflow behind it.
