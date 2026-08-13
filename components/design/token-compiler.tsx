"use client";

import { useState } from "react";

export function TokenCompiler() {
  const [primary, setPrimary] = useState("#00d9ff");
  const [accent, setAccent] = useState("#7c5cff");

  function exportTokens() {
    const tokens = {
      "--brand": primary,
      "--violet": accent,
    };
    const blob = new Blob([JSON.stringify(tokens, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "design-tokens.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <div className="card-title">Design Token Compiler</div>
      <div className="card-sub">Create CSS variables and export JSON</div>
      <div style={{ marginTop: 12 }}>
        <label className="muted">Primary</label>
        <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} style={{ width: 72, height: 40, borderRadius: 8, border: 0 }} />
        <label className="muted" style={{ marginLeft: 12 }}>Accent</label>
        <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} style={{ width: 72, height: 40, borderRadius: 8, border: 0 }} />
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={exportTokens}>Export Tokens</button>
      </div>
    </div>
  );
}
