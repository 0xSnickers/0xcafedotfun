// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

library MarketTypes {
    enum MarketStage {
        ACTIVE,
        GRADUATION_PENDING,
        LIQUIDITY_PENDING,
        DEX_LIVE
    }

    struct CurveConfig {
        uint256 initialPriceX18;
        uint256 targetPriceX18;
        uint256 targetSupply;
        uint256 graduationMarketCap;
    }

    struct FeeConfig {
        uint16 platformFeeBps;
        uint16 creatorFeeBps;
    }

    struct MarketStateView {
        MarketStage stage;
        uint256 curveSupply;
        uint256 reserveBalance;
        uint256 currentPriceX18;
        uint256 currentMarketCap;
        address creator;
        bool buyPaused;
        bool sellPaused;
        CurveConfig curveConfig;
    }

    struct BuyQuote {
        uint256 grossEthIn;
        uint256 platformFee;
        uint256 creatorFee;
        uint256 reserveIncrease;
        uint256 tokenOut;
        uint256 executionPriceX18;
        uint256 markPriceX18;
    }

    struct SellQuote {
        uint256 tokenIn;
        uint256 grossEthOut;
        uint256 platformFee;
        uint256 creatorFee;
        uint256 sellerReceives;
        uint256 executionPriceX18;
        uint256 markPriceX18;
    }
}
