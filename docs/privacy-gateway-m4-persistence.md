# Privacy Gateway M4 persistence design (pre-application)

## Admission recovery extension (owner-requested completion of M4)

Before applying the additional migration, the boundary review is: add only
PrivacyClientPackage, PrivacyAdmission, PrivacyInventoryArtifact and
PrivacyAdmissionEvent. The original four Privacy models and every frozen model
remain unchanged. Exact DDL is
`../prisma/migrations/20261023160000_privacy_admission_recovery/migration.sql`.
This supersedes the verified-onward limitation below only after its new tests pass.

Package persists opaque purpose/basis/scope and strict safe version pins with
policy hash and TTL. Admission owns immutable attempt/fence and CAS revision,
checkpoint, current lease, manifest/candidate/verification hashes and durable
cleanup intent. Its package scope is a composite FK; one admission per package
prevents package token correlation/replay. Artifact has UUID PK, scoped composite
FK to exact admission/attempt/fence, composite parent FK within the same job,
unique kind/ordinal and object/key refs, key/crypto versions, checksum/size,
taint, reservation/completion/revocation and hash-bound scanner-version result.
Reservation precedes every key/object side effect; extraction completion and
exact manifest commit atomically, never as partial RAW_READY evidence.
Admission events have job/revision PK, unique command key, safe action/state,
opaque actor, role/result, predecessor/intent/event hashes. Append-only DB guards and
deferred evidence constraints prohibit orphan history and unsupported progress.
Recovery index is cleanup/expiry. No existing table is used for temporary state.
Admission additionally pins scanner version and bounds claims at five per
incomplete stage; successful stage advancement resets that counter. Lease
takeover advances revision, not the immutable attempt/fence. The DB enforces
legal checkpoint adjacency, immutable completed checksums/CLEAN scan evidence,
one atomic original reservation plus admission audit, and a deferred
package-to-admission completeness check. Exact Prisma additions are the first
four models in the companion schema; no original model field changes.

Processing can reserve inventory but cannot complete verification evidence;
verification RLS permits mutation only of VERIFICATION inventory, never RAW
or candidate. Destruction may only revoke inventory. Publisher has SELECT on
safe admission metadata and RLS-limited completed CANDIDATE/VERIFICATION refs,
not RAW inventory or admission mutation. These are separate NOLOGIN roles:
no service login receives implicit membership, and separately configured
storage/key grants remain mandatory. Publisher DB rights grant no RAW key.

The restart-persistent TEST_ONLY object/key/signing configuration is filesystem
backed with AES-GCM ciphertext, separately wrapped keys and opaque refs; no
plaintext keys enter PostgreSQL. A missing key fails closed, never regenerates
a replacement for existing ciphertext. Atomic no-overwrite writes, reserved
refs, tombstones and live revision/lease checks make interruption explicit.
Sanitization stores one encrypted RAW-tainted mapping+candidate working bundle
before candidate publication so completed package-local tokens survive restart.
Verifier reconstructs independently from exact extraction manifest and reruns
current authorization, separation-of-duties and pin checks; durable completion
needs signed evidence. Cleanup intent is recoverable independently of a live
processing grant. Reference cleanup is not M1 irreversible destruction evidence.
After governed publication, durable revocation denies every RAW read/write
before the best-effort storage tombstone. Cleanup removes RAW-tainted original,
extracted and mapping/working-bundle references while retaining the exact final
sanitized candidate and signed verification artifact. Receipt storage is
restart-persistent, hash-checked and TEST_ONLY. The integration deliberately
returns DESTRUCTION_FAILED after reference-only cleanup: it does not manufacture
M1 evidence or turn file unlinking into RAW_DESTROYED.

M3 closure baseline: `fc27c1495d7cb0f8526eeccf25e188404af4f3ee`.
M3 source reference: `58a258c028d9295c2dea5c32c039fafa9c1a5c9b`.
Owner approved the additive Privacy-only persistence exception on 2026-10-23.

## Scope and exact proposed Prisma diff

Add four independent models before the existing generator in `prisma/schema.prisma`:
`PrivacyDurableJob`, `PrivacyDurableEvent`, `PrivacyDurableReceipt`,
`PrivacyDurableWork`. Add no fields/relations to any existing model.
Only child-to-Privacy-job foreign keys use `ON DELETE RESTRICT`.
No RAW/candidate dataset, plaintext token mapping, key material, names,
snippets, provider errors or client document content belongs in these tables.
Sanitized data remains a hash-addressed governed artifact outside the database.

