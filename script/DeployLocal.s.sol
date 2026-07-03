// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {console} from "forge-std/Script.sol";
import {DeployScript} from "./Deploy.s.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MemeToken} from "../src/MemeToken.sol";
import {TokenMarket} from "../src/TokenMarket.sol";
import {IUniswapV2FactoryLike} from "../src/interfaces/IUniswapV2.sol";
import {MarketTypes} from "../src/libraries/MarketTypes.sol";

contract DeployLocalScript is DeployScript {
    bytes32 internal constant LOCAL_FORMAL_E2E_SALT =
        0x6c6f63616c2d666f726d616c2d65326500000000000000000000000000000000;

    function run() public override {
        uint256 privateKey = deployerPrivateKey();
        address deployer = vm.addr(privateKey);
        address router = uniswapV2Router();

        vm.startBroadcast(privateKey);
        _deployFormalContracts(deployer, deployer, deployer, deployer, router);
        bool runLocalE2e = vm.envOr("RUN_LOCAL_E2E", false);
        if (runLocalE2e) {
            _runLifecycleE2e(deployer);
        }
        vm.stopBroadcast();

        _printSummary(deployer, deployer, deployer, deployer, router);
        console.log("Local lifecycle E2E:", runLocalE2e ? "passed" : "skipped");
    }

    function _runLifecycleE2e(address creator) internal {
        (address tokenAddress, address marketAddress) =
            memeFactory.createToken("Local Formal Token", "LFT", "", "", LOCAL_FORMAL_E2E_SALT);
        MemeToken token = MemeToken(tokenAddress);
        TokenMarket market = TokenMarket(marketAddress);
        uint256 deadline = block.timestamp + 1 days;

        MarketTypes.BuyQuote memory quote = market.quoteBuyExactTokens(_curveConfig().targetSupply);
        market.buy{value: quote.grossEthIn}(quote.tokenOut, deadline);
        require(
            uint256(market.stage()) == uint256(MarketTypes.MarketStage.GRADUATION_PENDING), "Not graduation pending"
        );

        market.prepareGraduation();
        require(uint256(market.stage()) == uint256(MarketTypes.MarketStage.LIQUIDITY_PENDING), "Not liquidity pending");

        liquidityManager.addLiquidity(tokenAddress, 0, 0, deadline);
        address pair =
            IUniswapV2FactoryLike(liquidityManager.uniswapFactory()).getPair(tokenAddress, liquidityManager.weth());

        require(uint256(market.stage()) == uint256(MarketTypes.MarketStage.DEX_LIVE), "Not DEX live");
        require(market.dexPair() == pair && pair != address(0), "Pair mismatch");
        require(token.minter() == address(0), "Minter not renounced");
        require(
            IERC20(pair).balanceOf(liquidityManager.LP_LOCK_ADDRESS()) == market.liquidityMintedSupply(),
            "LP lock mismatch"
        );
        require(token.balanceOf(address(liquidityManager)) == 0, "Manager token residual");
        require(address(liquidityManager).balance == 0, "Manager ETH residual");
        require(feeVault.creatorFeesClaimable(creator) == quote.creatorFee, "Creator fee mismatch");
        require(feeVault.platformFeesClaimable() == quote.platformFee, "Platform fee mismatch");
    }
}
