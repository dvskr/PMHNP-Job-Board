# Resume Studio Redesign: Implementation Spec

Source of truth for the redesign of the authenticated Resume Studio to match the
CareResume mockup.

Mockup files read for this spec:

- `studio mockup/CareResume.dc.html` (923 lines: markup shell plus the full
  `DCLogic` component script and seed data at the bottom)
- `studio mockup/Wireframes.dc.html` (five broad directions, 1a through 1e)

Shared contract already written and **not to be modified**:

- `lib/resume-studio/design.ts` (`studioColors`, `studioRadii`, `studioShadow`,
  `studioPane`, `studioFontStack`, `studioMonoStack`)
- `lib/resume-studio/templates.ts` (`RESUME_TEMPLATES`, `RESUME_FONTS`,
  `RESUME_DENSITIES`, `RESUME_PAPERS`, `ptToPx`, `resolveResumeStyle`)

Already built and **must not regress**:

- `app/dashboard/resume-studio/page.tsx` (auth gate) to
  `components/resume-studio/ResumeStudio.tsx` (client root)
- `SectionEditor.tsx` debounced autosave with retry and doc id guards
- `InsightRail.tsx` always mounted `aria-live` results region and quota badges
- `studio-api.ts` typed fetch client
- Backend routes under `app/api/resume-studio/`
- `lib/resume-score/score.ts` deterministic scorer

---

## 0. Reading of the mockup, in one paragraph

The mockup is a four view single page app: Dashboard, Resume Studio (editor),
Tailor, and Team. Only the editor is a genuinely new shape. Its structure is
wireframe direction **1b** (three panes with a persistent AI copilot rail on the
right) with the **live paper preview from 1a** installed as the middle pane. The
mockup is literally the wireframe's own suggested combination: "build 1a with the
copilot rail from 1b" plus "combine 1c + 1a as the full app". The Dashboard view
is direction **1c** (resumes as cards with score badges), the Tailor view is
direction **1d** (paste posting, keyword gap, insert bullets), and the Team view
is direction **1e** (seats, credit pools, SSO, template governance), which this
product has no infrastructure for and which is skipped in full.

---

## 1. Layout

### 1.1 Page chrome (what we take and what we drop)

The mockup ships its own global header and dark footer. We are inside the
authenticated dashboard shell, so:

| Mockup chrome | Decision |
| --- | --- |
| Sticky brand header with CareResume logo, 4 item nav, credits pill, avatar | **Drop.** Reuse the existing dashboard chrome. |
| Dark `#152623` footer with marketing links | **Drop.** The site already has a footer, and the studio is a working surface. |
| `max-width: 1500px; padding: 0 22px` main column | **Keep** as the studio's own container width. |

All CareResume branding, the fake user "Sathish Reddy", and the fake org
"Northgate Health System" are stripped. The product name in copy is
"Resume Studio". The signed in user's real name comes from the session.

### 1.2 Studio toolbar (replaces the mockup's editor header row)

Flex row, `align-items: center`, `justify-content: space-between`, `gap: 16px`,
`flex-wrap: wrap`, `margin-bottom: 16px`, container `padding: 20px 0 0`.

Left block:

- `h1` "Resume Studio", IBM Plex Serif 600, `24px`, `letter-spacing: -0.4px`,
  `margin: 0`, color `studioColors.text`.
- Save state row directly under it: `display:flex; align-items:center; gap:7px;
  font-size:12.5px; margin-top:3px`, color `studioColors.textMuted`. Leading dot
  is a `7px` circle, `border-radius: 50%`, background `studioColors.accent`,
  `animation: crPulse 2s infinite` while saving or retrying.
- A document title control sits inline to the right of the `h1` on wide screens
  (inline rename, existing behavior preserved).

Right block:

- Primary "Export PDF" button: background `studioColors.accent`, color `#fff`,
  no border, `border-radius: 9px`, `padding: 9px 16px`, `font-size: 13.5px`,
  weight 600, `display:flex; align-items:center; gap:7px`, leading
  `Download` lucide icon at `16px`.
- Secondary overflow menu (Duplicate, Set as default, Delete) as an icon button.

### 1.3 The three pane grid (the core of the redesign)

Exact mockup values, wide breakpoint:

```
display: grid;
grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr) 340px;
gap: 16px;
align-items: start;
padding-bottom: 40px;
```

**Pane 1, form (left).** Scrolls independently.

```
max-height: calc(100vh - 150px);
overflow-y: auto;
padding-right: 6px;
display: flex; flex-direction: column; gap: 14px;
```

Carries the `cr-scroll` custom scrollbar (see 2.14).

**Pane 2, live preview (middle).** Scrolls independently, and is a recessed well
around a white paper sheet.

```
max-height: calc(100vh - 150px);
overflow-y: auto;
background: #dedbd0;      /* preview well ground, see 3.2 */
border-radius: 14px;
padding: 20px;
display: flex; justify-content: center;
```

**Pane 3, copilot rail (right).** Fixed `340px`, sticky, does not scroll with the
page.

```
position: sticky;
top: 80px;
display: flex; flex-direction: column; gap: 14px;
```

The rail contains two stacked cards: the always visible score card, then the
tabbed card. The tabbed card's body has its own scroll:
`max-height: calc(100vh - 300px); overflow-y: auto; padding: 14px;
display:flex; flex-direction:column; gap:15px` for the Design tab, and
`max-height: 340px` for the Review tab.

### 1.4 Responsive collapse (the mockup has none; this is specified here)

The mockup is a fixed three column grid with no media queries. Define four
breakpoints. Nothing may overflow horizontally at `320px`.

| Range | Columns | Behavior |
| --- | --- | --- |
| `>= 1280px` | `minmax(0,1fr) minmax(0,1.05fr) 340px` | As above. Three panes visible. |
| `1024px to 1279px` | `minmax(0,1fr) 320px` | Rail stays. Column 1 becomes a two state pane driven by a segmented control ("Edit" / "Preview") pinned above it. Default state is Edit. |
| `768px to 1023px` | single column | A sticky segmented control bar (`Edit` / `Preview` / `Insights`) sits under the toolbar at `top: 0`, `z-index: 20`, background `studioColors.canvas`, `padding: 8px 0`, `border-bottom: 1px solid studioColors.border`. The score ring shrinks into that bar as a `44px` inline ring with the number at `15px` mono, so the score is never more than one glance away. Panes lose their `max-height`/`overflow-y` and scroll with the page. |
| `< 768px` | single column | Same as above. Section card padding drops to `14px 14px`. All two column field grids collapse to one column. Rail cards become full width. Preview well padding drops to `12px`. |

Segmented control (only rendered below `1280px`): full width, `display:flex`,
`background: studioColors.well`, `border-radius: 10px`, `padding: 3px`; each
button `flex:1`, `padding: 8px 10px`, `font-size: 13px`, weight 600,
`border-radius: 8px`; selected gets `background: studioColors.surface`, color
`studioColors.accentDark`, `box-shadow: studioShadow.pane`; unselected color
`studioColors.textBody`, no background. Implemented as a real
`role="tablist"` with `role="tab"` buttons and arrow key navigation.

### 1.5 Paper scaling inside the preview well

The mockup fakes the sheet with a fixed `max-width: 524px` and
`min-height: 680px`. That is not a preview, it is a picture of one. Replace it
with the real geometry from `templates.ts`:

- Paper width, both papers: `ptToPx(612)` = **816px**.
- Paper height: letter `ptToPx(792)` = **1056px**, legal `ptToPx(1008)` =
  **1344px**.
- Render the paper at those exact pixel sizes, then scale the whole sheet with
  `transform: scale(k)` and `transform-origin: top center`.
- `k = clamp(0.30, availableWidth / 816, 1)` where `availableWidth` is the
  preview well's content box width, measured with a `ResizeObserver`.
- The scaled wrapper must set an explicit `height: 1056 * k` (or `1344 * k`) so
  the transform does not leave a layout gap.
- At `320px` viewport: `(320 - 32 page padding - 24 well padding) / 816 = 0.32`,
  inside the clamp, no horizontal overflow.

