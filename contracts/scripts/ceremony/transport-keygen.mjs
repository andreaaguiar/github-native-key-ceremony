// Generates the ceremony transport keypair. Run once, locally. Re-run it to
// rotate the pair: no reviewer is involved, and no share has to change.
//
//   cd contracts
//   node scripts/ceremony/transport-keygen.mjs
//
// Writes both halves to .ceremony-transport/ (gitignored) and prints only the
// public half. The private half stays out of your scrollback, so terminal
// history and screen shares never capture it.
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), ".ceremony-transport");

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const wrap = (pem) => Buffer.from(pem, "utf8").toString("base64");

mkdirSync(OUT_DIR, { recursive: true, mode: 0o700 });
writeFileSync(resolve(OUT_DIR, "public.b64"), wrap(publicKey), { mode: 0o600 });
writeFileSync(resolve(OUT_DIR, "private.b64"), wrap(privateKey), { mode: 0o600 });

console.log("Transport keypair written to .ceremony-transport/ (gitignored).");
console.log("Neither value is a Shamir share. Rotating this pair needs no reviewer.\n");

console.log("CEREMONY_TRANSPORT_PUBLIC_KEY  — repo variable, safe to show:\n");
console.log(wrap(publicKey) + "\n");

console.log("CEREMONY_TRANSPORT_PRIVATE_KEY — secret on the `production` environment.");
console.log("Not printed on purpose. Read it with:");
console.log("  cat .ceremony-transport/private.b64\n");

console.log("Or set both without copying anything, if the gh CLI is authenticated:");
console.log('  gh variable set CEREMONY_TRANSPORT_PUBLIC_KEY --body "$(cat .ceremony-transport/public.b64)"');
console.log('  gh secret set CEREMONY_TRANSPORT_PRIVATE_KEY --env production --body "$(cat .ceremony-transport/private.b64)"\n');

console.log("Then remove the local copies:");
console.log("  rm -rf .ceremony-transport");
