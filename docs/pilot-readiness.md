# Pilot Readiness Checklist

## 1) Scope

- [ ] Enable `PILOT_MODE=true`
- [ ] Pilot product scope limited to `/dashboard` and `/projects`
- [ ] Confirm non-pilot product routes redirect to `/dashboard?pilot=scope`

## 2) Environment

- [ ] Create `.env` from `.env.example`
- [ ] Set `DATABASE_URL` to pilot PostgreSQL
- [ ] Run `npm run prisma:generate`
- [ ] Run `npm run db:migrate`

## 3) Access and security

- [ ] Bootstrap first super admin with `npm run auth:bootstrap-super-admin`
- [ ] Confirm admin APIs require authenticated admin access
- [ ] Confirm auth routes enforce origin checks and rate limiting

## 4) Data integrity

- [ ] Validate project lifecycle (create project, phase update, assessments, start)
- [ ] Validate project report generation endpoint
- [ ] Validate admin summary/operations/report data from DB-backed endpoints

## 5) Quality gate

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `./node_modules/.bin/vitest run`
- [ ] `npm run build`

## 6) Soft launch

- [ ] Start with a limited user cohort
- [ ] Monitor authentication failures, 4xx/5xx API rates, and DB health
- [ ] Keep rollback path ready: set `PILOT_MODE=false` and redeploy
