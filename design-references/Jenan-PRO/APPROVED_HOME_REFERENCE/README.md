# Jenan PRO Canonical Homepage Reference

`homepage.png` is the visual source for the scene of the public pre-login page at `/`: the globe, glowing network, skyline, dark navy/cyan/teal/emerald palette, lighting, depth, and overall layout. The final decisions below override anything in that image that they remove or replace.

## Authority

- Production recreates the design with real React, CSS, SVG, and live components. The image must never be loaded as a production background.
- `/home` may exist only as a compatibility redirect to `/`; it must not implement another homepage.
- Authentication panels reuse this page as their dimmed surrounding scene (see `../APPROVED_AUTH_REFERENCES`).

## Final decisions (these override `homepage.png`)

Removed and never to be restored: the big platform title, the top navigation (About / Services / Academy / Pricing / Support), search, the notification bell, the lower strip of news / platform statistics / user distribution, the lower row of five trust icons, and large circular or card-style auth entries.

Kept or added:

- Small AR / EN switch at the top, Jenan PRO logo at the top left (slightly enlarged).
- Headline on one colour, three short lines: «بيانات دقيقة / رؤى ذكية / نمو مستدام» (EN: Accurate data / Smart insights / Sustainable growth), with the tagline «خدمات متكاملة · تحليلات ذكية · نمو بلا حدود» shown as three words separated by spacing only (no dots or dividers).
- Four capability icons under the headline, the three platform indicators, and the closing quote.
- Two small rectangular access buttons (`access-buttons-665x385.png`) centred under the globe and above the service panels.
- Service panels at the bottom (Projects, Academy, Talent, Market, Software, Programs): one static panel at a time, replaced every 7 seconds with a very light fade/slide, no motion inside the scene, paused while hovered. Scenes are generated in code, kept calm on the left so the text and services lead, and use the Jenan PRO palette (violet only as a small accent).
- Layout stays one fixed 1661×947 composition scaled to the window.

## Integrity

- `homepage.png` — dimensions `1672×941`, SHA-256: `2F4A99E44FF225B3087CA45C1C8C16262938B85F1E3F8C7EE36CB2CD0B5C5404`
- `access-buttons-665x385.png` — SHA-256: `CAFAA1F17AB4EED2C950DA4139FA405B548329A3A9A9BA4DE2768EF6F7C3071C`
