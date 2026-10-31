/**
 * AES-256-GCM payload codec for Temporal (ADR-006). Temporal Cloud then only ever sees ciphertext:
 * the workflow's arguments, signals, update results and activity payloads are encrypted on the way
 * out of the API client and the worker, and decrypted on the way back in.
 *
 * No runtime dependencies. It uses `globalThis.crypto.subtle` (Node 20+, Vercel, edge runtimes).
 * `CodecPayload` is declared structurally so this file needs no `@temporalio` import, and it is
 * assignable to Temporal's `PayloadCodec` (which is `{ encode(payloads), decode(payloads) }` over
 * `{ metadata?, data? }` protobuf payloads).
 *
 * Wire format of an encrypted payload:
 *   metadata  encoding = "binary/encrypted", encryption-key-id = <id of the key>
 *   data      12-byte random IV, then the AES-GCM ciphertext (tag included)
 * The plaintext is a JSON blob of the original payload: { metadata: { name: base64 }, data: base64 }.
 * Encrypting the metadata too hides the encoding ("json/plain") along with the content. The key id
 * is bound in as additional authenticated data, so swapping the id in the clear metadata fails.
 *
 * Decode passes through any payload that is not `binary/encrypted`, so a namespace that holds
 * history from before the key was set (or from local development) stays readable.
 */

export interface CodecPayload {
  metadata?: Record<string, Uint8Array> | null;
  data?: Uint8Array | null;
}

export interface EncryptionCodec {
  encode(payloads: CodecPayload[]): Promise<CodecPayload[]>;
  decode(payloads: CodecPayload[]): Promise<CodecPayload[]>;
}

export const ENCRYPTED_ENCODING = "binary/encrypted";
const ENCODING_METADATA_KEY = "encoding";
const KEY_ID_METADATA_KEY = "encryption-key-id";

const IV_BYTES = 12;
const KEY_BYTES = 32;

// Only the slice of SubtleCrypto this file uses, so the file compiles without the DOM lib.
interface SubtleLike {
  importKey(
    format: "raw",
    keyData: Uint8Array,
    algorithm: { name: "AES-GCM" },
    extractable: boolean,
    usages: string[],
  ): Promise<unknown>;
  encrypt(
    algorithm: { name: "AES-GCM"; iv: Uint8Array; additionalData: Uint8Array },
    key: unknown,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
  decrypt(
    algorithm: { name: "AES-GCM"; iv: Uint8Array; additionalData: Uint8Array },
    key: unknown,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
  digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
}

interface CryptoLike {
  subtle: SubtleLike;
  getRandomValues(array: Uint8Array): Uint8Array;
}

function webCrypto(): CryptoLike {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (!c?.subtle) throw new Error("Web Crypto (globalThis.crypto.subtle) is not available.");
  return c;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked so a large payload cannot overflow the argument limit of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export interface CodecOptions {
  /** Base64 of exactly 32 random bytes (`openssl rand -base64 32`). */
  key: string;
  /**
   * Written to the payload metadata. Defaults to the first 8 hex characters of the key's SHA-256,
   * so two different keys never share an id by accident.
   */
  keyId?: string;
}

/** Throws at construction when the key is not valid base64 of 32 bytes, so a bad env var fails fast. */
export function createEncryptionCodec(options: CodecOptions): EncryptionCodec {
  let rawKey: Uint8Array;
  try {
    rawKey = fromBase64(options.key.trim());
  } catch {
    throw new Error("CHECKIN_CODEC_KEY must be base64.");
  }
  if (rawKey.length !== KEY_BYTES) {
    throw new Error(`CHECKIN_CODEC_KEY must decode to ${KEY_BYTES} bytes.`);
  }

  // Imported on first use and kept: the constructor stays synchronous.
  let prepared: Promise<{ key: unknown; keyId: string }> | null = null;
  const prepare = () => {
    prepared ??= (async () => {
      const { subtle } = webCrypto();
      const key = await subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
      let keyId = options.keyId;
      if (!keyId) {
        const digest = new Uint8Array(await subtle.digest("SHA-256", rawKey));
        keyId = Array.from(digest.subarray(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
      }
      return { key, keyId };
    })();
    return prepared;
  };

  async function encodeOne(payload: CodecPayload): Promise<CodecPayload> {
    const { key, keyId } = await prepare();
    const crypto = webCrypto();
    const metadata: Record<string, string> = {};
    for (const [name, value] of Object.entries(payload.metadata ?? {})) metadata[name] = toBase64(value);
    const plaintext = encoder.encode(
      JSON.stringify({ metadata, data: payload.data ? toBase64(payload.data) : null }),
    );
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(keyId) }, key, plaintext),
    );
    const data = new Uint8Array(IV_BYTES + sealed.length);
    data.set(iv, 0);
    data.set(sealed, IV_BYTES);
    return {
      metadata: {
        [ENCODING_METADATA_KEY]: encoder.encode(ENCRYPTED_ENCODING),
        [KEY_ID_METADATA_KEY]: encoder.encode(keyId),
      },
      data,
    };
  }

  async function decodeOne(payload: CodecPayload): Promise<CodecPayload> {
    const encoding = payload.metadata?.[ENCODING_METADATA_KEY];
    if (!encoding || decoder.decode(encoding) !== ENCRYPTED_ENCODING) return payload;

    const { key, keyId } = await prepare();
    const claimedId = payload.metadata?.[KEY_ID_METADATA_KEY];
    if (!claimedId || decoder.decode(claimedId) !== keyId) {
      throw new Error("Payload was encrypted with a different key.");
    }
    if (!payload.data || payload.data.length <= IV_BYTES) throw new Error("Encrypted payload is empty or truncated.");

    const iv = payload.data.subarray(0, IV_BYTES);
    const sealed = payload.data.subarray(IV_BYTES);
    const plaintext = await webCrypto().subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: claimedId },
      key,
      sealed,
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as {
      metadata?: Record<string, string>;
      data?: string | null;
    };
    const metadata: Record<string, Uint8Array> = {};
    for (const [name, value] of Object.entries(parsed.metadata ?? {})) metadata[name] = fromBase64(value);
    return { metadata, data: parsed.data == null ? null : fromBase64(parsed.data) };
  }

  return {
    encode: (payloads) => Promise.all(payloads.map(encodeOne)),
    decode: (payloads) => Promise.all(payloads.map(decodeOne)),
  };
}
