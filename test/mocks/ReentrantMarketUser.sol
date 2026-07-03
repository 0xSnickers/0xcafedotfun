// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TokenMarket} from "../../src/TokenMarket.sol";

contract ReentrantMarketUser {
    TokenMarket public market;
    uint256 public tokenIn;
    bool public attemptedReentry;

    function buy(TokenMarket market_) external payable {
        market = market_;
        market_.buy{value: msg.value}(0, block.timestamp);
    }

    function sellWithReentry(uint256 tokenIn_) external {
        tokenIn = tokenIn_;
        IERC20(market.token()).approve(address(market), tokenIn_);
        market.sell(tokenIn_, 0, block.timestamp);
    }

    receive() external payable {
        if (!attemptedReentry) {
            attemptedReentry = true;
            try market.sell(tokenIn, 0, block.timestamp) {} catch {}
        }
    }
}
