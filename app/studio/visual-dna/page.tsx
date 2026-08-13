import { Visualizer } from "@/components/visual-dna/visualizer";

export const metadata = {
  title: "Visual DNA — Studio",
};

export default function VisualDNAPage() {
  return (
    <main className="shell">
      <div className="page-grid">
        <aside className="side-stack">
          <div className="card">
            <div className="card-title">Studio</div>
            <div className="card-sub">Design tools and visual utilities</div>
          </div>
        </aside>
        <section className="main-stack">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Visual DNA</div>
                <div className="card-sub">Upload an image to generate a theme and preview</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Visualizer />
            </div>
          </div>
        </section>
        <aside className="right-stack">
          <div className="card">
            <div className="card-title">Preview Tips</div>
            <div className="card-sub">Try logos, photos, or interface screenshots.</div>
          </div>
        </aside>
      </div>
    </main>
  );
}
