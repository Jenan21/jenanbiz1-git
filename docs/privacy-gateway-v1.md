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
