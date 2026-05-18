/**
 * Skeleton shown while the AI narrative is generating. Pure server
 * component, no client-side hydration needed, so it sidesteps the
 * Next 16 + Turbopack streaming hydration quirk that affects
 * route-level loading.tsx files.
 */
export default function NarrativeSkeleton() {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="section-h">
        <h2 style={{ visibility: 'hidden' }}>placeholder</h2>
      </div>
      <div className="card" style={{ borderLeft: '3px solid var(--surface-3)' }}>
        <SkLine width="60%" />
        <SkLine width="85%" />
        <SkLine width="70%" />
      </div>
      <div className="section-h" style={{ marginTop: 20 }}>
        <h2 style={{ visibility: 'hidden' }}>placeholder</h2>
      </div>
      <div className="card">
        <SkLine width="40%" />
        <SkLine width="90%" />
        <SkLine width="80%" />
        <SkLine width="55%" />
      </div>
      <p
        className="mono small muted"
        style={{ marginTop: 16, textAlign: 'center', fontStyle: 'italic' }}
      >
        Writing your weekly summary…
      </p>
    </div>
  );
}

function SkLine({ width }: { width: string }) {
  return (
    <div
      style={{
        width,
        height: 12,
        borderRadius: 4,
        background:
          'linear-gradient(90deg, var(--surface-3) 0%, var(--surface-2) 50%, var(--surface-3) 100%)',
        backgroundSize: '200% 100%',
        animation: 'parentSkShimmer 1.4s ease-in-out infinite',
        margin: '10px 0',
      }}
    />
  );
}
