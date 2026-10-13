# Jenan PRO — approved bottom service panels (pre-login home)

Eight full-panel designs supplied by the product owner (1365×768 PNG each). They are the binding visual references for the service panels at the bottom of the pre-login page `/`.

| File | Service | Notes |
|---|---|---|
| `01-projects.png` | Projects | v2 template, 4 label-only tiles |
| `02-academy.png` | Academy | v2 |
| `03-talent.png` | Talent & hiring | v2 |
| `04-market.png` | Market | v2, gold tile underline |
| `05-software.png` | Software | v2 (the one used) |
| `06-marketing.png` | Marketing & advertising | v1: tiles carry a two-line description; the scene shows invented stat overlays (1.2M / 85K / 356 %) that are **not** shipped |
| `07-tools.png` | Tools (Studio) | v2 |
| `08-software-alt-1.png` | Software — earlier variant | stored for reference only, not used |

Three more files in the original upload were byte-identical duplicates (`B2` = marketing, `B3` = talent, `B5` = market) and are not stored twice.

## Authority and the explicit exception

- The designs are recomposed for the wide strip at the bottom of `/` (they are 2:1; the strip is ≈5:1). Layout, text, tiles, CTA and dots are live React/CSS; fonts stay Alexandria.
- **Product decision (explicit):** the *scene* of each design (the photographic right-hand part) is cropped from these files and shipped as a background layer under real text. This is the only exception to the rule that reference images are never used as page backgrounds, and it applies to these panels only.
- Demo numbers drawn in a design must not read as production data; the marketing scene is cropped to exclude its stat overlays.
- Rotation: one panel every **3 seconds**, a very light fade/slide, no motion inside the scene; paused on hover/focus/touch and for reduced motion.

## How the panels are built

- Copy, order, tile links and variants: `components/home/service-panels.ts` (Arabic and English; the English copy is a translation, not part of the designs).
- Images: `scripts/design/panel-assets.py` crops these files offline into `public/assets/home-panels/` (scene photos, 28 alpha-matted tile icons, brand leaf, marketing rocket) and records them in `assets.manifest.json`. Re-run it only when a design here changes.
- Markup and rotation engine: `components/home/cinematic-services.tsx`; styling: `styles/cinematic-home.css`.

## Known differences from the designs

- The strip is wider and shorter than the 2:1 designs, so the layout is recomposed; typography is the live Alexandria font, not the rendered glyphs of the designs.
- Seven dots (one per panel) instead of eight; the tile-to-route mapping and the English copy are product proposals.
- Arabic signage baked into a scene photo stays Arabic in the English interface.

## Integrity (SHA-256)

- `01-projects.png` — `D927BB0309393B16BDBB408752B02C5D71B8CA59DC28F5DBBC675F5916064652`
- `02-academy.png` — `4655B7C05B1F7DB2E0D2D858E9572F5B5B908883112F0C2BD18E65CDB1906926`
- `03-talent.png` — `783E37B9355B5097B172197EFC16E749E5AC20380AF1CBEC4D81FE98909A39E4`
- `04-market.png` — `6FEEF30C654E7467523465E178B1D01BE64FA5F04BC10EE8C875ED0A237F25D4`
- `05-software.png` — `3025C6846DBAE3C83A965BA271E7FCD7EDC576B150F55329356E537E14FE4A6D`
- `06-marketing.png` — `39FD262A1664FC6C2AF44CDD969923ED35691962CCCF0FEC772301E7017E33B5`
- `07-tools.png` — `6BCD35406AD58E07F3C277488AD8D7016B6FC19854E125C3114E8103B1260D63`
- `08-software-alt-1.png` — `DB6DD9E191E8C463D014EF360ECC82F2EC84FC56113FD111F2C6C737FE56877E`
