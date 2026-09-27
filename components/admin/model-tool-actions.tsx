"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Row = Record<string, string | number | boolean | null>;

export function ModelToolActions({ models, path, tools }: { models: Row[]; path: string; tools: Row[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedModel, setSelectedModel] = useState(String(models[0]?.id ?? ""));
  const [selectedTool, setSelectedTool] = useState(String(tools[0]?.id ?? ""));
  const [executionId, setExecutionId] = useState("");

  async function execute(payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/model-tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message ?? "تعذر تنفيذ الأمر");
      if (payload.action === "registerModel") setSelectedModel(String(body.result.id));
      if (payload.action === "registerTool") setSelectedTool(String(body.result.id));
      if (payload.action === "requestToolExecution") setExecutionId(String(body.result.id));
      setMessage(payload.action === "routeModel" ? `تم اختيار ${body.result.model.displayName} بتكلفة تقديرية ${body.result.estimatedCostMinor}` : "تم تنفيذ الأمر وحفظ السجل.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تنفيذ الأمر"); }
    finally { setBusy(false); }
  }

  if (path.startsWith("/models")) {
    return <section className="mission-engine-console"><header><div><span>MODEL GOVERNANCE</span><h2>سجل النماذج وقواعد التوجيه</h2></div><strong>QUALITY · COST · LATENCY</strong></header><form className="admin-ops-command" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = new FormData(event.currentTarget); void execute({ action: "registerModel", averageLatencyMs: Number(values.get("latency")), capabilities: String(values.get("capabilities")).split(",").map((item) => item.trim()).filter(Boolean), displayName: values.get("displayName"), enabled: true, inputCostPerMillionMinor: Number(values.get("inputCost")), modelKey: values.get("modelKey"), outputCostPerMillionMinor: Number(values.get("outputCost")), provider: values.get("provider"), qualityScore: Number(values.get("quality")), status: "ACTIVE" }); }}><label>الاسم<input name="displayName" minLength={2} required /></label><label>Provider<input name="provider" minLength={2} required /></label><label>Model key<input name="modelKey" required /></label><label>Capabilities<input name="capabilities" placeholder="analysis,json" /></label><label>Quality<input name="quality" type="number" min={0} max={100} defaultValue={80} /></label><label>Latency ms<input name="latency" type="number" min={0} defaultValue={500} /></label><label>Input cost / 1M<input name="inputCost" type="number" min={0} defaultValue={0} /></label><label>Output cost / 1M<input name="outputCost" type="number" min={0} defaultValue={0} /></label><button className="btn primary" disabled={busy} type="submit">تسجيل النموذج</button></form><div className="mission-engine-console__selectors"><label>النموذج<select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>{models.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.displayName)}</option>)}</select></label><button disabled={busy || !selectedModel} onClick={() => void execute({ action: "setRoutingRule", maximumCostMinor: 100, maximumLatencyMs: 5000, minimumQuality: 50, modelId: selectedModel, name: `General rule ${Date.now()}`, priority: 100, requiredCapabilities: [], taskType: "general" })}>إضافة قاعدة General</button><button disabled={busy || !models.length} onClick={() => void execute({ action: "routeModel", estimatedInputTokens: 1000, estimatedOutputTokens: 500, taskType: "general" })}>اختبار التوجيه</button></div>{message ? <p className="admin-ops-feedback" role="status">{message}</p> : null}</section>;
  }

  return <section className="mission-engine-console"><header><div><span>TOOL GOVERNANCE</span><h2>الأدوات والصلاحيات والتنفيذ</h2></div><strong>LEAST PRIVILEGE</strong></header><form className="admin-ops-command" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = new FormData(event.currentTarget); void execute({ action: "registerTool", description: "Governed platform tool", enabled: true, handlerId: "task-brief", key: values.get("key"), name: values.get("name"), riskLevel: values.get("riskLevel") }); }}><label>Key<input name="key" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><label>الاسم<input name="name" minLength={2} required /></label><label>المخاطر<select name="riskLevel"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><button className="btn primary" disabled={busy} type="submit">تسجيل الأداة</button></form><div className="mission-engine-console__selectors"><label>الأداة<select value={selectedTool} onChange={(event) => setSelectedTool(event.target.value)}>{tools.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label><button disabled={busy || !selectedTool} onClick={() => void execute({ action: "setToolPermission", allowed: true, approvalRequired: true, role: "ADMIN", scopes: ["mission:write"], toolId: selectedTool })}>منح ADMIN مع موافقة</button><button disabled={busy || !selectedTool} onClick={() => { const tool = tools.find((item) => String(item.id) === selectedTool); void execute({ action: "requestToolExecution", payload: { title: "Governed task brief", description: "Requested from tools console" }, toolKey: tool?.key }); }}>طلب تنفيذ</button><button disabled={busy || !executionId} onClick={() => void execute({ action: "decideToolApproval", approve: true, executionId, rationale: "Approved by platform administrator" })}>اعتماد التنفيذ</button><button disabled={busy || !executionId} onClick={() => void execute({ action: "executeTool", executionId })}>تشغيل المعتمد</button></div>{message ? <p className="admin-ops-feedback" role="status">{message}</p> : null}</section>;
}