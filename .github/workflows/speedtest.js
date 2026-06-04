// .github/workflows/speedtest.js

// 工具函数：sleep 延迟
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 核心测速函数：测量单个 IP 的响应时间
async function measureLatency(ip) {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(`http://${ip}/`, { method: 'HEAD', signal: controller.signal });
    const latency = Date.now() - start;
    console.log(`✅ ${ip} - ${latency}ms`);
    return { ip, latency, success: true };
  } catch (error) {
    console.log(`❌ ${ip} - 超时/失败`);
    return { ip, success: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

// 主函数
async function main() {
  console.log('🚀 开始获取 IP 列表...');
  try {
    // 1. 获取网页内容
    const response = await fetch('https://ip.164746.xyz/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await response.text();

    // 2. 解析 HTML，提取所有 IPv4 地址
    const ipRegex = /(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g;
    const allIps = [...new Set(html.match(ipRegex) || [])];
    console.log(`📋 共提取到 ${allIps.length} 个 IP 地址`);
    console.log(`🔍 IP 列表: ${allIps.join(', ')}`);

    if (allIps.length === 0) {
      throw new Error('未从网页中提取到任何 IP');
    }

    // 3. 并发测速（限制并发数量为 15，避免触发限流）
    const CONCURRENCY_LIMIT = 15;
    const results = [];
    for (let i = 0; i < allIps.length; i += CONCURRENCY_LIMIT) {
      const batch = allIps.slice(i, i + CONCURRENCY_LIMIT);
      const batchPromises = batch.map(ip => measureLatency(ip));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      await sleep(500); // 批次间延迟
    }

    // 4. 筛选出成功的 IP，并按延迟从小到大排序
    const successful = results.filter(r => r.success).sort((a, b) => a.latency - b.latency);
    const fastest = successful.slice(0, 5);

    // 5. 输出最终结果
    console.log('🏆 最快的 5 个 IP:');
    fastest.forEach((ip, idx) => {
      console.log(`   ${idx + 1}. ${ip.ip} (${ip.latency}ms)`);
    });

    // 可选：将结果保存为文件，供后续步骤使用
    const fs = require('fs');
    fs.writeFileSync('fastest-ips.json', JSON.stringify(fastest, null, 2));
    console.log('💾 结果已保存至 fastest-ips.json');
    
  } catch (error) {
    console.error('❌ 脚本运行失败:', error);
    process.exit(1);
  }
}

// 执行主函数
main();
