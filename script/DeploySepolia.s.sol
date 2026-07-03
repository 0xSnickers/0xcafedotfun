// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {DeployScript} from "./Deploy.s.sol";

contract DeploySepoliaScript is DeployScript {
    address internal constant SEPOLIA_UNISWAP_V2_ROUTER = 0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3;

    function deployerPrivateKey() internal view override returns (uint256) {
        return vm.envUint("PRIVATE_KEY_SEPOLIA");
    }

    function uniswapV2Router() internal view override returns (address) {
        return vm.envOr("SEPOLIA_UNISWAP_V2_ROUTER", SEPOLIA_UNISWAP_V2_ROUTER);
    }
}
