// Exact-rational oracle. Shares no code with the page: BigInt fractions only, so there is no float error anywhere.
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a || 1n; };
export class Q {
  constructor(n, d = 1n) { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d); this.n = n / g; this.d = d / g; }
  static of(x) { return x instanceof Q ? x : typeof x === 'bigint' ? new Q(x) : Q.parse(String(x)); }
  static parse(s) { const m = /^(-?)(\d*)\.?(\d*)$/.exec(String(s).trim()); if (!m) throw new Error('bad decimal ' + s);
    return new Q(BigInt(m[1] + (m[2] || '0') + m[3]), 10n ** BigInt(m[3].length)); }
  add(o) { o = Q.of(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Q.of(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Q.of(o); return new Q(this.n * o.n, this.d * o.d); }
  div(o) { o = Q.of(o); return new Q(this.n * o.d, this.d * o.n); }
  cmp(o) { o = Q.of(o); const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
  lt(o) { return this.cmp(o) < 0; } le(o) { return this.cmp(o) <= 0; } gt(o) { return this.cmp(o) > 0; } ge(o) { return this.cmp(o) >= 0; } eq(o) { return this.cmp(o) === 0; }
  floorDiv(den) { const n = this.n * den, d = this.d; let q = n / d; if (n % d !== 0n && (n < 0n) !== (d < 0n)) q -= 1n; return q; }
  ceil100() { return -(new Q(-this.n, this.d)).floorDiv(100n); }              // ceil(x*100) as BigInt
  floor100() { return this.floorDiv(100n); }
  round100() { return this.add(new Q(1n, 200n)).floorDiv(100n); }              // round half up to hundredths
  num() { return Number(this.n) / Number(this.d); }
}
export const hund = b => { const neg = b < 0n, s = (neg ? -b : b).toString().padStart(3, '0'); return (neg ? '-' : '') + s.slice(0, -2) + '.' + s.slice(-2); };
export const clampQ = (x, lo, hi) => x.lt(lo) ? Q.of(lo) : x.gt(hi) ? Q.of(hi) : x;

export const SCALE = [['A', '4.0', 95], ['A-', '3.7', 90], ['B+', '3.3', 85], ['B', '3.0', 80], ['B-', '2.7', 70], ['C+', '2.3', 60], ['C', '2.0', 50], ['C-', '1.7', 40], ['D+', '1.3', 30], ['D', '1.0', 20], ['F', '0.0', 0]]
  .map(([g, gp, cut]) => ({ g, gp: Q.parse(gp), cut: Q.of(BigInt(cut)) }));
export const gradeOf = t => SCALE.find(c => t.ge(c.cut));
export const COURSES = {
  ipa: [['part', 10, 100], ['asg', 35, 100], ['mt', 20, 30], ['fin', 35, 100]],
  afm: [['part', 20, 100], ['grp', 25, 100], ['crit1', 5, 100], ['crit2', 5, 100], ['crit3', 5, 100], ['crit4', 5, 100], ['fin', 35, 100]]
};
// marks: {id: decimal string | null}. Returns exact banked (pre-final entered), E (pre-final weight unentered), final contribution, bounds.
export function course(key, marks) {
  let banked = new Q(0n), E = 0n, fw = 0n, fin = null;
  for (const [id, w, max] of COURSES[key]) {
    const m = marks[id], c = m == null ? null : clampQ(Q.of(m), 0n, BigInt(max)).mul(w).div(max);
    if (id === 'fin') { fw = BigInt(w); fin = c; } else if (c === null) E += BigInt(w); else banked = banked.add(c);
  }
  const lo = banked.add(fin ?? 0n), hi = banked.add(E).add(fin ?? new Q(fw));
  return { banked, E: new Q(E), fw: new Q(fw), fin, lo, hi, complete: E === 0n && fin !== null, finalBlank: fin === null };
}
// Final-exam % needed for a cutoff: worst case (unknown pre-final work earns 0) and best case (earns full credit).
export const needHi = (c, cut) => Q.of(cut).sub(c.banked).div(c.fw).mul(100n);
export const needLo = (c, cut) => Q.of(cut).sub(c.banked).sub(c.E).div(c.fw).mul(100n);
// Expected chart steps (final blank, no unknown work): [x, gp] jump points.
export function steps(c) {
  const out = []; let cur = gradeOf(c.banked);
  for (const g of [...SCALE].reverse()) { const x = needHi(c, g.cut); if (x.gt(0n) && x.le(100n) && g.gp.gt(cur.gp)) { out.push([x.num(), g.gp.num()]); cur = g; } }
  return { start: gradeOf(c.banked).gp.num(), steps: out, end: gradeOf(c.banked.add(c.fw)).gp.num() };
}
