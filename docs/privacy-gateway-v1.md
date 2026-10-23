# JENAN PRIVACY GATEWAY — M0 ARCHITECTURE CHECKPOINT FOR OWNER REVIEW

## 1. Authority and scope

Owner request: 2026-10-23. **M0 owner-approved / CLOSED; M1 contracts, policies
and state model implemented for owner review only.** Sections 1-14 retain the
architecture and original M0 checkpoint; section 15 records the M1 implementation.
No production intake pipeline, deployment or provider integration is activated.
This document is not an operational security/privacy certification.

Canonical flow:

```text
Client Data
  -> privileged Privacy Gateway intake
  -> encrypted isolated ephemeral RAW zone
  -> minimal extraction / classification / sanitization
  -> independent sanitization verification
  -> approved sanitized publication
  -> governed Data Center lifecycle
  -> existing engines
```

RAW client data must never be an input to Data Center or any engine.
Sanitized data is not automatically anonymous: financial data, dates, stable
tokens and rare combinations may remain personal/confidential. It retains
tenant isolation, purpose restrictions and least-privilege access.

All seven engines, Map, Shared, Data Center production semantics, Projects and
Admin UI, Payments, existing modules and dependencies remain unchanged in M0.
No Worlds redesign, new UI, Sonar, final tag, main merge or production deployment.
No funding service or funding navigation is proposed.

### Existing interfaces inspected, not adopted as RAW storage

- `services/files/file-asset-service.ts` and `content-sniffing.ts` implement
  existing persistent user-file flows. Their sniffing/quota behavior alone is
  not a malware, sandbox, ephemeral-storage or privacy-verification guarantee.
- `lib/storage/document-storage.ts` selects existing local/blob document storage;
  it does not establish this design's key isolation, purge or backup exclusions.
- `services/data-center/service.ts` exposes source creation, item creation and
  existing DRAFT/review/publication lifecycle. It must receive sanitized content
  only. A privacy verification is not a claim that business evidence is VERIFIED.
- `services/data-center/contracts.ts` supports bounded content, provenance,
  exact version/checksum, scope and rights. Its content bound is 200,000
  characters per item; no unbounded attachment import is assumed.
- `lib/auth/authorization.ts` and Data Center policy provide existing platform
  and organization authorization patterns, not a ready-made Gateway grant.
- `lib/observability/sentry.ts` removes several telemetry fields; it is not
  sufficient proof that a RAW parser process, proxy or crash dump cannot leak.

**Integration activation gate:** today's generic intake and Data Center write
surfaces are not shown to enforce a Gateway receipt. M0 therefore does NOT claim
platform-wide prevention of bypass. A future boundary inventory must identify
every client-analytics ingress/import/engine caller. No client-analytics rollout
may occur until all applicable entrypoints are gated or disabled. If enforcing
that requires changing any frozen module, STOP and obtain explicit owner
approval before editing. A new adapter alone cannot establish universal denial.
This is a known future integration approval gate, not permission to change
Data Center semantics or an allegation of a newly verified vulnerability.

## 2. Trust boundaries and deployment model

| Zone | Allowed contents / principal | Prohibited |
| --- | --- | --- |
| Control plane | Opaque job/package IDs, policy refs, state, grants, receipts | Document bytes, source filenames, extracted values, RAW token map |
| Intake data plane | Bounded upload streams; dedicated intake identity | Persistent user-file service, public object URLs, general app body logging |
| RAW worker enclave | Job-scoped encrypted files, local OCR/parser output, ephemeral token map | Internet, production DB, Data Center, engines, AI/model endpoints, shared writable volumes |
| Verification enclave | Exact candidate and necessary ephemeral RAW comparison, separate identity | Publishing, key administration, unrestricted downloads |
| Sanitized release zone | Verified allowlisted structured dataset and signed bound receipts | Original PDFs/Office/images, arbitrary binary attachments, hidden metadata |
| Publication adapter | Exact approved sanitized artifact, current destination authorization | RAW key access, arbitrary caller content or destination, engine runtime |
| Destruction controller | Inventory handles, key revoke/delete rights, safe metadata | New publication or retaining RAW for audit |
| Audit/monitoring | Allowlisted metadata and signed receipts | RAW samples, raw hashes exposed as lookup oracles, prompts, secrets |

Prefer a separate hardened worker runtime, not a parser spawned inside Next.js.
Read-only image, non-root identity, syscall/container isolation, no host mounts,
bounded CPU/memory/disk/processes, no network after receipt of scoped capabilities.
Scanner definitions arrive through a separate controlled update plane.
Malicious parsers must not inherit cloud metadata access, signing credentials,
database credentials, KMS administration, generic network or other job mounts.
Each attempt has a distinct workspace and fence epoch; no reuse across tenants.

All capabilities bind organization, client, package, job, attempt, artifact,
operation and expiry. They are server-issued after current authorization, never
permissions inferred from supplied IDs. Queue messages carry opaque handles and
fence epochs only; access capabilities are fetched just in time, not embedded
in durable queues. No RAW queue body, base64 file or extracted text.

## 3. Proposed strict contracts

Version all contracts independently under `jenan.privacy-gateway.* /v1`.
Reject unknown fields, invalid combinations, excessive size and unsupported
versions. Use explicit integers/byte counts, UTC timestamps, immutable policy
versions and canonical serialization for signatures/hashes. Financial values
remain exact decimal strings; never use binary floating-point coercion.

| Contract | Required binding / contents |
| --- | --- |
| PackageManifest | Server opaque packageId, organizationId/clientId, approved purpose/schema, legal/usage basis ref, policy version/hash, bounded declared inventory, expiry; not uploader-controlled trust |
| JobContext | jobId/attemptId, packageId, owner principal, scope, stateRevision/fence, created/deadline timestamps, policy/extraction/detector versions |
| IntakeReceipt | Actual streamed bytes/count, verified media category, opaque file ID, encrypted inventory ref, scan status/version; untrusted names remain RAW |
| ExtractionCandidate | Approved schema fields, exact values/unit/currency/period, opaque source locator, extraction uncertainty; taint RAW until verification |
| SanitizedArtifact | Rebuilt allowlisted schema, stable package tokens, provenance locators, explicit missing/uncertain states, classification/access/purpose/expiry, content hash |
| VerificationReceipt | Candidate hash, package/job/attempt, exact policy/extractor/detector/scanner versions, coverage matrix, analytical-fidelity checks, reviewer refs, residual-risk disposition, expiry, signature |
| ReleaseAuthorization | Exact receipt/artifact hash, tenant/client and destination source/type/scope/rights, independent approval, expiry, one logical publication ID |
| PublicationReceipt | Release ID, exact Data Center source/item/version/checksum/content hash, artifact hash, confirmed lifecycle state, audit refs and timestamp |
| DestructionReceipt | Inventory manifest commitment, per-location deletion/revocation results, key destruction status, fence epoch, failure exclusions, timestamps, independently signed final state |

Receipts are immutable and signed with an asymmetric service signing key distinct
from encryption/tokenization keys. Verify signer trust, key version, signature,
tenant binding, expiry and current grants on every action; a valid signature is
not a current authorization grant. Policy change never silently changes old
receipts; regenerate/reverify under an explicit new revision.

Raw filenames, file paths, bank/identity numbers, snippets, OCR boxes containing
values and detection matches are permitted only in the ephemeral encrypted
RAW evidence manifest. Durable audit uses opaque artifact/region IDs and counts.
Opaque actor IDs in the audit are still protected personal metadata.

## 4. State machine and guarded transitions

State is the product of three explicit state machines, not one misleading
linear SUCCESS flag. Every transition uses compare-and-set revision, attempt
fence and current authorization; retries cannot resurrect older candidates.

```text
Processing:
CREATED -> RECEIVING -> INTAKE_VALIDATING -> MALWARE_SCANNING
 -> RAW_READY -> CLASSIFYING -> EXTRACTING -> SANITIZING
 -> SANITIZATION_VERIFICATION
 -> SANITIZATION_VERIFIED

Any processing stage -> REJECTED | FAILED | CANCELLED | EXPIRED
Uncertain privacy/fidelity/coverage -> MANUAL_PRIVACY_REVIEW_REQUIRED
Approved independent review -> SANITIZATION_VERIFICATION (never straight to publish)

Publication:
NOT_REQUESTED -> RELEASE_AUTHORIZED -> PUBLISHING
 -> RECONCILIATION_REQUIRED | SANITIZED_PUBLISHED
Any unmet gate -> PUBLICATION_BLOCKED

RAW cleanup:
RAW_PRESENT -> DESTRUCTION_PENDING -> RAW_ACCESS_REVOKED
 -> DESTRUCTION_VERIFYING -> RAW_DESTROYED
                         -> DESTRUCTION_FAILED
```

`MANUAL PRIVACY REVIEW REQUIRED` is the human-facing label for
`MANUAL_PRIVACY_REVIEW_REQUIRED`. Manual review cannot override missing malware
clearance, unsupported parser capability, expired RAW or failed verification.
Review records a new bounded decision and reruns the verification gate.

Only SANITIZATION_VERIFIED exact artifacts can enter publication. Mutation,
new OCR, token changes, policy change, or new destination scope invalidates the
release authorization. No manual "force publish" transition.

Success requires both SANITIZATION_VERIFIED and SANITIZED_PUBLISHED, followed
by RAW_DESTROYED. A published job with deletion failure is explicitly
`SANITIZED_PUBLISHED + DESTRUCTION_FAILED`, never fully complete.
FAILED/CANCELLED/EXPIRED/REJECTED jobs also purge RAW by deadline; lack of
successful publication is not permission for indefinite retention.

## 5. Intake, formats and bounded extraction

All ceilings below are **proposed M0 defaults for owner approval and M1 tests**,
not measured production capacity. Limits apply at upload edge, stream reader,
archive traversal, conversion, OCR and output generation, including abort paths.

| Resource | Proposed hard maximum |
| --- | --- |
| Package ingress | 100 MiB compressed/uploaded aggregate |
| Individual source file | 25 MiB; outer ZIP may occupy package ingress ceiling |
| Aggregate expanded/container bytes | 500 MiB across the whole job, not reset per nested entry |
| Archive/container entries | 1,000 aggregate, including OOXML parts |
| Nested container depth | 3 total counting outer ZIP and OOXML; no opaque embedded archives |
| Expansion ratio | 100:1 per container and globally; absolute bound still applies |
| Document page / image pixels | 500 pages/job; 40 megapixels/image and 200 megapixels/job |
| Spreadsheet | 20 sheets, 100,000 populated cells/job; bounded XML strings/rows/columns |
| CPU/memory/time | 2 vCPU, 1 GiB worker RAM, 10 minute stage / 30 minute job |
| Tenant concurrency / temporary space | 2 active jobs; 1 GiB job scratch; bounded tenant quota |
| RAW TTL | 24 hours from first accepted byte; manual review does not extend it |
| Successful publish cleanup target | Revoke RAW access immediately; verified cleanup within 15 minutes |

Reject before committing bytes beyond a limit; do not read an entire ZIP before
checking ingress. Count actual decompressed bytes, not only central-directory
claims; reject CRC/size inconsistencies, malformed headers and trailing ambiguity.
Fail closed on scanner outage/stale definitions, parse timeout, decompression
budget, unsupported encryption/password-protected documents or ambiguous types.
Encrypted upload transport is supported; password-protected file payloads are
not silently opened or brute-forced.

- ZIP: reject traversal (`..`), absolute/drive/UNC paths, NULs, symlinks,
  hardlinks/devices, alternate streams, special/reserved names, Unicode/case
  normalization collisions and duplicate destinations. Use generated filenames,
  descriptor-relative safe creation/no-follow, isolated root and checked paths.
- PDF: strict parse plus malware scan; disable JS, launch actions, attachments,
  external resources and embedded executables. Malformed/polyglot or unsupported
  objects reject. Visible content and hidden text/metadata are both in scope.
- XLSX/DOCX: validate actual package parts, bounded XML (no DTD/entities),
  relationships, embedded objects and external links; no macro execution.
  Macro-enabled formats are rejected. Hidden sheets/comments/track changes are
  not ignored during detection. XLSX formula caches are untrusted extracted
  observations, never silently recomputed or assumed current.
- Legacy DOC/XLS: requested input families, but separate capability-gated
  sandboxed conversion/parsers are required. Until qualified:
  `UNSUPPORTED_FORMAT`, not a false success or extension-based DOCX parsing.
- CSV: bounded encoding/dialect parse, column/schema checks and formula-injection
  checks. Never execute cells or automatically export executable spreadsheets.
  If preserving an analytical field conflicts with safe parsing, manual review.
- JPEG/PNG/WebP (and further images only after explicit capability approval):
  full decode limits, metadata/GPS removal, visual OCR and re-identification
  inspection. No SVG/HTML/active content by renaming it an image.

Extension, declared MIME, magic bytes and strict parser result must agree under
an approved media policy. Generic/empty MIME is not trusted proof. CSV requires
structural validation since it has no unique magic signature.
Malware scanning uses local/private processing; no public multi-tenant scanner
submission. Scan original containers and expanded members before conversion;
rescan rewritten artifacts if applicable. CLEAN means scan passed, not
sanitization or freedom from all unknown malware.

Duplicate detection is scoped to the same client/package and purpose.
Use a package-keyed HMAC of complete bounded bytes internally; no cross-client
hash lookup, existence oracle or persistent RAW fingerprint. Logical retries
use opaque idempotency keys, not document identity. Partial uploads are never
treated as complete duplicates.

## 6. Classification, minimal extraction and sensitive-data policy

Classify format, business document family and sensitivity locally using
versioned rules/offline detectors. All extracted content, including financial
tables and classifier output, stays RAW-tainted until sanitized verification.
No generative AI/LLM, external OCR, remote document analytics or model telemetry
is allowed in this initial architecture. Any later RAW AI path requires separate
owner authorization, explicit processor/retention/residency and threat review;
it is not an automatic fallback.

Minimum necessary fields are an approved purpose-specific allowlist, not
"extract everything then hope to redact". Local OCR/NLP may propose findings;
absence of a detector hit is not proof of absence. Arabic/English mixed text,
Arabic-Indic digits, OCR substitutions and contextual entity ambiguity need
coverage. Ambiguous or unreadable regions force review or reject.

Detect/remove or package-tokenize as purpose permits:

- Personal names; owner/authorized representative/signatory identity.
- National ID/iqama, phone, email, tax/business identifiers where not required,
  passport/customer/employee/account IDs and unnecessary free-text identifiers.
