// Confirms that two transport values are a matching pair, before you paste them
// into GitHub. GitHub secrets are write-only, so a wrong paste is otherwise only
// discovered by burning a tag on a failed ceremony.
//
// Checks the files written by transport-keygen.mjs:
//   node scripts/ceremony/transport-verify.mjs
//
// Or checks values you already hold, to test what you believe is stored:
//   CEREMONY_TRANSPORT_PUBLIC_KEY=... CEREMONY_TRANSPORT_PRIVATE_KEY=... \
//     node scripts/ceremony/transport-verify.mjs
import { constants, privateDecrypt, publicEncrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readPem } from "./pem.mjs";

const DIR = resolve(process.cwd(), ".ceremony-transport");

function load(envName, file) {
  if (process.env[envName]) return { value: process.env[envName], from: `$${envName}` };
  try {
    return { value: readFileSync(resolve(DIR, file), "utf8"), from: `.ceremony-transport/${file}` };
  } catch {
    console.error(`No ${envName} in the environment and no .ceremony-transport/${file} on disk.`);
    console.error("Run: node scripts/ceremony/transport-keygen.mjs");
    process.exit(1);
  }
}

const pub = load("CEREMONY_TRANSPORT_PUBLIC_KEY", "public.b64");
const priv = load("CEREMONY_TRANSPORT_PRIVATE_KEY", "private.b64");
console.log(`public  from ${pub.from}  (${pub.value.trim().length} chars)`);
console.log(`private from ${priv.from} (${priv.value.trim().length} chars)\n`);

let publicKey, privateKey;
try {
  publicKey = readPem(pub.value, "PUBLIC", "CEREMONY_TRANSPORT_PUBLIC_KEY");
  privateKey = readPem(priv.value, "PRIVATE", "CEREMONY_TRANSPORT_PRIVATE_KEY");
} catch (err) {
  console.error("FAIL: " + err.message);
  process.exit(1);
}
console.log("Both values decode to PEM keys of the expected type.");

// Same operation the ceremony performs: reviewer seals, deploy job opens.
const probe = "transport-verify-probe";
try {
  const sealed = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(probe, "utf8"),
  );
  const opened = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    sealed,
  ).toString("utf8");
  if (opened !== probe) throw new Error("round trip returned different data");
} catch (err) {
  console.error("\nFAIL: these two values are not a matching pair.");
  console.error("Both halves must come from the same transport-keygen.mjs run.");
  console.error("Underlying error: " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

console.log("PASS: the two values are a matching pair. Safe to store in GitHub.");
