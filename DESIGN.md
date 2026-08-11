---
name: Po Agent
description: An Ant Design 6 desktop workspace that preserves Po Agent's precise, dense, developer-controlled workflows.
colors:
  light:
    workspace: "#f5f5f5"
    canvas: "#ffffff"
    panel: "#ffffff"
    elevated: "#ffffff"
    subtle: "#fafafa"
    hover: "#f5f5f5"
    selected: "#e6f4ff"
    text: "#1f1f1f"
    muted: "#595959"
    dim: "#8c8c8c"
    borderSubtle: "#f0f0f0"
    borderStrong: "#d9d9d9"
    borderEmphasis: "#1677ff"
    accent: "#1677ff"
    accentHover: "#4096ff"
    accentDeep: "#0958d9"
    accentSoft: "#e6f4ff"
    accentForeground: "#ffffff"
    destructive: "#ff4d4f"
    success: "#52c41a"
    warning: "#faad14"
typography:
  ui: "-apple-system, BlinkMacSystemFont, Segoe UI, Inter, PingFang SC, Microsoft YaHei, sans-serif"
  mono: "Noto Sans Mono, JetBrains Mono, Fira Code, Consolas, monospace"
radius:
  small: "6px"
  control: "6px"
  floating: "8px"
  composer: "22px"
motion:
  fast: "150ms"
  standard: "200ms"
  slow: "220ms"
---

# Design System: Po Agent

## Direction

Po Agent fully adopts Ant Design 6 as its standard component library and design language. Ant Design supplies standard controls, icons, typography, spacing, color semantics, interaction patterns, accessibility behavior, and design guidance. Po Agent keeps its domain-specific workspace composition and safety rules: adopting a design system must not change sessions, chat, files, models, Skills, review flows, persistence, or destructive-action semantics.

## Sources of truth

- Use the installed `antd` package, its TypeScript types, the official component documentation, and `https://ant.design/llms-full.txt` before relying on remembered APIs.
- Use Ant Design MCP when available to inspect component APIs, tokens, examples, and migration guidance.
- `ConfigProvider` owns locale, global component size, and theme tokens; `App` owns contextual feedback APIs; `AntdRegistry` supplies Next.js App Router SSR styles.
- Prefer Ant Design components and `@ant-design/icons` for standard UI. Keep custom primitives only for Po Agent-specific behavior with no suitable Ant equivalent, such as workspace split handles, chat execution rendering, and the project file tree.
- Compatibility wrappers in `src/components/ui` preserve existing call sites during migration. New standard UI should use Ant Design APIs directly unless a wrapper enforces a real product invariant.

## Workspace architecture

- The primary navigation rail owns projects, Settings, and locale. Its bottom actions are icon-only and horizontal; System Prompt lives inside Settings. The user collapse action fully hides the rail. Its reveal control moves into a dedicated top row of the visible Conversation panel; when Conversation is also hidden, the control falls back to the Chat top bar and is separated from the distinct conversation-list control. Compact icon mode remains automatic on narrower workspaces.
- The project Conversation panel owns New chat, session search, and the current project's session tree. It is independently resizable and closable so project selection and conversation selection remain separate concepts.
- Chat uses one continuous white workspace surface containing the project Conversation panel and the conversation canvas. Resize handles show a subtle `border-subtle` resting line so the panel boundary and drag affordance stay discoverable; the line emphasizes to `border-emphasis` on hover and drag.
- A persisted Session may switch between Chat and Generate from a compact control in the workspace top bar. The switch changes the center view without creating another Session or discarding Chat state; Generate selects a capability within the Session instead of binding the Session to one API at creation time.
- Settings is an exclusive full-screen application state with an explicit Exit Settings action. The project navigation, Conversation panel, Chat, and Project dock are hidden while Settings is visible, while Chat remains mounted to preserve its state.
- A permanent right-side Project dock exposes Files, Skills, and Project Settings as vertical tabs. The dock and expanded inspector are one continuous white surface, with the resize handle placed only between Chat and the complete right-side surface. Selecting a tab opens a resizable inspector; selecting the active tab or its close button collapses it.
- On narrow workspaces, the Project inspector becomes an overlay so Chat retains a usable minimum width. Its active tab, open state, rail state, and user-adjusted widths survive reloads.
- The minimum supported viewport width is 1024px; there is no mobile-specific layout.
- Projects and sessions use compact single-line rows. Secondary metadata must not overpower titles or displace row actions.
- The File tree is the inspector's primary surface when no file is open. When previewing a file, it adapts between 152px and 192px and can be collapsed so the preview remains usable. Managed generation run directories stay isolated on disk, while the tree flattens completed runs that contain only artifact files and orders them newest first. Skills uses single-column list, detail, and add states rather than nesting another settings rail inside the inspector.

## Project dock and inspector

- Files, Skills, and Project Settings are sibling tabs because all three are interpreted relative to the selected project.
- The Skills tab shows the effective Skill set for that project: project-scoped, global, built-in, and Skill Pack-provided Skills.
- Project installation means only the selected project. Global installation means every project, including projects added later. Installation controls must name both the selected project and the global effect explicitly.
- Switching projects reloads the effective Skill set and leaves no stale detail from the previous project.
- Opening a file selects Files; opening Skills from Chat selects Skills. The inspector keeps its last selected tab when it is closed and reopened.
- Project Settings reuses the existing project-instructions workflow and preserves its unsaved-change confirmation behavior.

## Token architecture

The dependency direction is:

`base values → semantic tokens → shared UI components → feature surfaces`

Ant Design seed and alias tokens are the upstream source. `ConfigProvider` applies them to Ant components; project semantic tokens bridge domain-specific surfaces and Tailwind layout utilities. Do not override Ant internals with brittle selector-based CSS or introduce one-off colors, radii, shadows, or transition durations.

