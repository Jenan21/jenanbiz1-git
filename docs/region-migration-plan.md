# Region migration study: Vercel Functions and the database

Status: **study only. Nothing has been moved or changed.** Prepared 2026-10-14. Executing any step below needs the owner's
explicit approval (see section 9).

## 1. Decision summary

* **Dubai is not available right now**, so the preferred option cannot be done today. Vercel's Dubai region (`dxb1`) refuses new
  deployments, no Middle East region is on Vercel's current list, and Neon (our database provider) has no Middle East region at all.
* The AWS Middle East regions are themselves impaired: AWS reports its Bahrain region (`me-south-1`) unrecoverable and one of three
  zones in the UAE region (`me-central-1`) lost, and recommended customers move to other regions, ideally in Europe.
* **Recommendation: move Functions and database together to Frankfurt** (Vercel `fra1` and Neon `aws-eu-central-1`, which are the same
  AWS region, so function-to-database latency stays at about 1 ms), **before the invited trial**, while the production database holds
  no user accounts, so there is almost no data to carry and the rollback is trivial.
* Do **not** move only the Functions (for example to Mumbai `bom1`) and leave the database in Virginia: every page makes several
  queries, so a long function-to-database distance would make the site slower than it is today.
* Keep Dubai/Dammam under review (section 8). Re-evaluate when Vercel restores a Gulf region or the owner prefers in-Kingdom hosting.

## 2. What is verified (sources checked 2026-10-14)

| Fact | Source |
| --- | --- |
| Vercel has 19 compute regions: Stockholm, Mumbai, Paris, Cleveland, Cape Town, Dublin, Frankfurt, São Paulo, Hong Kong, Tokyo, Washington D.C., Seoul, Osaka, London, Portland, San Francisco, Singapore, Sydney, Montréal. None is in the Middle East. New projects default to Washington D.C. (`iad1`), which is where we run today | vercel.com/docs/regions, vercel.com/docs/functions/configuring-functions/region |
| `dxb1` (Dubai) is refused as a target: "currently under maintenance and cannot be used as a target region" (dashboard) and deployments fail; the plan does not matter | Vercel Community, 2026-09-07 |
| Hobby allows one Function region; Pro allows up to three | Vercel docs and changelog |
| Neon projects run only in AWS regions: US East (Virginia, Ohio), US West (Oregon), Frankfurt, London, Singapore, Sydney, São Paulo. **No Middle East region.** The region is fixed when a project is created; moving means a new project plus a data migration. Neon's Azure regions are deprecated | neon.com/docs/introduction/regions, neon.com/docs/import/region-migration |
| Neon restore window: Free 6 hours, Launch up to 7 days, Scale up to 30 days | neon.com/docs/postgres/backup-restore/history-window |
| AWS Bahrain (`me-south-1`) resources are inaccessible and cannot be restored; one UAE zone (`mec1-az2`) is lost and the other two are impaired. AWS and other vendors advised failing over to other regions, ideally Europe | The Register, 2026-09-16, citing the AWS Health Dashboard |

Not verified (treat as open questions): whether Google Cloud (`me-central2`, Dammam) offers managed Postgres suitable for us and its current
health, and the exact legal position under the Saudi Personal Data Protection Law (section 7).

## 3. Where things run today

| Component | Today | Note |
| --- | --- | --- |
| Vercel Functions | `iad1` (Washington D.C.), project `jenan-pro-private`, Hobby plan | no `vercel.json`; the region is the project default |
| PostgreSQL | Neon, `aws-us-east-1` (Virginia) | pooled `DATABASE_URL`, direct `DATABASE_URL_UNPOOLED` for migrations |
| Redis (rate limits) | `REDIS_URL` in Production; provider and region to be confirmed | each request touches it, so it should sit next to the Functions |
| File storage | Vercel Blob (`BLOB_STORE_ID`); store region fixed at creation | small, low-traffic; can stay or be recreated later |

The database currently has **no user accounts**, and the site is behind the private gate. That is the cheapest moment to move.

## 4. Options

Latency figures are typical network round trips between Riyadh and the region and are **estimates to be measured** (section 5), not promises.

| Option | Functions | Database | Riyadh to Functions | Function to DB | Verdict |
| --- | --- | --- | --- | --- | --- |
| A. Stay | Washington D.C. | Neon Virginia | about 180-220 ms | about 1 ms | Works, but slowest for Saudi users |
| **B. Frankfurt together** | `fra1` | Neon Frankfurt | about 90-120 ms | about 1 ms | **Recommended.** Same AWS region, available now, Neon-supported, AWS's own advice for the Middle East |
| C. Mumbai Functions, Frankfurt/Virginia DB | `bom1` | Neon (far away) | about 60-80 ms | about 120-200 ms | Rejected: many queries per page, slower overall |
| D. Dubai or Bahrain | not available | not available | n/a | n/a | Not possible today (Vercel `dxb1` offline; AWS Gulf regions impaired; Neon has none) |
| E. In-Kingdom hosting (for example Google Cloud Dammam) running our Docker image and a managed or self-run Postgres | outside Vercel | Dammam | lowest | low | Possible later. It replaces the hosting model (we already ship a `Dockerfile` and `compose.yaml`), so it is a separate project with its own cost, operations and security work |

Static assets (scripts, styles, images) are served by Vercel's CDN from the nearest point of presence regardless of the Function region, so the
gain from B is mainly on page and API responses that run Functions.

## 5. How to measure before and after