### Tables, columns, keys, relationships and indexes

* Job: UUID PK `id`, organization/client/package/attempt/owner UUIDs,
  fence/revision integers; processing/publication/destruction state strings;
  policyHash/pinsHash/inventoryHash SHA256; inventoryCount;
  artifactId/objectRef/artifactHash/verificationHash required safe references;
  sanitizerId/verifierId UUIDs and processorIds UUID array;
  rawExpiresAt/revokedAt/createdAt/updatedAt;
  unique `(organizationId, clientId, packageId, attemptId)` and
  `(id, attemptId, fence)`; expiry index. No raw object names or content.
* Event: `(jobId, sequence)` PK, job FK RESTRICT; committed revision, opaque actor UUID,
  role/action/result safe enums, previousHash/eventHash, at; unique
  `(jobId, idempotencyKey)` and `(jobId,eventHash)`. Chain begins with 64 zeroes.
* Receipt: UUID PK, job FK RESTRICT; kind, hash, objectRef, actor UUID, at;
  unique `(jobId,kind)` and `(jobId,hash)`. Body/signature stored in
  hash-verified receipt store, not an unbounded JSON column.
* Work: UUID PK, job FK RESTRICT; kind PUBLICATION/DESTRUCTION; immutable
  intentHash/idempotencyKey and attempt/fence; state, leaseOwner/leaseUntil;
  tries; exact nullable source/item/version/checksum references; safe failure;
  evidenceRef/evidenceHash; createdAt/updatedAt.
  Composite `(jobId,attemptId,fence)` FK to the exact job attempt/fence.
  Unique `(jobId,kind)` and `(jobId,idempotencyKey)`, recovery index on
  `(state,leaseUntil)`. Exact references never select a latest version.

## Constraints and mutation boundary

All UUID and SHA256 references are typed/checked; state values are constrained.
Job creation requires verified processing with exact candidate/verification
references, distinct owner/sanitizer/verifier. The trusted import boundary
authenticates M3 signed receipt/evidence and exact candidate before enrollment.
Receipt/event UPDATE/DELETE are rejected by DB triggers. Job and work
DELETE are rejected; their UPDATE checks immutable identity/intent fields and
requires job revision to increase exactly by one. A job lock serializes
atomic state/event/work/receipt changes in one transaction.

Idempotency keys are opaque UUIDs, not content hashes or customer strings.
On retries the committed event is returned only if the exact action intent
matches; changed request under the same key fails. A lease takeover increments
the job revision and changes the opaque lease owner, invalidating earlier workers.
The signed M3 attempt/fence is not rewritten by worker takeover. State and worker results require
exact job/attempt/fence/revision and unexpired lease. No process registry is
the authority.

## Roles and grants

New NOLOGIN roles `jenan_privacy_process`, `jenan_privacy_verify`,
`jenan_privacy_publish`, `jenan_privacy_destroy`, `jenan_privacy_audit`.
Existing application/service roles receive no membership automatically.
Only migration/admin may assign memberships to separately provisioned logins.
No grants on engines, Data Center, project tables, storage or keys.
Role-specific service operations additionally require live scoped authorization;
DB credentials do not establish human principal identity or RAW capability.
Audit role SELECT-only; append-only triggers apply even to normal app roles.
No privileges granted to PUBLIC on new tables. Deployment credentials remain
an explicit configuration prerequisite, not a production qualification claim.

## Recovery and publication

Durable intent precedes external operations. A claim/lease is persisted before
dispatch. Timeout/exception/partial acknowledgment becomes RECONCILIATION_REQUIRED;
never blindly re-dispatch an unknown publication. Reconcile exact release
identity and known item/version/checksum with a trusted publication adapter.
Existing Data Center service functions/policy stay unchanged; no auto-promotion
of privacy verification to business VERIFIED status. A separately authorized
human-governed Data Center lifecycle remains mandatory.

Publication acknowledgment and receipt, RAW revocation and destruction intent
must commit atomically. Access readers consult authoritative durable revocation.
Destruction handles failure/cancellation/TTL independently of publication.
Receipt is accepted only with complete M1 destruction evidence and exact
inventory. Otherwise persist PENDING/FAILED and recover by lease.

