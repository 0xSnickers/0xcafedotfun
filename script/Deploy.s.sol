// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import "../src/MemeFactory.sol";
import "../src/MemePlatform.sol";
import "../src/BondingCurve.sol";

contract DeployScript is Script {
    // 部署配置
    uint256 public constant CREATION_FEE = 0.001 ether;
    uint256 public constant PLATFORM_FEE_PERCENTAGE = 200; // 2%
    uint256 public constant CREATOR_FEE_PERCENTAGE = 300;  // 3%
    
    // 部署后的合约地址
    MemeFactory public memeFactory;
    MemePlatform public memePlatform;
    BondingCurve public bondingCurve;
    
    function setUp() public {}
    
    function run() public virtual {
        // 获取部署者私钥
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY_LOCAL");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts with account:", deployer);
        console.log("Account balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. 部署 MemeFactory
        console.log("Deploying MemeFactory...");
        memeFactory = new MemeFactory();
        console.log("MemeFactory deployed to:", address(memeFactory));
        
        // 2. 部署 MemePlatform（需要先部署，因为 BondingCurve 需要它的地址）
        console.log("Deploying MemePlatform...");
        memePlatform = new MemePlatform(payable(address(memeFactory)));
        console.log("MemePlatform deployed to:", address(memePlatform));
        
        // 3. 部署 BondingCurve（传入 MemePlatform 地址）
        console.log("Deploying BondingCurve...");
        bondingCurve = new BondingCurve(address(memePlatform));
        console.log("BondingCurve deployed to:", address(bondingCurve));
        
        // 4. 配置合约关系
        console.log("Configuring contract relationships...");
        
        // 设置 MemeFactory 的 BondingCurve 合约地址
        memeFactory.setBondingCurveContract(address(bondingCurve));
        console.log("MemeFactory BondingCurve address set");
        
        // 授权 MemeFactory 调用 BondingCurve
        bondingCurve.addAuthorizedCaller(address(memeFactory));
        console.log("MemeFactory authorized to call BondingCurve");
        
        // 5. 验证部署
        console.log("Verifying deployment...");
        require(memeFactory.owner() == deployer, "MemeFactory owner mismatch");
        require(memePlatform.owner() == deployer, "MemePlatform owner mismatch");
        require(bondingCurve.owner() == deployer, "BondingCurve owner mismatch");
        require(address(memePlatform.memeFactory()) == address(memeFactory), "Factory reference mismatch");
        require(memeFactory.bondingCurveContract() == address(bondingCurve), "BondingCurve reference mismatch");
        require(bondingCurve.authorizedCallers(address(memeFactory)), "MemeFactory not authorized");
        require(bondingCurve.memePlatform() == address(memePlatform), "MemePlatform reference mismatch");
        
        // 6. 输出部署信息
        console.log("=== Deployment Summary ===");
        console.log("Deployer:", deployer);
        console.log("MemeFactory:", address(memeFactory));
        console.log("MemePlatform:", address(memePlatform));
        console.log("BondingCurve:", address(bondingCurve));
        console.log("Creation Fee:", CREATION_FEE);
        console.log("Platform Fee:", PLATFORM_FEE_PERCENTAGE, "basis points");
        console.log("Creator Fee:", CREATOR_FEE_PERCENTAGE, "basis points");
        
        vm.stopBroadcast();
        
        // 7. 生成前端配置文件
        generateFrontendConfig();
    }
    
    function generateFrontendConfig() internal view {
        console.log("\n=== Frontend Configuration ===");
        console.log("Add to your frontend .env file:");
        console.log("NEXT_PUBLIC_MEME_FACTORY_ADDRESS=", address(memeFactory));
        console.log("NEXT_PUBLIC_BONDING_CURVE_ADDRESS=", address(bondingCurve));
        console.log("NEXT_PUBLIC_MEME_PLATFORM_ADDRESS=", address(memePlatform));
        console.log("NEXT_PUBLIC_CREATION_FEE=", CREATION_FEE);
        console.log("NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE=", PLATFORM_FEE_PERCENTAGE);
        console.log("NEXT_PUBLIC_CREATOR_FEE_PERCENTAGE=", CREATOR_FEE_PERCENTAGE);
    }
} 