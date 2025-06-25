#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:9000/api/monitor';

async function testAPI() {
    console.log('🧪 Testing Liquidity Monitor API\n');

    try {
        // 测试状态 API
        console.log('1. 🔍 Testing status endpoint...');
        const statusResponse = await axios.get(`${BASE_URL}/status`);
        console.log('   Status:', statusResponse.data);
        console.log('');

        // 测试手动添加流动性 API
        console.log('2. 🔧 Testing manual liquidity addition...');
        try {
            const manualResponse = await axios.post(`${BASE_URL}/manual`, {
                tokenAddress: '0x1234567890123456789012345678901234567890'
            });
            console.log('   Manual response:', manualResponse.data);
        } catch (error) {
            console.log('   Expected error (demo token):', error.response?.data || error.message);
        }
        console.log('');

        // 测试重启 API
        console.log('3. 🔄 Testing restart endpoint...');
        try {
            const restartResponse = await axios.post(`${BASE_URL}/restart`);
            console.log('   Restart response:', restartResponse.data);
        } catch (error) {
            console.log('   Error:', error.response?.data || error.message);
        }
        console.log('');

        // 再次检查状态
        console.log('4. 🔍 Checking status after restart...');
        const finalStatusResponse = await axios.get(`${BASE_URL}/status`);
        console.log('   Final status:', finalStatusResponse.data);

    } catch (error) {
        console.error('❌ API test failed:', error.message);
        console.log('💡 Make sure the server is running: npm run dev');
    }
}

// 运行测试
testAPI();

console.log('\n📋 Available API endpoints:');
console.log('   GET  /api/monitor/status     - Check monitor status');
console.log('   POST /api/monitor/manual     - Manually add liquidity for token');
console.log('   POST /api/monitor/restart    - Restart monitor');
console.log('   POST /api/monitor/stop       - Stop monitor');
console.log('   POST /api/monitor/start      - Start monitor');
console.log('\n📝 Example usage:');
console.log('   curl http://localhost:9000/api/monitor/status');
console.log('   curl -X POST http://localhost:9000/api/monitor/manual \\');
console.log('        -H "Content-Type: application/json" \\');
console.log('        -d \'{"tokenAddress": "0x..."}\''); 