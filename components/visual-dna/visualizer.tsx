"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";

function toHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function quantizeColor(r: number, g: number, b: number, step = 24) {
  return [Math.round(r / step) * step, Math.round(g / step) * step, Math.round(b / step) * step];
}

export function Visualizer() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setInfo(`File: ${file.name} — ${Math.round(file.size / 1024)} KB`);
    await extractPalette(url);
  }

  async function extractPalette(url: string) {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const cw = 200;
        const ch = Math.round((img.height / img.width) * cw);
        const canvas = canvasRef.current!;
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, cw, ch);
        const data = ctx.getImageData(0, 0, cw, ch).data;
        const counts = new Map<string, number>();
        // sample every 4th pixel (reduce work)
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const [qr, qg, qb] = quantizeColor(r, g, b, 16);
          const key = `${qr},${qg},${qb}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        const colors = sorted.slice(0, 6).map((s) => {
          const [r, g, b] = s[0].split(",").map((v) => Number(v));
          return toHex(r, g, b);
        });
        setPalette(colors);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  function applyTheme() {
    if (!palette.length) return;
    const root = document.documentElement;
    // map top colors to theme variables
    root.style.setProperty("--brand", palette[0]);
    if (palette[1]) root.style.setProperty("--glow", palette[1]);
    if (palette[2]) root.style.setProperty("--violet", palette[2]);
    if (palette[3]) root.style.setProperty("--blue", palette[3]);
  }

  return (
    <div className="visual-dna">
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input type="file" accept="image/*" onChange={handleFile} />
        <Button onClick={() => applyTheme()} disabled={!palette.length}>
          Apply theme
        </Button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>{info}</p>
      <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
        <canvas ref={canvasRef} style={{ width: 200, height: 120, borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {palette.length ? (
            palette.map((c) => (
              <div key={c} style={{ width: 56, height: 56, borderRadius: 8, background: c, border: "1px solid rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <small style={{ color: "#000", fontWeight: 700 }}>{c}</small>
              </div>
            ))
          ) : (
            <div className="muted">No palette yet — upload an image.</div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Live Preview</div>
              <div className="card-sub">Preview applies extracted colors to site theme</div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ padding: 18, borderRadius: 12 }} className="glass">
              <h3 style={{ margin: 0 }}>Jenan BIZ — Preview</h3>
              <p className="muted">This preview uses current CSS variables.</p>
              <div style={{ marginTop: 12 }}>
                <div className="pill">Primary: <span style={{ marginLeft: 8 }}>{palette[0] ?? "-"}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