- IBAN/bank accounts/cards, signatures/seals/stamps, QR/barcodes, document numbers.
- Exact addresses/GPS, embedded metadata, hidden layers/rows, comments, revision
  history, attachment names, links and machine-readable image payloads.

Decode QR/barcodes only offline and within bounds; never follow encoded URLs.
Remove their visual and payload channels even when unreadable; inability to
locate/verify all such areas requires manual review. A seal may combine text and
image identity and cannot be handled by text regex alone.

**Analytical preservation invariant:** do not tokenize/redact required amounts,
transaction dates, revenues, expenses, salaries, rents, taxes, cash flows,
liabilities, accounting categories, quantities, prices, units or currencies.
Do not recompute existing engine results. Missing stays missing, never zero.
No blind digit/name regex over all fields. Distinguish identifiers from analytical
numbers through schema/context plus verification. Preserve signs, precision,
periods, formulas-as-declared observations, row multiplicity and source links.
Record extraction uncertainty rather than fabricate a value.

Removing a person's name while retaining their salary/date is not guaranteed
anonymity. Rare category, exact location/date or small cohorts can re-identify.
If required analytical fidelity and acceptable privacy risk conflict, block
publication for owner/privacy review; never silently alter amounts/dates,
coarsen categories or publish identifiable data under a "sanitized" label.

## 7. Redaction, tokens and verification

Primary released output is newly built structured JSON/table data, not an
incrementally edited original Office/PDF/image. Original documents are never
published as-is. Redacted derivative documents, if later required, are a
separate qualified capability: irreversible full rewrite/raster handling,
re-OCR/render inspection, metadata/hidden-layer/embedded-object removal, with
no black-rectangle-only or incremental-save claim.

Stable tokens are package-local opaque random 128-bit-or-greater identifiers.
Maintain an encrypted ephemeral mapping from entity type plus approved
normalized value to token, authenticated by package context. Use keyed lookup,
not unkeyed hashes of low-entropy phone/ID values. Normalize cautiously by type;
no fuzzy name merging or same-name identity inference. Ambiguous entity links
require explicit review. Different packages/clients receive unrelated tokens.
Tokens must not encode tenant/name/account digits. A token collision is detected
and rejected/regenerated before verification; never silently merges entities.

Keep the mapping key and lookup material within the same per-job RAW lifetime.
No permanent reverse vault or detokenization API. After destruction only the
tokens already in sanitized records survive. A retry of the same immutable
verified artifact reuses its tokens; a fresh post-destruction ingestion cannot
recreate the mapping and is a new package/revision, not a false identical replay.

SANITIZATION_VERIFICATION uses a distinct stage/identity and independent checks:

1. Complete inventory/format/page/sheet/region coverage; no skipped or unparsed
   object disguised as clean.
2. Reparse/re-OCR rebuilt output and detect residual identifiers, metadata,
   formulas/links, image signatures/stamps and package identifiers.
3. Required analytical-field fidelity versus ephemeral extraction: exact
   decimal/date/unit/currency values, row counts and approved consistency
   checks, without mutating source or engine calculations.
4. Entity-link preservation and no cross-package tokens/identity map export.
5. Privacy/quasi-identifier risk assessment under exact approved purpose and
   access scope, with positive rule coverage and explicit residual limitations.
6. Verify exact artifact/policy/version/hash, scanner qualification and current
   reviewer authorization; produce signed bounded verification receipt.

No blanket "100% privacy" or detector-confidence-equals-verification claim.
A missing supported verification path yields MANUAL_PRIVACY_REVIEW_REQUIRED.
Manual review is privileged, scoped, audited, no-download/no-clipboard by default
and before TTL; technical controls cannot guarantee an authorized reviewer never
photographs a screen, which remains a residual organizational risk.

## 8. Publication and distributed consistency

Only the publication service can read the sanitized release zone and write via
existing Data Center APIs. It has no RAW keys. Sanitizer cannot publish;
publisher cannot sign its own verification. An authenticated admin alone is not
the necessary second approval.

Validate current principal/grant, organization/client binding, approved
destination/source/type and no-widening rights, exact release/receipt/signature/
hash and freshness before each action. Publish sanitized content through existing
DRAFT -> independent review -> approved publication semantics; do not bypass
Data Center approval or label privacy verification as source truth/accuracy.
No generic automatic platform-wide source, public scope or export permission.
Sanitized rights are no broader than approved source/purpose/tenant rights.

Use sanitized provenance references such as opaque `privacy:package:...` and
signed receipt IDs; never filename/RAW URL/account number. Record exact package,
policy/extraction/classification versions, audit refs, UTC time and artifact
hash in bounded sanitized provenance/content metadata, respecting existing
contracts. RAW originals are not Data Center upstreamVersionIds: those refer
only to real Data Center versions. Partition an oversized structured dataset
under a bounded manifest and verify every part; if current semantics cannot
represent the required lineage safely, STOP for explicit integration approval.

Object store, Gateway metadata and Data Center are not one atomic transaction.
Use a Gateway-owned sanitized-only outbox, unique release ID and exact
destination/version reconciliation. A crash/timeout after a Data Center write
is `RECONCILIATION_REQUIRED`, not permission to publish again.
Freeze retries until the exact prior outcome is proved. Do not guess by latest
version or title. If the existing APIs cannot support provable recovery and
duplicate protection, that is an activation blocker requiring approval, not a
reason to add hidden Data Center writes or weaken semantics.

SANITIZED_PUBLISHED means all required manifest parts have exact acknowledged
published versions and an authentic publication receipt. Missing part or draft
is not successful publication. The existing lifecycle may make individual
sanitized parts visible before the entire manifest completes; M0 does not claim
multi-item atomic visibility. If all-or-nothing visibility is required, STOP
before rollout for a separately approved integration mechanism.

## 9. Encryption and key model

- TLS 1.2+ (prefer 1.3) for ingress and service transport; workload identity and
  authenticated service channels; reject cleartext/proxy body-spool fallbacks.
- Authenticated envelope encryption, e.g. AES-256-GCM with unique nonces and
  authenticated organization/client/package/job/artifact/chunk/sequence/length
  context. Detect missing/reordered/truncated chunks before processing.
- Distinct random RAW data keys per job/attempt; distinct sanitized-storage
  encryption and receipt-signing keys. Token-map key separate from data key.
- Keys generated/used through a qualified KMS/HSM or isolated key broker;
  never hardcoded, logged, placed plaintext in application DB/Redis/env files,
  or shipped with worker images. Durable control rows contain opaque handles,
  not decryption material.
- No broad shared master key makes crypto-shredding claims automatically valid.
  Wrapped RAW keys retained in snapshots remain recoverable while their
  wrapping key exists. Qualification must prove per-job irreversible
  destruction of every recoverable key version/wrapped copy, including broker
  backups/escrow/replicas; otherwise crypto-shredding remains NOT_VERIFIED.
- Least privilege split: intake encrypt-only, assigned workers bounded decrypt,
  verifier assigned review decrypt, publisher sanitized-only, destruction
  revoke/delete, security custodians key administration. No one normal job
  identity has all grants.
- Rotate wrapping/signing keys with versioned trust and explicit rewrap policy.
  Expired RAW jobs must not be rewrapped/restored. Retain public signing keys
  needed for old receipts, not retired private RAW decryption material.
- Provider scheduled deletion is KEY_DELETION_PENDING until irrecoverable.
  Revoking access is not equivalent to key destruction. Break-glass use is
  dual-approved, short-lived, independently audited and cannot extend RAW TTL.

Provider, residency, dedicated key destruction semantics and legal basis remain
deployment qualification decisions. No Azure/cloud subscription or paid provider
is selected or provisioned in M0.

## 10. Authorization, ownership and audit

Gateway is privileged internal infrastructure. No public user upload endpoint,
anonymous ingest, ordinary organization-owner access or generic admin bypass.
Reuse trusted session/service identity and existing current authorization
patterns; add Gateway-owned scoped grants without changing existing RBAC meaning.

Proposed capabilities: `privacy.intake`, `privacy.process`, `privacy.review`,
`privacy.release`, `privacy.destroy`, `privacy.audit`. Human access requires an
active privileged internal identity AND an active org/client/job grant. Worker
identity requires assigned job/attempt and the specific operation. ClientId is a
validated internal relationship to an organization, not a caller claim.
Do not overload end-user impersonation or robot analytical grants.

Initiator/operator cannot independently approve their own release. Review,
release, key administration and destruction duties are explicitly separated.
Every read, review, retry, transition, publication and cleanup authorization is
reevaluated; URLs/capabilities alone never bypass revoked membership/grants.
No job listing by global hash. Scoped absent/unauthorized share a bounded error.
Server query scope precedes lookup disclosure. CSRF/same-origin for future
cookie-auth admin actions; mTLS/service credentials for worker APIs, method
allowlists, rate/quota limits, replay protection and streaming upload limits.
No routes or admin UI are implemented in M0.

Audit is append-only, per-tenant access controlled and independently integrity
checked: event ID, opaque actor/job/package/artifact refs, operation, previous/
next state/revision, policy hash, bounded reason code, timestamp, result and
receipt IDs. Use signed event chains or immutable audit sink plus monitored
sequence reconciliation; a mutable row named "append only" is insufficient.
Audit outage blocks release/RAW access; cleanup still proceeds under a durable
minimal local receipt spool containing metadata only, later reconciled.
No free-text parser error, filenames, SQL parameters, RAW hashes, cell values,
OCR text, request bodies or identifiers in audit/logs/metrics/traces.
Metrics labels must be bounded and non-identifying.

## 11. Data lifecycle and destruction guarantees

| Artifact | Location / lifetime | Retained after completion |
| --- | --- | --- |
| Upload archive and partial/multipart chunks | Dedicated encrypted RAW intake, hard TTL | No |
| Extracted documents, names, metadata and OCR/cache/render artifacts | Assigned enclave, RAW key, same or shorter TTL | No |
| Scanner quarantine and parser diagnostics | Same job RAW inventory; no vendor retention | No |
| Token map/lookup key, extraction comparison baselines | Ephemeral encrypted job namespace | No |
| Queue messages/leases | Opaque IDs only, bounded expiry | No RAW; minimal audit state only |
| Sanitized candidate | Restricted staging, versioned TTL | Only selected verified published dataset |
| Published sanitized dataset and safe provenance | Governed Data Center scope/retention | Yes, under existing governance |
| Hashes/audit/sanitization/publication/destruction receipts | Restricted metadata retention policy | Yes, no RAW recoverability |

RAW hashes are not innocent anonymized metadata: predictable identifiers/documents
can be guessed. Do not retain naked RAW content SHA-256 or keyed dedup material
after destruction. Retained hashes are sanitized content hashes, signed receipt/
inventory commitments over opaque artifact metadata and ciphertext digests;
they cannot be used as public RAW equality or recovery services.

Success cleanup starts only after exact SANITIZATION_VERIFIED plus
SANITIZED_PUBLISHED acknowledgment. Failure/cancellation/TTL independently
triggers cleanup regardless of publication. If publication is unresolved at TTL,
destroy RAW anyway, block further extraction, and reconcile only the already
verified sanitized candidate; otherwise require fresh intake.

Destruction sequence:

1. Fence/cancel work and uploads; stop new reads, leased decrypt and retries.
2. Inventory originals, extracted files, chunks/abandoned multipart uploads,
   versions/replicas, quarantine, scratch/cache/OCR/render artifacts, token maps,
   queue/dead-letter handles and intermediate files. Drain/kill assigned workers.
3. Revoke capabilities and keys, evict key/plaintext caches, unmap memory and
   terminate sandboxes. No hibernation, swap, core dumps or crash snapshots.
4. Delete artifacts and every recoverable storage version/replica by inventory;
   invalidate access paths. Destroy qualified per-job key material.
5. Independently verify absence/inaccessibility, worker termination, key/broker
   irreversible state, multipart/version/replica/TTL sweeps and queue expiry.
6. Sign destruction receipt, retaining only sanitized data and safe metadata.
   Delete encrypted RAW manifests after producing safe destruction evidence.

Storage profiles must exclude RAW from database/object/volume backups, versioning,
snapshots, CDN, proxy request capture, APM, crash dumps and scanner vendor
submission. Configuration checks and restore drills must substantiate exclusions.
No shared standard file service, ordinary backup job or general worker queue
may handle RAW simply because it is encrypted.

Guarantee is **verified logical deletion plus qualified cryptographic
irrecoverability**, not an unverifiable assertion of physical overwrite of
SSD/provider media. Deleted object API acknowledgment alone is insufficient.
If any RAW location/key copy is unknown or recoverable, set DESTRUCTION_FAILED
or DELETION_PENDING, revoke access, alert with safe metadata, retry boundedly
and escalate. Never issue RAW_DESTROYED until all required checks pass.
If the provider cannot meet hard TTL/key-destruction requirements, intake is
BLOCKED on that provider. No silent retention exception or infinite quarantine.

Operational original documents belong to a separately authorized system with
its own legal retention/access policy. This analytics pathway stores only a
temporary copy, never an archive, legal-hold vault or automatic migration of
originals elsewhere. This design neither creates a funding service nor deletes
legitimately retained documents in an independent operational system.

## 12. Threat model and failure behavior

Assets: RAW identities, financial confidentiality, key/mapping material, tenant
separation, analytical fidelity, release authority, audit/destruction evidence.
Adversaries: malicious uploader/document, compromised parser/worker, ordinary
user, overprivileged insider, mistaken reviewer, queue/retry attacker and
storage/telemetry misconfiguration. Provider/operator compromise and screen
capture remain residual risks requiring contractual/organizational safeguards.

| Threat / failure | Required boundary / result |
| --- | --- |
| Spoofed MIME, polyglots, malformed documents | Structure+parser agreement; reject; purge |
| ZIP/image/XML bombs, resource exhaustion | Aggregate streaming budgets, sandbox quotas and timeouts; no publish |
| Traversal/symlink/path collision | Descriptor-relative isolated extraction and opaque file names |
| Malware or parser exploit | Clean scan gate, patched pinned parser, no-egress enclave; quarantine stays ephemeral |
| Prompt injection/document instructions | Treat all content as data; no RAW LLM/tool execution |
| OCR misses, covered signatures, hidden content | Complete coverage, independent verification; manual review/reject |
| Over-redaction or numerical corruption | Schema-aware protected fields and exact fidelity checks; block |
| Token reversal/linkage/cross-tenant correlation | Package-local random map, separate keys, no reverse service, quasi-ID review |
| Unauthorized read or forged tenant/job ID | Current scoped authorization before metadata; same unavailable response |
| Receipt replay/artifact substitution | Signatures and exact content/policy/scope/attempt fence; no latest fallback |
| Concurrent stale worker or duplicate publish | CAS/fencing, unique logical release, exact reconciliation; unresolved blocks |
| KMS/scanner/audit outage | No plaintext/no-scan fallback; release blocked; independent cleanup remains active |
| Crash after Data Center write | Reconcile exact version, not blind retry or assumed success |
| Crash/disk spool/key escrow/backup leak | Dedicated qualified storage profile, startup janitor, restore drills; no destroy claim until proof |
| TTL expiry/manual review backlog | Revoke and purge; require new intake, never indefinite extension |
| Deletion/replica/key failure | DESTRUCTION_FAILED/PENDING, safe alert, retry/escalation; not completed |
| Existing client-data ingress bypass | Activation blocked until boundary wiring explicitly approved and verified |

