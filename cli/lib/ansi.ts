// Minimal ANSI styling + layout helpers for the Shipyard CLI (no dependency).
// Color is off when NO_COLOR is set, when --no-color is passed, or when the output is not a TTY.

export interface Style {
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  blue(s: string): string;
  magenta(s: string): string;
  cyan(s: string): string;
  gray(s: string): string;
  inverse(s: string): string;
  bgRed(s: string): string;
  bgGreen(s: string): string;
  bgYellow(s: string): string;
}

export function makeStyle(enabled: boolean): Style {
  const wrap = (open: number, close: number) => (s: string) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s);
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    blue: wrap(34, 39),
    magenta: wrap(35, 39),
    cyan: wrap(36, 39),
    gray: wrap(90, 39),
    inverse: wrap(7, 27),
    bgRed: (s) => (enabled ? `\x1b[41m\x1b[97m${s}\x1b[39m\x1b[49m` : s),
    bgGreen: (s) => (enabled ? `\x1b[42m\x1b[30m${s}\x1b[39m\x1b[49m` : s),
    bgYellow: (s) => (enabled ? `\x1b[43m\x1b[30m${s}\x1b[39m\x1b[49m` : s),
  };
}

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, '');
export const visibleLength = (s: string): number => [...stripAnsi(s)].length;

export function padEnd(s: string, width: number): string {
  const n = visibleLength(s);
  return n >= width ? s : s + ' '.repeat(width - n);
}
export function padStart(s: string, width: number): string {
  const n = visibleLength(s);
  return n >= width ? s : ' '.repeat(width - n) + s;
}
export function truncate(s: string, width: number): string {
  const chars = [...s];
  return chars.length <= width ? s : `${chars.slice(0, Math.max(0, width - 1)).join('')}…`;
}
export function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Simple column table. Cells may contain ANSI codes. Right-aligns columns listed in `right`. */
export function table(headers: string[], rows: string[][], st: Style, right: number[] = []): string {
  const widths = headers.map((h, i) => Math.max(visibleLength(h), ...rows.map((r) => visibleLength(r[i] ?? ''))));
  const fmt = (cells: string[]) =>
    cells.map((c, i) => (right.includes(i) ? padStart(c ?? '', widths[i]) : padEnd(c ?? '', widths[i]))).join('  ').trimEnd();
  return [st.dim(fmt(headers)), ...rows.map(fmt)].join('\n');
}

export const money = (v: number | null | undefined, digits = 4): string => (v === null || v === undefined ? '-' : `$${v.toFixed(digits)}`);
export const pct = (v: number | null | undefined): string => (v === null || v === undefined ? '-' : `${(v * 100).toFixed(v === 1 || v === 0 ? 0 : 1)}%`);

export function bar(fraction: number, width: number, st: Style, color: (s: string) => string = st.green): string {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const full = Math.round(f * width);
  return color('█'.repeat(full)) + st.gray('░'.repeat(width - full));
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
