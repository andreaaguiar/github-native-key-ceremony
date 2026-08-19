import { expect } from "chai";
import { network } from "hardhat";
import { Wallet, parseEther } from "ethers";
import { sweepRemainingBalance } from "../scripts/ceremony/sweep.js";

const { ethers } = await network.create();

describe("retiring-key sweep", () => {
  it("moves the balance forward and leaves the retiring key effectively empty", async () => {
    const [funder] = await ethers.getSigners();
    const retiring = Wallet.createRandom().connect(ethers.provider);
    const replacement = Wallet.createRandom();

    await (await funder.sendTransaction({ to: retiring.address, value: parseEther("0.05") })).wait();
    expect(await ethers.provider.getBalance(retiring.address)).to.equal(parseEther("0.05"));

    await sweepRemainingBalance(ethers, retiring, replacement.address);

    const left = await ethers.provider.getBalance(retiring.address);
    const moved = await ethers.provider.getBalance(replacement.address);

    // The replacement gets nearly everything; only unspent fee reserve is left.
    expect(moved).to.be.greaterThan(parseEther("0.049"));
    expect(left).to.be.lessThan(parseEther("0.001"));
    expect(moved + left).to.be.lessThanOrEqual(parseEther("0.05"));
  });

  it("skips the sweep instead of failing when the balance cannot cover gas", async () => {
    const [funder] = await ethers.getSigners();
    const retiring = Wallet.createRandom().connect(ethers.provider);
    const replacement = Wallet.createRandom();

    // Far less than 21000 * maxFeePerGas.
    await (await funder.sendTransaction({ to: retiring.address, value: 1000n })).wait();

    await sweepRemainingBalance(ethers, retiring, replacement.address);

    expect(await ethers.provider.getBalance(replacement.address)).to.equal(0n);
    expect(await ethers.provider.getBalance(retiring.address)).to.equal(1000n);
  });

  it("reserves exactly what the node validates against", async () => {
    // Regression test for the live failure: reserving 21000 * gasPrice while the
    // node charged against a higher maxFeePerGas overshot the balance by the
    // difference, and the sweep was rejected for insufficient funds.
    const [funder] = await ethers.getSigners();
    const retiring = Wallet.createRandom().connect(ethers.provider);

    await (await funder.sendTransaction({ to: retiring.address, value: parseEther("0.05") })).wait();

    const fee = await ethers.provider.getFeeData();
    expect(fee.maxFeePerGas === null, "chain should expose EIP-1559 fees").to.equal(false);
    // Plain comparison: the chai matchers reject a bare bigint here.
    expect(fee.maxFeePerGas! > (fee.gasPrice ?? 0n), "maxFeePerGas should exceed gasPrice").to.equal(true);

    // Would have thrown "insufficient funds" before the fix.
    await sweepRemainingBalance(ethers, retiring, Wallet.createRandom().address);
  });
});