Stable public error codes: `PRIVACY_UNAVAILABLE`, `UNSUPPORTED_FORMAT`,
`INTAKE_LIMIT_EXCEEDED`, `MALWARE_REJECTED`, `SCAN_UNAVAILABLE`,
`EXTRACTION_UNCERTAIN`, `PRIVACY_REVIEW_REQUIRED`, `VERIFICATION_FAILED`,
`RELEASE_BLOCKED`, `PUBLICATION_RECONCILIATION_REQUIRED`,
`DESTRUCTION_PENDING`, `DESTRUCTION_FAILED`. No RAW/vendor exception detail.
Resource failures are explicit and audited, never partial-success fallbacks.

## 13. Proposed M1-M5 execution and gates

Each milestone requires owner checkpoint approval before the next.

| Stage | Proposed implementation / required evidence |
| --- | --- |
| M1 | Strict pure contracts, taint/type semantics, policy/version bounds, state-machine/CAS model, signatures/hashes, token/fidelity semantics, adapter interfaces and architecture negative tests. No live RAW intake/DC writes. |
| M2 | Qualified isolated encrypted staging/key broker, streaming intake/format/scan/extraction sandbox boundaries, TTL/janitor, scoped authorization and metadata-only queues; hostile synthetic corpus and provider deletion/backup capability evidence. No publication. |
| M3 | Local minimal extraction/detection/sanitization, package-local stable tokens, protected analytical fields, independent verification/manual-review service contracts; Arabic/English, visual/hidden/QR, fidelity and residual-risk cases. No UI redesign or RAW LLM. |
| M4 | Gateway-owned durable metadata/outbox/audit, separate approved sanitized Data Center publisher integration, exact reconciliation/idempotency, destruction inventory/key revocation/receipts and crash recovery. STOP for frozen-module/schema changes before implementation. |
| M5 | End-to-end synthetic hostile-document acceptance; access revocation/tenant isolation, independent verification bypass attempts, races/crashes/TTL/outages, forensic residue/restore/deletion drills, bounded performance, quality gates and exact-tested-SHA security scan. Explicitly separate real-client-data/legal/provider qualification from synthetic success. |

M1-M5 do not authorize public routes/UI, external RAW processors, subscriptions
or frozen module changes. New Gateway persistence will likely need additive
dedicated tables/migrations before M4. No schema change is authorized by M0;
present exact schema and privilege impact for owner approval first. The same
applies to package manifests/dependencies and infrastructure configuration.
No ad hoc files/JSON blobs in Shared or existing production tables as a shortcut.

### Exact proposed source/test locations

These paths are a **future inventory**, not files created in M0. Grouped files
may be consolidated if implementation evidence favors simpler boundaries;
contract/security responsibilities must not disappear.

```text
services/privacy-gateway/contracts.ts
services/privacy-gateway/policy.ts
services/privacy-gateway/states.ts
services/privacy-gateway/receipts.ts
services/privacy-gateway/sanitization.ts
services/privacy-gateway/verification.ts
services/privacy-gateway/index.ts
services/privacy-gateway/adapters/authorization.ts
services/privacy-gateway/adapters/staging.ts
services/privacy-gateway/adapters/keys.ts
services/privacy-gateway/adapters/intake.ts
services/privacy-gateway/adapters/sandbox.ts
services/privacy-gateway/adapters/scanner.ts
services/privacy-gateway/adapters/extraction.ts
services/privacy-gateway/adapters/token-map.ts
services/privacy-gateway/adapters/jobs.ts
services/privacy-gateway/adapters/audit.ts
services/privacy-gateway/adapters/publication.ts
services/privacy-gateway/adapters/destruction.ts
workers/privacy-gateway-worker.ts
workers/privacy-gateway-cleanup.ts
tests/unit/privacy-gateway-contracts.test.ts
tests/unit/privacy-gateway-policy.test.ts
tests/unit/privacy-gateway-states.test.ts
tests/unit/privacy-gateway-sanitization.test.ts
tests/unit/privacy-gateway-verification.test.ts
tests/unit/privacy-gateway-boundaries.test.ts
tests/integration/privacy-gateway-intake.integration.test.ts
tests/integration/privacy-gateway-isolation.integration.test.ts
tests/integration/privacy-gateway-publication.integration.test.ts
tests/integration/privacy-gateway-destruction.integration.test.ts
tests/integration/privacy-gateway-acceptance.integration.test.ts
tests/unit/support/privacy-gateway-fixtures.ts
docs/privacy-gateway-v1.md
```

Only synthetic, non-identifying hostile fixtures; no real customer files in
Git/tests/artifacts. Never run hostile parsers or malware in an ordinary shared
developer host. Testing live samples requires a dedicated approved sandbox.

**Approval-gated potential modifications, not approved or edited now:**
`prisma/schema.prisma` and one additive migration (exact directory only after
schema review); `package.json`/lockfile for qualified parsers/scanner client;
deployment worker/network/key/storage policy files (provider not yet selected);
existing client-analytics ingress/DC/engine callsites only after exact bypass
inventory and explicit approval. Existing `services/files/*`, `lib/storage/*`,
`services/data-center/*`, `services/analysis-engines/*`, `services/jenan-map/*`,
UI routes and shared modules are not planned edit targets absent that approval.

## 14. M0 delivery status and owner decisions

**Created in M0:** this architecture document only.
No source, dependency, schema, production policy, API, UI, worker or existing
architecture was changed. No runtime tests/build/CodeQL/Sonar are claimed for
a documentation-only design. No new commit/push/deployment is implied.

Owner review must resolve before the applicable implementation milestone:

1. Proposed per-format limits, legacy DOC/XLS qualification and strict rejection.
2. RAW TTL/cleanup target, provider residency and legal/usage/retention basis.
3. Key broker/provider proof of irreversible per-job destruction and backup exclusions.
4. Review/release duty separation and required protected-field schemas.
5. Dedicated metadata schema and exact publication/bypass integration exception.

Unresolved choices do not prevent review of M0, but **block the corresponding
implementation/activation**, never silently default into weaker controls.
No platform-wide RAW-blocking, permanent anonymization, physical media wipe,
real-data acceptance or destruction guarantee is asserted as already implemented.

**M0 awaiting owner review. STOP before M1.**

## 15. M1 checkpoint: contracts / policies / state model

The owner approved M0, its initial intake policy defaults, 24h RAW TTL and
15-minute cleanup target (not yet an operational guarantee). Legacy DOC/XLS
remain rejected until an independently qualified capability exists.
The original section 14 is historical, not the current approval state.
**M1 only; STOP before M2.**

### 15.1 Exact implementation inventory

Added, isolated foundation modules:

- `services/privacy-gateway/contracts.ts`: strict versioned PrivacyJob,
  ClientPackage, IntakeArtifact, RawArtifact, SanitizedArtifact, SanitizationPolicy,
  VerificationReceipt, PublicationReceipt, DestructionReceipt, PrivacyActor,
  PrivacyRole/Grant, TokenizationScope, failure/review/reconciliation contracts.
- `services/privacy-gateway/policy.ts`: approved initial bounds and protected
  analytical fields, bounded strict JSON hashing, policy-content pin validation,
  current scoped grant evaluation and RAW role-access guards.
- `services/privacy-gateway/states.ts`: explicit processing/publication/
  destruction adjacency tables, revision/attempt/fence checks, taint/lineage/
  participant guards, bound receipt evidence, cleanup retry and immutable
  transitions returning a new job.
- `services/privacy-gateway/audit.ts`: allowlisted opaque audit event schema
  and safe error-wrapped parser; no arbitrary metadata, text or content fields.
- `services/privacy-gateway/index.ts`: exports only those foundation modules.

Added test-only files:

- `tests/unit/privacy-gateway-foundation.test.ts`
- `tests/unit/privacy-gateway-boundaries.test.ts`
- `tests/unit/support/privacy-gateway-fixtures.ts`

Updated document: `docs/privacy-gateway-v1.md` (original M0 document plus this
M1 checkpoint). No existing tracked production module or frozen engine is an
edit target. The M0 document had not been committed at M1 start; it remains
a new local document in the Git inventory, not an existing tracked code change.
No commit/push, branch change, final tag, main merge or remote/archive sync
is implied by this checkpoint.

### 15.2 Contracts, pins and analytical fidelity

All contracts have fixed v1 identifiers and strict unknown-field rejection.
`PRIVACY_VERSION = 1.0.0-m1`. Scope binds organization/client/package/job opaque
UUIDs plus attempt/fence where relevant. Dates are canonical millisecond UTC;
counts are bounded integers. No business values, originals, binary buffers,
free-text names or extraction text are accepted in durable metadata contracts.

RAW-tainted types cover original/partial uploads, extracted files, OCR, cache,
quarantine, intermediates and token mappings. SanitizedArtifact explicitly means
**SANITIZED_CANDIDATE**, structured allowlist data, `anonymous=false` and
`allowExport=false`. Only the separate exact VerificationReceipt establishes
the verified lifecycle state; changing an artifact tag does not publish it.
TokenizationScope requires package-local opaque random tokens, RAW mapping,
an ephemeral key handle and no reverse service. No tokenizer, secret mapping,
key generation or re-identification algorithm is executed in M1.

The policy pins exact sanitization/extraction/classification/tokenization/
verification component, semver and SHA-256 references. The sanitization policy
content hash omits only its own nested `pins.sanitization.hash`, avoiding
recursive self-hashing; all remaining policy content and four other component
references are included. Transition context separately binds the hash of the
complete pinned policy. Policy changes or version substitution fail closed.

The existing Shared canonical encoder is reused **read-only** without changing
Shared contracts or importing any engine runtime. A Gateway wrapper rejects
cycles, sparse arrays, accessors/hidden properties, non-JSON types, invalid
numbers, deep/large structures and custom serialization before hashing.
Bounds: 32 structural levels, 20,000 nodes, 256 KiB serialized metadata.
Arrays retain order and exact decimal strings retain their text precision.
Error messages are safe codes, never canonicalization paths or submitted values.

All fourteen protected analytical-field categories from M0 must remain in the
policy. Removing a category is rejected even if the policy hash is recomputed.
M1 does not extract/redact values or claim real numerical fidelity; its contracts
require exact-fidelity evidence and reject unsupported claims. Measurement of
actual preservation belongs to M3/M5.

### 15.3 State-machine enforcement and evidence boundaries

The three explicit lifecycles from section 4 are implemented. No direct
CREATED/RAW -> verified/published/destroyed shortcut exists. Terminal states
cannot restart. The processing graph permits explicit failure/cancel/expiry
transitions, never successful promotion as a fallback.

Every transition parses the complete job/context/policy/evidence, matches
expected revision, attempt/fence and pinned policy, checks monotonic time and
current passed-in grants, then returns a new validated job. These are **pure
precondition guards**, not a live database compare-and-set implementation.
No durable concurrency/idempotency guarantee is claimed before persistence
and atomic adapters are implemented.

RAW_READY requires explicit clean-scan evidence. SANITIZATION_VERIFIED requires
complete bound verification evidence: exact artifact/schema/lineage hashes,
inventory/coverage/malware checks, required analytical fidelity, residual-risk
acceptance, independent actor and unexpired receipt. Manual-review approval is
a separately scoped/revision-bound review record; it returns only to
SANITIZATION_VERIFICATION. It cannot directly authorize publication.

Publication requires a current verified artifact and separated actor. Exact
publication receipt binds the verification receipt, release ID, exact DC
source/item/version/checksum and full-part acknowledgement. It must record
RAW access revocation at publication time. Ambiguity becomes
RECONCILIATION_REQUIRED, which has no edge back to PUBLISHING; no blind retry
or latest substitution. Missing exact receipt prevents completion.

Destruction requires revoked RAW access, complete checks for all recoverable
locations/versions/multipart/quarantine/cache/OCR/token maps/queues/workers,
irreversible keys and backup exclusion. Inventory hash and count must match
the job's exact inventory, with every item checked and no unknown location.
Object-delete-only, scheduled-key-deletion and incomplete inventories fail.
Cleanup failure permits a bounded-state retry without reactivating RAW.
Expiry/failure can start cleanup without successful publication.

**Important M1 trust limitation:** receipt signatures are strict structural
Ed25519 envelopes only. `authenticatedReceiptHash`, clean-scan evidence and
current-grant inputs are trusted-server adapter preconditions, **not evidence
that M1 verified a real signature, scanner, storage provider or identity**.
Synthetic tests deliberately use placeholder signatures. Callers can construct
these pure data structures; no HTTP/queue ingress may pass user JSON through
as trusted evidence. Future adapters must authenticate signatures/key versions,
fetch current grants and bind their check to the exact receipt digest before
calling these functions. That adapter is not implemented or activated in M1.
No success-shaped claim of cryptographic verification or real destruction.

### 15.4 Role separation, RAW access and audit

Roles: INTAKE, SANITIZER, VERIFIER, PUBLISHER, DESTROYER, KEY_ACCESS, AUDITOR.
An active privileged-internal identity requires active exact scoped grants,
matching authorization revision and current validity window. Wrong org/client/
package/job, revoked/inactive/expired grants and inactive actors fail.
This is contract evaluation, not a live lookup or new platform-admin privilege.

Current-grant combinations reject sanitizer+verifier, sanitizer+publisher,
verifier+publisher and publisher+intake/key access. Job participation separately
prevents an actor processing RAW, then changing its role to verify/release.
The initiator cannot verify or publish their own package; verifier and publisher
must also differ. RAW access requires KEY_ACCESS plus an appropriate current
intake/sanitizer/verifier grant, and a live nonrevoked job. Publisher never
obtains RAW access, including through a combined publisher/key grant.

