# ADR 0002: Adopt Ant Design as the standard UI system

## Status

Accepted.

## Context

Po Agent had a collection of local Tailwind and Radix primitives with project-specific visual contracts. That gave detailed control but duplicated established component behavior, increased design decisions at each feature, and made AI-authored UI less predictable. The product needs a well-documented, widely validated standard without losing existing agent workflows or safety behavior.

## Decision

Adopt Ant Design 6 as the default component and design system, including standard components, typography, semantic colors, spacing, feedback, accessibility behavior, and interaction patterns. Use Lucide as the product icon system so feature work has a broader, visually consistent icon vocabulary.

- Next.js App Router uses `@ant-design/nextjs-registry` for SSR styles.
- A root `ConfigProvider` owns locale, component size, and theme tokens; `App` provides contextual feedback APIs.
- Standard controls use Ant Design. Product code imports Lucide icons through `src/components/icons.ts`; Ant Design may retain `@ant-design/icons` internally for its own component rendering.
- Existing `src/components/ui` exports may act as compatibility adapters while feature call sites migrate. They must delegate behavior to Ant Design instead of recreating it.
- Domain-specific components remain custom where Ant Design has no suitable equivalent. The workspace splitter and specialized chat/file rendering are current examples.
- Existing product invariants override library defaults when necessary. In particular, dialogs do not close from Escape or backdrop clicks, disabled actions explain their reason, destructive actions remain explicit, and input focus/selection behavior is preserved.
- Tailwind remains available for workspace composition and domain surfaces, not for restyling Ant component internals.

## Consequences

The project gains a shared vocabulary, official documentation, stable accessibility behavior, localization support, and more predictable AI-generated UI. The application bundle grows and custom compatibility adapters require temporary maintenance. Visual details change toward Ant Design defaults, and future upgrades must be verified against product invariants and regression tests.

## Migration policy

Migration is incremental on `feature/antd-migration`: infrastructure first, then shared primitives and icons, then feature call sites, followed by dependency cleanup and browser regression. A feature is considered migrated only when its behavior remains intact and its standard controls are Ant-backed.
