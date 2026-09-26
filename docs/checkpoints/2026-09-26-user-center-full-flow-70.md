# [70% BASELINE][PASS] User Center Full Flow

## Implemented pages and routes

- `/user` — personal account and activity overview.
- `/user/investments` — investment dashboard with truthful unavailable-source states.
- `/user/investment/detail` — asset detail unavailable state without fabricated values.
- `/user/unlocks` — voluntary community follow/acknowledgement flow using configured official links.
- `/user/payments` — persisted payment and invoice list.
- `/user/payments/invoice` — printable persisted payment detail.
- `/user/reports` — real project report downloads and audited user activity.

## Functional QA

- Account data remains isolated to the authenticated user.
- Payments include direct user payments and payments for organizations where the user is a member.
- Project reports use the existing protected PDF route.
- Community access requires an approved configured URL and explicit acknowledgement; no bot, fake-follow, or unsupported automatic verification is claimed.
- Investment metrics show unavailable/awaiting-source states because no approved investment data model is connected.
- Unsupported investment export/share/email actions are not exposed as working controls.
- Invoice print uses the browser print workflow; tax is shown as not recorded rather than estimated.

## Responsive and visual QA

- Seven pages tested at 2560x1440, 1920x1080, 1440x900, 1366x768, 1280x800, 1024x1366, 820x1180, 430x932, 390x844, and 360x800 in Arabic and English.
- No accidental horizontal overflow or clipped controls.
- Direct comparison performed against page 008 (`user_investments`) reference.
- Approximate current visual fidelity: 70–74%. Hero, metric row, performance/opportunity/update modules, report output block, navigation, and responsive hierarchy align with the reference direction.

## Remaining differences

- Investment assets, returns, portfolio allocation, and performance require an approved live investment source and data contract.
- Payment PDF/email delivery requires dedicated invoice rendering and mail providers; only truthful browser print is active.
- Final typography and spacing can be refined during the 80–90% pass.

## Engineering checks

- ESLint: passed.
- TypeScript: passed.
- User center/account/community integration: 3 passed.
- User Center responsive E2E: 20 passed.
- Production build: passed (105 routes generated).
- Snyk Code tool was not available in the current tool environment; no dependency changes were introduced.