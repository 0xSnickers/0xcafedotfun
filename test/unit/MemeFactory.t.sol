// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {MemeFactory} from "../../src/MemeFactory.sol";
import {MemeToken} from "../../src/MemeToken.sol";
import {TokenMarket} from "../../src/TokenMarket.sol";
import {MarketTypes} from "../../src/libraries/MarketTypes.sol";
import {OfficialTokenSaltMiner} from "../utils/OfficialTokenSaltMiner.sol";

contract MemeFactoryTest is Test, OfficialTokenSaltMiner {
    MemeFactory private factory;
    TokenMarket private implementation;

    address private creator = address(0xCAFE);
    address private otherCreator = address(0xBEEF);
    address private feeVault = address(0xFEE);
    address private liquidityManager = address(0x1111);
    bytes32 private userSalt = keccak256("cafe");

    function setUp() public {
        factory = new MemeFactory();
        implementation = new TokenMarket();
        factory.configure(address(implementation), feeVault, liquidityManager, _curveConfig(), _feeConfig());
    }

    function testCreateTokenIsFreePredictableAndRegistersMarket() public {
        (bytes32 salt, address predicted) =
            mineOfficialSalt(factory, creator, "Cafe", "CAFE", "image", "description", keccak256("predictable"));

        vm.prank(creator);
        (address tokenAddress, address marketAddress) =
            factory.createToken("Cafe", "CAFE", "image", "description", salt);

        MemeToken token = MemeToken(tokenAddress);
        TokenMarket market = TokenMarket(payable(marketAddress));

        assertEq(tokenAddress, predicted);
        assertEq(token.decimals(), 18);
        assertEq(token.creator(), creator);
        assertEq(token.minter(), marketAddress);
        assertEq(factory.marketOf(tokenAddress), marketAddress);
        assertTrue(factory.isMarket(marketAddress));
        assertEq(factory.creatorOf(tokenAddress), creator);
        assertEq(factory.tokenConfigVersion(tokenAddress), 1);
        assertEq(factory.totalTokenCount(), 1);

        assertEq(market.token(), tokenAddress);
        assertEq(market.creator(), creator);
        assertEq(market.factory(), address(factory));
        assertEq(market.owner(), address(factory));
        assertEq(market.feeVault(), feeVault);
        assertEq(market.liquidityManager(), liquidityManager);
    }

    function testCreateTokenRejectsEth() public {
        (bytes32 salt,) = mineOfficialSalt(factory, creator, "Cafe", "CAFE", "", "", keccak256("rejects-eth"));

        vm.deal(creator, 1 ether);
        vm.prank(creator);
        (bool success,) =
            address(factory).call{value: 1}(abi.encodeCall(MemeFactory.createToken, ("Cafe", "CAFE", "", "", salt)));
        assertFalse(success);
    }

    function testCreateTokenRequiresConfiguration() public {
        MemeFactory unconfiguredFactory = new MemeFactory();

        vm.prank(creator);
        vm.expectRevert(MemeFactory.FactoryNotConfigured.selector);
        unconfiguredFactory.createToken("Cafe", "CAFE", "", "", userSalt);
    }

    function testCreateTokenRejectsNonOfficialPredictedAddress() public {
        address predicted = factory.predictTokenAddress(creator, "Cafe", "CAFE", "", "", userSalt);
        assertFalse(isOfficialTokenAddress(predicted));

        vm.prank(creator);
        vm.expectRevert(MemeFactory.TokenAddressNotOfficial.selector);
        factory.createToken("Cafe", "CAFE", "", "", userSalt);
    }

    function testCreateTokenRejectsOversizedMetadata() public {
        string memory longName = new string(factory.MAX_TOKEN_NAME_BYTES() + 1);
        string memory longSymbol = new string(factory.MAX_TOKEN_SYMBOL_BYTES() + 1);
        string memory longImage = new string(factory.MAX_TOKEN_IMAGE_BYTES() + 1);
        string memory longDescription = new string(factory.MAX_TOKEN_DESCRIPTION_BYTES() + 1);

        vm.startPrank(creator);
        vm.expectRevert(MemeFactory.TokenMetadataTooLong.selector);
        factory.createToken(longName, "CAFE", "", "", userSalt);

        vm.expectRevert(MemeFactory.TokenMetadataTooLong.selector);
        factory.createToken("Cafe", longSymbol, "", "", userSalt);

        vm.expectRevert(MemeFactory.TokenMetadataTooLong.selector);
        factory.createToken("Cafe", "CAFE", longImage, "", userSalt);

        vm.expectRevert(MemeFactory.TokenMetadataTooLong.selector);
        factory.createToken("Cafe", "CAFE", "", longDescription, userSalt);
        vm.stopPrank();
    }

    function testConfigureRejectsInvalidImplementationAndConfigs() public {
        vm.expectRevert(MemeFactory.InvalidAddress.selector);
        factory.configure(address(0x1234), feeVault, liquidityManager, _curveConfig(), _feeConfig());

        MarketTypes.CurveConfig memory invalidCurve = _curveConfig();
        invalidCurve.initialPriceX18 = 0;
        vm.expectRevert(MemeFactory.InvalidCurveConfig.selector);
        factory.configure(address(implementation), feeVault, liquidityManager, invalidCurve, _feeConfig());

        invalidCurve = _curveConfig();
        invalidCurve.graduationMarketCap = 5_001 ether;
        vm.expectRevert(MemeFactory.InvalidCurveConfig.selector);
        factory.configure(address(implementation), feeVault, liquidityManager, invalidCurve, _feeConfig());

        MarketTypes.FeeConfig memory invalidFee = MarketTypes.FeeConfig({platformFeeBps: 101, creatorFeeBps: 25});
        vm.expectRevert(MemeFactory.InvalidFeeConfig.selector);
        factory.configure(address(implementation), feeVault, liquidityManager, _curveConfig(), invalidFee);

        MarketTypes.FeeConfig memory lowerFee = MarketTypes.FeeConfig({platformFeeBps: 99, creatorFeeBps: 25});
        vm.expectRevert(MemeFactory.InvalidFeeConfig.selector);
        factory.configure(address(implementation), feeVault, liquidityManager, _curveConfig(), lowerFee);
    }

    function testCreatorBoundSaltPreventsIdentityFrontRunning() public {
        (bytes32 sharedSalt, address creatorPrediction) =
            mineOfficialSalt(factory, creator, "Cafe", "CAFE", "", "", keccak256("shared-salt"));
        address otherPrediction = factory.predictTokenAddress(otherCreator, "Cafe", "CAFE", "", "", sharedSalt);
        assertNotEq(creatorPrediction, otherPrediction);
        assertFalse(isOfficialTokenAddress(otherPrediction));

        vm.prank(otherCreator);
        vm.expectRevert(MemeFactory.TokenAddressNotOfficial.selector);
        factory.createToken("Cafe", "CAFE", "", "", sharedSalt);

        vm.prank(creator);
        (address creatorToken,) = factory.createToken("Cafe", "CAFE", "", "", sharedSalt);
        assertEq(creatorToken, creatorPrediction);
        assertEq(factory.creatorOf(creatorToken), creator);
    }

    function testDuplicateCreatorSaltRevertsEvenWhenMetadataChanges() public {
        (bytes32 salt,) = mineOfficialSalt(factory, creator, "Cafe", "CAFE", "", "", keccak256("duplicate"));

        vm.prank(creator);
        factory.createToken("Cafe", "CAFE", "", "", salt);

        vm.prank(creator);
        vm.expectRevert(MemeFactory.SaltAlreadyUsed.selector);
        factory.createToken("Changed", "NEW", "new", "new", salt);
    }

    function testPaginationReturnsRequestedSlices() public {
        for (uint256 i = 0; i < 3; i++) {
            (bytes32 salt,) =
                mineOfficialSalt(factory, creator, "Cafe", "CAFE", "", "", keccak256(abi.encode("pagination", i)));
            vm.prank(creator);
            factory.createToken("Cafe", "CAFE", "", "", salt);
        }

        address[] memory allPage = factory.getTokens(1, 2);
        address[] memory creatorPage = factory.getCreatorTokens(creator, 1, 2);
        assertEq(allPage.length, 2);
        assertEq(allPage, creatorPage);

        address[] memory emptyPage = factory.getTokens(3, 2);
        assertEq(emptyPage.length, 0);

        vm.expectRevert(MemeFactory.InvalidPageSize.selector);
        factory.getTokens(0, 101);
    }

    function testConfigurationChangesOnlyAffectFutureMarkets() public {
        (bytes32 firstSalt,) = mineOfficialSalt(factory, creator, "First", "ONE", "", "", keccak256("first-market"));
        vm.prank(creator);
        (, address firstMarketAddress) = factory.createToken("First", "ONE", "", "", firstSalt);

        MarketTypes.CurveConfig memory updatedCurve = MarketTypes.CurveConfig({
            initialPriceX18: 0.002 ether,
            targetPriceX18: 0.006 ether,
            targetSupply: 2_000_000 ether,
            graduationMarketCap: 7_000 ether
        });
        factory.configure(address(implementation), feeVault, liquidityManager, updatedCurve, _feeConfig());

        (bytes32 secondSalt,) = mineOfficialSalt(factory, creator, "Second", "TWO", "", "", keccak256("second-market"));
        vm.prank(creator);
        (address secondToken, address secondMarketAddress) = factory.createToken("Second", "TWO", "", "", secondSalt);

        TokenMarket firstMarket = TokenMarket(payable(firstMarketAddress));
        TokenMarket secondMarket = TokenMarket(payable(secondMarketAddress));
        (uint256 firstInitialPrice,,,) = firstMarket.curveConfig();
        (uint256 secondInitialPrice,,,) = secondMarket.curveConfig();

        assertEq(firstInitialPrice, 0.001 ether);
        assertEq(secondInitialPrice, 0.002 ether);
        assertEq(factory.tokenConfigVersion(secondToken), 2);
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
