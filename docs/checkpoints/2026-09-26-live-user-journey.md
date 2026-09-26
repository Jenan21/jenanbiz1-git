# Jenan Pro Live User Journey

## Browser journey

The Playwright journey creates a real user through the registration UI, logs out through the platform shell, verifies the session is invalidated, and signs in again through the login UI.

It then exercises the live platform by:

- creating a project;
- enrolling in an academy course;
- creating and publishing a market listing;
- creating and publishing a job posting;
- creating an organization and activating finance, people, field, and fleet programs;
- recording a financial ledger entry;
- creating a marketing campaign and qualified lead;
- merging two generated PDF files and downloading the result;
- extracting a palette from the Jenan Pro logo;
- verifying all created records in the account overview;
- opening every service route defined by the platform catalog;
- verifying normal users receive `403` for admin;
- verifying Visual DNA redirects to login after logout.

## Defects found and fixed

- The platform Logout control only linked to `/login`; it now invalidates the session through the real logout endpoint.
- New market records lost their `isOwner` flag, hiding publish/pause controls until refresh; create and update results now preserve ownership.
- Academy progress rejected the deterministic academy IDs used by seeded courses; validation now accepts safe alphanumeric, underscore, and hyphen identifiers.
- `/software/robotics` returned `404`; it is now a protected standalone module workspace without changing the approved software service count.

## Verification

- `npm run test:e2e:journey`: 1 passed.
- Full browser suite: 96 passed.
- Unit and integration suite: 74 passed, 1 intentionally skipped.
- Production build: passed.