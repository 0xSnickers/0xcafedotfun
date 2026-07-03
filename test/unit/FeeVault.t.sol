// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {FeeVault} from "../../src/FeeVault.sol";
import {MemeFactory} from "../../src/MemeFactory.sol";
import {MemeToken} from "../../src/MemeToken.sol";
import {TokenMarket} from "../../src/TokenMarket.sol";
import {MarketTypes} from "../../src/libraries/MarketTypes.sol";
import {RejectEthReceiver} from "../mocks/RejectEthReceiver.sol";
import {ReentrantFeeClaimer} from "../mocks/ReentrantFeeClaimer.sol";
import {OfficialTokenSaltMiner} from "../utils/OfficialTokenSaltMiner.sol";

contract FeeVaultTest is Test, OfficialTokenSaltMiner {
    FeeVault private vault;
    MemeFactory private factory;
    TokenMarket private implementation;
    MemeToken private token;
    TokenMarket private market;

    address private creator = address(0xCAFE);
    address private buyer = address(0xBEEF);
    address private treasury = address(0xFEE);

    function setUp() public {
        vault = new FeeVault(address(this), treasury);
        factory = new MemeFactory();
        implementation = new TokenMarket();
        vault.setFactory(address(factory));
        factory.configure(address(implementation), address(vault), address(0x1111), _curveConfig(), _feeConfig());

        (bytes32 salt,) = mineOfficialSalt(factory, creator, "Cafe", "CAFE", "", "", keccak256("fee-vault"));
        vm.prank(creator);
        (address tokenAddress, address marketAddress) = factory.createToken("Cafe", "CAFE", "", "", salt);
        token = MemeToken(tokenAddress);
        market = TokenMarket(payable(marketAddress));
        vm.deal(buyer, 10 ether);
    }

    function testBuyAccruesSolventPullPaymentLedger() public {
        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);

        assertEq(vault.platformFeesClaimable(), 0.01 ether);
        assertEq(vault.creatorFeesClaimable(creator), 0.0025 ether);
        assertEq(vault.totalCreatorFeesClaimable(), 0.0025 ether);
        assertEq(vault.tokenPlatformFeesAccrued(address(token)), 0.01 ether);
        assertEq(vault.tokenCreatorFeesAccrued(address(token)), 0.0025 ether);
        assertEq(address(vault).balance, 0.0125 ether);
    }

    function testOnlyTrustedMarketCanAccrueExactPayment() public {
        vm.expectRevert(FeeVault.UntrustedMarket.selector);
        vault.accrueFees{value: 2}(address(token), creator, 1, 1);

        vm.deal(address(market), 1);
        vm.prank(address(market));
        vm.expectRevert(FeeVault.InvalidFeePayment.selector);
        vault.accrueFees{value: 1}(address(token), creator, 1, 1);
    }

    function testCreatorAndTreasuryClaimsUseChecksEffectsInteractions() public {
        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);

        address creatorRecipient = address(0xC0FFEE);
        vm.prank(creator);
        vault.claimCreatorFees(payable(creatorRecipient));

        vm.prank(treasury);
        vault.claimPlatformFees(0.01 ether, payable(treasury));

        assertEq(creatorRecipient.balance, 0.0025 ether);
        assertEq(treasury.balance, 0.01 ether);
        assertEq(vault.creatorFeesClaimable(creator), 0);
        assertEq(vault.platformFeesClaimable(), 0);
        assertEq(address(vault).balance, 0);
    }

    function testOwnerCannotClaimPlatformFeesUnlessItIsTreasury() public {
        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);

        vm.expectRevert(FeeVault.NotTreasury.selector);
        vault.claimPlatformFees(0.01 ether, payable(address(this)));
        assertEq(vault.platformFeesClaimable(), 0.01 ether);
    }

    function testRejectingRecipientDoesNotLoseClaimableBalance() public {
        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);
        RejectEthReceiver rejector = new RejectEthReceiver();

        vm.prank(creator);
        vm.expectRevert(FeeVault.EthTransferFailed.selector);
        vault.claimCreatorFees(payable(address(rejector)));

        assertEq(vault.creatorFeesClaimable(creator), 0.0025 ether);
        assertEq(vault.totalCreatorFeesClaimable(), 0.0025 ether);
    }

    function testRejectingCreatorClaimDoesNotBlockLaterTrades() public {
        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);
        RejectEthReceiver rejector = new RejectEthReceiver();

        vm.prank(creator);
        vm.expectRevert(FeeVault.EthTransferFailed.selector);
        vault.claimCreatorFees(payable(address(rejector)));

        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);

        assertEq(vault.creatorFeesClaimable(creator), 0.005 ether);
        assertEq(vault.platformFeesClaimable(), 0.02 ether);
        assertEq(address(vault).balance, 0.025 ether);
    }

    function testCreatorClaimDoesNotChangePlatformLedger() public {
        vm.prank(buyer);
        market.buy{value: 1 ether}(0, block.timestamp);

        vm.prank(creator);
        vault.claimCreatorFees(payable(creator));

        assertEq(vault.creatorFeesClaimable(creator), 0);
        assertEq(vault.totalCreatorFeesClaimed(creator), 0.0025 ether);
        assertEq(vault.platformFeesClaimable(), 0.01 ether);
        assertEq(vault.totalPlatformFeesAccrued(), 0.01 ether);
        assertEq(vault.totalPlatformFeesClaimed(), 0);
        assertEq(address(vault).balance, 0.01 ether);
    }

    function testCreatorClaimCannotReenter() public {
        ReentrantFeeClaimer claimer = new ReentrantFeeClaimer();
        (bytes32 salt,) =
            mineOfficialSalt(factory, address(claimer), "Reentrant Creator", "REENTER", "", "", keccak256("reenter"));
        (, address claimerMarketAddress) = claimer.createToken(factory, salt);

        vm.prank(buyer);
        TokenMarket(payable(claimerMarketAddress)).buy{value: 1 ether}(0, block.timestamp);
        claimer.claim(vault);

        assertTrue(claimer.attemptedReentry());
        assertEq(address(claimer).balance, 0.0025 ether);
        assertEq(vault.creatorFeesClaimable(address(claimer)), 0);
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
