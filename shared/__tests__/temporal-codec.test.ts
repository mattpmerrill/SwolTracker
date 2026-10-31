import { describe, it, expect } from "vitest";
import {
  ENCRYPTED_ENCODING,
  createEncryptionCodec,
  fromBase64,
  toBase64,
  type CodecPayload,
} from "../temporal-codec";

const KEY_A = toBase64(new Uint8Array(32).fill(7));
const KEY_B = toBase64(new Uint8Array(32).fill(9));

const utf8 = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array | null | undefined) => new TextDecoder().decode(b ?? new Uint8Array());

const jsonPayload = (value: unknown): CodecPayload => ({
  metadata: { encoding: utf8("json/plain") },
  data: utf8(JSON.stringify(value)),
});

describe("temporal payload codec", () => {
  it("round-trips payloads, including metadata and an empty data field", async () => {
    const codec = createEncryptionCodec({ key: KEY_A });
    const input = [
      jsonPayload({ userId: "u1", note: "heavy squat day, knee felt fine" }),
      { metadata: { encoding: utf8("binary/null") }, data: null },
      { metadata: { encoding: utf8("binary/plain"), custom: utf8("x") }, data: new Uint8Array([0, 1, 2, 255]) },
    ];

    const encoded = await codec.encode(input);
    const decoded = await codec.decode(encoded);

    expect(decoded).toHaveLength(3);
    expect(text(decoded[0].metadata?.encoding)).toBe("json/plain");
    expect(JSON.parse(text(decoded[0].data))).toEqual({ userId: "u1", note: "heavy squat day, knee felt fine" });
    expect(text(decoded[1].metadata?.encoding)).toBe("binary/null");
    expect(decoded[1].data).toBeNull();
    expect(Array.from(decoded[2].data ?? [])).toEqual([0, 1, 2, 255]);
    expect(text(decoded[2].metadata?.custom)).toBe("x");
  });

  it("emits binary/encrypted with a key id and hides the plaintext", async () => {
    const codec = createEncryptionCodec({ key: KEY_A });
    const [encoded] = await codec.encode([jsonPayload({ secret: "squat 405" })]);

    expect(text(encoded.metadata?.encoding)).toBe(ENCRYPTED_ENCODING);
    expect(text(encoded.metadata?.["encryption-key-id"])).toMatch(/^[0-9a-f]{8}$/);
    expect(Object.keys(encoded.metadata ?? {}).sort()).toEqual(["encoding", "encryption-key-id"]);
    expect(text(encoded.data)).not.toContain("squat");
    expect(text(encoded.data)).not.toContain("json/plain");
  });

  it("uses a fresh IV, so equal payloads encrypt differently", async () => {
    const codec = createEncryptionCodec({ key: KEY_A });
    const [a] = await codec.encode([jsonPayload({ a: 1 })]);
    const [b] = await codec.encode([jsonPayload({ a: 1 })]);
    expect(toBase64(a.data!)).not.toBe(toBase64(b.data!));
  });

  it("honours an explicit key id", async () => {
    const codec = createEncryptionCodec({ key: KEY_A, keyId: "2026-10" });
    const [encoded] = await codec.encode([jsonPayload({ a: 1 })]);
    expect(text(encoded.metadata?.["encryption-key-id"])).toBe("2026-10");
    await expect(codec.decode([encoded])).resolves.toHaveLength(1);
  });

  it("fails when the ciphertext is tampered with", async () => {
    const codec = createEncryptionCodec({ key: KEY_A });
    const [encoded] = await codec.encode([jsonPayload({ a: 1 })]);
    const data = new Uint8Array(encoded.data!);
    data[data.length - 1] ^= 0x01;
    await expect(codec.decode([{ ...encoded, data }])).rejects.toThrow();

    const ivFlipped = new Uint8Array(encoded.data!);
    ivFlipped[0] ^= 0x01;
    await expect(codec.decode([{ ...encoded, data: ivFlipped }])).rejects.toThrow();
  });

  it("fails when the key id in the clear metadata is swapped", async () => {
    const codec = createEncryptionCodec({ key: KEY_A, keyId: "k1" });
    const [encoded] = await codec.encode([jsonPayload({ a: 1 })]);
    const swapped = { ...encoded, metadata: { ...encoded.metadata, "encryption-key-id": utf8("k2") } };
    await expect(codec.decode([swapped])).rejects.toThrow(/different key/);
  });

  it("fails with the wrong key, even with a forged matching key id", async () => {
    const encoder = createEncryptionCodec({ key: KEY_A, keyId: "same" });
    const decoder = createEncryptionCodec({ key: KEY_B, keyId: "same" });
    const [encoded] = await encoder.encode([jsonPayload({ a: 1 })]);
    await expect(decoder.decode([encoded])).rejects.toThrow();

    // And with derived ids the mismatch is caught before any decrypt.
    const derivedB = createEncryptionCodec({ key: KEY_B });
    const [fromA] = await createEncryptionCodec({ key: KEY_A }).encode([jsonPayload({ a: 1 })]);
    await expect(derivedB.decode([fromA])).rejects.toThrow(/different key/);
  });

  it("rejects an encrypted payload with no data", async () => {
    const codec = createEncryptionCodec({ key: KEY_A });
    const [encoded] = await codec.encode([jsonPayload({ a: 1 })]);
    await expect(codec.decode([{ ...encoded, data: new Uint8Array(4) }])).rejects.toThrow(/truncated|empty/);
    await expect(codec.decode([{ ...encoded, data: null }])).rejects.toThrow(/truncated|empty/);
  });

  it("passes through payloads that are not binary/encrypted", async () => {
    const codec = createEncryptionCodec({ key: KEY_A });
    const plain = jsonPayload({ readable: true });
    const noMetadata: CodecPayload = { data: utf8("raw") };
    const decoded = await codec.decode([plain, noMetadata]);
    expect(decoded[0]).toBe(plain);
    expect(decoded[1]).toBe(noMetadata);
  });

  it("handles a large payload", async () => {
    const codec = createEncryptionCodec({ key: KEY_A });
    const big = new Uint8Array(300_000).map((_, i) => i % 251);
    const [encoded] = await codec.encode([{ metadata: { encoding: utf8("binary/plain") }, data: big }]);
    const [decoded] = await codec.decode([encoded]);
    expect(Buffer.from(decoded.data!).equals(Buffer.from(big))).toBe(true);
  });

  it("refuses keys that are not 32 bytes of base64", () => {
    expect(() => createEncryptionCodec({ key: toBase64(new Uint8Array(16)) })).toThrow(/32 bytes/);
    expect(() => createEncryptionCodec({ key: "not base64 !!!" })).toThrow();
    expect(() => createEncryptionCodec({ key: "" })).toThrow();
  });

  it("base64 helpers round-trip arbitrary bytes", () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
  });
});
