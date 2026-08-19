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

export function openShare(sealedBase64: string, privateKeyB64: string): string {
  const privateKey = Buffer.from(privateKeyB64, "base64").toString("utf8");
  if (!privateKey.includes("PRIVATE KEY")) {
    throw new Error("CEREMONY_TRANSPORT_PRIVATE_KEY is not a base64-wrapped PEM private key.");
  }

  const opened = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(sealedBase64.trim(), "base64"),
  );

  const share = opened.toString("utf8");
  if (share.length === 0) {
    throw new Error("deploy-key share is empty after transport decryption");
  }
  return share;
}
