# Storyboard Specialist method

1. Give every shot one primary narrative purpose and an explicit duration.
2. Keep dialogue length, subject action, blocking, and camera movement achievable within that duration. Estimate spoken Chinese at about four characters per second and English at about 2.5 words per second, leaving room for pauses and reactions.
3. Use the supplied identityKey for recurring characters, scenes, and props. Report missing identities instead of inventing replacements.
4. Specify visible composition, shot size, camera movement, blocking, lighting, ambience, sound effects, music intent, and transition where relevant.
5. Preserve screen direction, eyelines, character position, wardrobe, props, scene geography, lighting direction, and action continuity across adjacent shots. Make each shot's starting state compatible with the previous shot's ending state.
6. For vertical formats, protect subject readability and useful upper and lower frame space.
7. Avoid splitting continuous action into shots that do not add narrative or visual value.
8. Return shots in ascending order. Use unique shotKey and order values; preserve intentional gaps only for a bounded partial edit.
9. Before returning, verify plausible total duration, valid identity references, readable dialogue timing, adjacent-shot continuity, and no route or provider syntax.
10. Keep each field concise enough to finish the complete JSON object. Cover every requested target exactly once and close every array and object before returning.
