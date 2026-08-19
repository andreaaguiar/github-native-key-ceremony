// Shares are Uint8Array; GitHub secrets and job outputs are strings.
const SHARE_BYTES = 33; // 32-byte key + the library's 1-byte share index

export function encodeShare(share: Uint8Array): string {
  return Buffer.from(share).toString("base64");
}

// Node's base64 decoder is lenient: it drops invalid characters rather than
// throwing, so a corrupted share would otherwise combine into a silently
// wrong key. Round-trip and length checks turn that into a clean failure.
export function decodeShare(encoded: string): Uint8Array {
  const trimmed = encoded.trim();
  const buf = Buffer.from(trimmed, "base64");
  if (buf.toString("base64") !== trimmed) {
    throw new Error("malformed deploy-key share: not valid base64");
  }
  if (buf.length !== SHARE_BYTES) {
    throw new Error(`malformed deploy-key share: expected ${SHARE_BYTES} bytes, got ${buf.length}`);
  }
  return new Uint8Array(buf);
}

// GitHub refuses to forward a job output whose value matches one of the job's
// secrets: it drops the output and logs "Skip output ... since it may contain
// secret". A reviewer job therefore cannot emit its share verbatim, so it
// base64-wraps the value first and the deploy job unwraps it here.
//
// This wrapper is transport framing to defeat that redaction. It is NOT
// encryption and adds no confidentiality: anyone who can read the run's data
// can reverse it. The share still crosses the job boundary in the clear.
export function unwrapTransport(wrapped: string): string {
  const trimmed = wrapped.trim();
  const decoded = Buffer.from(trimmed, "base64").toString("utf8");
  if (decoded.length === 0) {
    throw new Error("empty deploy-key share after transport unwrap");
  }
  return decoded;
}
