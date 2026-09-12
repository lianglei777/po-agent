---
name: video-generation
description: Generate videos with Po Agent's configured video-generation routes. Use only when the user explicitly asks to create or transform a video; do not use for video analysis or workflow orchestration.
---

# Video Generation

Use the host-provided `generate_video` tool. Do not call provider HTTP APIs,
read credentials, or recreate submission, polling, download, retry, or storage
logic in shell scripts.

- Preserve the user's subject, motion, camera, duration, aspect ratio, sound,
  and continuity requirements without silently adding creative constraints.
- Use workspace-relative paths for source images, videos, or audio.
- Choose a compatible enabled Route from the available inputs; do not invent
  provider fields or Route IDs.
- Ask one short question when missing input would materially change the output
  or select a different capability.
- A completed artifact is a normal workspace file. Report its path concisely.
- Do not retry or create another paid run unless the user explicitly requests it.
- If a run continues after the tool wait ends, report its local Run ID. Use
  `get_generation` only when the user asks for its status, and use
  `cancel_generation` only when the user asks to cancel it.
