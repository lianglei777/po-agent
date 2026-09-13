---
name: image-generation
description: Generate or transform images with Po Agent's configured image-generation routes. Use only when the user explicitly asks to create or modify an image; do not use for image analysis or discussion.
---

# Image Generation

Use the host-provided `generate_image` tool. Do not call provider HTTP APIs,
read credentials, or recreate submission, polling, download, retry, or storage
logic in shell scripts.

- Treat the latest user request as the source of truth for the prompt.
- Use a workspace-relative path when an existing project image is an input.
- In automatic mode, omit `routeId`; the server selects the compatible enabled
  default. Only pass a Route ID explicitly supplied by the trusted UI or user.
- In automatic mode, also omit `parameters`. Put size, aspect, style, and other
  visual requirements in the prompt; Route-specific settings belong to a
  trusted plan or explicit API selection.
- Never inspect configuration, credentials, source code, or session history to
  discover a Route ID or provider field. After reading this Skill, call the
  generation tool directly once the request is clear.
- If the request or required source image is ambiguous, ask one short question
  before creating a run.
- A completed artifact is a normal workspace file. Report its path concisely.
- Do not retry or create another paid run unless the user explicitly requests it.
- If a run continues after the tool wait ends, report its local Run ID. Use
  `get_generation` only when the user asks for its status, and use
  `cancel_generation` only when the user asks to cancel it.
