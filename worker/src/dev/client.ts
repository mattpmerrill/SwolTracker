// Shared by the dev scripts: a Temporal client built from the same environment as the worker.
// Run them with `npm run dev:<name> -- <args>` (they load worker/.env if it exists).

import { Client, Connection } from "@temporalio/client";
import { workflowIdFor } from "../../../shared/checkin-contract.js";
import { connectionOptions, dataConverterFor, readTemporalConfig } from "../config.js";

export async function connectClient(): Promise<{ client: Client; close: () => Promise<void> }> {
  const config = readTemporalConfig();
  const connection = await Connection.connect(connectionOptions(config));
  const client = new Client({ connection, namespace: config.namespace, dataConverter: dataConverterFor(config) });
  return { client, close: () => connection.close() };
}

export function usageAndExit(usage: string): never {
  console.error(`Usage: ${usage}`);
  process.exit(2);
}

export function handleFor(client: Client, userId: string) {
  return client.workflow.getHandle(workflowIdFor(userId));
}

/** Runs a script body, prints a clean error and always closes the connection. */
export async function runScript(body: (client: Client) => Promise<void>): Promise<void> {
  const { client, close } = await connectClient();
  try {
    await body(client);
  } catch (error) {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
    process.exitCode = 1;
  } finally {
    await close();
  }
}
