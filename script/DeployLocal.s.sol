// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import "../src/MemeFactory.sol";
import "../src/MemePlatform.sol";
import "../src/BondingCurve.sol";

/**
 * @title DeployLocalScript
 * @notice Anvil local network deployment script
 * @dev Deploy complete Meme token platform ecosystem using ETH
 */
contract DeployLocalScript is Script {
    // Deployment configuration
    uint256 public constant CREATION_FEE = 0.001 ether;
    uint256 public constant PLATFORM_FEE_PERCENTAGE = 200; // 2%
    uint256 public constant CREATOR_FEE_PERCENTAGE = 300;  // 3%
    
    // Deployed contract instances
    MemeFactory public memeFactory;
    MemePlatform public memePlatform;
    BondingCurve public bondingCurve;
    
    // Test accounts - changed from public to private
    address[] private accountAddresses;
    
    function setUp() public {}
    
    function run() public {
        console.log("Starting deployment to Anvil local testnet...");
        
        // Use default anvil test account
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deployer account:", deployer);
        console.log("Account balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy MemeFactory
        console.log("1. Deploying MemeFactory...");
        memeFactory = new MemeFactory();
        console.log("MemeFactory deployed:", address(memeFactory));
        
        // 2. Deploy MemePlatform
        console.log("2. Deploying MemePlatform...");
        memePlatform = new MemePlatform(payable(address(memeFactory)));
        console.log("MemePlatform deployed:", address(memePlatform));
        
        // 3. Deploy BondingCurve
        console.log("3. Deploying BondingCurve...");
        bondingCurve = new BondingCurve(address(memePlatform));
        console.log("BondingCurve deployed:", address(bondingCurve));
        
        // 4. Configure contract relationships
        console.log("4. Configuring contract relationships...");
        
        // Set MemeFactory's BondingCurve contract address
        memeFactory.setBondingCurveContract(address(bondingCurve));
        console.log("MemeFactory BondingCurve address set");
        
        // Authorize MemeFactory to call BondingCurve
        bondingCurve.addAuthorizedCaller(address(memeFactory));
        console.log("MemeFactory authorized for BondingCurve");
        
        // 5. Setup test accounts
        console.log("5. Setting up test accounts...");
        _setupTestAccounts();
        
        vm.stopBroadcast();
        
        // 6. Verify deployment
        console.log("6. Verifying deployment...");
        _verifyDeployment(deployer);
        
        // 7. Print deployment summary
        _printDeploymentSummary();
        
        // 8. Print testing guide
        _printTestingGuide();
    }
    
    /**
     * @notice Setup test accounts
     */
    function _setupTestAccounts() internal {
        // Prepare test account addresses (Anvil default accounts)
        accountAddresses = [
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8, // Account 1
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, // Account 2
            0x90F79bf6EB2c4f870365E785982E1f101E93b906, // Account 3
            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65, // Account 4
            0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc  // Account 5
        ];
        
        console.log("Test accounts prepared:", accountAddresses.length);
        for (uint256 i = 0; i < accountAddresses.length; i++) {
            console.log("Account", i + 1, ":", accountAddresses[i]);
            console.log("ETH balance:", accountAddresses[i].balance);
        }
    }
    
    function _verifyDeployment(address deployer) internal view {
        require(memeFactory.owner() == deployer, "MemeFactory owner mismatch");
        require(memePlatform.owner() == deployer, "MemePlatform owner mismatch");
        require(bondingCurve.owner() == deployer, "BondingCurve owner mismatch");
        
        require(address(memePlatform.memeFactory()) == address(memeFactory), "MemePlatform Factory reference mismatch");
        require(memeFactory.bondingCurveContract() == address(bondingCurve), "MemeFactory BondingCurve reference mismatch");
        require(bondingCurve.authorizedCallers(address(memeFactory)), "MemeFactory not authorized for BondingCurve");
        require(bondingCurve.memePlatform() == address(memePlatform), "BondingCurve MemePlatform reference mismatch");
        
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
        console.log("MemeFactory   :", address(memeFactory));
        console.log("MemePlatform  :", address(memePlatform));
        console.log("BondingCurve  :", address(bondingCurve));
        console.log("Configuration:");
        console.log("Creation Fee  :", CREATION_FEE);
        console.log("Platform Fee  :", PLATFORM_FEE_PERCENTAGE, "basis points (2%)");
        console.log("Creator Fee   :", CREATOR_FEE_PERCENTAGE, "basis points (3%)");
        console.log("Test Accounts:", accountAddresses.length);
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
        console.log("NEXT_PUBLIC_MEME_FACTORY_ADDRESS=", address(memeFactory));
        console.log("NEXT_PUBLIC_BONDING_CURVE_ADDRESS=", address(bondingCurve));
        console.log("NEXT_PUBLIC_MEME_PLATFORM_ADDRESS=", address(memePlatform));
        console.log("NEXT_PUBLIC_NETWORK_RPC=http://127.0.0.1:8545");
        console.log("NEXT_PUBLIC_CHAIN_ID=31337");
        console.log("Happy testing!");
    }
} 