## Typography

- Use the native system sans stack for all interface text, headings, navigation, forms, and chat prose.
- Paths, code, compact metadata, model identifiers, and technical values use the mono stack.
- Headings use weight 600 with restrained negative tracking; there is no decorative display serif.
- Font sizes use a semantic token scale — do not use arbitrary `text-[Npx]` values:
  - `text-caption` (11px, lh 1.2) — badges, timestamps, micro labels
  - `text-meta` (12px, lh 1.25) — technical metadata, section labels
  - `text-xs` (13px) — sidebar items, compact values
  - `text-body-sm` (14px, lh 1.4) — descriptions, secondary text
  - `text-sm` (15px) — default UI text
  - `text-prose` (16px, lh 1.5) — chat composer body
  - `text-base` (17px) — body prose
  - `text-lg` (19px) — section headings
- Default UI text is 14px (`text-sm`); compact code and technical metadata use 11–12px (`text-caption`, `text-meta`, `text-xs`).
- Body prose should generally remain within 65–75 characters per line.

## Boundaries, shape, and elevation

Use three boundary roles:

1. `border-subtle` for internal dividers, rows, form groups, and message details.
2. `border-strong` for the composer and controls that need stronger structure.
3. A complete border plus `shadow-floating` for Dialogs, Dropdowns, Select content, Tooltips, and Popovers.

- Small icon controls use 6px corners; standard controls use 8px; grouped/floating surfaces use 12px.
- The chat composer is the intentional exception at 22px.
- Pills and circles are reserved for badges, status dots, switches, and the send icon button.
- Resting cards are flat. Shadows appear only where a surface genuinely floats.
- The primary application rail has no enclosing white card, border, or outer radius. Conversation, Chat, Project dock, and the expanded inspector use white surfaces over the gray application background.
- Vertical resize handles remain invisible until hover, keyboard focus, or active dragging.
- Do not use decorative grids, textures, gradients, neon, or layered glass effects.

## Component states

Every interactive component accounts for default, hover, focus-visible, active, selected, disabled, loading, and error states.

- Hover changes tone, not geometry.
- Focus-visible follows Ant Design's accessible primary outline and remains clearly visible.
- Selected navigation follows the appropriate Ant navigation pattern; domain-specific navigation may use the Ant selected blue surface when it improves scanability.
- Disabled controls block interaction and explain the specific reason through visible copy or a tooltip.
- Loading states prevent duplicate actions while keeping labels understandable.
- Error, success, and warning states combine color with text, icon, border, or shape.

## Color usage

Ant Design blue (`#1677ff`) is the primary action, selection, link, focus, switch, and active-state color. Use Ant semantic colors for success (`#52c41a`), warning (`#faad14`), and error (`#ff4d4f`); never communicate status by color alone.

## Chat

- User messages use a compact neutral bubble; assistant answers remain on the canvas without an enclosing decorative card.
- Consecutive thinking and tool activity from one user request is one execution process with one model label.
- The process is open while running and collapses after completion; recoverable tool failures remain local to their step.
- Final answer content stays outside the execution disclosure and remains directly readable.
- Tool rows reserve stable columns for command summary, status, and disclosure controls.
- The floating Composer keeps model, thinking, attachments, queue/steer/stop, and send controls in one compact toolbar. Context compaction remains an automatic runtime concern configured from General settings.
- Generate is a sibling Session view, not a separate Session type. Returning to Chat restores the same conversation, while generation Runs remain associated with the same Session.
- Long conversations use a Codex-style turn navigator overlaid on the Chat panel's right edge. User turns form a quiet continuous rail of short marks; hovering one mark expands nearby marks into a wave and reveals the user prompt plus the following assistant summary. Clicking a mark jumps to that turn without changing panel widths.

## Settings and detail pages

- Settings replaces the workspace chrome with a quiet gray navigation rail and a rounded white settings surface. A visible Exit Settings action returns to the preserved workspace.
- The model-provider editor stays mounted across Settings-section changes so pending configuration is not discarded.
- System Prompt is a directly embedded Settings workbench rather than a primary modal. It keeps effective-prompt preview, global append editing, project-instruction preview, reload state, conflict handling, and unsaved-change protection.
- Settings are grouped into bordered sections with label and description on the left and the control on the right.
- Rows use dividers instead of separate cards. Destructive actions remain visually separated and explicitly confirmed.
- Auto-save status stays in the workspace chrome; do not reintroduce a fake manual-save workflow.

## Dialog safety

- Backdrop clicks and Escape do not close Dialogs.
- A visible close, cancel, save, or confirmation action is always available.
- Unsaved model configuration requires discard confirmation.
- The safe action receives default focus in destructive confirmations.
- Provider deletion, model removal, API key removal, OAuth disconnect, and session deletion require explicit confirmation.

## Motion and accessibility

- State transitions use 150–220ms and animate color, opacity, transform, or short shadows when they communicate state; bounded panel-width interpolation is reserved for workspace layout changes.
- Primary navigation, Conversation, and Project panels use a restrained 220ms reveal and dismissal transition. Width interpolation preserves the workspace layout while a subtle opacity and directional offset clarifies which edge owns the panel.
- `prefers-reduced-motion: reduce` makes non-essential animation near-instant.
- Preserve semantic HTML, accessible names, keyboard paths, visible focus, and WCAG AA contrast.
- Verify 1024px, 1440px, and 1920px desktop widths in both languages.

## Do not

- Do not add unsupported Codex features, placeholder metrics, or controls without real backend behavior.
- Do not create a card for every piece of information.
- Do not use mascot-like elements, playful copy, gradients, neon, decorative textures, or marketing-page patterns.
- Do not silently change business logic, API contracts, cancellation behavior, or operation paths.