AuditEvent accepts only opaque UUIDs, bounded enums, timestamp/revision,
policy/previous-event hashes and optional artifact/receipt UUIDs. No generic
metadata bag, filename, OCR text, RAW hash, prompt, email, phone, IBAN or exception
text. Additional fields are rejected, not silently stripped. UUID syntax is not
proof of random generation or de-identification; future adapters must issue
opaque IDs and cannot encode identity values. No audit sink, signing chain,
telemetry transport or persistence is activated.

Required failure codes are implemented:
MALWARE_SCAN_UNAVAILABLE, UNSUPPORTED_FILE_TYPE, ARCHIVE_LIMIT_EXCEEDED,
MALFORMED_INPUT, SANITIZATION_UNCERTAIN, MANUAL_PRIVACY_REVIEW_REQUIRED,
VERIFICATION_FAILED, PUBLICATION_RECONCILIATION_REQUIRED, DESTRUCTION_PENDING,
DESTRUCTION_FAILED, AUTHORIZATION_DENIED, LINEAGE_MISMATCH, HASH_MISMATCH.
Additional explicit guard codes: ILLEGAL_TRANSITION, STALE_REVISION,
POLICY_MISMATCH. Failure contracts carry opaque scope/audit refs and no submitted
content; a code exists independently of whether its future provider is wired.

### 15.5 BYPASS INVENTORY / ACTIVATION BLOCKER

These are observed existing capabilities, **not newly closed security findings**
or proof of an anonymous attacker path. Existing authorization remains in place.
Privacy receipt enforcement must be designed/approved before these surfaces can
be used for client analytics; no change is made in M1.

| Existing surface | Observed flow | Activation requirement |
| --- | --- | --- |
| `app/api/files/route.ts`, `services/files/file-asset-service.ts` | Authenticated file upload stores original bytes in existing document storage and may associate a project | Do not use as Gateway RAW staging or feed client files to analytics without a verified sanitized handoff |
| `app/api/admin/data-center/route.ts`, `lib/admin/data-center-http.ts` | Admin multipart `import-file` and JSON commands dispatch directly to Data Center | Distinguish governed non-client sources from client analytics; require exact approved release for client data, with separate owner approval before editing |
| `services/data-center/imports.ts` | Existing import stores original document bytes and creates a Data Center item; original-download path exists | Not compatible with ephemeral analytics RAW; explicit approved integration design required, no reuse as temporary staging |
| `services/data-center/service.ts` | Direct create/version APIs accept caller-supplied content under existing governance | New publisher adapter alone cannot prevent all direct client-data writes; approval-gated boundary wiring/reconciliation needed |
| `app/api/projects/route.ts`, `services/projects/project-analysis.ts` | Existing save/run analysis flow consumes persisted user study input, including free text; no Gateway receipt contract | Scope customer analytics ingress explicitly; do not claim all manual fields sanitized, and do not modify Projects or engines in M1 |

This inventory is bounded to inspected surfaces, not an exhaustive platform
security audit. Source-specific direct imports and remaining callers must be
inventoried before activation. No source, UI, engine or RAW ingestion path is
rerouted/disabled. Closing the identified bypasses touches frozen components:
**activation is BLOCKED pending exact integration proposal and explicit owner
approval. STOP before making any such edit.**

### 15.6 M1 verification receipts

| Gate | Result |
| --- | --- |
| Privacy foundation/contracts/policy/lifecycle/auth/audit unit cases | **299/299 PASS** |
| Privacy architecture capability-boundary cases | **34/34 PASS** |
| Privacy M1 total | **333/333 PASS** |
| Unchanged global engine boundaries | **20/20 PASS** |
| Focused total, three files | **353/353 PASS, no skips** |
| TypeScript | PASS |
| Scoped ESLint | PASS, zero warnings |
| Production build | PASS on final-source unchanged retry; advisory interruption retained |
| Sequential post-build TypeScript | PASS |
| git diff --check / new-file whitespace / frozen tracked-file diff | PASS / PASS / unchanged |

`privacy-m1-focused-final.log`: **353/353** in **1.80 s**. It includes exhaustive
negative processing edges in addition to positive separated flow, rejection of
unverified publication, RAW taint substitution, collapsed and sequentially
switched duties, wrong scope/revoked grants, mismatched receipt/pins/hashes,
manual review/reconciliation, missing destruction checks/inventory, RAW TTL/
revocation and no-sensitive-content audit tests. Architecture negative probes
reject DB/storage/filesystem/network/AI/OCR/process/dynamic-code/hidden-clock
capabilities while allowing only Zod, local pure modules and read-only Shared
canonical encoding. No adapter/route/worker exists.

`privacy-m1-typecheck-final.log` and `privacy-m1-eslint-final.log`: PASS,
zero lint warnings. The final source additionally caps artifact lifetime at
24h and rejects revocation timestamps outside the recorded job lifetime;
the final-source suite and quality gates include these guards.

`privacy-m1-build-final.log`: **FAIL**, inherited Next.js dependency advisory.
`privacy-m1-build-final-retry.log`: **PASS**, identical unchanged retry.
No dependency/security remediation or upgrade is claimed. Earlier initial
build/advisory and unchanged retry receipts are also retained; they are not
substituted for the final-source build evidence. Only generated Next
declaration-path drift is restored before the post-build typecheck.
`privacy-m1-typecheck-postbuild-final.log`: **PASS** after that restoration.
Final tracked `git diff --check` and explicit whitespace checks on every new
file: **PASS**. All existing tracked files remain unchanged from
`6683d460291ca34c270eb3a5a1ca451295349d75`; new files are only the nine paths
listed in section 15.1, including the M0/M1 document.

The foundation is local and uncommitted; no remote/desktop synchronization or
new tested commit SHA is claimed in this M1 checkpoint.

No PostgreSQL, live RBAC/KMS/scanner/OCR, external AI, RAW ingestion,
Data Center publication or physical/cryptographic destruction acceptance is
claimed in M1. No Sonar or CodeQL claim, subscription, dependency change,
production deployment, main merge, final tag or automatic M2 work.

**M1 approved / closed by owner on 2026-10-23.**

### 15.7 Approved baseline preservation

Exact approved M0/M1 source baseline:
`85c916ef38ffc24431ed3d0bfcbe5366459e6ad8`.
Dedicated branch: `jenan-platform/privacy-gateway`.
This documentation-only follow-up records that immutable source baseline.
The previous local/uncommitted statement describes the submitted M1 checkpoint,
not the subsequently authorized baseline preservation.
Before M2, push this branch only, create the separate Desktop
`JenanPRO/privacy-gateway` archive, and verify clean local/remote/archive HEADs.
No main/integration merge or final tag is authorized.

## 16. M2 secure intake checkpoint (not production activation)

### 16.1 Preserved M1 baseline

Approved M0/M1 source commit: `85c916ef38ffc24431ed3d0bfcbe5366459e6ad8`.
Baseline documentation closure: `1158d6e15c2360fbe41f4d6f57f60a6fbc83fb47`.
Before any M2 edit, that closure was pushed to **only**
`origin/jenan-platform/privacy-gateway` and cloned to the independent Desktop
`JenanPRO/privacy-gateway` archive. Local HEAD = remote Privacy branch HEAD =
Desktop archive HEAD at that closure, with both working trees clean.
The Risk archive and original IDE checkout were not changed.

M2 is local working-tree implementation pending owner review; it is not
included in the preserved M1 archive. No M2 commit/push, merge or tag is claimed.

### 16.2 Exact M2 inventory

Added:

- `services/privacy-gateway/intake/contracts.ts`
- `services/privacy-gateway/intake/formats.ts`
- `services/privacy-gateway/intake/archive.ts`
- `services/privacy-gateway/intake/staging.ts`
- `tests/unit/privacy-intake.test.ts`
- `tests/unit/privacy-intake-boundaries.test.ts`
- `tests/unit/support/privacy-intake-fixtures.ts`

Changed:

- this document;
- `tests/unit/privacy-gateway-boundaries.test.ts`: keep all M1 pure-module
  capability checks; allow exactly the separate `intake` directory in inventory.

The five M1 source modules are unchanged. No barrel export or production
caller activates intake. No engine, Map, Data Center, Shared production
contract, schema, dependency, existing ingestion, UI or worker is changed.

### 16.3 Staging architecture and qualification

`EphemeralIntake` is a non-activated reference coordinator. It has a bounded
in-memory opaque control registry and **requires injected TEST_ONLY adapters**.
There is deliberately no production storage/KMS/scanner implementation or
automatic adapter/provider selection.

Each object namespace uses only organization/client/job/attempt/artifact UUIDs.
Attempt fence and full scope bind the ciphertext through authenticated
additional data. Original filenames and original document paths never become
storage keys, status fields, queue fields or audit values. The storage interface
exposes no public URL or listing capability. The coordinator exposes only
receive, authorized safe status, cancellation and trusted cleanup sweeping,
not a RAW download API.

The synthetic test broker actually uses AES-256-GCM, a fresh random 256-bit
key per artifact, 96-bit nonce, authentication tag and exact AAD binding.
Keys exist only in the test broker's private memory; stored values are
ciphertext. Within-package dedup fingerprints use keyed HMAC and remain
ephemeral/local to processing. No RAW equality hash is retained or exposed.
Tests cover wrong-AAD and tampered-ciphertext rejection.

**This is not a KMS or production key-security claim.** The test storage/broker
maps are process memory, not qualified durable storage. No backup exclusion,
snapshot exclusion, key rotation, broker least-privilege deployment,
crypto-shredding or provider deletion guarantee has been proved.

### 16.4 Format eligibility and parser resource limits

Actual supported reference capability:

- Strict UTF-8 CSV: bounded structural/quoting/column checks and aggregate
  cell budget; no formulas are executed and no business values interpreted.
- Strict non-encrypted ZIP using **Stored method 0 only**, containing only
  eligible CSV or recursively eligible Stored ZIP.

PDF, DOCX, XLSX, JPEG/PNG/WEBP and every other unqualified format fail closed.
Legacy DOC/XLS explicitly return `UNSUPPORTED_FILE_TYPE`.
Deflate and other ZIP compression methods also return `UNSUPPORTED_FILE_TYPE`;
this is intentionally not advertised as general ZIP support.
CSV has no unique magic signature: strict UTF-8/structure plus exact
`csv`/`text/csv` eligibility is used, not a fabricated CSV magic-byte claim.
ZIP requires `zip`/`application/zip`, matching signature and exact structure.
Password/encryption flags are rejected. Unsupported encrypted document formats
remain unsupported rather than being passed to an unqualified parser.

Pinned, non-widenable initial M2 limits:

| Limit | Ceiling/default |
| --- | --- |
| Package / cumulative expanded / entries / archive depth / ratio | 100 MiB / 500 MiB / 1,000 / 3 / 100:1 |
| Individual file | 100 MiB |
| Parser input / conservative parser allocation envelope | 8 MiB / 64 MiB |
| Aggregate cells | 100,000 |
| Pages / images / pixels per image | 1,000 / 100 / 40,000,000 |
| Cooperative parser time / per-scan timeout | 5 seconds / 30 seconds |
| Total attempt checkpoint deadline | parser time + scan time (35 seconds default) |
| Coordinator staged-byte budget / admitted jobs / concurrent jobs | 128 MiB / 32 / 4 |

These are initial technical policy defaults, not a production SLA.
The narrower parser/admission envelopes are explicit additional limits;
accepting a nominal 100 MiB package does not promise parser eligibility.
The byte budget accounts for stored payload bytes, not a measured whole-process
RSS bound or ciphertext overhead. Runtime copies/strings/allocator/GC overhead
are not represented as proven OS memory isolation.

Page/image/pixel caps are reserved policy ceilings: no page/image parser is
qualified, so those formats are rejected before reaching such a parser.
The original plus extracted artifacts must fit the existing M1 inventory cap
of 1,000; the effective eligible leaf count can therefore be below 1,000.
Policy hash includes exact limits and `strict-stored-zip-csv/1.0.0`.

### 16.5 Archive and parser boundary

Extraction validates central/local headers, regular-file mode, exact sizes,
CRC32, nonoverlapping contiguous local records and exact central/end layout.
No filesystem extraction occurs; eligible leaves remain RAW-tainted byte views.
Original archive names are transient parser inputs and are not returned.

Reject: traversal/absolute/drive/UNC/ADS paths; empty/dot components; Unicode
ambiguity; Windows device names; trailing dots; duplicate/case/prefix collisions;
symlink/hardlink-capable extra fields; nonregular/special entries; ZIP64/extra
fields; descriptors; comments; encryption; excessive depth/count/individual or
aggregate expansion/ratio; malformed/overlapping/trailing payloads.
All names use a deliberately narrow portable ASCII grammar, not lossy
normalization. No link or special-file object is ever created.

Parser code is capability-free local TypeScript over supplied bytes: no
filesystem/network/process/environment/provider imports, no dynamic execution,
no document macros, no external OCR/AI and no Data Center credentials.
AST import/capability tests include negative probes and preserve the M1
transitive dependency boundary. This demonstrates **code-level capability
restriction**, not an OS/container/VM sandbox, forced egress denial, hard
wall-clock interruption, RSS measurement or malicious-native-parser containment.
No general/native parser has been introduced. A qualified production parser
enclave and deployment proof remain activation blockers.

### 16.6 Scanning, authorization and lifecycle

The bounded path ends at:
`RECEIVING -> INTAKE_VALIDATING -> MALWARE_SCANNING -> RAW_READY`.
Both original package and every eligible leaf require independent CLEAN
responses. `SCAN_PENDING`, `SCAN_CLEAN`, `SCAN_REJECTED` and
`MALWARE_SCAN_UNAVAILABLE` are explicit safe metadata.
Missing provider, exception, timeout, UNAVAILABLE, ERROR, UNKNOWN or invalid
non-CLEAN verdict prevents RAW_READY. There is no bypass or network fallback.
Scan timeout aborts its signal and clears the coordinator-owned scan copy;
it does not prove a misbehaving scanner has dropped its own copies.

Every public job operation uses the current-authorization adapter with exact
scope/actor and M1 INTAKE plus KEY_ACCESS guards. Authorization is re-evaluated
after asynchronous steps and before RAW_READY. The adapter is synthetic in
tests, not a live RBAC integration. Attempt/fence mismatches are rejected;
scope denial and absent jobs use the same safe authorization error.