**Page break guides.** Draw a `1px` dashed rule in `studioColors.border` across
the sheet at every multiple of the page height, with a `10px` mono label
`Page 2` in `studioColors.textFaint` offset `4px` above the rule, so "does this
fit on one page" is answerable without exporting. Guides are `aria-hidden` and
absent from the PDF.

---

## 2. Component inventory

Every measurement below is taken from the mockup unless the row says
"specified here".

### 2.1 Section card (form pane)

```
background: studioColors.surface;      /* mockup #fff */
border: 1px solid studioColors.borderStrong;   /* #e8e3d8 */
border-radius: 14px;
padding: 18px 20px;
```

Section head: `display:flex; align-items:center; justify-content:space-between;
margin-bottom: 14px`.
Section title: IBM Plex Serif, `16px`, weight 600, color `studioColors.text`.
Optional right slot holds either an add button or a mono counter
(`font-size: 11.5px`, color `#9aa39f`, `studioMonoStack`).

### 2.2 Nested entry card (a role, a license, a certification, a degree)

```
border: 1px solid studioColors.borderSoft;   /* #ebe6da */
border-radius: 12px;
padding: 14px;   /* 13px for license, certification, education */
background: studioColors.surface;            /* mockup #fcfbf7 */
```

Experience entry header row: `display:flex; align-items:center;
justify-content:space-between; margin-bottom: 11px`. Left is
`Role {n}` at `13px` weight 600 color `studioColors.textBody`. Right is a
`display:flex; gap:4px` cluster of three icon buttons: move up, move down,
delete.

### 2.3 Field, label, input

```
/* wrapper */ display: flex; flex-direction: column; gap: 5px;
/* label   */ font-size: 11.5px; font-weight: 600; color: studioColors.textBody;
/* input   */
width: 100%;
border: 1px solid studioColors.border;      /* #e2ddd1 */
background: studioColors.surfaceAlt;        /* #fbfaf6 */
border-radius: 9px;
padding: 9px 11px;
font-size: 13.5px;
color: studioColors.text;
transition: border-color .12s, box-shadow .12s;
```

Focus (inputs and textareas): `border-color: studioColors.accent` and
`box-shadow: 0 0 0 3px rgba(13,107,98,.12)`. Placeholder color `#9aa39f`.

Textarea variants:

| Use | Extra style |
| --- | --- |
| Summary | `min-height: 96px; resize: vertical; line-height: 1.5` |
| Achievement bullet | `min-height: 38px; padding: 8px 10px; line-height: 1.4; resize: vertical` |
| Tailor paste box | `min-height: 200px; resize: vertical; line-height: 1.5` (mockup used 280px on a full width page; 200px fits the rail) |

### 2.4 Field grids per section

| Section | Grid |
| --- | --- |
| Contact | `grid-template-columns: 1fr 1fr; gap: 12px`. Fields in order: Full name, Credential (see 4.6), Email, Phone, City, State, LinkedIn URL. LinkedIn spans `grid-column: 1 / 3`. |
| Summary | Single textarea plus a `{n}/2000` mono counter in the section head. |
| Experience | Per entry: `grid-template-columns: 1fr 1fr; gap: 11px`. Cell order: Job title, Employer, Location, then a nested `grid-template-columns: 1fr 1fr; gap: 8px` holding Start and End. |
| Licenses | `grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end`. Row 1: Type, State, delete. Row 2: Number, Expiration. |
| Certifications | `grid-template-columns: 1fr 1fr 1fr auto; gap: 10px; align-items: end`. Name, Body, Expiration, delete. |
| Education | `grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end`. Row 1: Degree, Field, delete. Row 2: School, Grad year. |
| Skills | Chip wrap, then an input plus Add button row, then a suggestion row. |

Delete buttons that sit in an `align-items: end` grid get `height: 38px` so they
line up with the input baseline.

Below `768px` every one of these collapses to `grid-template-columns: 1fr`.

### 2.5 Bullet row

```
display: flex; gap: 7px; align-items: flex-start;
```

- Leading bullet glyph: a `6px` filled dot in `studioColors.accent`,
  `margin-top: 15px`, `aria-hidden`. (The mockup used a text bullet at
  `font-size:15px; padding-top:8px`.)
- The textarea takes the remaining width.
- Sparkle button (see 2.9) `flex-shrink: 0`.
- Remove icon button, `color: studioColors.danger`, `margin-top: 5px`.

Add bullet button sits under the list with `margin-top: 9px`.

### 2.6 Skill chips and suggestions

Active chip:

```
display: inline-flex; align-items: center; gap: 7px;
background: #eef4f2;                 /* accent tint, see 3.2 */
border: 1px solid #d7e5e1;
color: studioColors.accentDark;
border-radius: 8px;
padding: 5px 10px;
font-size: 13px; font-weight: 500;
```

Remove control inside the chip is a real `button`, borderless, transparent,
color `studioColors.accentDark`, `14px`, `line-height: 1`,
`aria-label="Remove {skill}"`.

Chip container: `display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px`.

Input row: `display:flex; gap:9px`. Input takes `flex:1`. Add button is the
outline accent button at `padding: 0 18px; font-size: 13.5px`.

Suggestion row: label "Suggestions:" at `12px` color `#9aa39f`, followed by
dashed chips: `border: 1px dashed #cdd2c8; background: studioColors.surfaceAlt;
color: studioColors.textBody; border-radius: 7px; padding: 3px 9px;
font-size: 12px; margin: 0 4px 4px 0`. Suggestions come from a static PMHNP list,
filter out anything already added (case insensitive), and cap at 4.

### 2.7 ATS score ring

Card: `background: studioColors.surface; border: 1px solid
studioColors.borderStrong; border-radius: 14px; padding: 18px;
text-align: center`.

Eyebrow: "Resume score", `font-size: 11px`, uppercase,
`letter-spacing: 1.2px`, weight 600, color `studioColors.textFaint`,
`margin-bottom: 12px`.

Ring wrapper: `position: relative; width: 120px; height: 120px; margin: 0 auto`.

SVG: `width=120 height=120 viewBox="0 0 120 120"`, `transform: rotate(-90deg)`.

- Track circle: `cx=60 cy=60 r=52 fill=none stroke=studioColors.wellAlt
  stroke-width=11`.
- Progress circle: same geometry, `stroke = gradeColor`, `stroke-width: 11`,
  `stroke-linecap: round`, `stroke-dasharray = "{C} {C}"`,
  `stroke-dashoffset = C * (1 - score/100)` where
  `C = 2 * Math.PI * 52 = 326.7256...` (do not round; let the browser handle it).
- Transition: `stroke-dashoffset .6s ease, stroke .3s`.
- Mount animation: set a CSS custom property `--c: {C}` on the circle and apply
  `animation: crRing .6s ease` where
  `@keyframes crRing { from { stroke-dashoffset: var(--c) } }`, so the ring
  sweeps up from zero on first paint and then transitions smoothly on every
  later score change.

Center overlay: `position: absolute; inset: 0; display:flex;
flex-direction: column; align-items:center; justify-content:center`.

- Number: `studioMonoStack`, weight 600, `font-size: 34px`, color `gradeColor`,
  `line-height: 1`.
- Grade word under it: `font-size: 11px`, weight 600, color
  `studioColors.textFaint`.

Under the ring: one line summary, `font-size: 12.5px`, color
`studioColors.textMuted`, `margin-top: 6px`.

Accessibility: the SVG is `aria-hidden`; the card exposes
`role="img"` with `aria-label="Resume score {n} out of 100, grade {grade}"` and
the number also lives in the always mounted `aria-live` region as text.

Grade thresholds are identical between the mockup and `lib/resume-score`
(85 / 70 / 50), so no scorer change is needed. Mapping:

| `ResumeScoreGrade` | Displayed word | Ring color | Summary line |
| --- | --- | --- | --- |
| `strong` (>= 85) | Strong | `studioColors.success` `#1f8a5b` | "Ready to send." |
| `solid` (>= 70) | Solid | `#2f8f6a` | "Solid. A few tweaks left." |
| `needs-work` (>= 50) | Needs work | `#c99a2e` | "Address the fixes below." |
| `critical` (< 50) | Critical | `studioColors.danger` `#b4514a` | "Several required sections are missing." |

### 2.8 Improvement checklist rows

One row per scoring dimension with a deficit, sorted by `(max - score)`
descending.

