import type { AuthPayload, AuthResolver } from "../contracts/types.js";
/**
 * Create a JWT verifier for the given secret.
 * @returns An async function that verifies a token and returns its payload.
 */
export declare function createAuthVerifier(jwtSecret: string): (token: string) => Promise<AuthPayload>;
/**
 * Create an AuthResolver that extracts AppIdentity from a SnappyClaw JWT.
 * This is the default auth adapter for the SDK.
 * @param jwtSecret - The shared secret used to sign JWTs.
 */
export declare function createSnappyClawJwtResolver(jwtSecret: string): AuthResolver<string>;
export type AuthVerifier = ReturnType<typeof createAuthVerifier>;
//# sourceMappingURL=auth.d.ts.map