TTL cleanup is scheduled with opaque metadata **before any RAW storage**;
scheduling failure blocks intake. TTL and revocation block further processing.
Cancellation, rejection, malformed input, scan/parser/key/storage failure,
timeout, expired TTL and abandoned intake all lead to revoked staging access,
key revocation/deletion attempts and cleanup scheduling. Retryable cleanup
failures remain explicit `CLEANUP_PENDING`; one failed job does not starve other
jobs' cleanup sweeps. Late key creation/storage writes after cancellation are
cleaned again after in-flight operations settle.

The M2 staging cleanup lifecycle does not fabricate M1 destruction receipts.
It never claims `RAW_DESTROYED`. Worker/key/cache/backup/provider evidence
required by M1 remains unproved; deletion acknowledgment is insufficient.
Owned plaintext byte copies are cleared best-effort; immutable strings,
provider copies and GC/runtime residue are not claimed irrecoverable.

The control registry, duplicate claim and admission fence are process-local,
not durable distributed CAS/idempotency or crash recovery. It never evicts a
live historical entry to admit another job. Bounded capacity exhaustion fails
explicitly. Production requires approved durable metadata, startup janitor,
qualified storage/key TTL enforcement and scheduled cleanup execution.
The existing bypass inventory is unchanged and activation remains blocked.

### 16.7 Validation receipts

Only synthetic/adversarial fixtures were used; no real client documents.
`privacy-m2-focused-final.log`: **486/486 PASS, five files, no skips**
(12.45 seconds on this run):

| Suite | Result |
| --- | --- |
| M2 intake/format/archive/staging units | 119/119 PASS |
| M2 parser/activation architecture | 14/14 PASS |
| M2 subtotal | 133/133 PASS |
| M1 foundation | 299/299 PASS |
| M1 pure-module boundaries | 34/34 PASS |
| Privacy M1 + M2 | 466/466 PASS |
| Global engine boundaries | 20/20 PASS |
| Total | 486/486 PASS, zero failures, no skips |

The corpus includes extension/MIME/signature mismatch; malformed/truncated/
CRC/header/tail archives; package/expanded/count/depth/ratio overflow; traversal;
symlink/hardlink/special files; Unicode/case/prefix collisions; encrypted ZIP;
legacy/unqualified formats; absent/failed/timed-out scanners; leaf scan failure;
parser/TTL cleanup; stale attempt/fence; per-operation authorization revocation;
cross-job/organization isolation; concurrent duplicate admission; late-key/
late-write cancellation races; capacity/deadline limits; failed cleanup and
retry; AEAD tamper rejection; safe errors/queues and forbidden parser capability
negative probes.

`privacy-m2-typecheck-final.log`: PASS.
`privacy-m2-eslint-final.log`: PASS, zero warnings.
`privacy-m2-build-preliminary.log`: FAIL with the inherited Next.js dependency
advisory. This was an earlier source revision and is not final-source build
acceptance. After the final lifecycle/authorization refinements and final
486-case/type/lint checks, `privacy-m2-build-final.log`: **PASS**.
No dependency change or advisory remediation was performed.
`privacy-m2-typecheck-postbuild-final.log`: **PASS**, sequentially after that
build and restoration of generated Next declaration-path drift.
`git diff --check` and explicit whitespace checks on every added/changed file:
**PASS**. All frozen production tracked files, including the five M1 source
modules and generated declarations, are unchanged from the preserved baseline.
Only the exact nine M2 paths listed above are added/changed.

Preserved HEADs rechecked after validation:
local HEAD = remote Privacy branch HEAD = Desktop archive HEAD =
`1158d6e15c2360fbe41f4d6f57f60a6fbc83fb47`.
The Desktop baseline archive remains clean. The implementation working tree
now contains the explicitly listed uncommitted M2 changes; it is not claimed
clean or included in the remote/archive baseline.

No sanitization/redaction/tokenization engine, independent verifier,
Data Center publication, AI/LLM, external OCR, UI or platform bypass enforcement
is activated. No production security/deletion/real-data qualification is claimed.
Next.js dependency advisory remains independent security debt; no dependency
change, Sonar, merge, deployment or final tag. STOP before M3.

### 16.8 Owner closure

M2 APPROVED / CLOSED by owner on 2026-10-23. The accepted M2 inventory is
seven added files and two modified files from section 16.2. Approved baseline
for M1 remains `1158d6e15c2360fbe41f4d6f57f60a6fbc83fb47`;
`85c916ef38ffc24431ed3d0bfcbe5366459e6ad8` is its parent/source reference only.
Owner authorized preserving this exact M2 implementation on the Privacy
branch, then starting M3 only after clean local/remote/Desktop equality.

## 17. M3 detection, sanitization and independent verification checkpoint

### 17.1 Baseline preservation and exact inventory

**M2 approved baseline:** `0611b414676ed9c5c59087fa6a4ef3be7b159863`.
Before any M3 source change, the approved nine-file M2 inventory and owner
closure were committed on `jenan-platform/privacy-gateway`, pushed to that
branch only, and fast-forwarded in the separate Desktop Privacy archive.
Local HEAD = remote Privacy HEAD = Desktop archive HEAD at this SHA and both
working trees were clean. M1 closure remains
`1158d6e15c2360fbe41f4d6f57f60a6fbc83fb47`; its parent/source reference is
`85c916ef38ffc24431ed3d0bfcbe5366459e6ad8`, not an alternative baseline.

M3 added:

- `services/privacy-gateway/sanitization/contracts.ts`: strict dataset/mapping/
  evidence/audit contracts, analytical/sensitive enums, bounded CSV profile,
  trusted runtime and TEST_ONLY signing interface.
- `services/privacy-gateway/sanitization/classification.ts`: explicit header
  classification, pattern detection, contextual analytical validators and
  bounded CSV table parsing.
- `services/privacy-gateway/sanitization/transform.ts`: allowlist transform and
  package-local random tokens; no verification authority.
- `services/privacy-gateway/sanitization/verifier.ts`: independent reconstruction,
  output re-scan, exact preservation/coverage and conservative residual checks.
- `services/privacy-gateway/sanitization/service.ts`: current authorization,
  per-job/package claims, immutable internal candidate, guarded M1 transitions,
  encrypted mapping handoff and independent receipt signing/verification.
- `tests/unit/privacy-sanitization.test.ts`.
- `tests/unit/privacy-sanitization-boundaries.test.ts`.
- `tests/unit/support/privacy-sanitization-fixtures.ts`: synthetic documents,
  scoped authorization/audit/scheduling doubles and actual test Ed25519 signing.

M3 changed:

- `services/privacy-gateway/intake/staging.ts`: authorized internal RAW_READY
  read callbacks over decrypted copies, exact intake-policy reference, and
  SANITIZER-only encrypted token-mapping staging in the same RAW inventory.
  Mapping objects are excluded from eligible CSV leaves; original M2 receive/
  scan/extract/TTL semantics and no-production activation are preserved.
- `tests/unit/privacy-gateway-boundaries.test.ts`: permit the separate M3
  directory while retaining all five M1 pure-module capability checks.
- this document.

Total: **eight added files and three changed files**. No M3 commit/push or
Desktop update is claimed. The source working tree contains these local M3
changes, not a clean M3 closure. No main/integration merge, tag or deployment.

### 17.2 Supported classification and detection

M3 processes only the qualified CSV leaves retained by M2, including CSV leaves
inside qualified Stored ZIP. There is no new PDF/Office/image parser, OCR,
general visual detector or natural-language named-entity recognition.

Field classification reports type, sensitivity, analytical necessity,
KEEP/REMOVE/TOKENIZE/REVIEW action and EXACT_SCHEMA/AMBIGUOUS confidence.
Confidence is an explicit schema status, not a statistical accuracy claim.
Known analytical headers retain their exact string values. Known person,
owner, delegate, signatory and account/user reference headers receive tokens
when linking is supported. Explicit national ID/iqama, phone, email, IBAN,
bank account/card, signature/stamp, QR/barcode, exact-address, metadata,
embedded-identifier and unnecessary business-ID fields are removed completely.
Selected explicit Arabic header aliases are supported.

Pattern detection covers email, phone-like, national-ID/iqama-like,
IBAN-like/card-like forms and embedded/URL/formula/control representations.
It does not validate every national registry/account/card checksum or detect
arbitrary names/addresses in unrestricted text. Names and the signature/stamp/
QR/barcode/metadata categories are covered as **declared CSV representations**;
no visual signature/stamp/barcode decoding or hidden OOXML/PDF detection is
claimed. Unknown headers, semantic duplicate headers and unsupported free text
fail closed. Invisible/control payloads or identity-shaped ambiguous required
values require review rather than numeric distortion.

Supported hidden/embedded coverage is the entire strict CSV cell/header
surface, including explicitly classified metadata/embedded fields. RAW-ready
provenance and complete leaf inventory come from the trusted M2 boundary.
M3 does not prove coverage outside that format/capability boundary.

### 17.3 Strict structured candidate and analytical preservation

The candidate is a strict `ALLOWLIST_STRUCTURED_DATA` dataset, `anonymous=false`.
It contains only exact scope/attempt/fence/pins/profile metadata, opaque
artifact IDs, row ordinals, approved analytical keys and opaque linkage tokens.
Unknown RAW keys cannot be attached to dataset, rows or value objects.
No original filename, source header, source sensitive value, RAW object/key
handle, rendered original or reverse mapping is included.

Required amounts, dates, revenue/expense/payroll/rent/tax, liabilities,
installments, cash flow, categories, quantities/prices/operational metric,
units/currencies and periods remain **strings**: no rounding, number parsing,
currency conversion, sign stripping, date rewriting or row reordering.
Source artifact/row association and token-field association remain explicit.
Supported dates/periods are strict ISO forms; categories/units/currencies
use a small fixed vocabulary. Unsupported formats or ambiguous identifier-like
values are reviewed, not coerced. These conservative limits can reject valid
business data; there is no silent expansion of the profile.
The numeric grammar permits at most nine integer digits and twelve fractional
digits; unseparated integers of nine or more digits are conservatively treated
as ambiguous identifiers. Scientific notation, thousands separators and
whitespace-normalized numbers are unsupported. Exact decimal strings remain
unchanged even when the residual-risk gate subsequently requires review.

The profile limits aggregate sources to 128 KiB, 1,000 rows and 10,000 cells;
headers/cell lengths and admitted packages are bounded. These are additional
reference-profile ceilings, not an OS memory/time sandbox guarantee.
Schema/version hashes and profile policy are pinned. Exact active M2 intake
policy reference must match the declared extraction reference; no historical
pin substitution, policy migration, provider fallback or latest lookup occurs.

### 17.4 Tokenization and RAW mapping lifecycle

Tokens carry 256 cryptographically random bits from the local crypto runtime,
exceeding M1's 128-bit minimum; they are not UUID-v4 values or global hashes of
identity. Exact repeated `(sensitive kind, original string)` pairs in one
package share the same token across eligible artifacts. No lossy name/value
normalization or fuzzy identity inference occurs. Distinct packages/clients
receive independently random tokens; semantic aliases cannot create duplicate
ambiguous linkage columns.

The package is bound to one processing job/attempt in this reference service.
A second job for an already claimed package is rejected rather than silently
reusing/migrating mappings. Retry/durable multi-job package linkage is not
implemented. Random token values and their content hashes are intentionally
not deterministic between independently created packages.

Mappings remain RAW-tainted. They are serialized only into the M2 test
encryption/storage boundary under opaque scoped keys, with authenticated
attempt/scope/object binding. They join the same RAW key/object inventory
and are covered by cancellation/expiry/retry cleanup; no independent permanent
reverse vault or mapping download API exists. A mapping-cleanup metadata
schedule must succeed before staging; no plaintext fallback is available.
Owned byte buffers are cleared best-effort and transient mapping arrays are
released. GC/string/provider residue is not certified destroyed.

### 17.5 Independent verifier and authorization

The sanitizer creates a candidate, never an approval. The verifier independently
loads retained encrypted eligible leaves and mapping through a current-role
M2 read boundary, reconstructs expected analytical values/links without invoking
the sanitizer or token generator, and checks exact source rows, order, types,
mapping one-to-one consistency and inventory coverage. It re-scans the output,
rejects undeclared fields/RAW reference leakage, and checks policy/version,
scope/job/package/attempt/fence, candidate content/schema/lineage hashes and
exact active extraction policy. Candidate and RAW storage cannot be written
through the verifier API. Read callbacks see copies; mutation of a copy does
not mutate encrypted retained RAW. Returned verified objects are deep copies.

Current SANITIZER/VERIFIER plus KEY_ACCESS authorization is required at reads
and rechecked around asynchronous work and before final state commit. A caller
cannot extend retained TTL by supplying a different job lifetime.
Sanitizer principal, previous processors and original job owner cannot approve,
including after changing their current role. There is no publisher role/path
in M3. Concurrent duplicate sanitize/verify calls are fenced locally; scoped
parallel package processing and cross-organization denial are tested.

No live RBAC adapter or durable distributed CAS exists. These are internal
reference APIs, never request-supplied callbacks/adapters. Qualification and
deployment isolation remain subject to later stages.

### 17.6 Receipts, residual risk, review and safe audit

Successful independent verification generates the M1 receipt with exact
job/client/package, attempt/fence, artifact/schema/lineage hashes, all policy
pins, verifier principal, time/expiry and opaque audit reference.
A separate strict verification-evidence envelope records eligible artifact IDs,
counts, rows, preserved cell count, coverage and supported-profile residual
assessment; it contains no RAW digest/snippet or sensitive values.
The Ed25519 signing payload binds **both** receipt and evidence. Signature
verification must succeed before the M1 SANITIZATION_VERIFIED transition.
Actual test Ed25519 signing verifies tampering of either envelope fails;
this is not production signing-key/KMS qualification.

Residual checks conservatively require at least three rows per exact released
analytical combination/link-kind group, and at least three uses of each token.
Rare tokens, unique/quasi-identifying combinations, free text, overly precise
unsupported location fields and ambiguous required values require manual
review. This is a small explicit reference rule, **not population k-anonymity,
universal identity detection or proof of anonymity**. Even exact-preserved
analytical data can remain restricted and require review. Sanitized != Anonymous.

Before a candidate exists, uncertainty records explicit
SANITIZATION_UNCERTAIN / MANUAL_PRIVACY_REVIEW_REQUIRED result plus a safe
reason while leaving the M1 processing state at its last legal step.
It does not fabricate a candidate or weaken M1 transitions to enter review.
Verifier uncertainty transitions from SANITIZATION_VERIFICATION to the existing
MANUAL_PRIVACY_REVIEW_REQUIRED state. No manual approval/retry shortcut is
implemented. Every review path blocks verified-data access.

