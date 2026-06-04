// .github/workflows/speedtest.js

const fs = require('fs');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 下载测速：下载一个小文件，计算实际速度 (Mbps)
async function measureDownloadSpeed(ip, testFileSizeMB = 0.5) {
  // 使用一个常见的测速文件路径（根据实际网站调整）
  // 通常 CDN 测试会使用 /speedtest/random400x400.jpg 或类似路径
  const testUrl = `http://${ip}/speedtest/random400x400.jpg`;
  // 或者使用一个固定大小的测试文件（如果存在）
  // const testUrl = `http://${ip}/100kb.bin`;
  
  const start = Date.now();
  let totalBytes = 0;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    const response = await fetch(testUrl, {
      method: 'GET',
      signal: controller.signal
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const reader = response.body.getReader();
    let bytesReceived = 0;
    
    // 读取数据直到完成或达到最大时间
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesReceived += value.length;
      totalBytes = bytesReceived;
      
      // 如果下载超过 5 秒且已收到足够数据，可以提前结束
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed > 5 && totalBytes > 500 * 1024) break;
    }
    
    clearTimeout(timeoutId);
    const elapsedSeconds = (Date.now() - start) / 1000;
    
    if (elapsedSeconds === 0 || totalBytes === 0) {
      throw new Error('下载数据为空');
    }
    
    // 计算速度：字节数 * 8 / 时间(秒) / 1,000,000 = Mbps
    const speedMbps = (totalBytes * 8) / elapsedSeconds / 1000000;
    
    console.log(`✅ ${ip} - ${speedMbps.toFixed(2)} Mbps (${(totalBytes / 1024).toFixed(0)}KB / ${elapsedSeconds.toFixed(2)}s)`);
    return { ip, speedMbps, success: true, totalBytes, elapsedSeconds };
    
  } catch (error) {
    console.log(`❌ ${ip} - 下载失败: ${error.message}`);
    return { ip, speedMbps: 0, success: false };
  }
}

// 从 HTML 中提取 IP 和对应的注释
function extractIpsWithComments(html) {
  const ipRegex = /(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g;
  const allMatches = [...html.matchAll(ipRegex)];
  
  if (allMatches.length === 0) return [];
  
  const ipComments = [];
  const visitedIps = new Set();
  
  for (const match of allMatches) {
    const ip = match[0];
    if (visitedIps.has(ip)) continue;
    visitedIps.add(ip);
    
    const startPos = Math.max(0, match.index - 200);
    const endPos = Math.min(html.length, match.index + 200);
    const context = html.substring(startPos, endPos);
    
    let comment = 'CDN节点';
    
    // 查找中文注释
    const tdMatch = context.match(/<\/td>\s*<td[^>]*>([^<]+)</i) || 
                    context.match(/<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>/i);
    if (tdMatch && tdMatch[1] && tdMatch[1].trim()) {
      comment = tdMatch[1].trim();
    } else {
      const chineseMatch = context.match(/[\u4e00-\u9fa5]{2,}/);
      if (chineseMatch) comment = chineseMatch[0];
      
      const englishMatch = context.match(/CF\s+\w+|移动|联通|电信|优选|普通/i);
      if (englishMatch) comment = englishMatch[0];
    }
    
    comment = comment.replace(/<[^>]*>/g, '').trim();
    if (comment.length > 50) comment = comment.substring(0, 50);
    if (!comment || comment.length === 0) comment = 'CDN节点';
    
    ipComments.push({ ip, comment });
  }
  
  console.log(`📋 提取到 ${ipComments.length} 个 IP（含注释）`);
  if (ipComments.length > 0) {
    console.log(`   示例: ${ipComments[0].ip} -> ${ipComments[0].comment}`);
  }
  
  return ipComments;
}

async function main() {
  console.log('🚀 开始获取 IP 并测试下载速度...');
  console.log('📊 将测试各节点的实际下载速度 (Mbps)');
  
  try {
    // 1. 获取网页
    const response = await fetch('https://ip.164746.xyz/', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    
    // 2. 提取 IP + 注释
    let ipList = extractIpsWithComments(html);
    if (ipList.length === 0) {
      const ipRegex = /(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g;
      const ips = [...new Set(html.match(ipRegex) || [])];
      if (ips.length === 0) throw new Error('未提取到任何 IP');
      
      console.log(`⚠️ 未找到注释，使用默认注释，共 ${ips.length} 个 IP`);
      ipList = ips.map(ip => ({ ip, comment: 'CDN节点' }));
    }
    
    // 限制最多测试 30 个 IP，避免时间过长
    if (ipList.length > 30) {
      console.log(`⚠️ IP 数量过多 (${ipList.length})，随机选取 30 个进行测试`);
      ipList = ipList.sort(() => 0.5 - Math.random()).slice(0, 30);
    }
    
    // 3. 并发测速（限制并发数，避免网络拥堵）
    const CONCURRENCY_LIMIT = 3;  // 下载测速并发数要小一些
    const results = [];
    
    for (let i = 0; i < ipList.length; i += CONCURRENCY_LIMIT) {
      const batch = ipList.slice(i, i + CONCURRENCY_LIMIT);
      console.log(`\n📡 测试批次 ${Math.floor(i/CONCURRENCY_LIMIT)+1}/${Math.ceil(ipList.length/CONCURRENCY_LIMIT)}`);
      
      const batchPromises = batch.map(item => measureDownloadSpeed(item.ip));
      const batchResults = await Promise.all(batchPromises);
      
      for (let j = 0; j < batch.length; j++) {
        if (batchResults[j].success && batchResults[j].speedMbps > 0) {
          results.push({
            ip: batchResults[j].ip,
            speedMbps: batchResults[j].speedMbps,
            comment: batch[j].comment
          });
        }
      }
      await sleep(2000); // 批次间延迟2秒
    }
    
    if (results.length === 0) {
      throw new Error('所有 IP 测速均失败');
    }
    
    // 4. 按下载速度从高到低排序，取最快的 5 个
    results.sort((a, b) => b.speedMbps - a.speedMbps);
    const fastest = results.slice(0, 5);
    
    console.log('\n🏆 下载速度最快的 5 个 IP:');
    fastest.forEach((item, idx) => {
      console.log(`   ${idx+1}. ${item.ip}  # ${item.speedMbps.toFixed(2)} Mbps  # ${item.comment}`);
    });
    
    // 5. 写入文件（格式：IP#下载速度 Mbps#注释）
    const outputLines = fastest.map(item => `${item.ip}#${item.speedMbps.toFixed(2)} Mbps#${item.comment}`);
    fs.writeFileSync('fastest-ips.txt', outputLines.join('\n') + '\n');
    console.log('\n💾 结果已写入 fastest-ips.txt');
    console.log('📄 格式: IP#下载速度#注释');
    
    // 可选：输出 JSON
    fs.writeFileSync('fastest-ips.json', JSON.stringify(fastest, null, 2));
    
  } catch (error) {
    console.error('❌ 脚本运行失败:', error);
    process.exit(1);
  }
}

main();
