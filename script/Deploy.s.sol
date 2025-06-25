// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import "../src/MemeFactory.sol";
import "../src/MemePlatform.sol";
import "../src/BondingCurve.sol";
import "../src/LiquidityManager.sol";
import "../src/FeeManager.sol";

contract DeployScript is Script {
    // Uniswap V2 地址（Anvil 本地部署）
    address constant UNISWAP_V2_ROUTER = 0x610178dA211FEF7D417bC0e6FeD39F05609AD788;
    
    // 部署配置
    uint256 public constant CREATION_FEE = 0.001 ether;
    uint256 public constant PLATFORM_FEE_PERCENTAGE = 200; // 2%
    uint256 public constant CREATOR_FEE_PERCENTAGE = 300;  // 3%
    
    // 部署后的合约地址
    MemeFactory public memeFactory;
    MemePlatform public memePlatform;
    BondingCurve public bondingCurve;
    LiquidityManager public liquidityManager;
    FeeManager public feeManager;
    
    function setUp() public {}
    
    function run() public virtual {
        // 获取部署者私钥
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY_LOCAL");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts with account:", deployer);
        console.log("Account balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. 部署 FeeManager
        console.log("Deploying FeeManager...");
        feeManager = new FeeManager();
        console.log("FeeManager deployed to:", address(feeManager));
        
        // 2. 部署 MemeFactory
        console.log("Deploying MemeFactory...");
        memeFactory = new MemeFactory();
        console.log("MemeFactory deployed to:", address(memeFactory));
        
        // 3. 部署 MemePlatform
        console.log("Deploying MemePlatform...");
        memePlatform = new MemePlatform(payable(address(memeFactory)), address(feeManager));
        console.log("MemePlatform deployed to:", address(memePlatform));
        
        // 4. 部署 LiquidityManager
        console.log("Deploying LiquidityManager...");
        liquidityManager = new LiquidityManager(UNISWAP_V2_ROUTER); // BondingCurve address will be set later
        console.log("LiquidityManager deployed to:", address(liquidityManager));
        
        // 5. 部署 BondingCurve
        console.log("Deploying BondingCurve...");
        bondingCurve = new BondingCurve(
            address(feeManager), 
            address(liquidityManager)
        );
        console.log("BondingCurve deployed to:", address(bondingCurve));
        bondingCurve.setMemeFactory(address(memeFactory));
        
        // 6. 配置合约关系
        console.log("Configuring contract relationships...");
        
        // 设置 MemeFactory 的 BondingCurve 合约地址
        memeFactory.setBondingCurveContract(address(bondingCurve));
        console.log("MemeFactory BondingCurve address set");
        
        // 设置 LiquidityManager 的 BondingCurve 地址
        liquidityManager.setBondingCurve(address(bondingCurve));
        console.log("LiquidityManager BondingCurve address set");
        
        // 7. 验证部署
        console.log("Verifying deployment...");
        require(memeFactory.owner() == deployer, "MemeFactory owner mismatch");
        require(memePlatform.owner() == deployer, "MemePlatform owner mismatch");
        require(bondingCurve.owner() == deployer, "BondingCurve owner mismatch");
        require(liquidityManager.owner() == deployer, "LiquidityManager owner mismatch");
        require(address(memePlatform.memeFactory()) == address(memeFactory), "Factory reference mismatch");
        require(memeFactory.bondingCurveContract() == address(bondingCurve), "BondingCurve reference mismatch");
        require(bondingCurve.memeFactory() == address(memeFactory), "BondingCurve MemeFactory reference mismatch");
        require(bondingCurve.liquidityManager() == address(liquidityManager), "LiquidityManager reference mismatch");
        require(liquidityManager.bondingCurve() == address(bondingCurve), "LiquidityManager BondingCurve reference mismatch");
        
        // 8. 输出部署信息
        console.log("=== Deployment Summary ===");
        console.log("Deployer:", deployer);
        console.log("FeeManager:", address(feeManager));
        console.log("MemeFactory:", address(memeFactory));
        console.log("MemePlatform:", address(memePlatform));
        console.log("BondingCurve:", address(bondingCurve));
        console.log("LiquidityManager:", address(liquidityManager));
        console.log("Creation Fee:", CREATION_FEE);
        console.log("Platform Fee:", PLATFORM_FEE_PERCENTAGE, "basis points");
        console.log("Creator Fee:", CREATOR_FEE_PERCENTAGE, "basis points");
        console.log("Uniswap V2 Router:", UNISWAP_V2_ROUTER);
        
        vm.stopBroadcast();
        
        // 9. 生成前端配置文件
        generateFrontendConfig();
    }
    
    function generateFrontendConfig() internal view {
        console.log("\n=== Frontend Configuration ===");
        console.log("Add to your frontend .env file:");
        console.log("NEXT_PUBLIC_FEE_MANAGER_ADDRESS=", address(feeManager));
        console.log("NEXT_PUBLIC_MEME_FACTORY_ADDRESS=", address(memeFactory));
        console.log("NEXT_PUBLIC_BONDING_CURVE_ADDRESS=", address(bondingCurve));
        console.log("NEXT_PUBLIC_MEME_PLATFORM_ADDRESS=", address(memePlatform));
        console.log("NEXT_PUBLIC_LIQUIDITY_MANAGER_ADDRESS=", address(liquidityManager));
        console.log("NEXT_PUBLIC_CREATION_FEE=", CREATION_FEE);
        console.log("NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE=", PLATFORM_FEE_PERCENTAGE);
        console.log("NEXT_PUBLIC_CREATOR_FEE_PERCENTAGE=", CREATOR_FEE_PERCENTAGE);
        console.log("NEXT_PUBLIC_UNISWAP_V2_ROUTER=", UNISWAP_V2_ROUTER);
    }
} 