The M4 enrollment boundary starts with an authenticated M3 verified checkpoint,
not arbitrary caller-provided receipt claims. It checks current independent verifier
authorization, the signed receipt/evidence, exact candidate, scope and policy pins.
The intake RAW authority is bound **before** database enrollment commits; enrollment
failure leaves missing durable authority fail-closed rather than opening a RAW gap.
Every subsequent read of that enrolled intake consults PostgreSQL, including checks
after decryption and before/after the reader callback. Process-local copies never
override revocation. Bindings cannot be replaced to reopen a revoked record.

This is a durable **verified-onward M4 coordinator**, not a durable replacement
for the pre-verification M2/M3 parser registries. Pre-verification parser state,
broker inventory recovery and a multi-host processing scheduler remain outside
the implemented recovery claim. Durable job/work/audit/receipt records and lease
recovery do not by themselves qualify storage, keys, receipt storage or cleanup
providers. Missing inventory/provider evidence must remain pending/failed.

### Implemented publication boundary

The new Privacy-owned Data Center adapter calls the existing
`createDataCenterItemInTransaction`; it does not edit the Data Center service,
tables, checksum algorithm, review policy or lifecycle. It creates one restricted,
organization-scoped DATA proposal with exact allowlist JSON, `UNVERIFIED` business
evidence and `DRAFT` status. A configured type must require independent review.
Privacy verification is never promoted to business verification.

The proposal and exact source/item/version/checksum association commit in one
database transaction. Loss of its response therefore leaves either both or
neither; the adapter never creates a second proposal to resolve an unknown result.
An absent association remains reconciliation-required; this implementation does
not offer a speculative retry or a "not published" proof for that case.
Normal human Data Center review/approval/publication must finish before the
Gateway accepts a signed publication receipt. Reconciliation reads only the
persisted exact version and requires matching current/published version numbers;
it never substitutes another version. Final receipt commit re-locks/rechecks
that exact published item under current authorization.

The port's persisted DISPATCH reservation prevents concurrent workers from
calling an external publication twice. Repeated final requests return the exact
committed state; an unknown intermediate result requires reconciliation.
Database revocation, publication receipt and destruction outbox are atomic.

### Destruction evidence and append-only protections

Final cleanup requires the strict M1 receipt plus a strict M4 evidence envelope:
job/package/attempt/fence, inventory hash/count, cleanup attempt, receipt hash,
opaque key/evidence references and all eleven cleanup categories. Both must
authenticate against the trusted destruction provider. The evidence envelope
is hash-addressed with the receipt, and failures never become RAW_DESTROYED.
No object deletion or process-local key-map deletion is sufficient evidence.

DB triggers prohibit audit/receipt UPDATE/DELETE and job/work DELETE; check
immutable fields, legal state edges and exact revision increments; and enforce
ordered audit predecessors. Deferred guards require an audit event for the
committed revision, exact verification receipt and matching completed-work evidence.
Normal role grants/RLS separate receipt/work kinds and audit actions.
Audit hashes are recomputed on read. These controls do not claim resistance to
a superuser/migration administrator disabling triggers or rewriting all history.

### Qualification and activation limits

PostgreSQL persistence and the existing Data Center transactional API are real
in the isolated tests. The RAW broker/storage/scanner, authorization source,
artifact/receipt store, destruction attestations and signer are TEST_ONLY or
test-configured, not production-qualified. Synthetic destruction receipts test
the evidence acceptance boundary; they are not physical-wipe or real-customer
destruction certification. There is no production worker, HTTP route, UI,
production credential/role membership assignment or bypass enforcement.
All ingress blockers in `privacy-gateway-v1.md` section 15.5 remain open.
Sanitized != Anonymous. M5 is not started.

## Pre-application boundary review

The proposed DDL is confined to four Privacy tables, their indexes, triggers
and five new roles. Prisma diff is append-only. No existing column, constraint,
relation, role membership, schema semantics or module is changed.
Migration must first apply on a disposable isolated PostgreSQL database.
If publication wiring requires a frozen contract change, STOP before it.

Exact migration DDL is the companion
`../prisma/migrations/20261023130000_privacy_gateway_durable/migration.sql`;
it is reviewed before execution. No production database use is authorized.
