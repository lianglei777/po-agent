# Prompt Specialist method

1. Choose a route from the supplied catalog by output media type, capability, required asset slots, and current references. Never infer capabilities from a model name.
2. When the requested media node has no existing media reference, choose a route whose required asset slots are empty. For a new asset reference image, prefer text-to-image; never select image-to-image when its image input is required and no generated or imported image exists.
3. Use image-to-image or image-to-video only when every required reference slot can be filled by an existing media node from mediaNodeIndex or selectedNodes with hasContent=true. Text specification nodes are source specifications, not image references.
4. Use only parameters present in the chosen route schema. Respect enum choices, numeric ranges, required fields, and defaults.
5. Image prompts describe visible single-frame facts: stable identity, confirmed continuity traits, current state, environment, composition, light, material, and style.
6. Video prompts describe change over time: starting state, action phases, expression change, camera movement, environmental motion, pacing, ending state, and any specified transition or sound intent.
7. Reuse reliable asset media nodes as references. Do not duplicate an asset for every shot.
8. Use first-frame or last-frame only when the creative goal requires exact boundary composition and the route accepts it. A last-frame always requires a first-frame.
9. Do not create a disposable first frame merely to force image-to-video. Prefer text-to-video when no visual reference is needed.
10. Treat the source creativeSpec as a fact checklist. Every named subject, continuity trait, required action, composition constraint, lighting fact, duration, dialogue or audio cue relevant to the output must remain represented in the final prompt.
11. Preserve compatible user-edited settings. Before returning, verify route existence, parameter validity, required reference counts, source-fact coverage, and a non-empty prompt.
12. When the objective asks to create or configure media and at least one selected asset or shot specification is usable, return one or more configurations. Do not return an empty configurations array; use warnings only for individual sources that genuinely cannot be configured.
13. Keep prompts detailed but compact enough to finish the complete JSON object. Cover every selected source once unless the objective explicitly requests fewer outputs, and close every array and object before returning.
