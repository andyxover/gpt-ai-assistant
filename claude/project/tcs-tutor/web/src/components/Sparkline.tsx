/**
 * Compact inline SVG sparkline. Pure server component — no state,
 * no client JS. Renders a path through the supplied points (each
 * value 0-100), with a soft fill underneath and the trend line on top.
 */
export default function Sparkline({
  points,
  width = 70,
  height = 22,
  stroke = 'var(--success)',
  fill = 'rgba(60, 167, 116, 0.18)',
}: {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}) {
  if (points.length < 2) return null;

  const pad = 1;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const xStep = w / (points.length - 1);

  const coords = points.map((v, i) => {
    const x = pad + i * xStep;
    const y = pad + h - (Math.max(0, Math.min(100, v)) / 100) * h;
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], i) => (i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`))
    .join(' ');
  const fillPath = `${linePath} L${coords[coords.length - 1][0].toFixed(1)},${(pad + h).toFixed(1)} L${coords[0][0].toFixed(1)},${(pad + h).toFixed(1)} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <path d={fillPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
