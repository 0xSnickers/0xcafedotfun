// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TokenMarket} from "../../src/TokenMarket.sol";
import {MarketTypes} from "../../src/libraries/MarketTypes.sol";

contract TokenMarketInitializationTest is Test {
    TokenMarket private implementation;

    function setUp() public {
        implementation = new TokenMarket();
    }

    function testInitializeSetsCoreState() public {
        TokenMarket market = _deployMarket(
            address(0x1001), address(0x1002), address(0x1003), address(0x1004), _curveConfig(), _feeConfig()
        );

        assertEq(market.token(), address(0x1001));
        assertEq(market.creator(), address(0x1002));
        assertEq(market.factory(), address(this));
        assertEq(market.owner(), address(this));
        assertEq(market.feeVault(), address(0x1003));
        assertEq(market.liquidityManager(), address(0x1004));
        assertEq(uint256(market.stage()), uint256(MarketTypes.MarketStage.ACTIVE));
        assertEq(market.currentPriceX18(), 0.001 ether);
        assertEq(market.currentMarketCap(), 0);
        assertFalse(market.buyPaused());
        assertFalse(market.sellPaused());
        assertFalse(market.graduationPaused());
    }

    function testGetMarketStateMatchesInitialState() public {
        TokenMarket market = _deployMarket(
            address(0x1001), address(0x1002), address(0x1003), address(0x1004), _curveConfig(), _feeConfig()
        );

        MarketTypes.MarketStateView memory state = market.getMarketState();

        assertEq(uint256(state.stage), uint256(market.stage()));
        assertEq(state.curveSupply, market.curveSupply());
        assertEq(state.reserveBalance, market.reserveBalance());
        assertEq(state.currentPriceX18, market.currentPriceX18());
        assertEq(state.currentMarketCap, market.currentMarketCap());
        assertEq(state.creator, market.creator());
        assertEq(state.buyPaused, market.buyPaused());
        assertEq(state.sellPaused, market.sellPaused());
        assertEq(state.curveConfig.initialPriceX18, _curveConfig().initialPriceX18);
        assertEq(state.curveConfig.targetPriceX18, _curveConfig().targetPriceX18);
        assertEq(state.curveConfig.targetSupply, _curveConfig().targetSupply);
        assertEq(state.curveConfig.graduationMarketCap, _curveConfig().graduationMarketCap);
    }

    function testInitializeRejectsZeroAddresses() public {
        bytes memory initData = abi.encodeCall(
            TokenMarket.initialize,
            (address(0), address(0x1002), address(0x1003), address(0x1004), _curveConfig(), _feeConfig())
        );

        vm.expectRevert(TokenMarket.InvalidAddress.selector);
        new ERC1967Proxy(address(implementation), initData);
    }

    function testInitializeRejectsInvalidCurveConfig() public {
        MarketTypes.CurveConfig memory invalidCurveConfig = MarketTypes.CurveConfig({
            initialPriceX18: 0.001 ether,
            targetPriceX18: 0.001 ether,
            targetSupply: 1_000_000 ether,
            graduationMarketCap: 5_000 ether
        });

        bytes memory initData = abi.encodeCall(
            TokenMarket.initialize,
            (address(0x1001), address(0x1002), address(0x1003), address(0x1004), invalidCurveConfig, _feeConfig())
        );

        vm.expectRevert(TokenMarket.InvalidCurveConfig.selector);
        new ERC1967Proxy(address(implementation), initData);
    }

    function testInitializeRejectsUnreachableGraduationMarketCap() public {
        MarketTypes.CurveConfig memory invalidCurveConfig = _curveConfig();
        invalidCurveConfig.graduationMarketCap = 5_001 ether;

        bytes memory initData = abi.encodeCall(
            TokenMarket.initialize,
            (address(0x1001), address(0x1002), address(0x1003), address(0x1004), invalidCurveConfig, _feeConfig())
        );

        vm.expectRevert(TokenMarket.InvalidCurveConfig.selector);
        new ERC1967Proxy(address(implementation), initData);
    }

    function testInitializeRejectsFeeConfigAboveCap() public {
        MarketTypes.FeeConfig memory invalidFeeConfig = MarketTypes.FeeConfig({platformFeeBps: 101, creatorFeeBps: 25});

        bytes memory initData = abi.encodeCall(
            TokenMarket.initialize,
            (address(0x1001), address(0x1002), address(0x1003), address(0x1004), _curveConfig(), invalidFeeConfig)
        );

        vm.expectRevert(TokenMarket.InvalidFeeConfig.selector);
        new ERC1967Proxy(address(implementation), initData);
    }

    function testInitializeRejectsFeeConfigBelowFormalRate() public {
        MarketTypes.FeeConfig memory invalidFeeConfig = MarketTypes.FeeConfig({platformFeeBps: 99, creatorFeeBps: 25});

        bytes memory initData = abi.encodeCall(
            TokenMarket.initialize,
            (address(0x1001), address(0x1002), address(0x1003), address(0x1004), _curveConfig(), invalidFeeConfig)
        );

        vm.expectRevert(TokenMarket.InvalidFeeConfig.selector);
        new ERC1967Proxy(address(implementation), initData);
    }

    function _deployMarket(
        address token,
        address creator,
        address feeVault,
        address liquidityManager,
        MarketTypes.CurveConfig memory curveConfig,
        MarketTypes.FeeConfig memory feeConfig
    ) internal returns (TokenMarket) {
        bytes memory initData = abi.encodeCall(
            TokenMarket.initialize, (token, creator, feeVault, liquidityManager, curveConfig, feeConfig)
        );

        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        return TokenMarket(address(proxy));
    }

    function _curveConfig() internal pure returns (MarketTypes.CurveConfig memory) {
        return MarketTypes.CurveConfig({
            initialPriceX18: 0.001 ether,
            targetPriceX18: 0.005 ether,
            targetSupply: 1_000_000 ether,
            graduationMarketCap: 5_000 ether
        });
    }

    function _feeConfig() internal pure returns (MarketTypes.FeeConfig memory) {
        return MarketTypes.FeeConfig({platformFeeBps: 100, creatorFeeBps: 25});
    }
}
