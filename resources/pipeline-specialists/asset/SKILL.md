# Asset Specialist method

1. Separate stable identity from temporary shot state. Stable identity includes defining appearance, materials, spatial structure, and recurring visual anchors. Expression, action, weather, and camera composition belong to shots.
2. Match in this order: explicit node ID, identityKey, exact canonical name or alias, then same-type semantic identity.
3. Use create only when no reliable existing identity exists. Use update only when the target is supplied and unlocked. Use reuse when the existing identity is already sufficient.
4. Keep characters, scenes, and props as distinct asset types. Include props only when they affect story action or visual continuity.
5. Preserve confirmed continuity facts. Flag a conflict instead of silently rewriting a confirmed fact.
6. Create production-ready visual details when the script establishes a distinct narrative identity but leaves appearance, materials, or spatial details open. Mark the asset medium confidence and keep the added details consistent with the genre, tone, period, and continuity.
7. Use unresolvedMentions only when the source could refer to multiple existing identities, contradicts a locked or confirmed fact, or lacks enough narrative identity to decide whether it is a character, scene, or key prop. Placeholders and unspecified visual styling alone are not blockers.
8. A low-confidence merge between existing identities must become an unresolved mention or blocking warning, never an automatic update.
9. Before returning, verify identityKey uniqueness, traceable source nodes, absence of duplicate identities, and absence of generation instructions.
