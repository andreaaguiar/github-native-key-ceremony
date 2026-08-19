// Shared PEM handling for the two halves of the ceremony transport keypair.
//
// The keygen prints each half base64-wrapped, so it fits on one line in a GitHub
// secret or variable field. Pasting the raw PEM instead is an easy mistake and
// harmless, so both forms are accepted. When neither works, the error says what
// was actually found — length and PEM label only, never the value itself, since
// this runs in CI logs.
export function readPem(value, kind, sourceName) {
  const raw = (value ?? "").trim();
  if (raw.length === 0) {
    throw new Error(`${sourceName} is empty.`);
  }

  // Accept a raw PEM as pasted, otherwise treat the value as base64-wrapped.
  const decoded = raw.includes("-----BEGIN")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");

  if (decoded.includes(`-----BEGIN ${kind} KEY-----`)) {
    return decoded;
  }

  // Report what it looked like, without revealing it.
  const label = decoded.match(/-----BEGIN ([A-Z ]+)-----/);
  const found = label
    ? `a PEM labelled "${label[1]}"`
    : "no PEM header at all, so the value is probably truncated or not base64";
  const swapped =
    kind === "PRIVATE" && label && label[1].includes("PUBLIC")
      ? " You have pasted the public half into the private secret."
      : kind === "PUBLIC" && label && label[1].includes("PRIVATE")
        ? " You have pasted the private half into the public variable."
        : "";

  throw new Error(
    `${sourceName} should hold a ${kind} key, but decoding it produced ${found}.` +
      `${swapped} Stored length was ${raw.length} characters.`,
  );
}