```
border: 1px solid {severity border};
background: {severity background};
border-radius: 10px;
padding: 11px 12px;
```

Inner: `display:flex; align-items:flex-start; gap:8px`.

- Icon slot: `16px` lucide icon, colored per severity.
- Label: `font-size: 13px`, weight 600, color `#26332f`.
- Detail: `font-size: 12px`, color `studioColors.textSoft`, `margin-top: 2px`,
  `line-height: 1.4`. Detail text is the dimension's findings, joined, capped at
  two findings.
- Right slot (specified here, not in the mockup): a points chip
  `+{max - score} pts`, `studioMonoStack`, `font-size: 11px`, weight 600,
  colored per severity, `flex-shrink: 0`. It tells the user what fixing the row
  is actually worth, which the mockup never says.

Severity derivation from a `ResumeScoreDimension`:

| Condition | Severity | Background | Border | Icon |
| --- | --- | --- | --- | --- |
| `score < max / 2` | warn | `#fbf1ec` | `#efd9cd` | `AlertTriangle`, color `studioColors.warn` |
| `score < max` | info | `#faf6ea` | `#eee0c2` | `Lightbulb`, color `studioColors.warn` |
| `score === max` | ok | `studioColors.successWash` | `#cfe6d6` | `CheckCircle2`, color `studioColors.success` |

If every dimension is at max, render exactly one ok row: label "Looking strong",
detail "No structural gaps found. Tailor to a posting to push keyword match
higher."

List container: `display:flex; flex-direction:column; gap:10px; padding:14px;
max-height: 340px; overflow-y: auto` with `cr-scroll`.

Under the list, the AI escalation button (see 2.9, warm variant) reading
"Deep AI review ({n} left)" with `margin-top: 2px`.

### 2.9 Buttons

| Name | Spec |
| --- | --- |
| Primary | `background: studioColors.accent; color:#fff; border:none; border-radius: 9px; padding: 9px 16px; font-size: 13.5px; font-weight: 600`. Page level CTA variant: `border-radius: 10px; padding: 12px 20px; font-size: 14px; box-shadow: 0 2px 8px rgba(13,107,98,.25)`. |
| Outline accent | `border: 1px solid studioColors.accent; color: studioColors.accent; background: studioColors.surface; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 600`. |
| Add (section head) | `border: 1px solid #cfe0da; color: studioColors.accent; background: studioColors.surface; border-radius: 8px; padding: 5px 12px; font-size: 12.5px; font-weight: 600`. |
| Icon button | `border: 1px solid studioColors.borderSoft; background: studioColors.surface; border-radius: 7px; width: 28px; height: 28px; font-size: 12px; color: studioColors.textSoft; display: inline-flex; align-items:center; justify-content:center`. Destructive variant sets `color: studioColors.danger`. |
| Warm AI (block) | `border:none; background: studioColors.warnWash; color: studioColors.warn; border-radius: 10px; padding: 11px; font-size: 13px; font-weight: 600`. |
| Warm AI (inline sparkle) | `border: 1px solid #e6cfa8; background: studioColors.warnWash; color: studioColors.warn; border-radius: 7px; padding: 8px 9px; font-size: 12px; font-weight: 600; white-space: nowrap`. |
| Tool row | `display:flex; align-items:center; gap:11px; border:1px solid studioColors.borderSoft; background: studioColors.surface; border-radius: 11px; padding: 12px; text-align: left`. Title `13.5px`/600, sub `11.5px` color `studioColors.textFaint`. |
| Dashed new | `border: 1.5px dashed #c9cdc4; background: studioColors.surfaceAlt; color: studioColors.textBody; border-radius: 12px; padding: 14px; font-size: 13.5px; font-weight: 600`. |
| Segmented pill, on | `border:none; background: {accent}; color:#fff; border-radius:7px; padding: 6px 12px; font-size: 12px; font-weight: 600`. |
| Segmented pill, off | `border: 1px solid studioColors.border; background: studioColors.surface; color: studioColors.textBody; border-radius: 7px; padding: 6px 12px; font-size: 12px; font-weight: 500`. |

Every button is a real `<button>` with `cursor: pointer`, `font-family: inherit`,
and a `:focus-visible` outline of `2px solid studioColors.accent` at
`outline-offset: 2px`. Icon only buttons carry an `aria-label`.

### 2.10 Rail tab bar

Container: `display:flex; border-bottom: 1px solid studioColors.wellAlt`.

Each tab: `flex: 1; border: none; padding: 11px 6px; font-size: 12.5px;
cursor: pointer; font-family: inherit`.

- Active: `background: studioColors.surface; color: studioColors.accentDark;
  font-weight: 600; border-bottom: 2px solid {accent}`.
- Inactive: `background: #faf8f2; color: #6b7671; font-weight: 500;
  border-bottom: 2px solid transparent`.

The mockup uses three tabs (Design, Review, Tools). We use **four**: `Design`,
`Review`, `Tailor`, `Cover letter`. Rationale: the mockup's Tools tab is a
launcher for tailor, cover letter, and interview prep, but the existing
`InsightRail` already implements Tailor and Cover letter as first class tabs with
quota badges and an always mounted `aria-live` results region. Promoting them
back to a launcher would delete working, accessible code for no gain. The
mockup's Score tab is not needed because the ring is always visible above the tab
card.

Tab bar is `role="tablist"`, tabs are `role="tab"` with
`aria-selected` and `aria-controls`, panels are `role="tabpanel"`, and left and
right arrow keys move selection.

### 2.11 Design tab controls

Body: `padding:14px; display:flex; flex-direction:column; gap:15px`.

Control label (every group): `font-size: 10px; font-weight: 700;
letter-spacing: .9px; text-transform: uppercase; color: studioColors.textFaint;
margin-bottom: 8px`.

**Template picker.** `display:grid; grid-template-columns: 1fr 1fr; gap: 9px`.
Five cards (the five ids in `RESUME_TEMPLATES`).

Card button:

```
border: 1.5px solid {selected ? accent : studioColors.border};
background: studioColors.surface;
border-radius: 9px;
overflow: hidden;
padding: 0;
box-shadow: {selected ? `0 0 0 2px ${accent}33` : 'none'};
```

Card internals, in order:

1. Header strip, per template (see table below).
2. Body: `padding: 6px 7px; display:flex; flex-direction:column; gap:3px`
   containing `headBar`, `line`, `lineShort`, `headBar (margin-top: 2px)`, `line`.
   - `line`: `height:3px; width:82%; background: studioColors.wellAlt;
     border-radius:2px`
   - `lineShort`: same but `width: 55%`
3. Label strip: `font-size: 11px; font-weight: 600; text-align: center;
   padding: 5px 4px 6px; color: {selected ? accent : studioColors.textBody};
   border-top: 1px solid studioColors.well; background:
   {selected ? accent + '12' : '#faf8f2'}`.

Per template header strip. `accent` is `template.accent` from `templates.ts`,
falling back to `studioColors.ink` when the template's accent is the empty
string (classic and minimal are ink only).

| Template | `hdr` | `nameBar` | `subBar` | `headBar` |
| --- | --- | --- | --- | --- |
| classic | `padding: 9px 8px 7px; text-align:center; border-bottom: 2px solid {accent}` | `height:5px; width:55%; background:#4a5852; border-radius:2px; margin:0 auto` | `height:3px; width:35%; background:{accent}; border-radius:2px; margin:3px auto 0` | `height:3px; width:34%; background:{accent}; border-radius:2px` |
| modern | `padding: 8px` | `height:7px; width:55%; background:{accent}; border-radius:2px` | `height:3px; width:30%; background:{accent}; opacity:.6; border-radius:2px; margin-top:3px` | `height:3px; width:30%; background:{accent}; border-radius:2px` |
| minimal | `padding: 8px; border-bottom: 1px solid studioColors.border` | `height:5px; width:50%; background:#4a5852; border-radius:2px` | `height:3px; width:30%; background:#c9cdc4; border-radius:2px; margin-top:3px` | `height:3px; width:28%; background:#c9cdc4; border-radius:2px` |
| enterprise | `padding: 9px 8px; background: {accent}` | `height:6px; width:55%; background:#fff; border-radius:2px` | `height:3px; width:35%; background: rgba(255,255,255,.6); border-radius:2px; margin-top:3px` | `height:3px; width:30%; background:{accent}; border-radius:2px` |
| executive | `padding: 8px; text-align:center; border-top: 2px solid {accent}; border-bottom: 2px solid {accent}` | `height:5px; width:60%; background:#4a5852; border-radius:2px; margin:0 auto` | `height:3px; width:34%; background:{accent}; border-radius:2px; margin:3px auto 0` | `height:3px; width:30%; background:{accent}; border-radius:2px; margin:0 auto` |

