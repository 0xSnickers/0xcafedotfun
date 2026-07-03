// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {FeeVault} from "../../src/FeeVault.sol";
import {MemeFactory} from "../../src/MemeFactory.sol";

contract ReentrantFeeClaimer {
    FeeVault public vault;
    bool public attemptedReentry;

    function createToken(MemeFactory factory, bytes32 salt) external returns (address token, address market) {
        return factory.createToken("Reentrant Creator", "REENTER", "", "", salt);
    }

    function claim(FeeVault vault_) external {
        vault = vault_;
        vault_.claimCreatorFees(payable(address(this)));
    }

    receive() external payable {
        if (!attemptedReentry) {
            attemptedReentry = true;
            try vault.claimCreatorFees(payable(address(this))) {} catch {}
        }
    }
}
