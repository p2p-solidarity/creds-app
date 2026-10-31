/**
 * Minimal DER reader for X.509 and Android KeyDescription parsing. Definite
 * lengths only; anything malformed throws, and the callers turn that into a
 * fail-closed `err`. High tag numbers are supported (KeyDescription uses
 * context tags up to [7xx]).
 */
export interface DerNode {
  /** 0 universal, 1 application, 2 context-specific, 3 private. */
  readonly cls: number;
  readonly constructed: boolean;
  readonly tag: number;
  /** The whole TLV — what a signature covers. */
  readonly raw: Uint8Array;
  readonly value: Uint8Array;
}

export const DER = {
  BOOLEAN: 1,
  INTEGER: 2,
  BIT_STRING: 3,
  OCTET_STRING: 4,
  NULL: 5,
  OID: 6,
  ENUMERATED: 10,
  SEQUENCE: 16,
  SET: 17,
  UTC_TIME: 23,
  GENERALIZED_TIME: 24,
} as const;

function fail(what: string): never {
  throw new Error(`der: ${what}`);
}

function readNode(buf: Uint8Array, start: number): { node: DerNode; next: number } {
  let pos = start;
  const first = buf[pos++];
  if (first === undefined) fail('truncated tag');
  let tag = first & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    for (let i = 0; ; i++) {
      const b = buf[pos++];
      if (b === undefined || i > 3) fail('bad high tag');
      tag = (tag << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
  }
  const lenByte = buf[pos++];
  if (lenByte === undefined) fail('truncated length');
  let len = lenByte;
  if (lenByte & 0x80) {
    const count = lenByte & 0x7f;
    if (count === 0 || count > 4) fail('unsupported length');
    len = 0;
    for (let i = 0; i < count; i++) {
      const b = buf[pos++];
      if (b === undefined) fail('truncated length');
      len = len * 256 + b;
    }
  }
  const end = pos + len;
  if (end > buf.length) fail('truncated value');
  return {
    node: { cls: first >> 6, constructed: (first & 0x20) !== 0, tag, raw: buf.subarray(start, end), value: buf.subarray(pos, end) },
    next: end,
  };
}

/** Exactly one node spanning all of `buf`. */
export function derParse(buf: Uint8Array): DerNode {
  const { node, next } = readNode(buf, 0);
  if (next !== buf.length) fail('trailing bytes');
  return node;
}

export function derChildren(node: DerNode): DerNode[] {
  if (!node.constructed) fail('not constructed');
  const out: DerNode[] = [];
  for (let pos = 0; pos < node.value.length; ) {
    const { node: child, next } = readNode(node.value, pos);
    out.push(child);
    pos = next;
  }
  return out;
}

export function derExpect(node: DerNode | undefined, tag: number, cls = 0): DerNode {
  if (node === undefined || node.tag !== tag || node.cls !== cls) fail(`expected tag ${cls}:${tag}`);
  return node;
}

export function derOid(node: DerNode | undefined): string {
  const v = derExpect(node, DER.OID).value;
  if (v.length === 0) fail('empty oid');
  const first = v[0]!;
  const parts: number[] = [first < 80 ? Math.floor(first / 40) : 2, first < 80 ? first % 40 : first - 80];
  let acc = 0;
  for (let i = 1; i < v.length; i++) {
    const b = v[i]!;
    acc = acc * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) {
      parts.push(acc);
      acc = 0;
    }
  }
  return parts.join('.');
}

export function derInteger(node: DerNode | undefined, tag: number = DER.INTEGER): bigint {
  const v = derExpect(node, tag).value;
  if (v.length === 0) fail('empty integer');
  let n = 0n;
  for (const b of v) n = (n << 8n) | BigInt(b);
  if (((v[0]!) & 0x80) !== 0) n -= 1n << BigInt(v.length * 8);
  return n;
}

export function derBoolean(node: DerNode | undefined): boolean {
  const v = derExpect(node, DER.BOOLEAN).value;
  // DER: FALSE is 0x00 and TRUE is exactly 0xFF.
  if (v.length !== 1 || (v[0] !== 0x00 && v[0] !== 0xff)) fail('bad boolean');
  return v[0] === 0xff;
}

export function derOctets(node: DerNode | undefined): Uint8Array {
  return derExpect(node, DER.OCTET_STRING).value;
}

export function derBitString(node: DerNode | undefined): Uint8Array {
  const v = derExpect(node, DER.BIT_STRING).value;
  if (v.length === 0 || v[0] !== 0) fail('bit string with unused bits');
  return v.subarray(1);
}

/** UTCTime / GeneralizedTime (Z only) → unix ms. */
export function derTime(node: DerNode | undefined): number {
  if (node === undefined || (node.tag !== DER.UTC_TIME && node.tag !== DER.GENERALIZED_TIME)) fail('expected time');
  const s = new TextDecoder().decode(node.value);
  const m = (node.tag === DER.UTC_TIME ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/u : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/u).exec(s);
  if (m === null) fail('bad time');
  const n = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const year = node.tag === DER.UTC_TIME ? (n[0] < 50 ? 2000 + n[0] : 1900 + n[0]) : n[0];
  return Date.UTC(year, n[1] - 1, n[2], n[3], n[4], n[5]);
}
