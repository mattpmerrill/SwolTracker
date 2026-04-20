import { randomUUID } from "node:crypto";
/**
 * Create an in-memory EventStore for development and testing.
 * Events are lost on process restart — use a persistent adapter (e.g. Supabase) for production.
 */
export function createInMemoryEventStore(options = {}) {
    const now = options.now ?? (() => new Date());
    const leaseMs = options.leaseMs ?? 30_000;
    const events = [];
    return {
        async emit(event) {
            const created = {
                ...event,
                id: randomUUID(),
                status: "pending",
                created_at: now().toISOString(),
                claimed_at: null,
                lease_expires_at: null,
                processed_at: null,
            };
            if (created.dedupe_key) {
                const duplicate = events.find((existing) => existing.app_name === created.app_name &&
                    existing.user_id === created.user_id &&
                    existing.dedupe_key === created.dedupe_key &&
                    existing.status !== "processed");
                if (duplicate)
                    return duplicate;
            }
            events.push(created);
            return created;
        },
        async claimPending(userId, appName) {
            const current = now().toISOString();
            const leaseExpires = new Date(now().getTime() + leaseMs).toISOString();
            const claimable = events.filter((event) => {
                if (event.user_id !== userId)
                    return false;
                if (appName && event.app_name !== appName)
                    return false;
                if (event.status === "processed")
                    return false;
                if (event.status === "processing" && event.lease_expires_at && event.lease_expires_at > current) {
                    return false;
                }
                return true;
            });
            for (const event of claimable) {
                event.status = "processing";
                event.claimed_at = current;
                event.lease_expires_at = leaseExpires;
            }
            return claimable.map((event) => ({ ...event }));
        },
        async markProcessed(eventId) {
            const event = events.find((entry) => entry.id === eventId);
            if (!event)
                return;
            event.status = "processed";
            event.processed_at = now().toISOString();
            event.lease_expires_at = null;
        },
    };
}
/**
 * Create a scoped event emitter for a specific app.
 * Wraps an EventStore so callers don't need to pass `app_name` on every emit.
 */
export function createEventEmitter(eventStore, appName) {
    return {
        async emit(eventName, userId, payload, dedupeKey) {
            return eventStore.emit({
                app_name: appName,
                event_name: eventName,
                user_id: userId,
                payload,
                dedupe_key: dedupeKey,
                status: "pending",
                claimed_at: null,
                lease_expires_at: null,
                processed_at: null,
            });
        },
    };
}
//# sourceMappingURL=store.js.map