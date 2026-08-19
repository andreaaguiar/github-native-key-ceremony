// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title GovToken
/// @notice ERC20 governance token with vote delegation support.
///         Minting is restricted to the owner (intended to be the DAO or a deployer multisig).
contract GovToken is ERC20Votes, Ownable {
    uint256 public constant MAX_SUPPLY = 10_000_000 ether;

    constructor(address initialOwner)
        ERC20("Governance Token", "GOV")
        EIP712("Governance Token", "1")
        Ownable(initialOwner)
    {}

    /// @notice Mint tokens to a recipient. Only callable by owner.
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "GovToken: max supply exceeded");
        _mint(to, amount);
    }

    // Required override
    function _update(address from, address to, uint256 amount)
        internal
        override(ERC20Votes)
    {
        super._update(from, to, amount);
    }
}
