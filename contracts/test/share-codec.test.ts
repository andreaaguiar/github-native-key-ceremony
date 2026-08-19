import { expect } from "chai";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { split, combine } from "shamir-secret-sharing";
import { encodeShare, decodeShare } from "../scripts/ceremony/share-codec.js";
import { openShare } from "../scripts/ceremony/transport.js";
import { generateKeyPairSync } from "node:crypto";

describe("ceremony share wiring", () => {
  it("round-trips a secret through split -> encode -> decode -> combine (2-of-3)", async () => {
    const secret = new Uint8Array(randomBytes(32));
    const shares = await split(secret, 3, 2);
    const encoded = shares.map(encodeShare);
    const decoded = encoded.map(decodeShare);

    expect(Buffer.from(await combine([decoded[0], decoded[1]]))).to.deep.equal(Buffer.from(secret));
    expect(Buffer.from(await combine([decoded[1], decoded[2]]))).to.deep.equal(Buffer.from(secret));
  });

  it("rejects a malformed share instead of decoding it to garbage", () => {
    expect(() => decodeShare("!!!not base64!!!")).to.throw(/not valid base64/);
    expect(() => decodeShare("YWJj")).to.throw(/expected 33 bytes/);
    expect(() => decodeShare("")).to.throw(/expected 33 bytes/);
  });

  it("accepts a share with surrounding whitespace", async () => {
    const [share] = await split(new Uint8Array(randomBytes(32)), 3, 2);
    expect(() => decodeShare(`  ${encodeShare(share)}\n`)).to.not.throw();
  });

  // The reviewer jobs run seal-share.mjs on a bare runner. These tests drive that
  // exact script, so the workflow and the deploy-side decrypt cannot drift apart.
  describe("share transport across the job boundary", () => {
    const keys = () => {
      const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 3072,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      return {
        pub: Buffer.from(publicKey).toString("base64"),
        priv: Buffer.from(privateKey).toString("base64"),
      };
    };

    const seal = (share: string, pub: string) =>
      execFileSync("node", ["scripts/ceremony/seal-share.mjs"], {
        env: { ...process.env, DEPLOY_KEY_SHARE: share, CEREMONY_TRANSPORT_PUBLIC_KEY: pub },
      }).toString();

    it("round-trips every 2-of-3 pair through seal-share.mjs and openShare", async () => {
      const secret = new Uint8Array(randomBytes(32));
      const shares = await split(secret, 3, 2);
      const { pub, priv } = keys();
      const sealed = shares.map((s) => seal(encodeShare(s), pub));

      for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) {
        const opened = [sealed[i], sealed[j]].map((c) => decodeShare(openShare(c, priv)));
        expect(Buffer.from(await combine(opened))).to.deep.equal(Buffer.from(secret));
      }
    });

    it("produces ciphertext that is neither the share nor its base64", async () => {
      const [share] = await split(new Uint8Array(randomBytes(32)), 3, 2);
      const plain = encodeShare(share);
      const { pub } = keys();
      const sealed = seal(plain, pub);

      expect(sealed).to.not.equal(plain);
      expect(sealed).to.not.equal(Buffer.from(plain, "utf8").toString("base64"));
      expect(sealed).to.not.include("\n");
      // RSA-OAEP is randomised, so the same share seals differently every time.
      expect(seal(plain, pub)).to.not.equal(sealed);
    });

    it("refuses a share sealed to a different transport key", async () => {
      const [share] = await split(new Uint8Array(randomBytes(32)), 3, 2);
      const sealed = seal(encodeShare(share), keys().pub);
      expect(() => openShare(sealed, keys().priv)).to.throw();
    });

    it("rejects a private key that is not a base64-wrapped PEM", () => {
      expect(() => openShare("Zm9v", Buffer.from("nope").toString("base64"))).to.throw(/not a base64-wrapped PEM/);
    });

    it("fails when the reviewer environment has no share", () => {
      expect(() =>
        execFileSync("node", ["scripts/ceremony/seal-share.mjs"], {
          env: { ...process.env, DEPLOY_KEY_SHARE: "", CEREMONY_TRANSPORT_PUBLIC_KEY: keys().pub },
          stdio: "pipe",
        }),
      ).to.throw();
    });
  });
});
