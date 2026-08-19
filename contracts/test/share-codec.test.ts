import { expect } from "chai";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { split, combine } from "shamir-secret-sharing";
import { encodeShare, decodeShare, unwrapTransport } from "../scripts/ceremony/share-codec.js";

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

  // The reviewer jobs wrap the share in bash before emitting it as a job output,
  // because GitHub drops an output whose value matches a secret. This asserts the
  // TypeScript unwrap matches what that exact shell pipeline produces.
  it("unwraps a share wrapped by the reviewer job's shell pipeline", async () => {
    const secret = new Uint8Array(randomBytes(32));
    const shares = await split(secret, 3, 2);

    const wrapWithShell = (value: string) =>
      execFileSync("bash", ["-c", `printf '%s' "$V" | base64 | tr -d '\n'`], {
        env: { ...process.env, V: value },
      }).toString();

    const rebuilt = await combine(
      [shares[0], shares[1]]
        .map(encodeShare)
        .map(wrapWithShell)
        .map((w) => decodeShare(unwrapTransport(w))),
    );
    expect(Buffer.from(rebuilt)).to.deep.equal(Buffer.from(secret));
  });

  it("rejects an empty transport wrapper rather than passing it on", () => {
    expect(() => unwrapTransport("")).to.throw(/empty deploy-key share/);
  });
});
