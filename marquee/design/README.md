# Marquee design reference — workflow

Purpose: turn a pile of Figma screenshots into a small, cheap-to-read text
file, so future menu work reads a doc instead of re-loading images. Images
are the expensive part of context; text extracted from them once is not.

## How it works

1. Export menu frames from Figma as PNG/JPG and drop them in
   `screenshots/` (gitignored — raw images stay local, never committed).
2. Say "process these" (or similar). A subagent reads only the
   **new** files in `screenshots/` — not the ones already folded into
   `reference.md` — and appends distilled notes: palette, type, layout
   patterns, component conventions. One-time image-token cost per batch,
   isolated to that agent run instead of the main conversation.
3. Day-to-day menu work (in Marquee, and later FeedBack itself) reads
   `reference.md` only. It's plain text — orders of magnitude cheaper
   than re-reading screenshots, and grep-able.
4. Once a design idea from `reference.md` actually gets built, the
   real source of truth becomes the code, same as everywhere else in this
   repo — `reference.md` stays a proposal/reference layer, not living
   documentation of what shipped.

## Scope

Marquee-local for now (`marquee/design/`). If/when menu work expands to
FeedBack itself, this graduates to a repo-root `design/` folder that can
hold a section per surface — a folder move, not a rebuild, since
`reference.md`'s content isn't Marquee-specific in structure, only in
content.

## When this earns its own subagent

Right now, ingestion runs as an ad hoc Agent call. If this workflow keeps
recurring across many future menus, it's worth promoting to a proper
subagent (like `feedback-plugin-expert`) that owns reading/updating
`reference.md` directly — flagged here so it isn't forgotten, not done
preemptively for ~20 screenshots.