M3 audit has a strict content-free schema: opaque event/job/actor/receipt IDs,
timestamp, fixed stage/result/reason enums, bounded counts and profile/policy
hashes only. The receipt audit reference resolves to the matching check event,
and that event carries the exact receipt ID. No free metadata,
names, original values, mapping/tokens, addresses, filenames or snippets.
Pre-commit successful check events use CANDIDATE, not a premature VERIFIED
claim. Audit failure, signing failure, revocation or encrypted RAW tampering
cannot commit verified output. Provider/parser details are not returned.
Verification receipt/evidence are available only through currently authorized
independent-verifier access after successful final commit.

### 17.7 Validation and explicit remaining limits

Final synthetic/adversarial regression:

| Suite | Result |
| --- | --- |
| M3 classification/sanitization/tokenization/verification units | 147/147 PASS |
| M3 architecture/negative capabilities | 19/19 PASS |
| M3 subtotal | 166/166 PASS |
| M1/M2 Privacy regression | 466/466 PASS |
| Privacy M1-M3 total | 632/632 PASS |
| Global boundaries | 20/20 PASS |
| Focused total, seven files | 652/652 PASS, zero failures, no skips |

`privacy-m3-focused-final.log`: PASS, 4.71 seconds on this run; includes
the final 256-bit token implementation and exact receipt/audit-event linkage.
`privacy-m3-typecheck-final.log`: PASS.
`privacy-m3-eslint-final.log`: PASS, zero warnings.
`privacy-m3-build-final.log`: FAIL with the inherited Next.js security advisory.
`privacy-m3-build-final-retry.log`: PASS, identical unchanged source retry.
No dependency changes or advisory remediation; Next.js debt remains independent.
`privacy-m3-typecheck-postbuild-final.log`: PASS sequentially after the final
unchanged build retry and restoration of generated Next declaration-path drift.
`git diff --check` and explicit whitespace checks across every new/changed M3
file: PASS. Exact final inventory: the eleven paths in section 17.1 only.
Frozen production tracked-file diff: UNCHANGED, including engines 1-7, Map,
Data Center semantics, Shared production contracts, schema/dependencies,
existing production ingress and UI. Five M1 source modules remain unchanged.
Preserved local HEAD = remote Privacy branch HEAD = clean Desktop archive HEAD
at `0611b414676ed9c5c59087fa6a4ef3be7b159863`; M3 files are local/uncommitted.
Earlier pre-final/pre-entropy build logs are retained separately and are not
substituted for the final-source test/type/lint/build/post-build receipts.

No real client documents, production KMS/signing provider/scanner/storage,
durable orchestration, native document sandbox, external OCR or AI/LLM.
No sanitization/detection capability is claimed for unsupported visual/native
formats. No final RAW destruction certification. The bypass inventory remains
an activation blocker, not silently closed. No Data Center publication, Projects/
Admin/Payments/UI integration, frozen engine/Map/Data Center/Shared change,
schema/dependency change, Sonar, merge, tag or deployment.

**M3 checkpoint for owner review. STOP before M4.**

### 17.8 Owner closure and preserved source baseline

M3 APPROVED / CLOSED by owner on 2026-10-23 with the results and limitations
above unchanged. Exact approved M3 source baseline:
`58a258c028d9295c2dea5c32c039fafa9c1a5c9b`.
Its parent M2 baseline is `0611b414676ed9c5c59087fa6a4ef3be7b159863`.
This documentation-only follow-up records the immutable M3 source SHA;
it does not claim a new test run or a self-referential commit hash.
The earlier local/uncommitted statements describe the submitted checkpoint
before owner-authorized preservation, not the subsequent baseline commit.

Before any M4 implementation, preserve this source plus this closure record
on `jenan-platform/privacy-gateway` only and verify clean local, remote Privacy
branch and Desktop Privacy archive HEAD equality. No main/integration merge,
final tag or production deployment is authorized. If M4 requires Prisma/schema
migration or a frozen-module change, STOP and obtain owner approval first.

## 18. M4 checkpoint: durable verified-onward lifecycle (historical partial scope accepted)

### 18.1 Authority, baseline and exact scope

The owner subsequently approved a limited additive Privacy persistence
exception: new Privacy Prisma models, one dedicated additive migration and
Privacy-only PostgreSQL constraints/indexes/roles/grants. This supersedes the
earlier schema STOP only within that exception; it does not authorize editing
existing engine, Map, Data Center, project, Shared or payment semantics.
The pre-application design and exact DDL are recorded in
[privacy-gateway-m4-persistence.md](privacy-gateway-m4-persistence.md).

Approved M3 source: `58a258c028d9295c2dea5c32c039fafa9c1a5c9b`.
Preserved M3 closure HEAD: `fc27c1495d7cb0f8526eeccf25e188404af4f3ee`.
Before M4, local HEAD, remote `jenan-platform/privacy-gateway` HEAD and Desktop
Privacy archive HEAD matched that closure HEAD with clean worktrees. A final
read-only check still found all three HEADs equal; M4 changes are intentionally
uncommitted pending owner review. No M4 closure SHA or clean M4 worktree is claimed.

Added:

* `docs/privacy-gateway-m4-persistence.md`
* `prisma/migrations/20261023130000_privacy_gateway_durable/migration.sql`
* `services/privacy-gateway/durable/contracts.ts`
* `services/privacy-gateway/durable/store.ts`
* `services/privacy-gateway/durable/workflow.ts`
* `services/privacy-gateway/durable/verification.ts`
* `services/privacy-gateway/durable/data-center.ts`
* `tests/integration/privacy-gateway-durable.integration.test.ts`
* `tests/unit/privacy-durable-boundaries.test.ts`

Changed:

* `prisma/schema.prisma` (four new Privacy models only)
* `services/privacy-gateway/intake/staging.ts` (irreversible binding to an
  authoritative durable RAW-read check for an enrolled intake)
* `services/privacy-gateway/sanitization/service.ts` (current independent
  verifier-only verified checkpoint export)
* `tests/unit/privacy-gateway-boundaries.test.ts` (explicit isolated durable
  directory inventory; pure foundation capability rules unchanged)
* `docs/privacy-gateway-v1.md`

### 18.2 Persistence, atomicity, audit and authorization

Four independent tables hold job/scope/attempt/fence/revision metadata,
ordered audit events, immutable receipt references and publication/destruction
work. No RAW bytes, extracted text, PII, plaintext token mappings, key material,
secrets, original sensitive names or parser errors are stored.
There is no relation to, or mutation of, any existing Prisma model.
The exact original generator/datasource/enums/models are tested unchanged
against preserved M3.

Row locks serialize commands. Revision compare-and-swap and immutable attempt/
fence bindings reject stale workers. Idempotency includes action, intent,
actor, attempt/fence and original revision; changing intent under a committed
key is rejected. A retry of a completed publication returns the committed
state without redispatch. Claims persist an expiring opaque worker lease;
takeover changes worker ownership and revision, not the signed M3 fence.
DISPATCH is durably reserved before an external publication operation.

Audit events are append-only, sequenced, predecessor-hashed and bound to the
committed job revision. Reads recompute the hash chain. DB triggers reject
history UPDATE/DELETE and job/work DELETE; enforce legal state edges and
immutable identity/intent; and require committed audit/receipt/work evidence.
Receipts contain only opaque object refs, hash, kind, principal and time.
Five new NOLOGIN roles have no automatically assigned memberships.
RLS separates publication/destruction work and verification/publication/
destruction receipts; role policies also constrain audit role/action.
Tests use actual SET LOCAL ROLE and confirm no access to existing FileAsset
records. Superuser/migration compromise is not covered by append-only claims.

Every command re-reads current scoped authorization, including a second check
before transaction commit. Enrollment requires a current independent verifier,
valid M3 job/receipt/evidence and exact candidate/policy/pins. Publication
excludes owner, verifier and every historical processor even after role changes.
DB credentials do not grant RAW, key or human Data Center capability.

### 18.3 Governed publication and reconciliation

The new Privacy-owned adapter uses unchanged
`createDataCenterItemInTransaction`. It requires an explicitly bound active
human Data Center principal and restricted organization-scoped source, with
export forbidden and an independently reviewed DATA type. It creates one
allowlist JSON proposal as DRAFT with UNVERIFIED business evidence.
Privacy verification does not imply business VERIFIED evidence.
The adapter cannot invoke Data Center review, approval or publication.

The proposal and its exact source/item/versionId/version/checksum association
commit atomically. Normal existing human review/approval/publication must
complete before a final Gateway publication receipt is accepted.
Reconciliation requires that exact persisted version and checksum, correct
source, current/published version numbers and PUBLISHED status. Receipt
commit re-locks/rechecks the exact item and current authorization. There is
no latest fallback, version substitution, auto-approval or duplicate creation.

Timeout, lost response, partial acknowledgment and absent proof remain
RECONCILIATION_REQUIRED. If an exact association is absent, the implemented
adapter does not speculate that nothing was published or blindly recreate it.
An expired publication lease also requires reconciliation, not redispatch.
Tests exercise the real existing Data Center API through independent human
review and prove one item/version after a lost creation response.

### 18.4 RAW revocation, destruction and recovery

Publication receipt, SANITIZED_PUBLISHED, durable RAW revocation and a
destruction outbox intent commit atomically. The database trigger creates
the destruction intent on first revocation. The actual enrolled M2 intake
consults PostgreSQL before/after RAW reads/decryption/callback and cannot
replace its bound authority. Stale sanitizer/verifier snapshots cannot reopen
RAW. A missing/unavailable authority fails closed. Publisher has no RAW reader.

Destruction leases/retries are durable. Provider failure records
DESTRUCTION_FAILED; expiration/revocation schedules DESTRUCTION_PENDING.
Final success requires the complete strict M1 destruction receipt and an
authenticated strict M4 evidence envelope covering job/package/attempt/fence,
inventory hash/count, cleanup attempt, receipt hash, opaque key/evidence refs
and all eleven declared cleanup categories. Missing/partial/incorrect evidence
cannot produce RAW_DESTROYED. Receipt and evidence are hash-addressed together.
This acceptance model is not a claim that deleting one object or a key map is
irreversible destruction.

Recovery tests include coordinator recreation, duplicate commands, competing
workers, expired leases, stale revisions/attempts/fences, revoked authorization,
ambiguous publication, cleanup failure/retry and a real child-process exit
mid-transaction. The latter rolls back uncommitted job/work changes without
partial intent. A separate real PostgreSQL container restart preserved all
four durable table counts (115 jobs / 306 events / 135 receipts / 70 work
records, before = after that drill); the complete suite then passed again.

### 18.5 Exact evidence and quality gates

Synthetic fixtures only; no real customer data.

| Gate | Result |
| --- | --- |
| M1 regression | 333/333 PASS |
| M2 regression | 133/133 PASS |
| M3 regression | 166/166 PASS |
| Privacy M1-M3 | 632/632 PASS |
| M4 PostgreSQL/functional/adversarial/recovery | 39/39 PASS |
| M4 architecture/additive/frozen schema boundaries | 5/5 PASS |
| M4 subtotal | 44/44 PASS |
| Privacy M1-M4 focused total | 676/676 PASS |
| Global analysis-engine boundaries | 20/20 PASS |
| Complete focused command, 9 files | 696/696 PASS; zero failures/skips |
| Prisma schema validation/generation | PASS |
| Full baseline + additive migration deploy on isolated PostgreSQL 17 | PASS |
| TypeScript | PASS |
| Production build | PASS on bounded-worker retry |
| Post-build TypeScript after restoring generated declaration drift | PASS |
| Scoped ESLint | PASS, zero warnings |
| git diff --check | PASS |
| Frozen production diff outside the approved additive schema exception | UNCHANGED |

Evidence logs live in the session workspace, not customer data storage:
`privacy-m4-migrate-v3.log`, `privacy-m4-focused.log`,
`privacy-m4-focused.json`, `privacy-m4-types.log`,
`privacy-m4-build.log`, `privacy-m4-build-retry.log` and
`privacy-m4-postbuild-types.log`.
The first build compiled and completed its type phase but its page-data worker
exited with Windows code 3221225477; that run is NOT claimed PASS.
The successful retry used the existing NEXT_BUILD_CPUS=2 setting and explicitly
disabled Sentry source-map upload/release credentials in the child environment.
No production source/dependency/config change or warning suppression was used
to obtain the pass. Existing Map filesystem-tracing warnings remain unrelated;
zero warnings applies to scoped ESLint, not all existing build warnings.

### 18.6 Explicit limits and activation blockers

* Durability starts at authenticated SANITIZATION_VERIFIED enrollment. The
  pre-verification M2/M3 parser registries are not persisted/rehydrated by M4.
  This is not proof that the entire M1-M3 intake/parser pipeline has become
  a restartable distributed processing system. Durable pre-verification
  metadata/inventory and recovery therefore remain open M4 work, not an
  owner-approved scope reduction or an implicit deferral to M5.
* PostgreSQL and real Data Center transactional/lifecycle calls are exercised.
  Tests use a disposable local database, never the production database.
* RAW encryption/storage/key/scanner adapters remain the M2 TEST_ONLY
  providers; no production qualification or OS/native parser sandbox is added.
* Current grants/principal bindings are test-configured; the artifact/receipt
  store is a TEST_ONLY map. Hash-pinned durable DB refs are not proof of a
  production-durable object store, independently deployed RBAC or provider
  inventory recovery.
* Receipt signatures exercise real Ed25519 with TEST_ONLY in-memory keys,
  not a production KMS/HSM or rotation/backup qualification.
* Publication-port doubles are used in adversarial timeout/partial cases.
  Separate tests use the actual governed Data Center adapter and service.
* Destruction revoke/evidence providers are explicitly mocked. Synthetic
  complete attestations test strict receipt acceptance; they do not prove
  actual physical wipe, backup exclusion, native worker termination, permanent
  key destruction or final RAW destruction for real data.
* PostgreSQL lease/outbox recovery is implemented; no production scheduler,
  cross-host parser orchestration, worker deployment, durable RAW inventory
  provider or cleanup SLA certification is activated.
* The section 15.5 ingress/bypass inventory remains OPEN. File upload,
  Data Center import/command/create/version and project-analysis inputs are
  neither rerouted nor disabled. M4 does not close any activation blocker.
* No UI, Projects integration, AI/LLM, external OCR, production KMS/scanner,
  payment/engine/Map/Shared change, Sonar final campaign, dependency change,
  main merge, final tag or production deployment is activated.
  The inherited Next.js advisory remains independent security debt.

After all validation, the owned disposable PostgreSQL container and its exact
anonymous test volume were removed. No unrelated container/database was changed.

