# Jenan BIZ Product Delivery Plan

This document records approved product requirements and delivery gates. It is a planning specification only; entries here do not authorize implementation.

## Mandatory delivery order

1. Complete and receive explicit approval for **Login**.
2. Complete and close **Register**.
3. Begin **Admin Command Center** only after Login and Register are closed.

No new product task may start before the current task is closed or an explicit priority change is approved. The communications requirement below must not be implemented, committed, or pushed as functional work before its delivery gate opens.

## Admin Command Center — future approved scope

### Jenan Communications Command Center / مركز الاتصالات

#### Objective

Connect all email addresses associated with the platform so incoming messages appear automatically in the Admin dashboard, where they are classified, prioritized, and routed according to message type and urgency.

#### Sources

- Gmail.
- Future Jenan-hosted email accounts.
- The integration boundary must allow additional approved communication sources later without changing the core classification workflow.

#### Priority and handling policy

##### P1 — Executive

Includes government entities, legal matters, patents and inventions, investors, strategic partnerships, banks, contracts, and sensitive communications.

- Notify the owner/Admin immediately.
- Show sender, organization, summary, attachments, requested action, and a proposed reply.
- Never send an automatic reply.
- An Agent may prepare analysis or a draft, but an Admin must explicitly approve any outgoing response.

##### P2 — Critical

Includes major complaints, important customers, and payment, security, or operational incidents.

- Send a rapid alert.
- Prepare a resolution plan or reply draft.
- Require Human/Admin approval whenever policy, risk, access, money, security, or external commitment is involved.

##### P3 — Operational

Includes quotations, service inquiries, request follow-ups, subscriptions, invoices, and sales communications.

- Support fast automatic or assisted replies only through approved templates and policies.
- Route to the responsible Agent or specialist team.
- Escalate when confidence, policy coverage, or authority is insufficient.

##### P4 — Routine

Includes newsletters, notifications, and routine communications.

- Classify and archive according to policy.
- Include useful items in the appropriate digest.

#### Required capabilities

- AI classification and priority scoring, with visible rationale and confidence.
- Assignment to Agents or specialist teams.
- Draft Reply / Approve / Send workflow with role-based permissions.
- Complete, immutable audit log of ingestion, classification, routing, approvals, edits, and sends.
- Safe attachment handling, metadata display, malware/content checks, and access controls.
- SLA and response timers with breach/escalation states.
- In-Admin alerts; Slack and mobile notifications are later integration phases.
- Source/message threading, duplicate handling, status tracking, and searchable history.
- Explicit fallback to Human/Admin review when classification confidence is insufficient.

#### Collective Intelligence Core integration

Validated classification decisions, approved corrections, and approved responses may later be connected to the **Collective Intelligence Core**. Only validated, access-controlled data may be used so future generations can benefit without learning from unreviewed, sensitive, or incorrect decisions.

#### Non-negotiable safety rule

No Agent may automatically send sensitive, government, legal, patent/invention, banking, contractual, partnership, or investment-related replies. These categories always require explicit Admin approval before sending.

#### Current status

**Recorded and approved for future planning only. Not authorized for implementation.** Login remains the active task; Register follows after explicit Login approval, and Admin Command Center follows only after Register is closed.
