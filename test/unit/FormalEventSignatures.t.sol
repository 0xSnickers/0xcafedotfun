// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";

contract FormalEventSignaturesTest is Test {
    function testTokenCreatedSignature() public pure {
        assertEq(
            keccak256(
                bytes("TokenCreated(address,address,address,bytes32,bytes32,uint256,string,string,string,string)")
            ),
            hex"2e6a298ee5c2c69b8bdae686492d63d7831e75ca18ee6f396d547e4b9dbdcd9c"
        );
    }

    function testTokenBoughtSignature() public pure {
        assertEq(
            keccak256(
                bytes(
                    "TokenBought(address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)"
                )
            ),
            hex"427a71158baeadd9d3bee5324735d3f4874131119b9b5f168f1b06962d813f52"
        );
    }

    function testTokenSoldSignature() public pure {
        assertEq(
            keccak256(
                bytes(
                    "TokenSold(address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)"
                )
            ),
            hex"1e08fd5e7eacd019f9f1c83ba3fe4fcf357a662cb60994e538d7bf933e7f2a8c"
        );
    }

    function testGraduationPreparedSignature() public pure {
        assertEq(
            keccak256(bytes("GraduationPrepared(address,address,uint256,uint256,uint256,uint256)")),
            hex"2cebcb19c21bb9c55d1cea81002e0f99efc87eacf6e876a76c3bd0e29dbb776b"
        );
    }

    function testTokenGraduatedSignature() public pure {
        assertEq(
            keccak256(bytes("TokenGraduated(address,address,address,uint256,uint256,uint256,uint256,uint256)")),
            hex"006e1020468287b27bca89ebe3cb5ac3f9d5702470213a741ca2a441ed3921be"
        );
    }

    function testFeesAccruedSignature() public pure {
        assertEq(
            keccak256(bytes("FeesAccrued(address,address,address,uint256,uint256)")),
            hex"c0879f763f0d64184ec8745848b1f7a3f477f4c68aa33f65ed52c18ae86a087c"
        );
    }

    function testCreatorFeesClaimedSignature() public pure {
        assertEq(
            keccak256(bytes("CreatorFeesClaimed(address,address,uint256)")),
            hex"aa4ecfd5324d73e3b54d038b3ae8ac8f88866d49dc334dc1f02fe36e0f935748"
        );
    }

    function testPlatformFeesClaimedSignature() public pure {
        assertEq(
            keccak256(bytes("PlatformFeesClaimed(address,address,uint256)")),
            hex"5a49fac18cb83464da1273dfc88bc71e609ba5472f63f296423f909f1a90daf4"
        );
    }
}
