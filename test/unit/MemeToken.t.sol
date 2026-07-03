// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {MemeToken} from "../../src/MemeToken.sol";

contract MemeTokenTest is Test {
    address private creator = address(0xCAFE);
    address private market = address(0xBEEF);
    address private user = address(0xA11CE);
    MemeToken private token;

    function setUp() public {
        token = new MemeToken("Cafe", "CAFE", creator, market, "image", "description");
    }

    function testUsesFixedDecimalsAndFormalRoles() public view {
        assertEq(token.decimals(), 18);
        assertEq(token.creator(), creator);
        assertEq(token.minter(), market);
    }

    function testOnlyMinterCanMintBurnAndTransferMinterRole() public {
        vm.expectRevert(MemeToken.NotMinter.selector);
        token.mint(user, 1 ether);

        vm.prank(market);
        token.mint(market, 2 ether);
        assertEq(token.totalSupply(), 2 ether);

        vm.prank(market);
        token.burnMarketBalance(1 ether);
        assertEq(token.totalSupply(), 1 ether);

        vm.prank(market);
        token.setMinter(address(0));
        assertEq(token.minter(), address(0));
    }

    function testOnlyCreatorCanUpdateMetadata() public {
        vm.expectRevert(MemeToken.NotCreator.selector);
        token.updateMetadata("new-image", "new-description");

        vm.prank(creator);
        token.updateMetadata("new-image", "new-description");
        assertEq(token.tokenImage(), "new-image");
        assertEq(token.description(), "new-description");
    }

    function testRejectsOversizedMetadataUpdates() public {
        string memory longImage = new string(token.MAX_TOKEN_IMAGE_BYTES() + 1);
        string memory longDescription = new string(token.MAX_TOKEN_DESCRIPTION_BYTES() + 1);

        vm.startPrank(creator);
        vm.expectRevert(MemeToken.TokenMetadataTooLong.selector);
        token.updateMetadata(longImage, "description");

        vm.expectRevert(MemeToken.TokenMetadataTooLong.selector);
        token.updateMetadata("image", longDescription);
        vm.stopPrank();
    }

    function testDoesNotExposePublicBurnFunctions() public {
        (bool burnSuccess,) = address(token).call(abi.encodeWithSignature("burn(uint256)", 1 ether));
        (bool burnFromSuccess,) =
            address(token).call(abi.encodeWithSignature("burnFrom(address,uint256)", user, 1 ether));

        assertFalse(burnSuccess);
        assertFalse(burnFromSuccess);
    }
}
