const DEFAULT_RETRYABLE = {
    not_found: false,
    forbidden: false,
    invalid_args: false,
    conflict: false,
    rate_limited: true,
    internal: true,
};
/**
 * Throwable carrier for structured tool errors.
 *
 * Tools can throw `AppError` to signal a failure the SDK will translate into a
 * canonical `AppToolResult` with `ok: false` and a populated `error` envelope.
 * Bare `Error` instances become `{ code: "internal", retryable: true }` to
 * preserve the legacy "something went wrong" path.
 */
export class AppError extends Error {
    code;
    retryable;
    details;
    constructor(code, message, options = {}) {
        super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = "AppError";
        this.code = code;
        this.retryable = options.retryable ?? DEFAULT_RETRYABLE[code];
        this.details = options.details;
    }
    /** Render as a plain `AppToolError` payload for envelope serialization. */
    toToolError() {
        return {
            code: this.code,
            message: this.message,
            retryable: this.retryable,
            ...(this.details ? { details: this.details } : {}),
        };
    }
    static notFound(message, options) {
        return new AppError("not_found", message, options);
    }
    static forbidden(message, options) {
        return new AppError("forbidden", message, options);
    }
    static rateLimited(message, options) {
        return new AppError("rate_limited", message, options);
    }
    static invalidArgs(message, options) {
        return new AppError("invalid_args", message, options);
    }
    static conflict(message, options) {
        return new AppError("conflict", message, options);
    }
    static internal(message, options) {
        return new AppError("internal", message, options);
    }
}
/** Type guard: is this value an `AppError` instance? */
export function isAppError(value) {
    return value instanceof AppError;
}
//# sourceMappingURL=errors.js.map