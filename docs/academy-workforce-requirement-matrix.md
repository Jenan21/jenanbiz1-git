# Jenan Digital Workforce Requirement Matrix

## Existing System Discovered

| Area | Status | Notes |
| --- | --- | --- |
| Robot Factory and persistent robot identity | DONE | `Robot` is the durable identity and stays separate from runtime allocation. |
| Missions, tasks, evidence, costs, evolution | DONE | Existing models remain intact and are linked from workforce runtime and experience foundations. |
| Platform RBAC and audit | PARTIAL | Platform `ADMIN` and `SUPER_ADMIN` protect Academy commands; Academy-specific roles and assignments are persisted for staged delegation. |
| Model gateway and tool registry | PARTIAL | Provider abstraction exists. Live provider acceptance is deferred as an external billing blocker. |
| Academy Foundation registry and lifecycle | DONE | Academy, colleges, fields, disciplines, specializations, skills, courses, labs, exams, certifications, profiles, retraining, and certificates are persisted. |

## Workforce V1 Coverage

| Requirement | Status | Implementation |
| --- | --- | --- |
| Demand to workforce gap to candidate batch | DONE | `WorkforceDemand`, `WorkforceGap`, `CandidateBatch`, and transactional services. |
| Cohorts and competency-based programs | DONE | Programs, immutable curriculum versions, cohorts, enrollment, hours, mastery, and probation settings. |
| Skills graph and cycle protection | DONE | Hierarchy, prerequisites, typed relations, resources, and cycle prevention in the service layer. |
| Theory, lab, practical, blind assessment | DONE | Separate lifecycle states and persisted attempts with rubric/evaluator/reviewer provenance. |
| Independent review and hard gates | DONE | Evaluator/reviewer separation guard, critical exam gates, certification requirements, and audit entries. |
| Certification validity and expiry | DONE | Expiry refresh marks certificates as recertification-required and prevents runtime allocation. |
| Agent identity separated from runtime | DONE | `AgentRuntimeAllocation` leases a runtime to an eligible persisted `Robot` identity, then releases it. |
| Real mission performance feedback | DONE | `AcademicExperience` updates trust/reliability; repeated critical failures suspend and queue retraining. |
| Genome and shared packs | DONE | Version-ready genome, skill packs, knowledge packs, and reusable bindings. |
| Geography foundation | DONE | Hierarchical nodes, agent geography profiles, and privacy-restricted geographic knowledge provenance. |
| Curriculum evolution | DONE | Versioned curricula and reviewable change proposals tied to validated experience. |
| Admin Academy UI and API | DONE | Admin dashboard is API-driven; demand and geography controls call the protected service layer. |
| Live AI labs and live acceptance | EXTERNAL BLOCKER | Explicitly `Awaiting AI Provider`; no mock is used to claim production AI. |

## Deferred After V1

- Worker queue infrastructure and distributed scheduling are designed for by batches, cohorts, idempotent uniqueness, runtime leases, and audit records, but are not provisioned before load requires them.
- GIS/vector/raster ingestion, licensed source connectors, and time-series analytics remain provider/data integrations rather than fabricated data.
- Granular Academy role-assignment UI and non-admin scoped command authorization remain a staged RBAC extension; platform admin protection is active now.
- Arena execution sandboxes, full capstone project evaluators, bulk load benchmarking with ten-thousand physical candidate identities, and API-provider training execution are deferred until the relevant workers/providers are authorized.