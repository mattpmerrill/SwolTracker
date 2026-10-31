// With CHECKIN_CODEC_KEY set, Temporal's history must hold ciphertext only: payloads (workflow
// input, signals, update arguments and results, activity inputs) AND failure messages. And the
// ordinary behaviour must survive it: a client with the same codec still sees a typed, readable
// failure.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ApplicationFailure, WorkflowUpdateFailedError } from "@temporalio/client";
import { historyToJSON } from "@temporalio/common/lib/proto-utils";
import { describe, expect, it } from "vitest";
import { UPDATE_DECIDE_CHECKIN, type DecideInput, type DecideResult } from "../../shared/checkin-contract.js";
import { dataConverterFor, readTemporalConfig } from "../src/config.js";
import { DAY, MINUTE, withWorld } from "./harness.js";

// A throwaway key for the test (32 zero-ish bytes in base64), not a secret.
const KEY = Buffer.alloc(32, 7).toString("base64");
const SECRET_MESSAGE = "Tuesday pineapple conflict";

/** Every payload `encoding` found anywhere in a history JSON (metadata values are base64 in it). */
function payloadEncodings(historyJson: string): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const metadata = record.metadata as Record<string, unknown> | undefined;
    if (metadata && typeof metadata.encoding === "string") {
      found.add(Buffer.from(metadata.encoding, "base64").toString("utf8"));
    }
    Object.values(record).forEach(walk);
  };
  walk(JSON.parse(historyJson));
  return found;
}

const dataConverter = dataConverterFor(readTemporalConfig({ CHECKIN_CODEC_KEY: KEY }));

describe("payload codec + encoded failures", () => {
  it("refuses Temporal Cloud without a codec key, like the API client", () => {
    expect(() => readTemporalConfig({ TEMPORAL_API_KEY: "k" })).toThrow(/CHECKIN_CODEC_KEY/);
    expect(readTemporalConfig({ TEMPORAL_API_KEY: "k", CHECKIN_CODEC_KEY: KEY }).apiKey).toBe("k");
  });

  it("round-trips a permanent failure through the codec, and the history holds no plaintext", async () => {
    await withWorld(
      {
        dailyAfterMs: 10_000 * DAY,
        dataConverter,
        overrides: {
          apply: async () => {
            throw ApplicationFailure.nonRetryable(SECRET_MESSAGE, "Conflict");
          },
        },
      },
      async (r) => {
        const first = await r.start();
        await r.skip(6 * DAY + MINUTE);
        await r.eventually(() => r.world.notifies("ready").length === 1, "the ready push");

        const error = await r
          .latest()
          .executeUpdate<DecideResult, [DecideInput]>(UPDATE_DECIDE_CHECKIN, {
            args: [{ checkinId: "checkin-1", acceptIds: ["c1"] }],
          })
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(WorkflowUpdateFailedError);
        const cause = (error as WorkflowUpdateFailedError).cause as ApplicationFailure;
        expect(cause).toBeInstanceOf(ApplicationFailure);
        expect(cause.type).toBe("Conflict");
        // The client decrypts the message with the same codec.
        expect(cause.message).toBe(SECRET_MESSAGE);

        const raw = historyToJSON(await first.fetchHistory());
        // Every payload is ciphertext (none says json/plain), and so is the failure message: the
        // failure type stays readable routing metadata, the human text does not.
        expect([...payloadEncodings(raw)]).toEqual(["binary/encrypted"]);
        expect(raw).not.toContain(SECRET_MESSAGE);
        // Control: a history recorded without the codec does show plaintext payloads.
        const plain = readFileSync(fileURLToPath(new URL("./fixtures/happy-path.json", import.meta.url)), "utf8");
        expect(payloadEncodings(plain).has("json/plain")).toBe(true);
      },
    );
  });
});
