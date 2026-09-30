# Jenan PRO Canonical Front Door and Auth References

These three images are the sole binding visual references for the public front door and authentication UI:

- `pre-entry.png` — canonical public platform interface before authentication.
- `login.png` — canonical sign-in overlay.
- `register.png` — canonical account-creation overlay.

`pre-entry.png` is `1672×941`. The two panel references are `462×725` and combine with the same public interface behind them.

## Authority

- These images supersede generic Home/Auth `reference.html`, `spec.txt`, legacy candidates, and alternate layouts for this phase.
- Production must recreate the designs with real React/CSS/components. The images must never be used as page backgrounds.
- Replace every visible legacy `Jenan BIZ` mark with `Jenan PRO` or `جنان برو`.
- The large left-side platform title from the source image is intentionally omitted and must not be restored. The approved logo remains.
- `/` is the canonical pre-entry interface, `/auth` and `/login` use the canonical sign-in overlay, and `/register` uses the canonical account-creation overlay.
- Recovery and onboarding inherit the same visual DNA; they do not define independent design directions.
- The surrounding public interface remains visible behind each centered translucent overlay.
- Closing an authentication overlay returns to `/`.
- Registration must show an IP-derived country flag and allow manual country selection.
- Production has one public interface, one Auth flow, one Auth component, and one Auth stylesheet. Compatibility aliases must reuse the same implementation.

## Integrity

- `pre-entry.png` SHA-256: `7850621B6F4E5062BE265AA231C2B18684F5D2BFC0576DFF6BAA7103837AFE5F`
- `login.png` SHA-256: `D745E12EE6588C9A9D3235CA69E1C35CF583BB311225ABB2049D152BAD2F2CD2`
- `register.png` SHA-256: `8065AF3563F6DCC173FF33B43630DB69D84AF32ED5FE224C7FC8CF273AA89A75`
