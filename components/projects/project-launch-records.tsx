"use client";

import { FormEvent, useState } from "react";

import type { Locale } from "@/types/i18n";

export type ProjectComplianceRecord = {
  id: string;
  kind: "LICENSE" | "PROCEDURE";
  title: string;
  authority: string | null;
  status:
    | "REQUIRED"
    | "IN_PROGRESS"
    | "SUBMITTED"
    | "APPROVED"
    | "REJECTED"
    | "NOT_APPLICABLE";
  reference: string | null;
  dueAt: string | null;
  notes: string | null;
};

export type ProjectVendorRecord = {
  id: string;
  kind: "VENDOR" | "PARTNER";
  name: string;
  category: string | null;
  contactEmail: string | null;
  status: "PROSPECT" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  notes: string | null;
};

async function command(body: Record<string, unknown>) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  if (!response.ok)
    throw new Error(payload?.message ?? "Project command failed");
}

export function ProjectComplianceWorkspace({
  items,
  locale,
  onChanged,
  projectId,
}: {
  items: ProjectComplianceRecord[];
  locale: Locale;
  onChanged: () => Promise<void>;
  projectId: string;
}) {
  const ar = locale === "ar";
  const [kind, setKind] = useState<ProjectComplianceRecord["kind"]>("LICENSE");
  const [title, setTitle] = useState("");
  const [authority, setAuthority] = useState("");
  const [reference, setReference] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await command(body);
      await onChanged();
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر حفظ السجل."
            : "The record could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      {
        action: "createCompliance",
        authority: authority || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        kind,
        projectId,
        reference: reference || undefined,
        title,
      },
      ar ? "تمت إضافة المتطلب." : "Requirement added.",
    );
    setTitle("");
    setAuthority("");
    setReference("");
    setDueAt("");
  }

  const nextStatus = (status: ProjectComplianceRecord["status"]) =>
    status === "REQUIRED" || status === "REJECTED"
      ? "IN_PROGRESS"
      : status === "IN_PROGRESS"
        ? "SUBMITTED"
        : status === "SUBMITTED"
          ? "APPROVED"
          : null;
  return (
    <article
      className="card project-launch-records project-compliance"
      data-project-focus="compliance"
    >
      <header className="section-heading">
        <h3>{ar ? "التراخيص والإجراءات" : "Licenses and procedures"}</h3>
        <p>
          {ar
            ? "سجل متطلبات قابل للتتبع بجهة مرجعية وحالة وتاريخ استحقاق."
            : "A traceable requirement register with authority, status, and due date."}
        </p>
      </header>
      <form className="project-launch-records__form" onSubmit={create}>
        <select
          aria-label={ar ? "نوع المتطلب" : "Requirement type"}
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as ProjectComplianceRecord["kind"])
          }
        >
          <option value="LICENSE">{ar ? "ترخيص" : "License"}</option>
          <option value="PROCEDURE">{ar ? "إجراء" : "Procedure"}</option>
        </select>
        <input
          required
          minLength={2}
          maxLength={240}
          placeholder={ar ? "اسم المتطلب" : "Requirement title"}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          maxLength={240}
          placeholder={ar ? "الجهة" : "Authority"}
          value={authority}
          onChange={(event) => setAuthority(event.target.value)}
        />
        <input
          maxLength={500}
          placeholder={ar ? "المرجع" : "Reference"}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
        <input
          aria-label={ar ? "تاريخ الاستحقاق" : "Due date"}
          type="date"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
        />
        <button
          className="button button--primary"
          disabled={busy}
          type="submit"
        >
          {ar ? "إضافة متطلب" : "Add requirement"}
        </button>
      </form>
      {message ? (
        <p className="project-error" role="status">
          {message}
        </p>
      ) : null}
      <div className="project-launch-records__list">
        {items.map((item) => {
          const status = nextStatus(item.status);
          return (
            <article key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>
                  {item.kind} ·{" "}
                  {item.authority ?? (ar ? "جهة غير محددة" : "No authority")}
                </span>
                <small>
                  {item.reference ?? (ar ? "لا يوجد مرجع" : "No reference")}
                </small>
              </div>
              <div>
                <strong>{item.status}</strong>
                {status ? (
                  <button
                    className="button button--secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        {
                          action: "updateComplianceStatus",
                          itemId: item.id,
                          projectId,
                          status,
                        },
                        ar ? "تم تحديث الحالة." : "Status updated.",
                      )
                    }
                    type="button"
                  >
                    {status.replaceAll("_", " ")}
                  </button>
                ) : null}
                {item.status === "REQUIRED" ? (
                  <button
                    className="button button--ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        {
                          action: "updateComplianceStatus",
                          itemId: item.id,
                          projectId,
                          status: "NOT_APPLICABLE",
                        },
                        ar
                          ? "تم توثيق عدم الانطباق."
                          : "Not-applicable state recorded.",
                      )
                    }
                    type="button"
                  >
                    {ar ? "غير منطبق" : "Not applicable"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
        {!items.length ? (
          <p className="project-error">
            {ar
              ? "لا توجد تراخيص أو إجراءات مسجلة."
              : "No licenses or procedures recorded."}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function ProjectVendorWorkspace({
  items,
  locale,
  onChanged,
  projectId,
}: {
  items: ProjectVendorRecord[];
  locale: Locale;
  onChanged: () => Promise<void>;
  projectId: string;
}) {
  const ar = locale === "ar";
  const [kind, setKind] = useState<ProjectVendorRecord["kind"]>("VENDOR");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await command(body);
      await onChanged();
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر حفظ السجل."
            : "The record could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      {
        action: "createVendor",
        category: category || undefined,
        contactEmail: contactEmail || undefined,
        kind,
        name,
        projectId,
      },
      ar ? "تمت إضافة الجهة." : "Organization added.",
    );
    setName("");
    setCategory("");
    setContactEmail("");
  }

  const nextStatus = (status: ProjectVendorRecord["status"]) =>
    status === "PROSPECT"
      ? "APPROVED"
      : status === "APPROVED"
        ? "ACTIVE"
        : status === "ACTIVE"
          ? "SUSPENDED"
          : null;
  return (
    <article
      className="card project-launch-records project-vendors"
      data-project-focus="vendors"
    >
      <header className="section-heading">
        <h3>{ar ? "الموردون والشركاء" : "Vendors and partners"}</h3>
        <p>
          {ar
            ? "سجل جهات المشروع وحالتها الفعلية، دون تقييمات أو عقود مفترضة."
            : "A record of project organizations and their actual status, without inferred ratings or contracts."}
        </p>
      </header>
      <form className="project-launch-records__form" onSubmit={create}>
        <select
          aria-label={ar ? "نوع الجهة" : "Organization type"}
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as ProjectVendorRecord["kind"])
          }
        >
          <option value="VENDOR">{ar ? "مورد" : "Vendor"}</option>
          <option value="PARTNER">{ar ? "شريك" : "Partner"}</option>
        </select>
        <input
          required
          minLength={2}
          maxLength={240}
          placeholder={ar ? "اسم الجهة" : "Organization name"}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          maxLength={160}
          placeholder={ar ? "التصنيف" : "Category"}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
        <input
          maxLength={320}
          type="email"
          placeholder={ar ? "بريد التواصل" : "Contact email"}
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
        />
        <button
          className="button button--primary"
          disabled={busy}
          type="submit"
        >
          {ar ? "إضافة جهة" : "Add organization"}
        </button>
      </form>
      {message ? (
        <p className="project-error" role="status">
          {message}
        </p>
      ) : null}
      <div className="project-launch-records__list">
        {items.map((item) => {
          const status = nextStatus(item.status);
          return (
            <article key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>
                  {item.kind} ·{" "}
                  {item.category ?? (ar ? "غير مصنف" : "Uncategorized")}
                </span>
                <small>
                  {item.contactEmail ?? (ar ? "لا يوجد بريد" : "No email")}
                </small>
              </div>
              <div>
                <strong>{item.status}</strong>
                {status ? (
                  <button
                    className="button button--secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        {
                          action: "updateVendorStatus",
                          projectId,
                          status,
                          vendorId: item.id,
                        },
                        ar ? "تم تحديث الحالة." : "Status updated.",
                      )
                    }
                    type="button"
                  >
                    {status}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
        {!items.length ? (
          <p className="project-error">
            {ar
              ? "لا يوجد موردون أو شركاء مسجلون."
              : "No vendors or partners recorded."}
          </p>
        ) : null}
      </div>
    </article>
  );
}
