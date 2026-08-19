// Encrypts one reviewer's share to the ceremony transport public key, and writes
// the ciphertext to stdout as base64.
//
// Why this exists: a job binds to one Environment, so a share can only reach the
// deploy job as a job output. GitHub refuses to forward an output that holds a
// secret, and it registers common encodings of that secret too, base64 among
// them. Plain text and base64 are therefore both dropped. RSA-OAEP ciphertext is
// randomised and is not an encoding of the secret, so the output survives — and
// unlike base64 it also gives real confidentiality, because only the deploy job
// holds the private key.
//
// Runs on a bare runner with no dependencies: Node's own crypto only.
import { constants, publicEncrypt } from "node:crypto";
import { readPem } from "./pem.mjs";

const share = process.env.DEPLOY_KEY_SHARE;
const publicKeyB64 = process.env.CEREMONY_TRANSPORT_PUBLIC_KEY;

if (!share) {
  console.error("DEPLOY_KEY_SHARE is not set on this environment.");
  process.exit(1);
}
if (!publicKeyB64) {
  console.error("CEREMONY_TRANSPORT_PUBLIC_KEY repo variable is not set.");
  process.exit(1);
}

let publicKey;
try {
  publicKey = readPem(publicKeyB64, "PUBLIC", "CEREMONY_TRANSPORT_PUBLIC_KEY");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const sealed = publicEncrypt(
  { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
  Buffer.from(share, "utf8"),
);

process.stdout.write(sealed.toString("base64"));
