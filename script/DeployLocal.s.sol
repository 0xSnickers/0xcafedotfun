// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import "../src/MemeFactory.sol";
import "../src/MemePlatform.sol";
import "../src/BondingCurve.sol";
import "../src/LiquidityManager.sol";
import "../src/FeeManager.sol";

/**
 * @title DeployLocalScript
 * @notice Anvil local network deployment script
 * @dev Deploy complete Meme token platform ecosystem using ETH
 */
contract DeployLocalScript is Script {
    // Uniswap V2 地址（Anvil 本地部署）
    address constant UNISWAP_V2_ROUTER = 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0;
    
    // Deployment configuration
    uint256 public constant CREATION_FEE = 0.001 ether;
    uint256 public constant PLATFORM_FEE_PERCENTAGE = 200; // 2%
    uint256 public constant CREATOR_FEE_PERCENTAGE = 300;  // 3%
    
    // Deployed contract instances
    FeeManager public feeManager;
    MemeFactory public memeFactory;
    MemePlatform public memePlatform;
    BondingCurve public bondingCurve;
    LiquidityManager public liquidityManager;
    
    
    function setUp() public {}
    
    function run() public {
        console.log("Starting deployment to Anvil local testnet...");
        
        // Use default anvil test account
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY_LOCAL");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deployer account:", deployer);
        console.log("Account balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy FeeManager
        console.log("1. Deploying FeeManager...");
        feeManager = new FeeManager();
        console.log("FeeManager deployed:", address(feeManager));
        
        // 2. Deploy MemeFactory
        console.log("2. Deploying MemeFactory...");
        memeFactory = new MemeFactory();
        console.log("MemeFactory deployed:", address(memeFactory));
        
        // 3. Deploy MemePlatform
        console.log("3. Deploying MemePlatform...");
        memePlatform = new MemePlatform(payable(address(memeFactory)), address(feeManager));
        console.log("MemePlatform deployed:", address(memePlatform));
        
        // 4. Deploy LiquidityManager
        console.log("4. Deploying LiquidityManager...");
        liquidityManager = new LiquidityManager(UNISWAP_V2_ROUTER); // BondingCurve address will be set later
        console.log("LiquidityManager deployed:", address(liquidityManager));
        
        // 5. Deploy BondingCurve
        console.log("5. Deploying BondingCurve...");
        bondingCurve = new BondingCurve(
            address(feeManager), 
            address(liquidityManager)
        );
        console.log("BondingCurve deployed:", address(bondingCurve));
        bondingCurve.setMemeFactory(address(memeFactory));
        
        // 6. Configure contract relationships
        console.log("6. Configuring contract relationships...");
        
        // Set MemeFactory's BondingCurve contract address
        memeFactory.setBondingCurveContract(address(bondingCurve));
        console.log("MemeFactory BondingCurve address set");
        
        // Set LiquidityManager's BondingCurve address
        liquidityManager.setBondingCurve(address(bondingCurve));
        console.log("LiquidityManager BondingCurve address set");
        
        // 7. Setup test accounts
        console.log("7. Setting up test accounts...");
        
        vm.stopBroadcast();
        
        // 8. Verify deployment
        console.log("8. Verifying deployment...");
        _verifyDeployment(deployer);
        
        // 9. Print deployment summary
        _printDeploymentSummary();
        
        // 10. Print testing guide
        _printTestingGuide();
    }
    
    
    function _verifyDeployment(address deployer) internal view {
        require(memeFactory.owner() == deployer, "MemeFactory owner mismatch");
        require(memePlatform.owner() == deployer, "MemePlatform owner mismatch");
        require(bondingCurve.owner() == deployer, "BondingCurve owner mismatch");
        require(liquidityManager.owner() == deployer, "LiquidityManager owner mismatch");
        
        require(address(memePlatform.memeFactory()) == address(memeFactory), "MemePlatform Factory reference mismatch");
        require(memeFactory.bondingCurveContract() == address(bondingCurve), "MemeFactory BondingCurve reference mismatch");
        require(bondingCurve.memeFactory() == address(memeFactory), "BondingCurve MemeFactory reference mismatch");
        require(bondingCurve.liquidityManager() == address(liquidityManager), "BondingCurve LiquidityManager reference mismatch");
        require(liquidityManager.bondingCurve() == address(bondingCurve), "LiquidityManager BondingCurve reference mismatch");
        
        console.log("All contract deployment verification passed");
    }
    
    /**
     * @notice Print deployment summary
     */
    function _printDeploymentSummary() internal view {
        console.log("===== Deployment Summary =====");
        console.log("Network: Anvil Local Testnet");
        console.log("RPC URL: http://127.0.0.1:8545");
        console.log("Chain ID: 31337");
        console.log("Contract Addresses:");
        console.log("FeeManager       :", address(feeManager));
        console.log("MemeFactory      :", address(memeFactory));
        console.log("MemePlatform     :", address(memePlatform));
        console.log("BondingCurve     :", address(bondingCurve));
        console.log("LiquidityManager :", address(liquidityManager));
        console.log("Configuration:");
        console.log("Creation Fee     :", CREATION_FEE);
        console.log("Platform Fee     :", PLATFORM_FEE_PERCENTAGE, "basis points (2%)");
        console.log("Creator Fee      :", CREATOR_FEE_PERCENTAGE, "basis points (3%)");
        console.log("Uniswap V2 Router:", UNISWAP_V2_ROUTER);
    }
    
    /**
     * @notice Print testing guide
     */
    function _printTestingGuide() internal view {
        console.log("===== Testing Guide =====");
        console.log("1. Start Anvil: anvil");
        console.log("2. Deploy: forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast");
        console.log("3. Test: forge test --rpc-url http://127.0.0.1:8545");
        console.log("Test Account Private Keys:");
        console.log("Account1: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
        console.log("Account2: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
        console.log("Account3: 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
        console.log("Frontend Environment Variables:");
        console.log("NEXT_PUBLIC_FEE_MANAGER_ADDRESS=", address(feeManager));
        console.log("NEXT_PUBLIC_MEME_FACTORY_ADDRESS=", address(memeFactory));
        console.log("NEXT_PUBLIC_BONDING_CURVE_ADDRESS=", address(bondingCurve));
        console.log("NEXT_PUBLIC_MEME_PLATFORM_ADDRESS=", address(memePlatform));
        console.log("NEXT_PUBLIC_LIQUIDITY_MANAGER_ADDRESS=", address(liquidityManager));
        console.log("NEXT_PUBLIC_NETWORK_RPC=http://127.0.0.1:8545");
        console.log("NEXT_PUBLIC_CHAIN_ID=31337");
        console.log("Happy testing!");
    }
} 