The mockup's sixth template, "Compact", is dropped: `RESUME_DENSITIES.compact`
already expresses it, and a template that duplicates a density axis makes the
two controls contradict each other.

**Heading font.** `display:grid; grid-template-columns:1fr 1fr; gap:7px`. Four
buttons from `RESUME_FONTS`, each styled as a segmented pill plus
`font-family: {font.cssStack}; font-size: 13px; text-align: center`, so the
control previews itself. Under the group, one line of honest fine print at
`11px` color `studioColors.textFaint`:
"PDF export maps this to {font.pdfFamily} so applicant tracking systems parse it
reliably."

**Density.** `display:flex; gap:6px`. Two segmented pills from
`RESUME_DENSITIES`: Roomy, Compact.

**Paper size.** `display:flex; gap:7px`. Two segmented pills from
`RESUME_PAPERS`: Letter, Legal.

The mockup's separate **Text size** (S / M / L) and **Accent** (six swatches) and
**A4** controls are dropped. See 4.

### 2.12 Live paper preview

Paper element:

```
background: #fff;
box-shadow: studioShadow.paper;
border-radius: 3px;
width: 816px;                     /* ptToPx(paper.widthPt) */
min-height: {1056 | 1344}px;      /* ptToPx(paper.heightPt) */
padding: {ptToPx(density.marginPt)}px;    /* roomy 64, compact 48 */
font-family: {font.cssStack};
font-size: {ptToPx(density.bodyPt)}px;    /* roomy 14, compact 12.67 */
line-height: {density.lineHeight};        /* roomy 1.42, compact 1.28 */
color: studioColors.textStrong;
```

Every derived measurement in the preview comes from `resolveResumeStyle()` and
`ptToPx()`. No literal pixel value for anything the PDF also renders.

**Header block**, by `template.headerAlign` and `template.headingStyle`:

| Template | Header block |
| --- | --- |
| classic | `text-align:center; border-bottom: 2px solid {accent}; padding-bottom: 12px; margin-bottom: 14px` |
| modern | `text-align:left; padding-bottom: 10px; margin-bottom: 14px` (no rule); name color is `{accent}` |
| minimal | `text-align:left; border-bottom: 1px solid studioColors.border; padding-bottom: 12px; margin-bottom: 14px` |
| enterprise | `text-align:left; background: {accent}; padding: 16px 18px; border-radius: 8px; margin-bottom: 16px`; name `#fff`, credential `rgba(255,255,255,.92)`, contact line `rgba(255,255,255,.85)` |
| executive | `text-align:center; border-top: 1.5px solid {accent}; border-bottom: 1.5px solid {accent}; padding: 12px 0; margin-bottom: 14px` |

Name: `font-family: {font.cssStack}; font-weight: 600;
font-size: {ptToPx(density.namePt)}px` (roomy 28, compact 24);
`letter-spacing: -.3px`; color `studioColors.ink` except modern (accent) and
enterprise (white).

Credential line: weight 600, `font-size: {ptToPx(density.bodyPt + 1)}px`,
`margin-top: 2px`, color `{accent}` (white variants per the table).

Contact line: `font-size: {ptToPx(density.bodyPt - 1)}px`, color
`studioColors.textSoft`, `margin-top: 6px`.

**Section heading**, by `template.headingStyle`:

| Style | Spec |
| --- | --- |
| `rule` (classic, executive) | `font-family: {font.cssStack}; font-size: {ptToPx(density.headingPt)}px; font-weight:600; text-transform: uppercase; letter-spacing: 1px (executive 1.6px); color: {accent}; border-bottom: 1px solid studioColors.border; padding-bottom: 3px; margin-bottom: 8px` |
| `caps` + accent (modern) | Same font and size, `letter-spacing: .8px; color: {accent}; border-left: 3px solid {accent}; padding-left: 9px; margin-bottom: 8px`; no bottom rule |
| `caps` + ink only (minimal) | `font-family: studioFontStack; font-size: {ptToPx(density.headingPt - 0.5)}px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: studioColors.textFaint; margin-bottom: 7px`; no rule |
| `bar` (enterprise) | `letter-spacing: 1.2px; color: {accent}; border-bottom: 2px solid {accent}; padding-bottom: 3px; margin-bottom: 8px` |

Section spacing: every section block gets
`margin-bottom: {ptToPx(density.sectionGapPt)}px` (roomy 17.33, compact 12); the
last section has none. Entries inside a section get
`margin-bottom: {ptToPx(density.entryGapPt)}px` (roomy 10.67, compact 7.33).