Sanitized != Anonymous. M3 uncertainty/unacceptable re-identification risk
still means MANUAL_PRIVACY_REVIEW_REQUIRED -> NO SANITIZATION_VERIFIED,
and therefore no publication authorization.

**Partial M4 checkpoint only: not ready for full M4 closure. The verified-onward
scope and the unimplemented pre-verification durability above must not be
confused with full end-to-end durable M1-M3 processing. STOP before M5.**

## 19. JENAN PRIVACY GATEWAY — M4 FINAL CHECKPOINT FOR OWNER REVIEW

### 19.1 Baseline and delivery state

M3 closure baseline: `fc27c1495d7cb0f8526eeccf25e188404af4f3ee`.
M3 approved source: `58a258c028d9295c2dea5c32c039fafa9c1a5c9b`.
Branch: `jenan-platform/privacy-gateway`.
Local HEAD, remote Privacy branch HEAD and Desktop Privacy archive HEAD still
match the M3 closure baseline. M4 has not been committed/pushed or declared
APPROVED/CLOSED. Its twenty review files are persistent in the implementation
worktree; the Desktop Git archive remains the clean M3 baseline.

Section 18 records the accepted partial checkpoint, not the final result.
This section supersedes its pre-verification durability gap for the tested,
nonactivated reference configuration only. Owner review remains required.

### 19.2 Exact M4 file inventory

Modified (5):

* [Privacy document](privacy-gateway-v1.md)
* [Prisma schema](../prisma/schema.prisma)
* [M2 staging authority](../services/privacy-gateway/intake/staging.ts)
* [M3 durable checkpoint export](../services/privacy-gateway/sanitization/service.ts)
* [Foundation architecture boundary inventory](../tests/unit/privacy-gateway-boundaries.test.ts)

Added (15):

* [Persistence design](privacy-gateway-m4-persistence.md)
* [Verified-onward migration](../prisma/migrations/20261023130000_privacy_gateway_durable/migration.sql)
* [Admission recovery migration](../prisma/migrations/20261023160000_privacy_admission_recovery/migration.sql)
* [Durable contracts](../services/privacy-gateway/durable/contracts.ts)
* [PostgreSQL store](../services/privacy-gateway/durable/store.ts)
* [Governed workflow](../services/privacy-gateway/durable/workflow.ts)
* [Verification authentication](../services/privacy-gateway/durable/verification.ts)
* [Governed Data Center adapter](../services/privacy-gateway/durable/data-center.ts)
* [Admission recovery contracts](../services/privacy-gateway/durable/recovery-contracts.ts)
* [Admission recovery coordinator](../services/privacy-gateway/durable/recovery.ts)
* [Durable PostgreSQL acceptance](../tests/integration/privacy-gateway-durable.integration.test.ts)
* [Actual-process restart acceptance](../tests/integration/privacy-recovery.integration.test.ts)
* [M4 architecture boundaries](../tests/unit/privacy-durable-boundaries.test.ts)
* [TEST_ONLY encrypted restart objects/keys/signer](../tests/unit/support/privacy-restart-objects.ts)
* [TEST_ONLY process entry/configuration](../tests/unit/support/privacy-recovery-process.ts)

No dependency, frozen production module, existing Prisma model/enum/field,
existing migration or Data Center semantic contract changed.

### 19.3 Exact persistence and migration scope

Two additive Privacy migrations create eight new models/tables only:
PrivacyClientPackage, PrivacyAdmission, PrivacyInventoryArtifact,
PrivacyAdmissionEvent, PrivacyDurableJob, PrivacyDurableEvent,
PrivacyDurableReceipt and PrivacyDurableWork. Exact columns/DDL/Prisma additions
are the linked schema/migrations; the preapplication design describes PK/FK,
unique/index/state/role constraints. The schema beginning at `generator client`
is byte-identical to M3 after newline normalization.

The second migration adds package scope/purpose/basis, immutable policy/version
and scanner-version pins, admission checkpoint, attempt/fence/CAS revision,
five-claim incomplete-stage bound, leases, manifest/candidate/verification
hashes, cleanup intent and safe failure. Inventory records exact opaque
artifact/parent/job/package/client/organization/attempt/fence/object/key/version,
kind/taint/checksum/size, scan state/hash/version and lifecycle state.
Completed checksums and CLEAN evidence are immutable. Composite FKs prevent
cross-job/organization/attempt linkage; unique refs and kind/ordinal prevent
duplicates. Deferred package/admission/audit/evidence guards prevent orphan
rows, incomplete inventory advancement and unsupported checkpoint jumps.

Transactions commit reservations and audit atomically before external writes.
Extraction child completion and exact manifest commit together before RAW_READY.
Verification completes only with the exact signed artifact/hash/evidence.
Stale revision, worker, lease, attempt/fence and conflicting idempotency keys
are rejected. A matching committed command is replayed without another effect.
DB stores no document bytes, extracted text, PII values, snippets, sensitive
filenames, plaintext maps/keys/secrets or raw provider/parser errors.

Isolated PostgreSQL 17 applied the complete 80-migration history successfully,
including both final Privacy migrations. Disposable database only; no production
database was used. There was no destructive change to an existing schema/table.

### 19.4 Restart recovery coverage

The durable path now covers:

`INTAKE -> SCAN -> EXTRACT -> RAW_READY -> SANITIZE -> VERIFY -> PUBLISH -> DESTROY`

DESTROY includes durable cleanup, failure/retry and evidence adjudication; it
does **not** imply a certified real-data RAW_DESTROYED outcome.

The restart suite launches fresh operating-system Node processes that recreate
Prisma clients, authorized reference adapters and signers. It does not keep a
process registry alive to carry RAW, keys, mappings or candidates between steps.
AES-GCM object ciphertext and wrapped per-artifact keys survive through opaque
references outside PostgreSQL. A missing key fails closed without replacement.
Authenticated complete pending-file writes can be recovered; corrupt/incomplete
ciphertext cannot become successful evidence. No OS power-loss/fsync durability
qualification is claimed.

Abrupt process-death checkpoints cover committed intake; staging; before/pending/
after key and object writes; original-write-before-DB advancement; scan;
scan-clean; extraction and extracted write; before RAW_READY; classification;
sanitization; mapping/candidate writes; candidate-ready; verification and signed
verification write. Recovery uses the existing reservation/attempt/fence and
exact current authorization/pins, never a latest lookup or a new substitute key.

Additional acceptance covers revoked authorization after restart, expired TTL
while down, expired-lease takeover and stale workers/fences, concurrent duplicate
delivery/replay, scanner-version substitution, parser/sanitization/signing/storage
failure, abandoned/cancelled cleanup interrupted by process death, durable cleanup
retry, and late key/object side effects before/after revocation.
Mapping, candidate and signed receipt bytes are compared exactly across restart:
no regenerated tokens, candidates or verification receipts. Sanitizer identity
remains persisted; granting it VERIFIER after restart still fails separation
of duties. M3 analytical fidelity/purpose-limited risk checks remain unchanged.

### 19.5 Audit, publication, revocation and destruction evidence

Admission audit stores ordered opaque actor/role/action/result, safe state,
timestamp, command/intent/predecessor/event hashes. Normal roles cannot UPDATE
or DELETE history; PostgreSQL enforces ordering and committed revision evidence.
The reader recomputes the chain in a consistent transaction snapshot and
rechecks current auditor authorization. Verified-onward audit/receipts retain
their independent append-only/hash-chain protections. There are no RAW snippets,
PII, map contents or raw parser errors in these records/log payloads.
This is not protection against a database superuser disabling all safeguards.

Publisher remains independent of owner/Sanitizer/Verifier, including role-change
attempts. Authorization, exact scope/attempt/fence/revision, artifact availability,
policy/version and signed receipt hashes, expiry/revocation are checked again
at publication. Publisher DB inventory reads are RLS-limited to completed
CANDIDATE/VERIFICATION; it has no admission mutation or RAW inventory visibility.
Processing cannot finalize verification evidence; verification cannot mutate RAW
or candidate inventory. NOLOGIN roles receive no automatic service membership.

The real unchanged Data Center API creates a restricted organizational
DRAFT/UNVERIFIED proposal. Existing independent human business review/approval/
publication is mandatory. Exact release/source/item/version ID/version number/
checksum persist atomically with the proposal association. Ambiguous result,
timeout, partial acknowledgement or expired publication lease requires
RECONCILIATION_REQUIRED; no blind duplicate dispatch or latest substitution.
Exact reconciliation rechecks/locks the same item/version/checksum. Publication
receipt, RAW revocation and destruction work commit atomically.

The new end-to-end test resumes a persisted verified artifact, uses the actual
governed Data Center lifecycle in the isolated database, recreates the coordinator,
reconciles exact publication, denies RAW through a fresh process, and performs
reference cleanup. Final candidate and signed verification survive cleanup;
RAW original/extraction/mapping ciphertext and per-artifact key references do not.

Destruction evidence acceptance still requires the complete strict M1 receipt
plus M4 job/package/attempt/fence/inventory/count/key/cleanup-attempt/evidence
references and all eleven categories. In the new reference-cleanup integration,
that certification is intentionally unavailable: the durable outcome is
DESTRUCTION_FAILED, never RAW_DESTROYED. The earlier synthetic complete-evidence
tests exercise acceptance/retry/idempotency only, not physical-wipe certification.
Receipt objects are hash-checked and restart-persistent in TEST_ONLY storage.

### 19.6 Final gate results

Synthetic data only. The complete final focused command ran once:

| Gate | Final result |
| --- | --- |
| M1 functional/foundation + architecture | 299 + 34 = 333/333 PASS |
| M2 intake + architecture | 119 + 14 = 133/133 PASS |
| M3 sanitization + architecture | 147 + 19 = 166/166 PASS |
| M1-M3 regression | 632/632 PASS |
| M4 verified-onward PostgreSQL/functional/adversarial | 39/39 PASS |
| M4 actual-process/restart/admission recovery | 44/44 PASS |
| M4 architecture/additive/frozen boundaries | 9/9 PASS |
| M4 subtotal | 92/92 PASS |
| Complete Privacy M1-M4 | 724/724 PASS |
| Global boundaries only | 20/20 PASS |
| Focused total, 10 files | 744/744 PASS; zero failures/skips |
| Prisma validation/generation; isolated PostgreSQL migrations | PASS |
| TypeScript before build | PASS |
| Scoped ESLint | PASS; zero warnings |
| Production build | PASS on unchanged-code retry with explicit isolated DATABASE_URL |
| Post-build TypeScript | PASS |
| git diff --check | PASS |
| Frozen production diff; original Prisma schema | UNCHANGED |

Evidence is in the session workspace: `privacy-m4-final-focused.json`,
`privacy-m4-final-focused.log`, `privacy-m4-recovery-migrate.log`,
`privacy-m4-final-lint.log`, `privacy-m4-final-types.log`,
`privacy-m4-final-build.log`, `privacy-m4-final-build-retry.log` and
`privacy-m4-final-postbuild-types.log`. The first final build compiled/typechecked
but failed page-data collection because its shell lacked DATABASE_URL; it is not
counted as PASS. The unchanged-code retry explicitly used the isolated test URL,
NEXT_BUILD_CPUS=2 and no Sentry upload/release credentials and passed.
Existing unrelated Map tracing warnings remain; zero warnings refers to scoped
ESLint. Only generated build declaration drift was restored before post-build
types. No engine 1-7 functional/historical repository-wide suite was rerun.

### 19.7 TEST_ONLY limitations, blockers and stop

* Filesystem object/receipt storage, local master/wrapped keys and persistent
  Ed25519 signer are restart-persistent synthetic providers, not production
  KMS/HSM, storage, backup, rotation, cross-host or power-loss qualification.
* Scanner returns controlled synthetic CLEAN/REJECTED/timeouts; no production
  malware scanner, external OCR or OS/native parser sandbox is qualified.
* Actor/grant/policy/binding sources and clock/process crash/failure hooks are
  test-configured. DB constraints/grants/RLS and isolated Data Center operations
  are real, but production identities, memberships, deployment and key grants
  are not provisioned.
* Publication-port timeout/partial/adversarial doubles remain TEST_ONLY; the
  separate actual API test proves unchanged governance, not live publication.
* Complete destruction attestations remain synthetic/mock. Reference/key-file
  deletion is not physical wipe, backup erasure, final RAW destruction evidence,
  customer-data certification or a production cleanup SLA.
* Durable PostgreSQL leases/checkpoints/intents are implemented; no production
  worker/scheduler or distributed orchestration qualification is activated.
* All section 15.5 ingress/bypass blockers remain OPEN. M4 does not route,
  disable or grant an exception to an existing ingress. Production activation
  still requires every bypass to be governed, disabled or explicitly approved.
* No Projects/Admin UI, AI/LLM, external OCR, Engines 1-7, Map, Shared, Payments,
  existing project-analysis schema, existing ingestion or Data Center semantics
  was changed. No platform bypass enforcement, production publication/KMS/storage/
  scanner, final RAW certification, dependency change, Sonar campaign, main merge,
  final tag or production deployment was activated. Next.js advisory remains
  independent security debt.

**Sanitized != Anonymous.**

**MANUAL_PRIVACY_REVIEW_REQUIRED -> NO SANITIZATION_VERIFIED** on unsupported
or uncertain detection, failed analytical fidelity or unacceptable supported
re-identification risk; no publication authorization follows.

**M4 APPROVED / CLOSED by the owner on 2026-10-23.**
The owner accepted all 744/744 focused tests and the quality gates above.
The historical review-state text in 19.1 records the submission state only.
M5 is authorized for final technical acceptance, not additional functionality.
Exact approved M4 implementation baseline:
`7909939f888ac3423dca527116c2c9378016b229`.
The baseline was pushed only to `jenan-platform/privacy-gateway` and
fast-forwarded into the Desktop Privacy archive.
All TEST_ONLY, qualification, destruction-evidence and open bypass limitations
remain unchanged. No merge, final tag or production deployment is authorized.

Final housekeeping: the owned recovery PostgreSQL container and its anonymous
test volume were removed after validation. Restart fixture directories were
removed by test teardown. No unrelated database/container was changed.
The persisted final evidence records 744/744 passing with zero failures/skips;
no test rerun was performed for this housekeeping/report confirmation.

## 20. JENAN PRIVACY GATEWAY — M5 FINAL CHECKPOINT FOR OWNER REVIEW

### 20.1 Status: BLOCKED / NOT APPROVED / NOT CLOSED

