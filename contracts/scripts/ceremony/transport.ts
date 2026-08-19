// Deploy-job half of the share transport. The reviewer jobs seal each share with
// scripts/ceremony/seal-share.mjs; this opens it.
//
// The transport keypair exists only to move shares across a job boundary:
//   - public key  -> CEREMONY_TRANSPORT_PUBLIC_KEY, a repo variable (not secret)
//   - private key -> CEREMONY_TRANSPORT_PRIVATE_KEY, a secret on `production`
//
// It is not part of the 2-of-3 custody scheme. Holding the private key alone
// reveals nothing: a share is only useful with a second share. Losing it costs
// nothing either, because generating a new pair needs no reviewer involvement.
import { constants, privateDecrypt } from "node:crypto";
// @ts-expect-error - plain .mjs helper, shared with the bare-runner seal script
import { readPem } from "./pem.mjs";

export function openShare(sealedBase64: string, privateKeyValue: string): string {
  const privateKey = readPem(privateKeyValue, "PRIVATE", "CEREMONY_TRANSPORT_PRIVATE_KEY") as string;

  let opened: Buffer;
  try {
    opened = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(sealedBase64.trim(), "base64"),
    );
  } catch (err) {
    throw new Error(
      "Could not open a reviewer share with CEREMONY_TRANSPORT_PRIVATE_KEY. " +
        "The share was probably sealed with a different transport public key: " +
        "re-run transport-keygen.mjs and set BOTH halves from the same run. " +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const share = opened.toString("utf8");
  if (share.length === 0) {
    throw new Error("deploy-key share is empty after transport decryption");
  }
  return share;
}