**Section content rules** (derived from `ResumeSections`, see 4.6 for the copy
rules that replace the mockup's dashes):

| Section | Shown when | Content |
| --- | --- | --- |
| Header | always | `contact.fullName` or the ghost "Your Name" |
| Summary | `summary.trim()` non empty | one paragraph, `line-height: 1.5`, color `studioColors.textStrong` |
| Experience | any entry has `jobTitle` or `employerName` | per entry: a `display:flex; justify-content:space-between; gap:8px` row with the title (weight 600, `studioColors.ink`) and the date range (`font-size: {ptToPx(bodyPt-1.5)}px`, color `#7a857f`, `white-space: nowrap`); then the employer line (weight 500, `font-size: {ptToPx(bodyPt-0.5)}px`, color `{accent}`); then a `ul` at `margin: 5px 0 0; padding-left: 17px; line-height: 1.45` with `li { margin-bottom: 2px }`, empty bullets filtered out |
| Licenses and Certifications | at least one license with `licenseType` or certification with `name` | one joined line |
| Education | any entry has `degreeType` or `schoolName` | per entry: bold degree line, then the school line |
| Skills | `skills.length > 0` | one joined line |

### 2.13 Resume cards with score badges (direction 1c, reused in the library rail and the empty state)

```
border: 1px solid studioColors.borderStrong;
border-radius: 12px;
padding: 15px 17px;
display: flex; align-items: center; gap: 16px;
transition: border-color .15s, background-color .15s;
```

Hover / focus within: `border-color: studioColors.accent; background:
studioColors.surfaceAlt`.

Left block (`flex: 1`):

- Title row: `display:flex; align-items:center; gap:8px`. Name at `15px`
  weight 600. Default badge: `font-size: 10.5px; font-weight: 600; color:
  studioColors.accentDark; background: studioColors.accentWash;
  border-radius: 5px; padding: 2px 7px`, content is a `Star` icon at `10px` plus
  the word "DEFAULT".
- Meta line: `font-size: 12.5px; color: studioColors.textFaint; margin-top: 3px`,
  text "Updated {relative time}".

Center block, the score badge: `text-align:center`; number in `studioMonoStack`
weight 600 `19px` colored by grade; caption "ATS" at `10px`, uppercase,
`letter-spacing: .6px`, color `studioColors.textFaint`.

Right block: outline accent "Edit" button.

Counter in the list head: `{n} of 10`, `12.5px`, `studioMonoStack`, color
`studioColors.textFaint`. `MAX_DOCUMENTS` is already 10 in `ResumeStudio.tsx`.

New document control: the dashed new button, full width, label
"+ New from profile", with a secondary text button "Start blank" under it.

### 2.14 Scrollbars, animations, and motion policy

```css
.cr-scroll::-webkit-scrollbar { width: 9px }
.cr-scroll::-webkit-scrollbar-thumb {
  background: #d3d0c6;
  border-radius: 9px;
  border: 2px solid var(--studio-canvas);   /* studioColors.canvas */
}
```

Keyframes, exactly as the mockup:

```css
@keyframes crIn    { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes crRing  { from { stroke-dashoffset: var(--c) } }
@keyframes crBar   { from { width: 0 } }
@keyframes crPulse { 0%,100% { opacity: 1 } 50% { opacity: .5 } }
```

Usage: view or tab change `animation: crIn .3s ease` (rail tab panels `.2s`);
score ring `crRing .6s ease`; keyword bar `crBar .5s ease`; autosave dot
`crPulse 2s infinite` while saving.

`@media (prefers-reduced-motion: reduce)` disables all four, sets the ring to its
final `stroke-dashoffset` immediately, sets the bar to its final width, and
removes the pulse (the dot stays solid).

### 2.15 Keyword match panel (Tailor tab)

Match card: `text-align: center` inside the standard section card.

- Eyebrow "Keyword match": `11px`, uppercase, `letter-spacing: 1.2px`,
  weight 600, color `studioColors.textFaint`, `margin-bottom: 8px`.
- Percentage: `studioMonoStack`, weight 600, `font-size: 42px`,
  `line-height: 1`, colored by band.
- Bar: `height: 9px; background: studioColors.wellAlt; border-radius: 9px;
  margin-top: 12px; overflow: hidden`; fill `height: 100%; width: {pct}%;
  background: {bandColor}; border-radius: 9px; transition: width .5s`.

Band colors: `>= 80` `studioColors.success`, `>= 55` `#c99a2e`, else
`studioColors.danger`.

Coverage lists. Group labels at `12px` color `studioColors.textFaint`,
`margin-bottom: 6px`; chip container `display:flex; flex-wrap:wrap; gap:7px`.

| Chip | Spec |
| --- | --- |
| Matched | `background: #e4f2e9; border: 1px solid #bfe0cc; color: #256b42; border-radius: 7px; padding: 4px 10px; font-size: 12.5px; font-weight: 500`, leading `Check` icon at `12px` |
| Missing | `background: #fbe6e4; border: 1px solid #edc4c0; color: #9c3b34;` same metrics, leading `X` icon at `12px` |

Suggested bullet card: `border: 1px solid studioColors.borderSoft;
border-radius: 10px; padding: 11px; background: studioColors.surface;
display:flex; gap:10px; align-items:flex-start`. Text at `13px`
`line-height: 1.45` color `studioColors.textStrong`, then an outline accent
"Insert" button at `border-radius: 7px; padding: 5px 11px; font-size: 12px;
white-space: nowrap`.

Data mapping from the existing `/api/resume-studio/tailor` response:
`keywordAlignment[]` splits on `presentInResume` into matched and missing;
`pct = round(matched.length / keywordAlignment.length * 100)`, `0` when the array
is empty. Suggested bullets come from `tailoredBullets[].tailored`, falling back
to `keywordAlignment[].suggestion` for missing keywords.

### 2.16 Modal

Overlay: `position: fixed; inset: 0; z-index: 60; background: rgba(20,30,28,.5);
backdrop-filter: blur(3px); display:flex; align-items:center;
justify-content:center; padding: 24px; animation: crIn .2s ease`.

Dialog: `background: studioColors.surface; border-radius: 16px;
max-width: 620px; width: 100%; max-height: 86vh; overflow: hidden;
display:flex; flex-direction:column; box-shadow: 0 20px 60px rgba(0,0,0,.3)`.

- Head: `padding: 18px 22px; border-bottom: 1px solid studioColors.wellAlt;
  display:flex; align-items:center; justify-content:space-between`. Icon at
  `18px` plus IBM Plex Serif `18px`/600 title. Close button: borderless,
  `background: #f2efe6; border-radius: 8px; width: 30px; height: 30px;
  font-size: 16px; color: studioColors.textSoft`.
- Body: `padding: 22px; overflow-y: auto` with `cr-scroll`. Cover letter body is
  `white-space: pre-wrap; font-size: 14px; line-height: 1.65; color: #2a3833;
  font-family: 'IBM Plex Serif', serif`.
- Foot: `padding: 14px 22px; border-top: 1px solid studioColors.wellAlt;
  display:flex; justify-content:flex-end; gap:10px`. Outline accent "Copy"
  (`border-radius: 9px; padding: 9px 16px; font-size: 13.5px`) whose label flips
  to "Copied" for 2000ms after a successful `navigator.clipboard.writeText`, and
  a primary "Done" at `padding: 9px 18px`.

Accessibility additions the mockup lacks: `role="dialog"`, `aria-modal="true"`,
`aria-labelledby` pointing at the title, focus moved to the dialog on open,
focus trapped inside, `Escape` closes, focus restored to the trigger on close,
overlay click closes while inner click calls `stopPropagation`.

Below `640px` the dialog goes `max-width: 100%; max-height: 92vh;
border-radius: 14px` and the overlay padding drops to `12px`.

### 2.17 Empty and pending states (specified here; the mockup has none)

| State | Spec |
| --- | --- |
| No documents at all | Centered card in the middle column: dashed `1.5px #c9cdc4` border, `border-radius: 12px`, `background: studioColors.surfaceAlt`, `padding: 48px 24px`, `FileText` icon at `40px` in `studioColors.accent`, IBM Plex Serif `20px` title "Start your first resume", body at `13.5px` color `studioColors.textMuted`, then a primary "Start from my profile" and a text "Start blank". |
| Document exists but is empty | The paper renders with ghost placeholders at color `#9aa39f` (not italic, not lower opacity, so it stays legible): "Your Name" in the name slot and "Your summary will appear here as you type." in the summary slot. Ghost text is `aria-hidden` and excluded from the PDF. |
| Review tab, nothing run yet | Well block: `background: studioColors.well; border-radius: 10px; padding: 16px`, copy at `13px` color `studioColors.textMuted` explaining that the checklist above is free and unlimited while a deep AI review spends one of the daily allowance, then the warm AI button. |
| Tailor tab, no posting pasted | Same well pattern, plus the paste textarea and a primary "Analyze match". |
| Quota exhausted | `background: studioColors.warnWash; border: 1px solid #e6cfa8; color: studioColors.warn; border-radius: 10px; padding: 11px 12px; font-size: 12.5px`, copy naming the tool and the reset time from `usage.resetAtIso`. Never an `alert()`; the mockup uses `alert()` twice and both are replaced by this inline card. |
| Network or service error | Existing `FriendlyNotice` component with tone `error`, kept as is. |

### 2.18 Daily allowance card (rail, under the tabbed card)

From the mockup's "Today's AI allowance" panel, wired to the real
`/api/resume-studio/usage` response.

Card is the standard rail card. Title IBM Plex Serif `16px`/600
"Today's AI allowance", `margin: 0 0 6px`. Subtitle at `12px` color
`studioColors.textFaint`: "The score is always free. AI tools spend a credit
only when they succeed."

Rows: `display:flex; align-items:center; justify-content:space-between;
padding: 7px 0`. Label at `13.5px` color `#3a4a45`. Value chip:
`studioMonoStack`, `12px`, weight 600, `border-radius: 6px; padding: 3px 9px`.

| Row | Value | Chip color / background |
| --- | --- | --- |
| Resume score | "Unlimited" | `studioColors.accentDark` on `studioColors.accentWash` |
| AI review | `{remaining} of {cap}` | `studioColors.warn` on `studioColors.warnWash` |
| Tailor to posting | `{remaining} of {cap}` | same |
| Cover letter | `{remaining} of {cap}` | same |

When `remaining === 0` the chip flips to `studioColors.danger` on `#fbf1ec` and
the row gains a `11.5px` reset time line under it.

---

## 3. Typography and color

### 3.1 Typography

| Role | Family | Size and weight | Where |
| --- | --- | --- | --- |
| Studio chrome | `studioFontStack` (IBM Plex Sans) | `13px` to `15px`, 400 to 600 | every pane, control, label |
| Display and section titles | `'IBM Plex Serif', serif` | `24px`/600 page title, `18px`/600 modal title, `16px`/600 section title | toolbar, section cards, rail cards, modal |
| Numerals | `studioMonoStack` (IBM Plex Mono) | `34px`/600 score, `42px`/600 match, `19px`/600 card badge, `11px` to `12.5px` counters and chips | score ring, keyword match, resume cards, counters, allowance chips |
| Resume body (preview) | `font.cssStack` from `RESUME_FONTS` | derived from `ptToPx(density.*)` | the paper only |
| Resume headings (preview) | `font.cssStack`, except `minimal` which uses `studioFontStack` | `ptToPx(density.headingPt)` | the paper only |

Fixed chrome sizes lifted from the mockup: `10px` control labels (700, ls .9px),
`11px` eyebrows (600, ls 1.2px), `11.5px` field labels (600), `12px` helper text,
`12.5px` tabs and meta, `13px` chips and checklist labels, `13.5px` inputs and
tool titles, `14px` page CTA, `15px` resume card names, `16px` section titles.

### 3.2 Color mapping

Every mockup hex maps to a `design.ts` token. Use the token, never the hex.

| Mockup hex | Token | Used for |
| --- | --- | --- |
| `#efece4` | `studioColors.canvas` | page ground behind the panes |
| `#fff`, `#fcfbf7` | `studioColors.surface` | pane and card backgrounds, nested entry cards |
| `#fbfaf6` | `studioColors.surfaceAlt` | input background, hover fill, dashed button fill |
| `#f0ece2` | `studioColors.well` | row separators, empty state wells, close button |
| `#eee9dd` | `studioColors.wellAlt` | ring track, progress track, tab divider, thumbnail lines |
| `#e2ddd1` | `studioColors.border` | input borders, hairlines, unselected template card |
| `#ebe6da` | `studioColors.borderSoft` | nested entry borders, icon button borders |
| `#e8e3d8` | `studioColors.borderStrong` | section and rail card borders |
| `#0d6b62` | `studioColors.accent` | primary buttons, focus rings, selection, bullets glyph |
| `#0a4f49` | `studioColors.accentDark` | active tab text, chip text, hover state of accent |
| `#e4f0ec` | `studioColors.accentWash` | default badge, active nav pill, unlimited chip |
| `#152623` | `studioColors.ink` | resume name and job titles in the preview |
| `#182b28` | `studioColors.text` | section titles, input text |
| `#3a453f` | `studioColors.textStrong` | resume body copy in the preview |
| `#4a5852` | `studioColors.textBody` | field labels, thumbnail name bars |
| `#5a655f` | `studioColors.textSoft` | checklist detail, icon button glyphs |
| `#61706b` | `studioColors.textMuted` | ring summary line, subtitles |
| `#8a938e` | `studioColors.textFaint` | eyebrows, counters, meta, placeholders in labels |
| `#1f8a5b` | `studioColors.success` | strong grade, ok checklist icon |
| `#eef6f0` | `studioColors.successWash` | ok checklist row background |
| `#8a5416` | `studioColors.warn` | AI action text, warn checklist icon |
| `#f8ecd8` | `studioColors.warnWash` | AI action background, quota chips |
| `#b4514a` | `studioColors.danger` | delete buttons, critical grade |
| `#4a7a8c` | `studioColors.info` | the enterprise template accent (already in `templates.ts`) |

Eleven mockup values have no token. Put them in a new
`components/resume-studio/studio-theme.ts` that imports `design.ts`, exports them
as named constants with a one line reason each, and never repeats a raw hex in a
component:

| Constant | Value | Reason |
| --- | --- | --- |
| `previewWell` | `#dedbd0` | the recessed ground the paper floats on; darker than `canvas` on purpose so the white sheet reads as paper |
| `chipTint` / `chipTintBorder` | `#eef4f2` / `#d7e5e1` | skill chip, one step lighter than `accentWash` |
| `addBtnBorder` | `#cfe0da` | add button hairline |
| `dashedBorder` | `#c9cdc4` | dashed new button |
| `dashedChipBorder` | `#cdd2c8` | dashed suggestion chip |
| `tabInactiveBg` / `tabInactiveText` | `#faf8f2` / `#6b7671` | inactive rail tab |
| `scrollThumb` | `#d3d0c6` | custom scrollbar thumb |
| `gradeSolid` / `gradeFair` | `#2f8f6a` / `#c99a2e` | the two middle grade bands; `success` is too green for solid and `warn` is too dark for a ring |
| `warnRowBg` / `warnRowBorder` | `#fbf1ec` / `#efd9cd` | warn checklist row |
| `infoRowBg` / `infoRowBorder` | `#faf6ea` / `#eee0c2` | info checklist row |
| `matchOk*` / `matchGap*` | `#e4f2e9`/`#bfe0cc`/`#256b42` and `#fbe6e4`/`#edc4c0`/`#9c3b34` | keyword chips; deliberately lighter than the semantic tokens so a wall of them does not shout |

`studioPane` from `design.ts` is the base for the section card and both rail
cards; only `border-radius` and `padding` are overridden per 2.1 and 2.7.

---

## 4. Feature list: BUILD or SKIP

### 4.1 Editor shell and panes

| # | Feature | Call | Reasoning |
| --- | --- | --- | --- |
| 1 | Three pane grid `1fr / 1.05fr / 340px` (direction 1b) | **BUILD** | The whole point of the redesign; replaces the current `250px / 1fr / 400px` document list grid. |
| 2 | Independently scrolling form pane at `calc(100vh - 150px)` | **BUILD** | Keeps the preview and score in view while editing a long resume. |
| 3 | Sticky copilot rail at `top: 80px` | **BUILD** | The score must never scroll away; it is the feedback loop. |
| 4 | Live paper preview pane with a real `816px` sheet and `transform: scale()` | **BUILD** | The mockup's fixed `524px` sheet is a fake; real geometry from `templates.ts` is what makes preview and PDF agree. |
| 5 | Page break guides on the sheet | **BUILD** | Answers "does this fit on one page" without an export round trip. Not in the mockup. |
| 6 | Responsive collapse with an Edit / Preview / Insights segmented control | **BUILD** | The mockup has no breakpoints at all; the studio has to work at 320px. |
| 7 | `crIn` view transition, `crRing` ring sweep, `crBar` bar fill, `crPulse` save dot | **BUILD** | Cheap, compositor friendly, and the pulse is the only thing communicating autosave. Gated on `prefers-reduced-motion`. |
| 8 | `cr-scroll` custom scrollbar | **BUILD** | Two independently scrolling panes need quiet scrollbars or the layout reads as broken. |
| 9 | Bespoke global header with brand, 4 tab nav, credits pill, avatar | **SKIP** | We are inside the authenticated dashboard shell; a second header is duplicate chrome and a second nav model. |
| 10 | Dark marketing footer | **SKIP** | Site already has one, and it does not belong on a working surface. |
| 11 | `localStorage` persistence of the whole resume | **SKIP** | Documents are already persisted server side per user with debounced autosave and retry. |
| 12 | `window.print()` as the export | **SKIP** | A real `@react-pdf` export route already exists at `documents/[id]/pdf`. |

### 4.2 Form pane

| # | Feature | Call | Reasoning |
| --- | --- | --- | --- |
| 13 | Contact card, 2 column grid, LinkedIn full width | **BUILD** | Direct restyle of the existing contact section. |
| 14 | Summary card with a live character counter | **BUILD** | Counter is free feedback; keep the existing `2000` cap rather than the mockup's 600. |
| 15 | Experience entries with Add role, per role Move up, Move down, Delete | **BUILD** | Reordering is new and genuinely useful; the current editor cannot reorder roles. |
| 16 | Achievement bullets with Add and Remove per bullet | **BUILD** | Already exists; restyle to the bullet row spec. |
| 17 | Per bullet sparkle button that jumps to the matching AI rewrite | **BUILD** | Keeps the mockup's affordance without a new endpoint: the button is enabled only when the last AI review returned a `rewrittenBullets` entry for that bullet, and it focuses that card in the Review tab. |
| 18 | Per bullet on demand AI rewrite that calls the model per click | **SKIP** | Quota is one review per document, not one per bullet; per click calls would burn the daily allowance in seconds and there is no per bullet endpoint or prompt. |
| 19 | Licenses, Certifications, Education cards with grid rows and Delete | **BUILD** | Restyle of existing sections onto the grids in 2.4. |
| 20 | Skills as removable chips, Enter to add, Add button | **BUILD** | Straight upgrade over a comma string; maps cleanly onto `skills: string[]`. |
| 21 | Skill suggestion chips, filtered against current skills, capped at 4 | **BUILD** | Static PMHNP vocabulary, no AI call, and it directly moves the scorer's clinical scope dimension. |
| 22 | Debounced autosave with retry and doc id guards | **BUILD (preserve)** | Already correct in `SectionEditor.tsx`. Do not touch the timing constants (`1200ms` / `4000ms`) or the guards. |

### 4.3 Copilot rail

| # | Feature | Call | Reasoning |
| --- | --- | --- | --- |
| 23 | Always visible ATS score ring with animated sweep, grade word, summary line | **BUILD** | The single most important element of the redesign. |
| 24 | Live client side scoring as you type | **BUILD** | `scoreResumeText()` is a pure deterministic function, so it can run in the browser on `sectionsToText(sections)` with zero API cost; the `/score` route stays the authoritative path for persisted analyses. |
| 25 | Improvement checklist rows with severity colors, driven by scorer dimensions | **BUILD** | Turns the eight dimension findings into an ordered work list. |
| 26 | Points chip on each checklist row (`+N pts`) | **BUILD** | Not in the mockup. Makes the score legible as a set of moves rather than a verdict. |
| 27 | Design tab: template picker with 5 mini thumbnails | **BUILD** | `RESUME_TEMPLATES` already has exactly these five. |
| 28 | Design tab: heading font picker previewing its own face, with the PDF mapping fine print | **BUILD** | `RESUME_FONTS` exists and the `pdfFamily` mapping should be stated honestly in the UI. |
| 29 | Design tab: density (Roomy / Compact) and paper (Letter / Legal) pills | **BUILD** | `RESUME_DENSITIES` and `RESUME_PAPERS` exist and both feed the PDF. |
| 30 | Design tab: six accent color swatches | **SKIP** | `styleConfig` is contractually `{font, density, paper}` and each template carries a fixed accent; adding a sixth style axis forks preview and PDF, which is exactly what the shared contract exists to prevent. |
| 31 | Design tab: separate Text size S / M / L | **SKIP** | `RESUME_DENSITIES` already sets `bodyPt`, `namePt`, `headingPt`, leading, gaps, and margin together. A second independent size axis would let a user pick combinations the PDF cannot reproduce. |
| 32 | A4 paper option | **SKIP** | `RESUME_PAPERS` is Letter and Legal; the audience is United States clinical hiring. |
| 33 | Sixth "Compact" template | **SKIP** | Duplicates the Compact density; the two controls would contradict each other. |
| 34 | Review tab with the deep AI review escalation button and remaining count | **BUILD** | Already wired to `/api/resume-studio/review` with quota badges. |
| 35 | Tailor tab: paste box, keyword match percentage, animated bar, matched and missing chips, suggested bullets with Insert | **BUILD** | This is direction 1d's substance and it maps exactly onto the existing `keywordAlignment[]` and `tailoredBullets[]` response. |
| 36 | Standalone `/tailor` route at `max-width: 1080px` | **SKIP** | Splits the document context across two pages and hides the live preview at the exact moment the user is inserting bullets into it. The rail tab keeps the sheet visible. |
| 37 | Cover letter tab, result opens in the modal | **BUILD** | The modal is a better read surface for 250 words than a `340px` rail column. |
| 38 | Tools tab as a launcher for tailor, cover letter, interview prep | **SKIP** | Its two shippable entries are already first class tabs with quota badges and an `aria-live` region; a launcher would be a click tax. |
| 39 | Interview prep (question list plus angle notes) | **SKIP** | Needs a new AI task, prompt directory, quota bucket, feature flag, and endpoint, none of which exist. This is a feature addition wearing a redesign's clothes. Top candidate for the next milestone. |
| 40 | Always mounted `aria-live` results region and quota badges | **BUILD (preserve)** | Already correct in `InsightRail.tsx`. Never unmount it on tab change. |
| 41 | Daily allowance card wired to `/usage` | **BUILD** | Real data, already exposed, and it makes the free vs metered split honest. |
| 42 | `alert()` for exhausted quota | **SKIP** | Replaced by the inline quota card in 2.17. |

### 4.4 Document library (direction 1c)

| # | Feature | Call | Reasoning |
| --- | --- | --- | --- |
| 43 | Resume cards with name, default star badge, relative updated time, ATS score badge, Edit button | **BUILD** | Replaces the current plain list rail; the score badge per document is the useful part. |
| 44 | `{n} of 10` counter | **BUILD** | `MAX_DOCUMENTS = 10` already exists. |
| 45 | "+ New from profile" dashed button plus "Start blank" | **BUILD** | `createDocument({ seedFromProfile })` already supports both. |
| 46 | Duplicate, rename inline, set default, delete | **BUILD (preserve)** | Already built against `documents/[id]` and `duplicate`. |
| 47 | Smart match banner: "N open postings fit your default resume, top match 94%" | **SKIP** | There is no resume to job matching engine; the percentage would be invented, and invented numbers are exactly what the stats policy forbids. |
| 48 | Recent activity feed | **SKIP** | No activity log table exists. Rendering a plausible feed would be fabricated history. |
| 49 | Global "N AI credits left" header pill | **SKIP** | Quota is per feature with independent caps and reset times; one summed number would be wrong for every individual tool. The allowance card (41) is the correct surface. |

### 4.5 Team and enterprise (direction 1e)

| # | Feature | Call | Reasoning |
| --- | --- | --- | --- |
| 50 | Team workspace route and ENTERPRISE pill | **SKIP** | Single candidate product; there is no organization entity. |
| 51 | Seat counters and team stat tiles | **SKIP** | No seats, no billing, no org membership. |
| 52 | Members table with per member credit bars, roles, invite | **SKIP** | No org membership or role model. |
| 53 | Shared credit pool | **SKIP** | Quota is per user per day in Redis; there is no pooled balance to draw from. |
| 54 | Approved and locked org templates, template governance | **SKIP** | `RESUME_TEMPLATES` is a static registry with no ownership or approval state. |
| 55 | SAML SSO, SCIM provisioning, data retention configuration rows | **SKIP** | Auth is a single user session; none of this infrastructure exists. |
| 56 | Billing | **SKIP** | No payment infrastructure. The candidate tools are free. |

### 4.6 Copy corrections (mandatory before any string ships)

The mockup's copy uses em and en dashes throughout. House rule forbids both in
user facing copy. Every carried over string must be rewritten. Dash characters
are described rather than typed below so the repo stays greppable.

| Mockup string | Replacement |
| --- | --- |
| "Your psychiatric-nursing career workspace (em dash) resumes, matches, and AI insights in one place." | "Your psychiatric nursing career workspace: resumes, matches, and AI insights in one place." |
| Resume card name "PMHNP (em dash) Default" | "PMHNP, Default" |
| Ring summary "Strong (em dash) a few tweaks left." | "Solid. A few tweaks left." |
| Scorer copy "Summary is long (em dash) trim to keep it scannable." | "Summary is long. Trim it to keep it scannable." |
| Scorer copy "Aim for 2(en dash)4 sentences (180(en dash)600 chars)" | "Aim for 2 to 4 sentences, roughly 180 to 600 characters." |
| Preview date range "Jan 2022 (en dash) Present" | "Jan 2022 to Present" |
| Preview certification "PMHNP-BC (em dash) ANCC" | "PMHNP-BC, ANCC" |
| Preview education "MSN, Psychiatric-Mental Health (em dash) University of Texas, 2020" | "MSN, Psychiatric-Mental Health, University of Texas, 2020" |
| Coverage label "Missing (em dash) add these" | "Missing, add these" |
| Tools row "Match keywords (ampersand) gaps" | "Match keywords and gaps" |
| CTA "Open Resume Studio (arrow)" | "Open Resume Studio" with a lucide `ArrowRight` icon |

Hyphens inside real terms stay: "trauma-informed", "board-certified",
"PMHNP-BC", "Psychiatric-Mental Health", "measurement-based care".

Verify with a literal character grep over `components/resume-studio/`,
`lib/resume-studio/`, and `app/dashboard/resume-studio/` before finishing.

**Credential line decision.** The mockup stores a free text `credential` field on
the resume. `ResumeSections.contact` has no such field and the shared contract is
not being changed. Derive the preview's credential line instead: take the first
certification `name`, else the first license `licenseType`, joined with the
license state when both exist. Render nothing when neither exists. This keeps
the schema stable and keeps the line accurate by construction.

**Emoji decision.** The mockup uses emoji for every icon. Replace all of them
with `lucide-react` icons already used in this codebase: `AlertTriangle`,
`Lightbulb`, `CheckCircle2`, `Sparkles`, `Target`, `Mail`, `Trash2`, `ArrowUp`,
`ArrowDown`, `X`, `Check`, `Plus`, `Download`, `Star`, `FileText`, `Loader2`,
`RefreshCw`. Sizes: `12px` inside chips, `14px` in checklist rows, `16px` in
buttons and tool rows, `18px` in the modal head.

---

## 5. Interaction details

### 5.1 What updates live as you type

| Trigger | Latency | Effect |
| --- | --- | --- |
| Any keystroke in any field | immediate, no debounce | Local `sections` state updates and the paper preview re rerenders. This is the headline behavior of direction 1a and it must never feel delayed. |
| Any keystroke | `400ms` trailing debounce | `sectionsToText()` then `scoreResumeText()` run on the client; the ring animates to the new offset and the checklist reorders. |
| Any keystroke | `1200ms` trailing debounce | `PATCH documents/[id]` with `sections`; save state goes `saving`, then `saved`, and on failure `retrying` with a `4000ms` retry. Existing logic; do not change. |
| Template, font, density, or paper click | immediate | Local style state updates and the paper rerenders in the same frame. |
| Same click | `600ms` trailing debounce | `PATCH documents/[id]` with `{ template }` and `{ styleConfig }`. On failure, revert the local style to the last confirmed server value and show the error notice. |
| Skill added or removed | immediate | Chip list and preview skills line update; score recompute follows the `400ms` path. |
| Bullet insert from Tailor | immediate | Text is unshifted into `experience[0].bullets`, the form pane scrolls that textarea into view, the textarea receives focus, and its border flashes `studioColors.accent` for `800ms`. |

### 5.2 Hover, active, selected, focus

| Element | Hover | Active or selected | Focus visible |
| --- | --- | --- | --- |
| Resume card | `border-color: accent; background: surfaceAlt`, `transition: .15s` | Default card carries the accent wash badge | `outline: 2px solid accent; outline-offset: 2px` on the card's primary control |
| Template card | unselected: `border-color: #cfe0da` | `border-color: accent` plus `box-shadow: 0 0 0 2px {accent}33` and the accent tinted label strip | outline on the button |
| Segmented pill | off state gains `background: #faf8f2` | on state is solid accent with white text | outline |
| Rail tab | `background: #f2efe6` | white background, accent dark text, `2px` accent underline | outline inset by `-2px` so it does not clip |
| Icon button | `background: #f7f4ec`; destructive `background: #fbf1ec` | pressed: `transform: translateY(1px)` | outline |
| Primary button | `background: studioColors.accentDark` | pressed: `transform: translateY(1px)`; disabled: `opacity: .6; cursor: not-allowed` | outline with `outline-offset: 2px` |
| Outline accent button | `background: studioColors.accentWash` | same pressed rule | outline |
| Skill chip remove | `color: studioColors.danger` | n/a | outline around the chip |
| Suggestion chip | `border-style: solid; background: studioColors.surface` | n/a | outline |
| Input and textarea | `border-color: #d5cfc0` | n/a | `border-color: accent` plus `box-shadow: 0 0 0 3px rgba(13,107,98,.12)` |
| Move up / move down | as icon button | first role's up and last role's down are `disabled` | outline |

All transitions are `150ms` or shorter and touch only `background-color`,
`border-color`, `color`, `opacity`, `box-shadow`, and `transform`. No layout
property is animated anywhere.

### 5.3 Keyboard

- Tab order follows the visual order: toolbar, form pane top to bottom, then the
  rail. The preview pane is not a tab stop; its scroll container gets
  `tabindex="0"` and `role="region"` with an `aria-label` so keyboard users can
  scroll it.
- Rail tabs: left and right arrows move selection, `Home` and `End` jump to the
  first and last tab, activation is automatic on selection.
- Skills input: `Enter` adds and clears; a duplicate (case insensitive) is
  rejected with an inline `12px` note in `studioColors.danger` and the input is
  not cleared.
- Modal: `Escape` closes, focus is trapped, focus returns to the trigger.
- Segmented control below `1280px`: arrow keys move between panes.
- Every icon only control has an `aria-label`; move buttons read
  "Move role {n} up" and "Move role {n} down".

### 5.4 Announcements

- The existing always mounted `aria-live="polite"` region in `InsightRail`
  carries: score changes ("Resume score {n} out of 100, {grade}"), AI result
  ready, quota exhausted, and save failures.
- Save state changes announce through a separate `aria-live="polite"` on the
  toolbar's save row.
- Score updates are throttled to at most one announcement every `2000ms` so
  typing does not flood a screen reader.

---

## 6. Files to create and change

| Path | Action |
| --- | --- |
| `components/resume-studio/studio-theme.ts` | **New.** Derived style objects and the eleven untokenized constants from 3.2. No raw hex anywhere else. |
| `components/resume-studio/ResumePreview.tsx` | **New.** The paper sheet. Consumes `resolveResumeStyle()` and `ptToPx()` only. |
| `components/resume-studio/ScoreRing.tsx` | **New.** SVG ring per 2.7. |
| `components/resume-studio/ImprovementList.tsx` | **New.** Checklist rows per 2.8, fed by `ResumeScoreDimension[]`. |
| `components/resume-studio/DesignPanel.tsx` | **New.** Template, font, density, paper pickers per 2.11. |
| `components/resume-studio/StudioModal.tsx` | **New.** Accessible dialog per 2.16. |
| `components/resume-studio/ResumeStudio.tsx` | **Rewrite** the shell and grid. Keep document CRUD and state ownership. |
| `components/resume-studio/SectionEditor.tsx` | **Restyle**, add role reorder and skill chips. Do not touch autosave timing, retry, or doc id guards. |
| `components/resume-studio/InsightRail.tsx` | **Extend**: lift the score card out of the tab set, add the Design tab, restyle. Keep the always mounted `aria-live` region and the quota badges. |
| `components/resume-studio/studio-api.ts` | **Extend**: replace the local `ResumeTemplate = 'classic' \| 'compact'` union with `ResumeTemplateId` imported from `lib/resume-studio/templates` (a pure data module, safe to bundle client side), and add `styleConfig: ResumeStyleConfig` to `ResumeDocument` and `styleConfig?: Partial<ResumeStyleConfig>` to `DocumentPatch`. |
| `lib/resume-studio/pdf.tsx` | **Rewrite the style layer** to consume `resolveResumeStyle()` so every point value comes from the same registry as the preview. |

### 6.1 Two migration notes

1. **Name collision.** `templates.ts` exports an interface named `ResumeTemplate`
   (the object) while `studio-api.ts` exports a type of the same name (the id
   union). Rename the client one to `ResumeTemplateId` and re export it from
   `studio-api.ts` for existing importers.
2. **Legacy `template: 'compact'` rows.** `getTemplate()` falls back to `classic`
   for unknown ids, so existing documents keep rendering. Recommended one time
   backfill, operator gated: set `template = 'enterprise'` and
   `styleConfig.density = 'compact'` for any document currently at `'compact'`,
   which preserves the visual intent (tight leading, more per page). Do not run
   this automatically.

---

## 7. Definition of done

- `npx tsc --noEmit` returns zero errors outside `.next/dev/types`.
- A literal grep for the em dash and en dash characters over
  `components/resume-studio/`, `lib/resume-studio/`, and
  `app/dashboard/resume-studio/` returns nothing.
- No horizontal scrollbar on the document body at `320px`, `375px`, `768px`,
  `1024px`, `1440px`.
- Every interactive element is reachable and operable by keyboard with a visible
  focus indicator.
- The always mounted `aria-live` region in `InsightRail` is present in the DOM on
  every tab, including before any AI call has run.
- Autosave still debounces at `1200ms`, still retries at `4000ms`, and still
  discards responses whose document id does not match the current document.
- Changing template, font, density, or paper changes the preview and the exported
  PDF identically, because both read `resolveResumeStyle()`.
- `prefers-reduced-motion: reduce` removes every animation named in 2.14.
