export function inr(x: number): string {
  const abs: string = Math.abs(x).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${x < 0 ? '-' : ''}₹${abs}`;
}

export function inrCompact(x: number): string {
  return `${x < 0 ? '-' : ''}₹${new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.abs(x))}`;
}

export function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function timeOf(ts: number): string {
  return new Date(ts).toLocaleString();
}
