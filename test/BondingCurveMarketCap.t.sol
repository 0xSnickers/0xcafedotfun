// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "forge-std/Test.sol";
import "../src/MemeFactory.sol";
import "../src/MemePlatform.sol";
import "../src/BondingCurve.sol";
import "../src/MemeToken.sol";

/**
 * @title BondingCurveMarketCapTest
 * @notice 专门测试新的10 ETH市值毕业逻辑的详细测试
 */
contract BondingCurveMarketCapTest is Test {
    MemeFactory public memeFactory;
    MemePlatform public memePlatform;
    BondingCurve public bondingCurve;
    
    address public owner;
    address public creator = makeAddr("creator");
    address public buyer1 = makeAddr("buyer1");
    address public buyer2 = makeAddr("buyer2");
    address public buyer3 = makeAddr("buyer3");
    
    uint256 public constant CREATION_FEE = 0.001 ether;
    uint256 public constant TARGET_MARKET_CAP = 10 ether;
    
    // 测试代币参数
    uint256 public constant TEST_TARGET_SUPPLY = 1000000 * 1e18;
    uint256 public constant TEST_TARGET_PRICE = 0.001 ether;
    uint256 public constant TEST_INITIAL_PRICE = 0.0000001 ether;
    
    event TokenGraduatedByMarketCap(
        address indexed token,
        uint256 finalSupply,
        uint256 totalRaised,
        uint256 marketCap
    );
    
    function setUp() public {
        owner = address(this);
        
        // Deploy contracts
        memeFactory = new MemeFactory();
        memePlatform = new MemePlatform(payable(address(memeFactory)));
        bondingCurve = new BondingCurve(address(memePlatform));
        
        // Setup
        memeFactory.setBondingCurveContract(address(bondingCurve));
        bondingCurve.addAuthorizedCaller(address(memeFactory));
        
        // Fund test accounts
        vm.deal(creator, 100 ether);
        vm.deal(buyer1, 100 ether);
        vm.deal(buyer2, 100 ether);
        vm.deal(buyer3, 100 ether);
    }
    
    function _createTestToken(string memory name, string memory symbol, bytes32 salt) 
        internal returns (address) {
        vm.startPrank(creator);
        address tokenAddress = memePlatform.createMemeToken{value: CREATION_FEE}(
            name,
            symbol,
            18,
            "https://example.com/test.png",
            "Test token for market cap graduation",
            salt,
            TEST_TARGET_SUPPLY,
            TEST_TARGET_PRICE,
            TEST_INITIAL_PRICE
        );
        vm.stopPrank();
        return tokenAddress;
    }
    
    function testMarketCapConstant() public {
        assertEq(bondingCurve.TARGET_MARKET_CAP(), TARGET_MARKET_CAP);
    }
    
    function testInitialMarketCapIsZero() public {
        address token = _createTestToken("Test", "TEST", keccak256("test"));
        
        uint256 marketCap = bondingCurve.getCurrentMarketCap(token);
        assertEq(marketCap, 0, "Initial market cap should be 0");
        
        bool shouldGraduate = bondingCurve.checkGraduationCondition(token);
        assertFalse(shouldGraduate, "Should not graduate initially");
    }
    
    function testMarketCapCalculationAccuracy() public {
        address token = _createTestToken("Math Test", "MATH", keccak256("math"));
        
        // Purchase some tokens
        vm.startPrank(buyer1);
        uint256 purchaseAmount = 1 ether;
        bondingCurve.buyTokens{value: purchaseAmount}(token, 0);
        vm.stopPrank();
        
        // Verify market cap calculation
        (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(token);
        uint256 currentPrice = bondingCurve.getCurrentPrice(token);
        uint256 expectedMarketCap = (currentPrice * params.currentSupply) / 1e18;
        uint256 actualMarketCap = bondingCurve.getCurrentMarketCap(token);
        
        assertEq(actualMarketCap, expectedMarketCap, "Market cap calculation should be accurate");
        assertTrue(actualMarketCap > 0, "Market cap should be positive after purchase");
        assertTrue(actualMarketCap < TARGET_MARKET_CAP, "Should not graduate with small purchase");
    }
    
    function testExactMarketCapGraduation() public {
        address token = _createTestToken("Exact Test", "EXACT", keccak256("exact"));
        
        // 使用较高的初始价格来更容易控制市值
        vm.startPrank(creator);
        address precisToken = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Precise Test",
            "PRECISE",
            18,
            "https://example.com/precise.png",
            "Precise graduation test",
            keccak256("precise"),
            100000 * 1e18,     // 较小的supply
            0.001 ether,       // target price
            0.00001 ether      // 较高的初始价格
        );
        vm.stopPrank();
        
        // 逐步购买接近10 ETH市值
        vm.startPrank(buyer1);
        
        uint256 totalPurchases = 0;
        bool graduated = false;
        
        // 分多次小额购买，精确控制市值
        for (uint256 i = 0; i < 20 && !graduated; i++) {
            uint256 currentMarketCap = bondingCurve.getCurrentMarketCap(precisToken);
            console.log("Current market cap:", currentMarketCap);
            console.log("Target market cap:", TARGET_MARKET_CAP);
            
            if (currentMarketCap >= TARGET_MARKET_CAP * 95 / 100) { // 接近95%时
                // 期望毕业事件
                vm.expectEmit(true, false, false, false);
                emit TokenGraduatedByMarketCap(precisToken, 0, 0, 0);
            }
            
            bondingCurve.buyTokens{value: 1 ether}(precisToken, 0);
            totalPurchases += 1 ether;
            
            (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(precisToken);
            if (params.graduated) {
                graduated = true;
                uint256 finalMarketCap = bondingCurve.getCurrentMarketCap(precisToken);
                console.log("Graduated at market cap:", finalMarketCap);
                console.log("Total ETH spent:", totalPurchases);
                
                // 验证毕业时市值确实达到或超过10 ETH
                assertGe(finalMarketCap, TARGET_MARKET_CAP, "Market cap should be >= 10 ETH at graduation");
                break;
            }
        }
        
        vm.stopPrank();
        
        assertTrue(graduated, "Token should have graduated");
    }
    
    function testGraduationEventData() public {
        address token = _createTestToken("Event Test", "EVENT", keccak256("event"));
        
        // 修改为更容易毕业的参数
        vm.startPrank(creator);
        address eventToken = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Event Token",
            "EVT",
            18,
            "https://example.com/event.png",
            "Event testing token",
            keccak256("event-token"),
            50000 * 1e18,      // 很小的supply
            0.001 ether,
            0.0001 ether       // 高初始价格
        );
        vm.stopPrank();
        
        vm.startPrank(buyer1);
        
        // 大额购买触发毕业，并验证事件数据
        vm.recordLogs();
        bondingCurve.buyTokens{value: 20 ether}(eventToken, 0);
        
        Vm.Log[] memory logs = vm.getRecordedLogs();
        
        // 查找毕业事件
        bool graduationEventFound = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("TokenGraduatedByMarketCap(address,uint256,uint256,uint256)")) {
                graduationEventFound = true;
                
                // 解码事件数据
                address eventTokenAddr = address(uint160(uint256(logs[i].topics[1])));
                (uint256 finalSupply, uint256 totalRaised, uint256 marketCap) = 
                    abi.decode(logs[i].data, (uint256, uint256, uint256));
                
                assertEq(eventTokenAddr, eventToken, "Event should be for correct token");
                assertTrue(finalSupply > 0, "Final supply should be positive");
                assertTrue(totalRaised > 0, "Total raised should be positive");
                assertGe(marketCap, TARGET_MARKET_CAP, "Market cap in event should be >= 10 ETH");
                
                console.log("Graduation event data:");
                console.log("  Final supply:", finalSupply);
                console.log("  Total raised:", totalRaised);
                console.log("  Market cap:", marketCap);
                break;
            }
        }
        
        assertTrue(graduationEventFound, "Graduation event should be emitted");
        vm.stopPrank();
    }
    
    function testPostGraduationBehavior() public {
        address token = _createTestToken("Post Grad", "PGRAD", keccak256("postgrad"));
        
        // 创建容易毕业的代币
        vm.startPrank(creator);
        address gradToken = memePlatform.createMemeToken{value: CREATION_FEE}(
            "Graduate Token",
            "GRAD",
            18,
            "https://example.com/grad.png",
            "Will graduate quickly",
            keccak256("quick-grad"),
            30000 * 1e18,
            0.001 ether,
            0.0002 ether
        );
        vm.stopPrank();
        
        // 触发毕业
        vm.startPrank(buyer1);
        bondingCurve.buyTokens{value: 25 ether}(gradToken, 0);
        vm.stopPrank();
        
        // 验证毕业状态
        (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(gradToken);
        assertTrue(params.graduated, "Token should be graduated");
        
        // 验证毕业检查函数返回false（已毕业的代币不应再检查毕业）
        bool shouldGraduate = bondingCurve.checkGraduationCondition(gradToken);
        assertFalse(shouldGraduate, "Graduated token should not need further graduation");
        
        // 尝试继续购买应该失败
        vm.startPrank(buyer2);
        vm.expectRevert("Token has graduated");
        bondingCurve.buyTokens{value: 1 ether}(gradToken, 0);
        vm.stopPrank();
        
        // 尝试卖出应该失败
        vm.startPrank(buyer1);
        MemeToken memeToken = MemeToken(gradToken);
        uint256 balance = memeToken.balanceOf(buyer1);
        if (balance > 0) {
            memeToken.approve(address(bondingCurve), balance);
            vm.expectRevert("Token has graduated");
            bondingCurve.sellTokens(gradToken, balance / 2, 0);
        }
        vm.stopPrank();
    }
    
    function testMultipleTokensGraduationSequence() public {
        // 创建多个代币，验证独立毕业
        address[] memory tokens = new address[](3);
        
        vm.startPrank(creator);
        for (uint256 i = 0; i < 3; i++) {
            tokens[i] = memePlatform.createMemeToken{value: CREATION_FEE}(
                string(abi.encodePacked("Token ", i)),
                string(abi.encodePacked("TOK", i)),
                18,
                "https://example.com/multi.png",
                "Multi token test",
                keccak256(abi.encodePacked("multi-", i)),
                (i + 1) * 50000 * 1e18,           // 不同的supply
                0.001 ether,
                (i + 1) * 0.00005 ether           // 不同的初始价格
            );
        }
        vm.stopPrank();
        
        // 让第二个代币先毕业
        vm.startPrank(buyer1);
        bondingCurve.buyTokens{value: 15 ether}(tokens[1], 0);
        vm.stopPrank();
        
        // 验证只有第二个代币毕业
        for (uint256 i = 0; i < 3; i++) {
            (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(tokens[i]);
            if (i == 1) {
                assertTrue(params.graduated, "Token 1 should be graduated");
            } else {
                assertFalse(params.graduated, "Other tokens should not be graduated");
            }
        }
        
        // 其他代币应该仍可交易
        vm.startPrank(buyer2);
        bondingCurve.buyTokens{value: 1 ether}(tokens[0], 0);
        bondingCurve.buyTokens{value: 1 ether}(tokens[2], 0);
        vm.stopPrank();
    }
    
    function testPriceProgressionTowardGraduation() public {
        address token = _createTestToken("Price Test", "PRICE", keccak256("price"));
        
        // 记录价格和市值的变化
        uint256[] memory marketCaps = new uint256[](6);
        uint256[] memory prices = new uint256[](6);
        
        // 初始状态
        marketCaps[0] = bondingCurve.getCurrentMarketCap(token);
        prices[0] = bondingCurve.getCurrentPrice(token);
        
        // 分次购买，观察价格和市值变化，直到毕业
        bool graduated = false;
        uint256 completedPurchases = 0;
        
        for (uint256 i = 1; i <= 5 && !graduated; i++) {
            vm.startPrank(buyer1);
            
            // 检查是否已毕业，如果已毕业则停止购买
            (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(token);
            if (params.graduated) {
                graduated = true;
                break;
            }
            
            bondingCurve.buyTokens{value: 2 ether}(token, 0);
            vm.stopPrank();
            
            marketCaps[i] = bondingCurve.getCurrentMarketCap(token);
            prices[i] = bondingCurve.getCurrentPrice(token);
            completedPurchases = i;
            
            console.log("After purchase", i);
            console.log("  Price:", prices[i]);
            console.log("  Market cap:", marketCaps[i]);
            console.log("  Progress to graduation:", (marketCaps[i] * 100) / TARGET_MARKET_CAP, "%");
            
            // 检查是否在这次购买后毕业
            (params,,,) = bondingCurve.getTokenDetails(token);
            if (params.graduated) {
                graduated = true;
                console.log("  *** GRADUATED ***");
                break;
            }
        }
        
        // 验证价格和市值递增（直到毕业前）
        for (uint256 i = 1; i <= completedPurchases; i++) {
            assertTrue(prices[i] > prices[i-1], "Price should increase with each purchase");
            assertTrue(marketCaps[i] > marketCaps[i-1], "Market cap should increase with each purchase");
        }
        
        // 如果达到毕业条件，验证毕业状态
        if (graduated) {
            (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(token);
            assertTrue(params.graduated, "Should be graduated if market cap >= 10 ETH");
            uint256 finalMarketCap = bondingCurve.getCurrentMarketCap(token);
            assertGe(finalMarketCap, TARGET_MARKET_CAP, "Final market cap should be >= 10 ETH");
        }
    }
    
    function testEdgeCaseVerySmallPurchases() public {
        address token = _createTestToken("Edge Case", "EDGE", keccak256("edge"));
        
        // 很多小额购买
        vm.startPrank(buyer1);
        for (uint256 i = 0; i < 50; i++) {
            // 检查是否已毕业
            (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(token);
            if (params.graduated) {
                assertTrue(true, "Token graduated with small purchases");
                break;
            }
            
            bondingCurve.buyTokens{value: 0.1 ether}(token, 0);
            
            uint256 marketCap = bondingCurve.getCurrentMarketCap(token);
            if (marketCap >= TARGET_MARKET_CAP) {
                (params,,,) = bondingCurve.getTokenDetails(token);
                assertTrue(params.graduated, "Should graduate when market cap reaches 10 ETH");
                break;
            }
        }
        vm.stopPrank();
    }
    
    function testMarketCapNeverExceedsReasonableBounds() public {
        address token = _createTestToken("Bounds Test", "BOUNDS", keccak256("bounds"));
        
        // 大额购买
        vm.startPrank(buyer1);
        bondingCurve.buyTokens{value: 50 ether}(token, 0);
        vm.stopPrank();
        
        uint256 marketCap = bondingCurve.getCurrentMarketCap(token);
        
        // 虽然可能超过10 ETH（因为购买是原子的），但不应该超过过分的范围
        assertTrue(marketCap >= TARGET_MARKET_CAP, "Should be >= 10 ETH");
        // 调整上限，考虑到大额购买可能导致较高的市值
        assertTrue(marketCap <= 1000 ether, "Should not exceed extremely high bounds");
        
        (BondingCurve.CurveParams memory params,,,) = bondingCurve.getTokenDetails(token);
        assertTrue(params.graduated, "Should be graduated");
        
        console.log("Final market cap after large purchase:", marketCap);
    }
} 