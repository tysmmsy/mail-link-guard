// Punycode decoding (RFC 3492) so a host such as "xn--mzon-..." can be shown and
// matched in its Unicode form. Browsers expose only the ASCII form through URL.

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

function digitOf(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 22; // 0-9 -> 26-35
  if (code >= 0x41 && code <= 0x5a) return code - 0x41; // A-Z
  if (code >= 0x61 && code <= 0x7a) return code - 0x61; // a-z
  return BASE;
}

/** Decodes one Punycode label (without the "xn--" prefix). Returns null when malformed. */
export function decodeLabel(input: string): string | null {
  const output: number[] = [];
  const basicEnd = input.lastIndexOf("-");
  for (let j = 0; j < Math.max(basicEnd, 0); j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) return null;
    output.push(c);
  }
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let i = 0;
  for (let index = basicEnd > 0 ? basicEnd + 1 : 0; index < input.length; ) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) return null;
      const digit = digitOf(input.charCodeAt(index++));
      if (digit >= BASE) return null;
      i += digit * w;
      if (i > 0x10ffff * 64) return null;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const length = output.length + 1;
    bias = adapt(i - oldi, length, oldi === 0);
    n += Math.floor(i / length);
    i %= length;
    if (n > 0x10ffff) return null;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

/** Converts each "xn--" label of a host to Unicode; other labels are kept as they are. */
export function toUnicodeHost(host: string): string {
  return host
    .split(".")
    .map((label) => {
      if (!label.toLowerCase().startsWith("xn--")) return label;
      return decodeLabel(label.slice(4)) ?? label;
    })
    .join(".");
}
