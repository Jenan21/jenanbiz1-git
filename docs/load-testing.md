# Load and resilience testing

`scripts/loadtest.mjs` drives a running server with sustained traffic and reports throughput, latency, server errors and dropped connections per scenario. It exits non-zero when a scenario produces a server error, drops more than 1 % of its connections, answers outside the statuses the scenario allows, or lets ordinary visitors suffer while abuse is running.

It only targets `localhost` unless `LOADTEST_ALLOW_REMOTE=yes` is set, because it generates sign-in failures and sustained load on purpose. Run it against a local production build or a staging copy that you own, never against a shared service.

## Running it

```bash
npm run build
# Start the production server the way it runs in production: Redis for the rate limits and the private gate on.
SITE_ACCESS_USERNAME=loadtest SITE_ACCESS_PASSWORD=<random> REDIS_URL=redis://127.0.0.1:6379 \
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3102 npx next start -H 127.0.0.1 -p 3102

LOADTEST_BASE_URL=http://127.0.0.1:3102 LOADTEST_GATE_USER=loadtest LOADTEST_GATE_PASSWORD=<random> \
npm run loadtest -- --duration 15          # every scenario
npm run loadtest -- --each --duration 5    # one scenario per route, to find a slow endpoint
npm run loadtest -- --only login-botnet    # selected scenarios
```

`DATABASE_URL` (read from `.env`) lets the script seed a throw-away member with a session, which the signed-in scenarios use; the member and everything it created are deleted afterwards. `--scale 2` doubles every connection count.

## Scenarios

| Scenario | What it models | What must hold |
|---|---|---|
| `health-live`, `health-ready` | Probes and monitors at 100 connections | No errors; the readiness answer is shared, so many callers cost one database check |
| `spike-500` | A sudden 500-connection burst | No errors, no dropped connections |
| `gate-flood` | Anonymous traffic against the private gate | Every answer is `401`; the flood stays cheap |
| `public-home` | The pre-login pages | No errors |
| `member-api-reads`, `member-pages`, `--each` | Signed-in reads and pages | No errors |
| `member-writes` | Project creation at 20 connections | `201` until the write budget is spent, then `429` |
| `login-flood` | One address guessing sign-ins | `429` after the per-address budget; ordinary visitors unaffected |
| `login-botnet` | Many addresses guessing sign-ins (spoofed forwarding header) | Hashing is bounded: excess attempts get a fast `503` with `Retry-After`; ordinary visitors unaffected |

## What the platform does under pressure

- **Rate limits** are shared through Redis, so every instance counts the same visitors. If Redis is unreachable the limited routes fail closed rather than open.
- **Password hashing** (Argon2id, 64 MB each) runs at most four at a time per instance with a short waiting line (`PASSWORD_HASH_CONCURRENCY`, `PASSWORD_HASH_QUEUE`). Beyond that, sign-in, registration and recovery answer `503` immediately instead of queueing unbounded work; before this limit a distributed sign-in flood held requests for more than four seconds each.
- **The database pool** is bounded (`DATABASE_POOL_MAX`, five per serverless instance and twenty on a long-running server) and a request that cannot get a connection within eight seconds, or a statement that runs longer than thirty, is cancelled (`DATABASE_CONNECT_TIMEOUT_MS`, `DATABASE_QUERY_TIMEOUT_MS`).
- **`/api/health/ready`** is open, so its answer is cached for five seconds and concurrent callers share one check; it cannot be used to hammer the database or Redis.
- **The private gate** answers anonymous traffic with a small `401`, locks a client out after ten wrong guesses in ten minutes, and keeps working if the rate-limit store is down.

## Reference results

Measured on a developer laptop (8 GB, shared with other applications) against a production build, local PostgreSQL, a Redis-compatible store and the private gate on. Absolute numbers on Vercel differ because functions scale out; what matters here is that nothing errors, nothing hangs, and abuse does not starve ordinary visitors.

| Scenario | Throughput | p50 | p99 | Server errors | Notes |
|---|---|---|---|---|---|
| `health-live` | ~1,400 rps | 52 ms | 236 ms | 0 | |
| `health-ready` | ~1,700 rps | 44 ms | 211 ms | 0 | cached |
| `spike-500` | ~1,600 rps | 69 ms | 912 ms | 0 | |
| `gate-flood` | ~1,800 rps | 67 ms | 321 ms | 0 | all `401` |
| `member-api-reads` | ~200 rps | 223 ms | 636 ms | 0 | eight endpoints mixed |
| `member-pages` | ~200 rps | 134 ms | 432 ms | 0 | seven pages mixed |
| `member-writes` | ~640 rps | 30 ms | 47 ms | 0 | `429` after the write budget |
| `login-flood` | ~320 rps | 288 ms | 939 ms | 0 | `429` after the per-address budget; visitors p99 142 ms |
| `login-botnet` | ~180 rps | 392 ms | 2.9 s | 0 | `503` for the excess; visitors p99 121 ms |

A three-minute mixed soak held the server's memory between 370 and 530 MB with no upward trend.

Every individual signed-in route answers in under 100 ms at the median with ten connections (`--each`).

## Findings and recommendations

- **The pre-login pages are heavy.** `/`, `/login` and `/register` return about 1.3 MB of HTML (about 415 KB compressed) because the world-map decoration inlines 256 country outlines, and they load a 1.2 MB script chunk that carries the same outline data. Each page costs roughly 13 ms of server time, so they are the slowest public routes (about 80 rps per core). They are safe behind the gate, but before the public launch consider serving the static country layer as a cached image and keeping only the highlighted countries in the page. The home design is frozen, so this needs the owner's go-ahead and a pixel comparison.
- **Vercel Hobby limits** (function invocations, bandwidth, CPU time) apply to a flood that reaches the functions. The gate's `401` is cheap, but a sustained flood still consumes invocations; Vercel's network-level protection absorbs volumetric attacks, and a paid plan adds configurable firewall rules.
- **Cold starts**: the first sign-in on a fresh instance pays for the first Argon2 hash and the gate key derivation (tens of milliseconds each).