1. Baseline now, from a Saudi connection: `curl -s -o NUL -w "connect %{time_connect}s  first-byte %{time_starttransfer}s\n" https://jenan-pro-private.vercel.app/api/health/live` (use the gate credentials if asked), repeated 20 times; note the median.
2. `/api/health/ready` includes a database round trip; compare it with `/api/health/live` to isolate function-to-database time.
3. After the preview deployment in `fra1` against the new database (section 6), repeat the same probes against the preview URL. The move is justified only if the median first-byte time for Saudi clients improves and readiness stays healthy.
4. Do not run heavy load on Hobby. Light probes only (the repository's `npm run loadtest` is for a local or paid-plan target).

## 6. Plan, backup and rollback

### 6.1 Prerequisites (owner)

* Upgrade the Vercel team to **Pro** (also required for commercial use, see `SECURITY.md` item 5; a single `fra1` region works on Hobby but the plan is not meant for a commercial launch).
* Approve creating a new Neon project in `aws-eu-central-1` and choose the Neon plan. Prefer a paid plan so the restore window is 7 days or more (Free is 6 hours).
* Confirm where `REDIS_URL` lives; if it is a regional Redis in the US, create one in Frankfurt at the same provider and move it together.

### 6.2 Backup before any change (mandatory, no exceptions)

1. Record the current state: the production deployment URL and id, the Neon project id, the list of Production environment variable **names**, and `prisma migrate status` against production.
2. Take a full logical backup with the direct (unpooled) connection, never the pooled one: `pg_dump --format=custom --no-owner --no-privileges --file jenanpro-<date>.dump "<DATABASE_URL_UNPOOLED>"`.
   Use a `pg_dump` at least as new as the server version.
3. Check it: `pg_restore --list jenanpro-<date>.dump` must list every table, and **restore it into a scratch database** (local PostgreSQL) and compare row counts per table. A dump that has never been restored is not a backup.
4. Store two encrypted copies in two different places (for example the owner's encrypted drive and an object store in a different provider). Never commit them and never put them in the repository or the session folder.
5. Note the Neon restore window and create a Neon snapshot or branch at the moment of the move as an extra restore point.

### 6.3 Migration runbook (after approval)

1. Create the new Neon project in `aws-eu-central-1` (Neon's Import Data Assistant is the guided route for databases under about 10 GB; `pg_dump` and `pg_restore` give full control; logical replication is only needed for busy databases and is not needed here).
2. Restore the backup into the new project, then run `prisma migrate deploy` against it and confirm `prisma migrate status` is clean and per-table row counts match the source.
3. Create the Frankfurt Redis if needed. Do not point Production at anything yet.
4. Add `"regions": ["fra1"]` in a new `vercel.json` (or set Project Settings > Functions > Function Region), and build a **preview** deployment with the new `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `REDIS_URL` set for Preview only.
5. Verify the preview: `/api/health/ready` returns 200, the gate and sign-in work, the e-mail verification and project invitation flows work, and the latency probes from section 5 improve.
6. Cutover (low risk because the platform is private and has no users): set the Production variables to the new values, deploy with `--skip-domain`, verify with `vercel curl <url>/api/health/ready`, then `vercel promote`.
7. Observe for 24-48 hours. Keep the **old Neon project untouched and running**. After the owner signs off, keep it a further 14 days, then delete it. Rotate no secret as part of this change.

### 6.4 Rollback

* **Trigger:** readiness failing, error rate above normal, wrong row counts, or latency worse than the baseline.
* **Action:** `vercel promote <previous deployment URL>`. A deployment keeps the environment values it was built with, so promoting the previous deployment restores the old region **and** the old database at once, within a minute. Previous known-good deployments are listed in the deploy notes.
* **Data written after cutover:** the old database does not have it. While the platform is private this is negligible; if any real data was written, export it from the new database (`pg_dump --data-only` for the affected tables) before rolling back and re-apply it.
* The old Neon project stays untouched until sign-off, so there is always something to roll back to. A second fallback is the restored backup from 6.2.

## 7. Data location (not legal advice)

Moving from the United States to Germany changes where personal data is stored, but neither location is in the Kingdom. The Saudi Personal Data
Protection Law does not simply forbid storing data abroad; transfers outside the Kingdom are allowed under conditions and safeguards set by the
transfer regulations, and some sectors (financial, government, critical infrastructure) have stricter rules. Because I could not retrieve the
official text during this study, **the owner should confirm the position with Saudi counsel before the public launch**, especially if the platform
will hold regulated or government-related data. If in-Kingdom storage turns out to be required, option E (section 4) is the path, not a Gulf region on
AWS or Vercel.

## 8. Re-evaluation triggers

* Vercel lists a Gulf or Middle East compute region again (Dubai `dxb1` or another) **and** a supported Postgres exists in the same region or country.
* A legal requirement for in-Kingdom storage appears (then plan option E).
* Measured latency from Saudi users after the move is still unsatisfactory.

Whatever is chosen, keep an off-region backup: the Gulf is currently a conflict zone, and AWS says some resources there were lost.

## 9. What I need from the owner to proceed

1. Approval to upgrade the Vercel team to Pro (or to accept staying on Hobby for the private trial only).
2. Approval to create a Neon project in Frankfurt and the plan to use.
3. A maintenance window (any time works while the site is private) and confirmation that there is no real data in the current database that I do not know about.
4. Where `REDIS_URL` is hosted, or permission to create a Frankfurt Redis.

Until then nothing is changed: production keeps running in `iad1` with Neon Virginia.
