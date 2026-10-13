# Jenan PRO Canonical Auth References

These two full-page images are the sole binding visual references for authentication UI:

- `login-1672x941.png` — canonical sign-in panel (card `758×766`, shown on a `1672×941` screen).
- `register-1448x1086.png` — canonical account-creation panel (card `752×938`, shown on a `1448×1086` screen).

## Authority

- These images supersede every earlier Auth reference (the former `462×725` panels, generic Auth `reference.html`, `spec.txt`, legacy candidates, and alternate layouts).
- Production recreates the designs with real React/CSS/SVG. The images must never be used as page backgrounds or loaded at runtime.
- The panel is laid out at its reference card size and scaled as one unit (`zoom`), so spacing, fields, type, and colours keep the reference proportions on every screen. The login card was approved as seen on a `1365×768` screen and the register card on a `1024×768` screen; those are the scales used at that viewport height.
- The pre-login page at `/` shows two small rectangular buttons, **دخول / Sign in** (cyan) and **إنشاء حساب / Create account** (emerald), centred under the globe (`../APPROVED_HOME_REFERENCE/access-buttons-665x385.png`). Clicking a button makes its panel grow out of that button; closing the panel (×, Esc, or the scrim) returns to `/`.
- `/` is the canonical pre-entry interface, `/auth` and `/login` open the sign-in panel, `/register` opens the account-creation panel, and `/auth/forgot` reuses the same card for recovery. Onboarding inherits the same visual DNA.
- The surrounding pre-login scene stays visible (dimmed) behind the panel.
- Registration shows an IP-derived country code and allows manual selection; mobile number is optional and stored in E.164 form. Sign-in accepts the account email.
- Google and Apple are the only additional sign-in methods (explicit product decision), shown under an «أو المتابعة عبر / or continue with» divider at the bottom of the card; each button is disabled and marked «قريباً / Soon» until the provider's credentials are configured. Do not add other Auth methods.
- Production has one public interface, one Auth flow, one Auth component, and one Auth stylesheet (`styles/canonical-auth.css`); compatibility aliases reuse the same implementation.
- The globe and skyline inside the card are generated assets (`public/assets/jenan-auth-globe.webp`, `public/assets/jenan-auth-skyline.webp`), not copies of the reference.
- Replace every visible legacy `Jenan BIZ` mark with `Jenan PRO` or `جنان برو`.

## Integrity

- `login-1672x941.png` SHA-256: `9E33618FCCE07DAFD961F322E2501C7422AA6B5764A480742EF1257C8C50EA8B`
- `register-1448x1086.png` SHA-256: `6CA98580B5DBA7722B26744037EBBE4ED6A11ED634B9A0C787A057F2754B5207`
