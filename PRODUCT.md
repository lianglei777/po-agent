# Product

## Register

product

## Users

Solo developers running Pi Agent locally through a desktop Web workspace to write, edit, and review code alongside an AI assistant. They are in a focused, screen-heavy workflow — often with an editor, terminal, and browser open at the same time — and need a reliable surface for managing projects and sessions, inspecting files when needed, and reviewing generated changes.

## Product Purpose

Po Agent is the local desktop Web interface for the Pi coding agent. It turns projects and agent sessions into a navigable, inspectable workspace: start a session, watch the agent's reasoning and tool calls, open the current project's file or Skill panel when needed, configure model providers, and resume or fork past sessions. The interface exists to keep the developer in control, not to entertain them.

## Brand Personality

Clean, smart, lightweight, trustworthy.

Voice is quiet and confident. The UI gets out of the way so the user can focus on code and decisions. Every visual choice should feel intentional and load-bearing — no decoration for its own sake. A restrained Codex-blue accent signals focus and live state; the near-black primary action signals commitment.

## References

Ant Design 6 and its enterprise product patterns are the primary reference. Focused productivity tools such as Linear, Vercel, and Notion remain secondary references for density without clutter.

## Anti-references

- Overly friendly AI assistant UI: chatty mascots, emoji overload, bubbly rounded everything, anthropomorphic flourishes.
- SaaS landing-page clichés: big hero metrics, gradient text, glassmorphism, purple-blue gradients, animated explainers.
- Dark-mode gamer aesthetic: neon accents, high chroma, aggressive shadows, "cyber" styling.

## Design Principles

1. **Information density is a feature.** Project and session navigation stay visible, while Chat, configuration, and the optional Project panel reveal only the files or Skills needed for the current task.
2. **Quiet surfaces, active states.** At rest the UI is neutral and breathable; blue appears only for focus, links, switches, live state, and explicit status.
3. **The agent is a tool, not a character.** No personality avatars, no confetti, no cheerleading copy.
4. **Respect system conventions.** Support reduced motion and keep keyboard paths obvious.
5. **Ant Design by default.** Use Ant components, icons, tokens, typography, feedback, and interaction patterns for standard UI. The primary `#1677ff` communicates actions and state; custom UI is reserved for real Po Agent domain behavior.
6. **Stable workflows over novelty.** Preserve Chat state and established operation paths while central workspace views change; configuration navigation must not interrupt a running conversation.
7. **Explicit destructive actions.** Important deletion, credential removal, and disconnect operations require confirmation with concrete action language.
8. **Dialogs close deliberately.** Dialogs remain open on backdrop clicks and Escape; users leave through visible close, cancel, save, or confirmation actions.
9. **Sessions are capability containers.** A persisted session can expose both Chat and content-generation views. Creating a session does not permanently assign it to one interaction mode.

## Accessibility & Inclusion

- Target WCAG 2.1 AA for contrast and focus visibility.
- Keep keyboard navigation and visible focus states intact across panels, dialogs, and tooltips.
- Support reduced motion: disable or replace non-essential animations when `prefers-reduced-motion: reduce` is set.
- Never discard unsaved configuration changes without an explicit confirmation.
