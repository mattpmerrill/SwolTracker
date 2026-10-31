// Loaded by path (DataConverter.failureConverterPath), twice: with require() on the worker's main
// thread, and bundled into the workflow sandbox. That is why it is a tiny CommonJS file and not
// TypeScript: require() must work under tsx, vitest and plain node alike.
//
// encodeCommonAttributes moves every failure message and stack trace into an encoded payload, so the
// payload codec (AES-GCM) encrypts them too. Without it, "This offer has expired." would sit in
// Temporal's history in the clear even with the codec on. The worker only uses this converter when
// CHECKIN_CODEC_KEY is set (src/config.ts), so local development stays readable in the Temporal UI.
const { DefaultFailureConverter } = require("@temporalio/common");

exports.failureConverter = new DefaultFailureConverter({ encodeCommonAttributes: true });
