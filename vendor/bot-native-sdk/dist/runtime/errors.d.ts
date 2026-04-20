import type { AppToolError, AppToolErrorCode } from "../contracts/types.js";
export interface AppErrorOptions {
    /** Override the code's default `retryable` value. */
    retryable?: boolean;
    /** Structured details surfaced in `AppToolError.details`. */
    details?: Record<string, unknown>;
    /** Underlying cause — kept on the Error instance, not serialized. */
    cause?: unknown;
}
/**
 * Throwable carrier for structured tool errors.
 *
 * Tools can throw `AppError` to signal a failure the SDK will translate into a
 * canonical `AppToolResult` with `ok: false` and a populated `error` envelope.
 * Bare `Error` instances become `{ code: "internal", retryable: true }` to
 * preserve the legacy "something went wrong" path.
 */
export declare class AppError extends Error {
    readonly code: AppToolErrorCode;
    readonly retryable: boolean;
    readonly details?: Record<string, unknown>;
    constructor(code: AppToolErrorCode, message: string, options?: AppErrorOptions);
    /** Render as a plain `AppToolError` payload for envelope serialization. */
    toToolError(): AppToolError;
    static notFound(message: string, options?: AppErrorOptions): AppError;
    static forbidden(message: string, options?: AppErrorOptions): AppError;
    static rateLimited(message: string, options?: AppErrorOptions): AppError;
    static invalidArgs(message: string, options?: AppErrorOptions): AppError;
    static conflict(message: string, options?: AppErrorOptions): AppError;
    static internal(message: string, options?: AppErrorOptions): AppError;
}
/** Type guard: is this value an `AppError` instance? */
export declare function isAppError(value: unknown): value is AppError;
//# sourceMappingURL=errors.d.ts.map