M4 remains owner-approved/closed. Approved implementation baseline:
`7909939f888ac3423dca527116c2c9378016b229`.
Documentation closure HEAD: `2f8843e4daf9830f51740c15496bfd9fbe403f0c`.
Before M5 work, Local HEAD = Remote Privacy branch HEAD = Desktop Privacy
archive HEAD at that documentation closure; both worktrees were clean.
Both commits were pushed only to `jenan-platform/privacy-gateway`.

M5 stopped at a real build/security gate, not a functional acceptance.
The production build exited 1 with:
`SecurityFatalError: Your version of Next.js is affected by a known security vulnerability.`
The build reported Next.js 16.4.0; the unchanged manifest specifies ^16.3.6.
The log recommended upgrading and cited the npm bulk advisory endpoint,
but did not identify an individual CVE/GHSA or severity. No severity or
new Privacy-specific vulnerability is inferred from this message.
This is inherited dependency security debt, not an authorized dependency
remediation. No retry to bypass the advisory, suppression, dependency edit
or automatic upgrade was attempted.

The already-running full focused Privacy/global regression was explicitly
stopped when this blocker was identified. It produced no completed final
receipt: do not interpret its planned 756 cases as passed, nor reuse M4's
744/744 receipt as an M5 rerun. Post-build TypeScript and remaining final
acceptance are pending. No exact M5 candidate SHA has been created, because
the owner required candidate creation after all tests. CodeQL was therefore
not dispatched; there is no exact-SHA security acceptance claim.

### 20.2 Completed preparation and bounded development evidence

* A dedicated disposable PostgreSQL 17 database on loopback port 55449 was
  used. Port 55439 belonged to another test container and was not reused,
  stopped or altered. Production databases were not used.
* Prisma validation/generation passed; all 80 migrations were present and
  successfully applied in the owned isolated database.
* Final pre-build TypeScript passed. Scoped ESLint passed with zero warnings.
* Frozen runtime/schema/dependencies/workflow diff against the M4 closure
  was unchanged. The generated Next type import drift was restored.
* Selected development tests passed after test-harness corrections. Their
  selectors intentionally skipped unrelated cases: they are not a no-skips
  final regression. Early failures were an overstrict concurrent-cleanup
  expectation and TEST_ONLY publication acknowledgement timestamps; only
  test code was corrected.
* New actual-process acceptance passed for process death after the external
  synthetic publication effect, exact reconciliation without redispatch,
  RAW denial, and process death after reference cleanup. Incomplete M1
  evidence still ended DESTRUCTION_FAILED, with no destruction receipt.
* Additional selected cases passed for ciphertext/AAD/key-reference tamper,
  invalid scanner output, cross-job/package/client/organization grants,
  manipulated verification receipt, and bounded concurrent admission,
  publication and cleanup. No production functionality was added.
* A point-in-time scan of all eight Privacy metadata tables inspected 702
  rows, found zero synthetic RAW/PII/token/private-key sentinels, and zero
  orphan admissions/inventory/receipts/work. This is a scoped sentinel test,
  not a universal no-leakage certification.
* Read-only security review reported no confirmed findings in its Privacy
  scope. Existing architecture checks constrain runtime log/telemetry,
  queue/transport and external-service activation. Final comprehensive
  acceptance remains incomplete.
* GitHub open CodeQL alert inventory before final acceptance returned zero.
  This is not an analysis of a final M5 SHA and does not satisfy that gate.

Recorded selected-development synthetic load (not a production SLA):

| Workload | Admission/verification/cleanup | Publication/destruction |
| --- | --- | --- |
| Jobs / concurrency | 6 / 3 | 6 / 3 |
| Organizations / clients | 2 / 3 | 6 / 6 |
| Batch duration | 12,610 ms | 1,786 ms |
| Job latency p50 / p95 (six samples) | 6,070 / 6,536 ms | 762 / 1,018 ms |
| Process peak RSS | 343,547,904 bytes | 325,042,176 bytes |
| Maximum metadata envelope | 17,843 bytes | 1,288 bytes |
| Candidate / receipt envelope | 2,018 / 1,937 bytes | not separately measured |
| Unexpected failures | 0 after harness correction | 0; 12 expected race rejections |

Memory is the test worker's process high-water RSS, not aggregate child-process
or database memory. Publication/destruction load used synthetic complete
evidence fixtures; it is not physical wipe or production destruction proof.

### 20.3 Exact pending M5 file scope

Modified:

* [Privacy document](privacy-gateway-v1.md)
* [Durable PostgreSQL tests](../tests/integration/privacy-gateway-durable.integration.test.ts)
* [Actual-process tests](../tests/integration/privacy-recovery.integration.test.ts)
* [TEST_ONLY process entry](../tests/unit/support/privacy-recovery-process.ts)

Added:

* [Bounded final acceptance](../tests/integration/privacy-final-acceptance.integration.test.ts)
* [TEST_ONLY restart publication/destruction workflow](../tests/unit/support/privacy-final-workflow.ts)
* [Explicit isolated database allowlist](../tests/unit/support/privacy-isolated-database.ts)

M5 changes remain local/uncommitted. The Desktop Git archive retains the
approved M4 documentation closure, not these pending M5 test changes.
The owned M5 PostgreSQL container and its exact anonymous volume were removed.
All nine exact interrupted synthetic fixture directories were removed after
their generated process configuration and test-key marker were inspected.
Final documentation `git diff --check` passed; frozen runtime/schema,
dependencies, workflows and generated Next imports remain unchanged.
No unrelated resource was altered.

All prior limits remain: storage/key broker/scanner/signing/authorization are
TEST_ONLY; production KMS/storage/scanner and OS/native parser sandbox are not
qualified. Sanitized != Anonymous. MANUAL_PRIVACY_REVIEW_REQUIRED means no
SANITIZATION_VERIFIED. RAW_DESTROYED requires complete M1 evidence; otherwise
DESTRUCTION_PENDING/DESTRUCTION_FAILED. Bypass inventory remains OPEN.
Sonar final campaign was not run. No AI/LLM, external OCR, Projects/Admin UI,
frozen engine/Map/Data Center semantic change, merge, final tag or deployment.

**STOP: owner decision required for the inherited dependency/build security
blocker. M5 has not passed final acceptance.**

## 21. JENAN PRIVACY GATEWAY — M5 FINAL CHECKPOINT FOR OWNER REVIEW

### 21.1 Authorized dependency exception and candidate preparation

The owner subsequently authorized only `next = 16.4.2` and
`eslint-config-next = 16.4.2`, both exact. This section supersedes section 20's
build-blocked status; section 20 remains the truthful historical stop receipt.
Approved M4 implementation baseline:
`7909939f888ac3423dca527116c2c9378016b229`.
M4 documentation closure baseline:
`2f8843e4daf9830f51740c15496bfd9fbe403f0c`.
Branch remains `jenan-platform/privacy-gateway`.

Only package.json/package-lock.json changed for the dependency exception.
The lock diff contains the two approved packages, @next/env, @next SWC platform
packages and @next/eslint-plugin-next only. No unrelated lock entry changed.
Physical installed manifests and lock both report 16.4.2; npm's first install
left stale physical 16.4.0 manifests despite its metadata report, so `npm ci`
restored the approved exact lock before any acceptance run.
React/React DOM 19.3.0, TypeScript 5.9.3, Sentry 11.7.0, sharp 0.35.5 and
Prisma 7.10.0 remain unchanged. Peer constraints are satisfied.
The npm bulk advisory query for the installed Next 16.4.2 returned no entries
at acceptance time. No suppression, forced build, security-rule/workflow
change or dependency remediation outside the exception was used.

Additional M5 files remain precisely the seven test/document files listed in
20.3. No Privacy implementation, engine, Map, Data Center semantic contract,
shared production contract, Prisma schema/migration, auth/routing semantics
or CSP/security rule changed after the approved M4 baseline.

### 21.2 Complete local acceptance receipts

| Gate | Result |
| --- | --- |
| M1 foundation / architecture regression | 333/333 PASS |
| M2 intake / architecture regression | 133/133 PASS |
| M3 sanitization / architecture regression | 166/166 PASS |
| M4 retained PostgreSQL / restart / architecture baseline | 92/92 PASS |
| M5 added acceptance cases | 12/12 PASS |
| Privacy total, M1-M5 | 736/736 PASS |
| Global architecture boundaries | 20/20 PASS |
| Full focused regression, 11 files | 756/756 PASS, zero failures/skips |
| Auth/approval/password/OAuth/routing/security helpers, 13 files | 112/112 PASS, zero failures/skips |
| Prisma validation/generation | PASS |
| Isolated PostgreSQL 17, complete 80 migrations | PASS |
| Pre-build TypeScript | PASS |
| Scoped ESLint | PASS, zero warnings |
| Production build, installed Next 16.4.2 | PASS, first upgraded attempt |
| Post-build TypeScript | PASS |
| Live production proxy/routing/CSP/nonce/browser smoke | PASS |
| Frozen runtime/schema/workflows diff | UNCHANGED |
| git diff --check | PASS |

The full focused run completed in 1465.61 seconds. Retained M4 PostgreSQL tests
plus the added publication/load case were 40/40; actual-process recovery plus
the added publish/destroy response-loss case were 45/45; new bounded final
acceptance was 10/10. M4 architecture remained 9/9.
No engine functional suite or historical repository-wide regression was run.

The real production server ran on loopback only, with account approval enabled.
Home, /auth, /login, /register and /auth/forgot returned 200; each response had
a distinct nonce bound into script markup. Unauthenticated /dashboard returned
307 to sign-in. Hardening headers and absence of X-Powered-By were verified.
Chromium hydrated login/register/forgot with zero page errors or CSP violations.
A session-only smoke assertion initially checked unsafe-inline across all
directives; it was corrected to check script-src, matching the unchanged
existing policy's intentional inline styles. No security rule was changed.
The temporary server was stopped after verification.

### 21.3 PostgreSQL, adversarial, recovery and leakage acceptance

The completed suites cover transactional state/evidence commit, revision/fence
locking, concurrent/duplicate delivery, stale worker rejection, exact scoped
artifact relationships, orphan prevention, append-only audit/receipts,
RLS/role separation and current authorization. Cross-job/package/client/
organization grants cannot advance the state.

Synthetic adversarial fixtures cover malformed archives, expansion bombs,
traversal/path collisions/Unicode ambiguity, unsupported formats, invalid/
unavailable scanner states and timeouts, parser failure, corrupted ciphertext,
wrong AAD/key reference, hash/policy/version/receipt tampering, audit rewriting,
ambiguous publication and mismatched/incomplete destruction evidence.

Actual fresh-process recovery covers intake, staging/key/object reservations,
scan, extraction, RAW_READY, classification/sanitization, stable mappings and
candidates, signed verification, publication response loss and destruction
cleanup response loss. Exact reconciliation does not redispatch a publication.
Stable token/candidate/receipt bytes, TTL, current revoked authorization,
role-change separation and stale-worker denial are retained after restart.
Reference cleanup without complete M1 evidence ends DESTRUCTION_FAILED, never
a fabricated RAW_DESTROYED receipt.

After the complete run, all eight Privacy metadata tables contained 1,587 rows:
zero synthetic RAW/PII/token/private-key sentinels, and zero orphan admissions,
inventory, receipts or work. Existing safe-error/audit tests and architecture
checks also passed. This is scoped evidence, not universal leakage certification;
no production telemetry/queue/transport activation was introduced.

### 21.4 Final bounded synthetic concurrency/load

| Metric | Admission/verify/cleanup | Publication/destruction |
| --- | --- | --- |
| Jobs / concurrency | 6 / 3 | 6 / 3 |
| Organizations / clients | 2 / 3 | 6 / 6 |
| Batch duration | 12,903 ms | 4,820 ms |
| Job latency p50 / p95, six samples | 6,431 / 6,444 ms | 1,301 / 3,474 ms |
| Worker process peak RSS | 247,967,744 bytes | 241,754,112 bytes |
| Maximum metadata envelope | 17,843 bytes | 1,288 bytes |
| Candidate / receipt envelope | 2,018 / 1,937 bytes | not separately measured |
| Unexpected failures | 0 | 0; 12 expected race rejections |

These are bounded synthetic acceptance results, not production SLA or capacity
qualification. Memory is worker-process high-water RSS, not total child/DB
memory. Publication/destruction load uses synthetic complete M1 evidence only;
the separate actual-process path honestly rejects incomplete real attestation.

### 21.5 Exact-SHA security gate and remaining limits

All local gates above completed before candidate creation. Exact tested M5
candidate: `68f149906f8ddc6a246c462e303a2bf88f4fe1a2`.
The unchanged CodeQL workflow analyzed that same SHA in
[run 39976513909](https://github.com/Jenan21/jenanbiz1-git/actions/runs/39976513909):
completed/success, javascript-typescript and actions jobs both successful.
Uploaded analysis IDs: 2014164471 (javascript-typescript) and 2014149386
(actions), both on the candidate SHA with empty analysis error fields.
Final repository-wide open alerts: zero. Privacy-branch open alerts: zero.
New open Privacy Gateway alerts: zero. No alert was dismissed or modified
during M5 acceptance.

The JavaScript analysis reported five results, not zero findings: these are
the existing previously dismissed alerts #14, #10, #9, #3 and #2, dated
2026-10-14/19, in Map operator tooling/bootstrap/auth helpers, outside Privacy.
Their historical disposition was inspected and left unchanged. Actions results
were zero. A runner-image migration annotation is informational, not a code
security finding. These distinctions must remain visible in the owner report.

The exact tested/security-analyzed candidate is immutable above. This later
documentation-only receipt does not change its tested source or dependency
graph and is not presented as a separately CodeQL-tested SHA.
The owned PostgreSQL acceptance container and its exact anonymous volume were
removed after all local validation. Test teardown removed its synthetic
directories; the production smoke server was stopped. No unrelated database,
container or service was modified.

Storage/key broker/scanner/signing/authorization adapters remain TEST_ONLY.
Production KMS/storage/scanner and OS/native parser sandbox are NOT QUALIFIED.
Sanitized != Anonymous. MANUAL_PRIVACY_REVIEW_REQUIRED means
NO SANITIZATION_VERIFIED. RAW_DESTROYED requires complete M1 evidence;
otherwise DESTRUCTION_PENDING/DESTRUCTION_FAILED. Bypass inventory remains
OPEN. Sonar final campaign was not run. No AI/LLM, external OCR, Projects/Admin
UI, frozen semantics change, merge, final tag or production deployment.

**M5 submitted for owner review only after the exact-SHA security gate;
not self-approved/closed. STOP: no merge, final tag or production deployment.**
