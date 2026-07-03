// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {LiquidityManager} from "../src/LiquidityManager.sol";
import {MemeFactory} from "../src/MemeFactory.sol";
import {TokenMarket} from "../src/TokenMarket.sol";
import {MarketTypes} from "../src/libraries/MarketTypes.sol";

contract DeployScript is Script {
    address internal constant DEFAULT_UNISWAP_V2_ROUTER = 0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3;

    FeeVault public feeVault;
    LiquidityManager public liquidityManager;
    TokenMarket public tokenMarketImplementation;
    MemeFactory public memeFactory;

    function deployerPrivateKey() internal view virtual returns (uint256) {
        return vm.envUint("PRIVATE_KEY_LOCAL");
    }

    function uniswapV2Router() internal view virtual returns (address) {
        return vm.envOr("UNISWAP_V2_ROUTER", DEFAULT_UNISWAP_V2_ROUTER);
    }

    function run() public virtual {
        uint256 privateKey = deployerPrivateKey();
        address deployer = vm.addr(privateKey);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        address governance = vm.envOr("GOVERNANCE_ADDRESS", deployer);
        address guardian = vm.envOr("GUARDIAN_ADDRESS", deployer);
        address router = uniswapV2Router();

        vm.startBroadcast(privateKey);
        _deployFormalContracts(deployer, treasury, governance, guardian, router);
        vm.stopBroadcast();

        _printSummary(deployer, treasury, governance, guardian, router);
    }

    function _deployFormalContracts(
        address deployer,
        address treasury,
        address governance,
        address guardian,
        address router
    ) internal {
        feeVault = new FeeVault(deployer, treasury);
        liquidityManager = new LiquidityManager(router);
        tokenMarketImplementation = new TokenMarket();
        memeFactory = new MemeFactory();

        feeVault.setFactory(address(memeFactory));
        liquidityManager.setFactory(address(memeFactory));
        memeFactory.setGuardian(guardian);
        memeFactory.configure(
            address(tokenMarketImplementation),
            address(feeVault),
            address(liquidityManager),
            _curveConfig(),
            _feeConfig()
        );

        if (governance != deployer) {
            feeVault.transferOwnership(governance);
            liquidityManager.transferOwnership(governance);
            memeFactory.transferOwnership(governance);
        }

        _verifyConfiguration(deployer, treasury, governance, guardian, router);
    }

    function _verifyConfiguration(
        address deployer,
        address treasury,
        address governance,
        address guardian,
        address router
    ) internal view {
        require(feeVault.factory() == address(memeFactory), "FeeVault factory mismatch");
        require(feeVault.treasury() == treasury, "FeeVault treasury mismatch");
        require(liquidityManager.factory() == address(memeFactory), "LiquidityManager factory mismatch");
        require(liquidityManager.uniswapRouter() == router, "Router mismatch");
        require(liquidityManager.uniswapFactory() != address(0), "Uniswap factory missing");
        require(liquidityManager.weth() != address(0), "WETH missing");
        require(memeFactory.marketImplementation() == address(tokenMarketImplementation), "Market impl mismatch");
        require(memeFactory.feeVault() == address(feeVault), "Factory FeeVault mismatch");
        require(memeFactory.liquidityManager() == address(liquidityManager), "Factory LiquidityManager mismatch");
        require(memeFactory.guardian() == guardian, "Guardian mismatch");
        require(memeFactory.configVersion() == 1, "Config version mismatch");
        require(memeFactory.PLATFORM_FEE_BPS() == 100, "Platform fee mismatch");
        require(memeFactory.CREATOR_FEE_BPS() == 25, "Creator fee mismatch");
        require(memeFactory.CREATE_FEE() == 0, "Create fee mismatch");

        if (governance == deployer) {
            require(feeVault.owner() == governance, "FeeVault owner mismatch");
            require(liquidityManager.owner() == governance, "LiquidityManager owner mismatch");
            require(memeFactory.owner() == governance, "Factory owner mismatch");
        } else {
            require(feeVault.pendingOwner() == governance, "FeeVault pending owner mismatch");
            require(liquidityManager.pendingOwner() == governance, "LiquidityManager pending owner mismatch");
            require(memeFactory.pendingOwner() == governance, "Factory pending owner mismatch");
        }
    }

    function _curveConfig() internal view virtual returns (MarketTypes.CurveConfig memory) {
        return MarketTypes.CurveConfig({
            initialPriceX18: vm.envOr("CURVE_INITIAL_PRICE_X18", uint256(0.000001 ether)),
            targetPriceX18: vm.envOr("CURVE_TARGET_PRICE_X18", uint256(0.000012 ether)),
            targetSupply: vm.envOr("CURVE_TARGET_SUPPLY", uint256(1_000_000 ether)),
            graduationMarketCap: vm.envOr("GRADUATION_MARKET_CAP", uint256(10 ether))
        });
    }

    function _feeConfig() internal pure returns (MarketTypes.FeeConfig memory) {
        return MarketTypes.FeeConfig({platformFeeBps: 100, creatorFeeBps: 25});
    }

    function _printSummary(address deployer, address treasury, address governance, address guardian, address router)
        internal
        view
    {
        console.log("=== Formal Deployment Summary ===");
        console.log("Deployer:", deployer);
        console.log("Governance:", governance);
        console.log("Guardian:", guardian);
        console.log("Treasury:", treasury);
        console.log("MemeFactory:", address(memeFactory));
        console.log("FeeVault:", address(feeVault));
        console.log("LiquidityManager:", address(liquidityManager));
        console.log("TokenMarket implementation:", address(tokenMarketImplementation));
        console.log("Uniswap V2 Router:", router);
        console.log("Uniswap V2 Factory:", liquidityManager.uniswapFactory());
        console.log("WETH:", liquidityManager.weth());
    }
}
