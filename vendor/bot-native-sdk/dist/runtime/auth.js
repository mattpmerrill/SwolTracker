import { jwtVerify } from "jose";
/**
 * Create a JWT verifier for the given secret.
 * @returns An async function that verifies a token and returns its payload.
 */
export function createAuthVerifier(jwtSecret) {
    const secret = new TextEncoder().encode(jwtSecret);
    return async function verifyAuth(token) {
        const { payload } = await jwtVerify(token, secret);
        return {
            sub: payload.sub,
            email: payload.email,
            iat: payload.iat,
            exp: payload.exp,
        };
    };
}
/**
 * Create an AuthResolver that extracts AppIdentity from a SnappyClaw JWT.
 * This is the default auth adapter for the SDK.
 * @param jwtSecret - The shared secret used to sign JWTs.
 */
export function createSnappyClawJwtResolver(jwtSecret) {
    const verify = createAuthVerifier(jwtSecret);
    return async (token) => {
        const payload = await verify(token);
        return {
            userId: payload.sub,
            rawClaims: payload,
        };
    };
}
