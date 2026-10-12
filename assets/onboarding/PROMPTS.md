# AI image prompts — welcome tour and website

These replace the Unsplash placeholders. They are used in the in-app welcome tour
(`src/components/welcome/`) and on nix.shipapp.pl (`web/site/img/`, via `scripts/generate-site.mjs`).

## Delivery

- **Format:** vertical **9:19.5, 1179 × 2556 px** (or larger at the same ratio), JPG, sRGB, under 1.5 MB.
- **Crops:** each photo is cropped to 3:4 cards and to a 9:19.5 phone screen. Keep the subject in the middle, with
  room around it.
- **Filenames:** the same as today (`welcome.jpg`, `capture.jpg`, …) in `assets/onboarding/`.
- **Web copies:** after swapping, run:
  ```bash
  for f in welcome capture ephemeral chat memories; do sips -s format jpeg -s formatOptions 70 -Z 1200 assets/onboarding/$f.jpg --out web/site/img/$f.jpg; done
  ```
- **Credits:** update `assets/onboarding/CREDITS.md` with the tool, the date and "AI-generated".
- **People:** adults only (early-to-mid twenties). NiX is 16+, so no one in the art may look underage.

## Shared style (append to every prompt)

> Candid photo shot on an iPhone, natural light, real moment, unposed, shallow depth of field, subtle film grain,
> warm natural skin tones with a gentle cool indigo tint in the shadows, contemporary European setting, adults in
> their early-to-mid twenties, diverse, no text, no logos, no brand names, no watermarks, vertical composition,
> subject centered with generous margins.

**Negative prompt (where supported):** text, letters, captions, logo, watermark, brand, app interface, visible
phone screen content, children, teenagers, minors, nudity, alcohol bottles in focus, cigarettes, weapons, extra
fingers, deformed hands, plastic skin, over-smoothed faces, HDR, oversaturated, studio lighting, stock-photo
smile, celebrity likeness.

## Images

| # | File | Where it appears | Prompt |
| --- | --- | --- | --- |
| 1 | `welcome.jpg` | Welcome scene (front card), website hero (front card) | Two close friends taking a selfie together on a wooden pier by a lake at golden hour, laughing mid-moment, one holding the phone at arm's length (back of the phone toward the camera), wind in their hair, sun flare behind them, warm light. |
| 2 | `capture.jpg` | Camera scene (viewfinder), website hero (right card) | What a phone camera sees at a rooftop party at dusk: friends dancing with hands in the air under warm string lights, city skyline glowing behind, slight motion blur on hands, the upper-middle of the frame left calm (a sticker is placed there). |
| 3 | `ephemeral.jpg` | Disappearing scene (it is blurred at the end) | A packed outdoor concert at night seen from inside the crowd, silhouettes and raised hands against deep blue and violet stage lights, light beams and floating confetti, energetic. |
| 4 | `chat.jpg` | Chat avatar of "Ola" (small circle), Memories tiles | Close portrait of a young woman with a warm, natural smile, outdoors in soft golden-hour light, face centered in the upper third, plain softly blurred background, looking just past the camera. |
| 5 | `memories.jpg` | Memories scene, website hero (left card) | Two friends seen from behind, sitting on sea cliffs and photographing the sunset over the ocean with a phone, orange and pink sky, calm water, peaceful nostalgic mood. |

### Optional: more variety in the Memories grid

The grid now repeats photos 1–5. With six more, every tile can be different. Add the files and the code will be wired up.

| File | Prompt |
| --- | --- |
| `memory-coffee.jpg` | Overhead shot of two cups of latte art on a small marble café table by a sunny window, hands reaching in, morning light. |
| `memory-dog.jpg` | A happy golden retriever running along a beach at sunset toward the camera, wet sand reflections. |
| `memory-skate.jpg` | A young adult skateboarding at a concrete skatepark at dusk, mid-trick, friends watching in the background, warm sky. |
| `memory-cake.jpg` | A birthday cake with lit sparklers on a table at a small evening house party, friends' hands clapping around it, faces out of frame, cosy warm light. |
| `memory-city.jpg` | A rainy city street at night with neon reflections on wet pavement, two friends walking under one umbrella, seen from behind. |
| `memory-hike.jpg` | Three friends seen from behind on a mountain summit at sunrise, arms raised, sea of clouds below. |

### Optional: avatars in the camera scene

The camera scene shows three friend avatars ("O", "K", "M") as letters. Generate these three to use photos instead:
square, 512 × 512, a head-and-shoulders portrait, softly blurred background, natural light. Make three different
people (two women, one man), early twenties, friendly expression.
