# Onboarding photos

All 14 JPG files in this directory are **AI-generated** using OpenAI's built-in
`image_gen.imagegen` tool on **2026-10-12**, following the supplied NiX photo brief.
They replace the five previous Unsplash placeholders and add six memory photos
and three avatars. The people are fictional.

- Scenes: `welcome.jpg`, `capture.jpg`, `ephemeral.jpg`, `chat.jpg`, `memories.jpg`.
- Memories: `memory-coffee.jpg`, `memory-dog.jpg`, `memory-skate.jpg`,
  `memory-cake.jpg`, `memory-city.jpg`, `memory-hike.jpg`.
- Avatars: `avatar-o.jpg`, `avatar-k.jpg`, `avatar-m.jpg`.

Full-quality masters live in [`source/`](source/). The app bundles light copies (this folder) and the
website serves its own (`web/site/img/`); both are exported by `npm run brand:onboarding`
(`scripts/brand/export-onboarding.sh`) — edit the masters, then re-run it.

Masters are delivered as JPEG with an embedded sRGB profile. Scene files are 1179 × 2556 px;
avatars are 1024 × 1024 px. Generated sources were resampled and minimally
center-cropped for these delivery dimensions; all files are under 1.5 MB.

Review corrections on 2026-10-12, also with `image_gen.imagegen`: removed branding
from the seated friend's shoes and black shirt in `memory-skate.jpg`; replaced
recognizable Prague landmarks with generic Central European buildings in
`capture.jpg` and `memory-city.jpg`.

Exact generation and correction prompts: [GENERATION_PROMPTS.json](GENERATION_PROMPTS.json).
