import { describe, expect, it } from "vitest";
import { CanonicalizationError, canonicalHash, canonicalize, compareText, omitKeys, roundTo, sha256Hex } from "@/services/analysis-engines/shared";

describe("canonical JSON", () => {
  it("sorts keys at every depth and emits no whitespace", () => {
    expect(canonicalize({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("does not depend on insertion order", () => {
    expect(canonicalize({ one: 1, two: { b: 2, a: 1 } })).toBe(canonicalize({ two: { a: 1, b: 2 }, one: 1 }));
  });

  it("orders keys by UTF-16 code unit, as RFC 8785 requires", () => {
    // U+1F600 is the surrogate pair D83D DE00 and U+FF5E is the single unit FF5E: by code unit the emoji comes first, by code point it would come last.
    const encoded = canonicalize({ "\uFF5E": 1, "\u{1F600}": 2 });
    expect(encoded.indexOf("\u{1F600}")).toBeLessThan(encoded.indexOf("\uFF5E"));
  });

  it("omits undefined object members, keeps null, and rejects undefined inside arrays", () => {
    expect(canonicalize({ a: undefined, b: null, c: 1 })).toBe('{"b":null,"c":1}');
    expect(() => canonicalize([1, undefined])).toThrow(CanonicalizationError);
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY]])("rejects the non-finite number %s", (value) => {
    expect(() => canonicalize({ value })).toThrow(/not finite/);
  });

  it("rejects values JSON cannot carry faithfully", () => {
    class Box { constructor(public value: number) {} }
    for (const value of [BigInt(10), () => 1, Symbol("x"), new Map(), new Set(), new Box(1), /x/, new Uint8Array(1)]) {
      expect(() => canonicalize({ value })).toThrow(CanonicalizationError);
    }
  });

  it("accepts objects without a prototype", () => {
    const bare = Object.create(null) as Record<string, number>;
    bare.k = 1;
    expect(canonicalize(bare)).toBe('{"k":1}');
  });

  it("encodes a Date as its ISO string and rejects an invalid one", () => {
    expect(canonicalize({ at: new Date("2026-10-20T12:00:00.000Z") })).toBe('{"at":"2026-10-20T12:00:00.000Z"}');
    expect(() => canonicalize({ at: new Date("nope") })).toThrow(/invalid Date/);
  });

  it("writes negative zero as 0 and keeps the ECMAScript number form", () => {
    expect(canonicalize([-0, 0.1, 100, 1.0, 1e21, 1e-7])).toBe("[0,0.1,100,1,1e+21,1e-7]");
  });

  it("escapes strings exactly as JSON does", () => {
    expect(canonicalize('a"b\\c\n\u0001é')).toBe('"a\\"b\\\\c\\n\\u0001é"');
  });

  it("names the path of the offending value", () => {
    try { canonicalize({ list: [1, { deep: Number.NaN }] }); expect.unreachable(); }
    catch (error) { expect((error as CanonicalizationError).path).toBe("$.list[1].deep"); }
  });
});

describe("hashing", () => {
  it("matches the SHA-256 reference vectors", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("hashes the canonical text, so equal content hashes alike whatever the key order", () => {
    const first = canonicalHash({ b: [1, 2], a: { y: 1, x: 2 } });
    expect(first).toBe(canonicalHash({ a: { x: 2, y: 1 }, b: [1, 2] }));
    expect(first).toBe(sha256Hex('{"a":{"x":2,"y":1},"b":[1,2]}'));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when any value, key or array order changes", () => {
    const base = canonicalHash({ a: [1, 2], b: 1 });
    expect(canonicalHash({ a: [2, 1], b: 1 })).not.toBe(base);
    expect(canonicalHash({ a: [1, 2], b: 2 })).not.toBe(base);
    expect(canonicalHash({ a: [1, 2], c: 1 })).not.toBe(base);
  });

  it("omitKeys removes only the listed top-level keys", () => {
    expect(omitKeys({ a: 1, b: { a: 2 }, c: 3 }, ["a", "c"])).toEqual({ b: { a: 2 } });
  });
});

describe("roundTo", () => {
  it.each([
    [1.005, 2, 1.01], [-1.005, 2, -1.01], [2.5, 0, 3], [-2.5, 0, -3], [0.1 + 0.2, 3, 0.3], [1234.5678, 2, 1234.57], [0.0004, 3, 0], [12, 3, 12], [1e-9, 3, 0], [1.4999, 0, 1],
  ])("rounds %s to %s decimals as %s (half away from zero)", (value, decimals, expected) => {
    expect(roundTo(value, decimals)).toBe(expected);
  });

  it("never returns negative zero", () => {
    expect(Object.is(roundTo(-0.0004, 3), 0)).toBe(true);
    expect(Object.is(roundTo(-0, 2), 0)).toBe(true);
  });

  it("rejects non-finite input and invalid precision", () => {
    expect(() => roundTo(Number.NaN, 2)).toThrow(RangeError);
    expect(() => roundTo(Number.POSITIVE_INFINITY, 2)).toThrow(RangeError);
    expect(() => roundTo(1, -1)).toThrow(RangeError);
    expect(() => roundTo(1, 13)).toThrow(RangeError);
    expect(() => roundTo(1, 1.5)).toThrow(RangeError);
  });
});

describe("compareText", () => {
  it("orders by code unit and not by locale", () => {
    expect(["b", "B", "a", "é", "z"].sort(compareText)).toEqual(["B", "a", "b", "z", "é"]);
    expect(compareText("a", "a")).toBe(0);
  });
});
