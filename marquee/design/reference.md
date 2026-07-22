# Marquee design reference

Distilled from 28 Figma screenshot exports of FeedBack's host-app design
language ("Slopsmith" in the mocks is FeedBack's own pre-rename name, not a
different product — the mocks predate the June 2026 rename). This is a
separate visual identity from Marquee's own theatrical skin — do not merge.

## Palette

- Base background: near-black warm charcoal (~#0d0d0d–#111111).
- Card/panel surface: dark charcoal, one step up from bg (~#1a1a1a–#202020), subtle border, radius ~8–12px.
- Text: white/off-white headings; muted mid-gray body text (~#9a9a9a); italic light-gray text used specifically inside form fields (placeholder-style, even for filled values).
- **Accent color is a user-selectable theme, not a fixed brand color** — confirmed by the Theme Settings screen (dropdown reading "Acid Green" + a "+" to add more themes, with a live preview pane). Screens in this set sample at least:
  - Red/coral (~#EF4444–#F2545B) — appears to be the default; used on most Settings/Songs/Plugins/Onboarding screens.
  - Acid/lime green (~#CCFF00) — matches the "Acid Green" theme name.
  - Blue/teal (~#1E88E5-ish).
  - A fourth variant tints the **entire page background** olive-green rather than just recoloring the accent — structurally different from the other three (see Open Questions).
- Semantic status colors (consistent across themes, independent of the accent-theme system): lime-green = "Active" / "Up to Date" (positive); red = "Inactive" / "Outdated" (negative). Used as small dots + pill badges on plugin cards/rows.
- Practice-time chart and slider fills reuse the current theme's accent color as a gradient-to-transparent fill.

## Type

- Clean geometric/humanist sans throughout (exact family not verifiable from pixels — reads similar to Inter/Poppins-class default UI sans).
- Headline/display: bold, ~24–32px (e.g. "Welcome back, Metsamies!", modal onboarding titles). Onboarding titles mix bold white + bold accent-colored spans within one heading (e.g. "Practice Your Favorite **Songs**.").
- Body/label: regular weight, ~13–15px, muted gray.
- Section headers (e.g. "Audio Chain:", "My Instruments:"): bold white, ~16–18px.
- Form field values/placeholders are consistently **italicized** in light gray — a deliberate convention, not just placeholder styling (applies even to filled dropdown values like "ASIO", "48000 Hz").
- Plugin/pedal card product names ("NEURAL AMP MODELER") are uppercase + letterspaced, evoking a hardware faceplate label — the one deliberate typographic outlier from the rest of the UI's sentence-case convention.
- Nav labels: regular weight; active item marked by accent-colored underline/highlight, not bold.

## Layout patterns

- **Nav chrome, two variants:**
  - "With sidebar": full left sidebar (~200–256px) with wordmark, expandable Home/Library groups, icon+label items — paired with a horizontal top tab bar (Home/Songs/Plugins/Settings) and right-aligned utility cluster (tuner widget, instrument icon, streak/XP badge, "Support us!" CTA).
  - "Without sidebar": the sidebar collapses to an icon-only rail (~64–88px, logo mark + icon stack, no labels) — used on deep Settings/detail pages to reclaim width. Paired with a horizontal sub-nav tab bar for that section's pages (Profile/Audio/Plugins/Video/Theme/Customize). Not literally navless — a collapsed rail, not its absence.
- **Settings rows:** label above or beside control; dropdowns are full-width bordered dark rectangles with a trailing chevron and italic value text. Checkboxes are plain outline squares (not toggle switches) paired with a text label — worth confirming before building real toggles, since square checkboxes read as an unusual choice for a modern settings page. Sliders: thin horizontal track, round handle, accent-color fill to the left of the handle, min/current/max labels in small gray text below.
- **Cards:** dark rounded rects, subtle border, art bleed on left/top, colored elements confined mostly to buttons/status pills. Album/setlist cards overlay title + CTA button on bottom of bled artwork.
- **Plugin cards:** styled as physical guitar-pedal/amp hardware — dark brushed-metal texture, uppercase letterspaced product name, illustrated control knobs, status shown via colored dot + pill badges (green "Active"/"Up to Date", red "Inactive"/"Outdated"). One example (Group 43) shows two pedal cards visually "patch-cabled" together — a playful hardware-rack metaphor.
- **Plugin manager page has 3 interchangeable view modes** (seen across the "Plugins - Milan" set): accordion/list rows with a colored left-edge status stripe; a card grid; and a freeform "deck" drag layout with labeled sections (Audio Deck/Utility Deck/Practice Deck/Plugins Hub) over a dot-grid pegboard background.
- **Onboarding, two distinct patterns:**
  1. "Introduction" — modal dialog overlay, 50/50 image+text split, step-dot progress + "N of 5" counter, accent-colored primary CTA, "Skip Tour" text link.
  2. "Oboarding" — contextual coachmark tooltips anchored to live UI elements with pointer callouts, accent-bordered cards, sequential numbered steps over a dimmed real homepage. Same content arc, entirely different execution — don't conflate the two mechanisms.
- **Homepage** is the most dashboard-dense screen: hero promo banner, side "Continue Playing" card, audio signal-chain mini-widget, stat tiles (Library/Plugins counts), horizontal-scroll "Recently Played" rail, setlist card grid, community/minigame promo cards, and a practice-time area chart with stat callouts. Songs/Plugins/Settings pages are comparatively sparse single-purpose layouts by contrast.
- **Profile Settings reuses one page shell across 5 instrument variants** (Bass/Drums/Guitar/Keys/Vocals): a shared top block (avatar, username, email, title dropdowns, language, left-handed checkbox, DLC path) followed by an instrument-specific detail pane that changes completely per instrument — string color picker (Bass/Guitar), visual drum-kit builder + highway lane editor (Drums), piano octave range + finger color picker with hand illustrations (Keys), vocal warm-up + microphone dropdowns (Vocals). Strong "shared shell, swappable detail pane" pattern worth reusing.

## Screen index

| Screenshot | Covers |
|---|---|
| Homepage w Sidebar.png | Homepage, full sidebar, red/default theme |
| Homepage w Sidebar-1.png | Same homepage, acid-green theme variant |
| Homepage w Sidebar-2.png | Same homepage, full olive-tinted background variant |
| Homepage w Sidebar - Extra Color Style.png | Same homepage, blue theme variant |
| Homepage without Sidebar.png | Homepage, collapsed rail, taller/extra content (2nd recently-played row) |
| Audio Settings without Sidebar.png | Settings > Audio: input/tone/output chain, noise gate, A/V sync sliders |
| Video Settings without Sidebar.png | Settings > Video: highway/camera/card display options |
| Theme Settings without Sidebar.png | Settings > Theme: theme picker dropdown + live preview pane |
| Plugin Settings without Sidebar.png | Settings > Plugins: full plugin list table, bulk actions, red status stripe |
| Plugin card.png | Single plugin card, active/up-to-date state |
| Plugin card-1.png | Single plugin card, no status pills (dimmed/inactive?) |
| plugin card nav.png | Isolated status-dot + "Active" label fragment |
| Plugins - Milan.png | Plugin manager, accordion/list view, sparse rows |
| Plugins - Milan #1.png | Plugin manager, card grid view toggle (card/accordion switch) |
| Plugins - Milan #2.png | Plugin manager, freeform "deck" drag layout w/ section headers |
| Introduction.png | Onboarding modal, step 1 of 5, songs/practice intro |
| Introduction-1.png | Onboarding modal, step 2 of 5, minigames intro |
| Introduction-2.png | Onboarding modal, step 3 of 5, theory/skills intro |
| Oboarding.png | Coachmark tour, steps 1–3, tuner/instrument/signal callouts on dimmed homepage |
| Oboarding-1.png | Coachmark tour, steps 4–5, profile/first-song callouts |
| Profile Settings Bass without Sidebar.png | Profile settings, Bass instrument detail (string color picker) |
| Profile Settings Drums without Sidebar.png | Profile settings, Drums detail (kit builder + highway lanes) |
| Profile Settings Guitar without Sidebar.png | Profile settings, Guitar detail (string color picker) |
| Profile Settings Keys without Sidebar.png | Profile settings, Keys detail (octave range + finger color picker) |
| Profile Settings Vocals without Sidebar.png | Profile settings, Vocals detail (warm-up + microphone) |
| Songs without Sidebar.png | Songs library list, album rows w/ song counts, tabs for All/Favorites/Setlists |
| Frame 515120.png | Profile/instrument stat strip: level, streak, per-instrument mini stat cards |
| Group 43.png | Two plugin pedal cards "patch-cabled" together illustration |

## Open questions / inconsistencies

- Accent color is a real theming feature (Theme Settings screen proves it), so the red/green/blue variance across Homepage screenshots is intentional, not drift — but one variant (Homepage w Sidebar-2) recolors the *entire background*, not just the accent, which is structurally different from the other three theme samples. Confirm whether full-background reskinning is in scope or that file was a stray exploration.
- Settings use plain outline-square checkboxes everywhere, not toggle switches — unusual for this kind of settings-heavy page. Worth confirming intentional before building real controls.
- Red and lime-green each do double duty: as the default theme accent color AND as semantic status colors (red=inactive/outdated, green=active/up-to-date) on plugin cards. Under a non-default theme (e.g. the blue variant) this separation would presumably still hold since status pills looked theme-independent in the samples seen — but worth verifying status-pill colors never shift with the theme picker.
- No screenshots of empty/error states, modals-within-modals, or responsive/narrow layouts were in this set — those will need fresh reference material when relevant.
