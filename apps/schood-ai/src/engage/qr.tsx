import qrcode from 'qrcode-generator';

// A QR code for a share or verification link, drawn as inline SVG paths (no images,
// no network). Error correction M survives a phone camera at arm's length.

export function QrCode({ value, label, size = 168 }: { value: string; label: string; size?: number }) {
  const code = qrcode(0, 'M');
  code.addData(value);
  code.make();
  const count = code.getModuleCount(), margin = 2, total = count + margin * 2;
  let path = '';
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (code.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`;
  return <svg role="img" aria-label={label} viewBox={`0 0 ${total} ${total}`} width={size} height={size} shapeRendering="crispEdges" className="rounded-xl border border-navy-line/30 bg-white">
    <rect width={total} height={total} fill="#ffffff"/>
    <path d={path} fill="#0f172a"/>
  </svg>;
}
