import type { AppEventRecord, EventStore } from "../contracts/types.js";
export interface InMemoryEventStoreOptions {
    /** Injectable clock for deterministic testing. */
    now?: () => Date;
    /** Lease duration in ms before an uncompleted event becomes reclaimable. Defaults to 30s. */
    leaseMs?: number;
}
/**
 * Create an in-memory EventStore for development and testing.
 * Events are lost on process restart — use a persistent adapter (e.g. Supabase) for production.
 */
export declare function createInMemoryEventStore(options?: InMemoryEventStoreOptions): EventStore;
/**
 * Create a scoped event emitter for a specific app.
 * Wraps an EventStore so callers don't need to pass `app_name` on every emit.
 */
export declare function createEventEmitter(eventStore: EventStore, appName: string): {
    emit(eventName: string, userId: string, payload: Record<string, unknown>, dedupeKey?: string): Promise<AppEventRecord>;
};
//# sourceMappingURL=store.d.ts.map