const http = require('http');

// 测试局域网RPC连接
const rpcUrl = 'http://192.168.5.34:8545';

const testRPC = () => {
  const data = JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_blockNumber",
    params: [],
    id: 1
  });

  const options = {
    hostname: '192.168.5.34',
    port: 8545,
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  console.log('Testing RPC connection to:', rpcUrl);
  
  const req = http.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      console.log('Response:', responseData);
      try {
        const parsed = JSON.parse(responseData);
        console.log('Block Number:', parseInt(parsed.result, 16));
      } catch (err) {
        console.error('Failed to parse response:', err);
      }
    });
  });

  req.on('error', (error) => {
    console.error('Request failed:', error);
  });

  req.write(data);
  req.end();
};

// 测试合约读取
const testContractRead = () => {
  const data = JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_call",
    params: [{
      to: "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9", // MEME_FACTORY_ADDRESS
      data: "0x8da5cb5b" // owner() function selector
    }, "latest"],
    id: 2
  });

  const options = {
    hostname: '192.168.5.34',
    port: 8545,
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  console.log('\nTesting contract read...');
  
  const req = http.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      console.log('Contract Response:', responseData);
    });
  });

  req.on('error', (error) => {
    console.error('Contract request failed:', error);
  });

  req.write(data);
  req.end();
};

testRPC();
setTimeout(() => testContractRead(), 2000);
