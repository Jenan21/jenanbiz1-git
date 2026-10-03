"use client";

import Link from "next/link";
import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Organization = { id: string; name: string; businessPrograms: Array<{ key: string; status: string }> };
type Vehicle = { id: string; label: string; plateNumber: string; status: "ACTIVE" | "MAINTENANCE" | "INACTIVE" };

export function FleetWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [organizations, setOrganizations] = useState<Organization[]>([]); const [organizationId, setOrganizationId] = useState(""); const [vehicles, setVehicles] = useState<Vehicle[]>([]); const [label, setLabel] = useState(""); const [plateNumber, setPlateNumber] = useState(""); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false);
  async function load() {
    setLoading(true); const response = await fetch("/api/programs", { cache: "no-store" }); const payload = await response.json().catch(() => null) as { organizations?: Array<{ organization: Organization }>; message?: string } | null;
    if (!response.ok || !payload?.organizations) { setMessage(payload?.message ?? (ar ? "تعذر تحميل المنشآت." : "Organizations could not be loaded.")); setLoading(false); return; }
    const nextOrganizations = payload.organizations.map(({ organization }) => organization).filter((organization) => organization.businessPrograms.some((program) => program.key === "FLEET" && program.status === "ACTIVE")); const nextId = nextOrganizations.some((organization) => organization.id === organizationId) ? organizationId : (nextOrganizations[0]?.id ?? ""); setOrganizations(nextOrganizations); setOrganizationId(nextId);
    if (nextId) { const vehicleResponse = await fetch(`/api/programs/fleet?organizationId=${encodeURIComponent(nextId)}`, { cache: "no-store" }); const vehiclePayload = await vehicleResponse.json().catch(() => null) as { vehicles?: Vehicle[]; message?: string } | null; if (vehicleResponse.ok && vehiclePayload?.vehicles) setVehicles(vehiclePayload.vehicles); else setMessage(vehiclePayload?.message ?? (ar ? "تعذر تحميل الأسطول." : "Fleet could not be loaded.")); } else setVehicles([]); setLoading(false);
  }
  const loadInEffect = useEffectEvent(() => { void load(); });

  useEffect(() => {
    const timeout = window.setTimeout(loadInEffect, 0);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => {
    if (!organizationId) return;
    const timeout = window.setTimeout(loadInEffect, 0);
    return () => window.clearTimeout(timeout);
  }, [organizationId]);
  async function submit(command: Record<string, unknown>) { setSubmitting(true); setMessage(""); const response = await fetch("/api/programs/fleet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) }); const payload = await response.json().catch(() => null) as { message?: string } | null; if (response.ok) await load(); else setMessage(payload?.message ?? (ar ? "تعذر حفظ المركبة." : "Vehicle could not be saved.")); setSubmitting(false); }
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await submit({ action: "create", organizationId, label, plateNumber }); setLabel(""); setPlateNumber(""); }
  const statusLabel = (status: Vehicle["status"]) => ({ ACTIVE: ar ? "نشطة" : "Active", MAINTENANCE: ar ? "صيانة" : "Maintenance", INACTIVE: ar ? "غير نشطة" : "Inactive" })[status];
  return <section className="fleet-workspace" aria-busy={loading}><header className="fleet-workspace__header"><div><span className="eyebrow eyebrow--small">FLEET / VEHICLES</span><h1>{ar ? "إدارة أسطول المنشأة" : "Organization fleet management"}</h1><p>{ar ? "سجل مركبات منشأتك وتابع حالتها التشغيلية الفعلية." : "Register organization vehicles and track their real operational status."}</p></div><Link className="button button--secondary" href="/programs">{ar ? "برامج المنشأة" : "Organization programs"}</Link></header>{organizations.length ? <label className="fleet-organization">{ar ? "المنشأة" : "Organization"}<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label> : <p className="programs-message">{ar ? "فعّل برنامج إدارة الأسطول أولًا." : "Activate the fleet program first."}</p>}{organizations.length ? <form className="fleet-form" onSubmit={create}><input required minLength={2} maxLength={160} placeholder={ar ? "اسم أو وصف المركبة" : "Vehicle label"} value={label} onChange={(event) => setLabel(event.target.value)} /><input required minLength={2} maxLength={32} placeholder={ar ? "رقم اللوحة" : "Plate number"} value={plateNumber} onChange={(event) => setPlateNumber(event.target.value)} /><button className="button button--primary" disabled={submitting} type="submit">{ar ? "إضافة مركبة" : "Add vehicle"}</button></form> : null}{message ? <p className="programs-message" role="status">{message}</p> : null}<div className="fleet-vehicles">{vehicles.map((vehicle) => <article key={vehicle.id}><div><strong>{vehicle.label}</strong><span>{vehicle.plateNumber}</span></div><div><strong>{statusLabel(vehicle.status)}</strong>{vehicle.status === "ACTIVE" ? <button className="button button--secondary" disabled={submitting} onClick={() => void submit({ action: "updateStatus", organizationId, vehicleId: vehicle.id, status: "MAINTENANCE" })} type="button">{ar ? "صيانة" : "Maintenance"}</button> : null}</div></article>)}{!loading && organizations.length && !vehicles.length ? <p className="programs-message">{ar ? "لا توجد مركبات مسجلة." : "No vehicles registered."}</p> : null}</div></section>;
}