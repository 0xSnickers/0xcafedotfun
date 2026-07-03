// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {MemeFactory} from "../../src/MemeFactory.sol";
import {FeeVault} from "../../src/FeeVault.sol";

contract RejectEthReceiver {
    function createToken(MemeFactory factory, bytes32 salt) external returns (address token, address market) {
        return factory.createToken("Reject Creator", "REJECT", "", "", salt);
    }

    function claimCreatorFees(FeeVault vault, address payable recipient) external {
        vault.claimCreatorFees(recipient);
    }

    receive() external payable {
        revert("REJECT_ETH");
    }
}
