// .github/workflows/speedtest.js

const fs = require('fs');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 测速单个 IP
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

// 更通用的提取方法：先提取所有IP，再根据位置查找附近的中文/英文注释
function extractIpsWithComments(html) {
  // 1. 提取所有 IPv4 地址
  const ipRegex = /(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g;
  const allMatches = [...html.matchAll(ipRegex)];
  
  if (allMatches.length === 0) return [];
  
  // 2. 为每个 IP 尝试提取周围的注释文本
  const ipComments = [];
  const visitedIps = new Set();
  
  for (const match of allMatches) {
    const ip = match[0];
    if (visitedIps.has(ip)) continue;
    visitedIps.add(ip);
    
    // 获取 IP 周围 200 个字符的上下文
    const startPos = Math.max(0, match.index - 200);
    const endPos = Math.min(html.length, match.index + 200);
    const context = html.substring(startPos, endPos);
    
    // 在上下文中查找可能的中文注释（节点名称）
    // 匹配 <td>内容</td> 或 空白+中文/英文文字
    let comment = 'Unknown';
    
    // 优先查找：右邻的 <td> 或 左邻的 <td>
    const tdMatch = context.match(/<\/td>\s*<td[^>]*>([^<]+)</i) || 
                    context.match(/<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>/i);
    if (tdMatch && tdMatch[1] && tdMatch[1].trim()) {
      comment = tdMatch[1].trim();
    } else {
      // 查找中文字符或常见节点关键词
      const chineseMatch = context.match(/[\u4e00-\u9fa5]{2,}/);
      if (chineseMatch) comment = chineseMatch[0];
      
      // 查找英文关键词
      const englishMatch = context.match(/CF\s+\w+|移动|联通|电信|优选|普通/i);
      if (englishMatch) comment = englishMatch[0];
    }
    
    // 清理注释（去掉HTML标签和多余空格）
    comment = comment.replace(/<[^>]*>/g, '').trim();
    if (comment.length > 50) comment = comment.substring(0, 50);
    
    ipComments.push({ ip, comment });
  }
  
  console.log(`📋 提取到 ${ipComments.length} 个 IP（含注释）`);
  if (ipComments.length > 0) {
    console.log(`   示例: ${ipComments[0].ip} -> ${ipComments[0].comment}`);
  }
  
  return ipComments;
}

async function main() {
  console.log('🚀 开始获取 IP 及节点信息...');
  try {
    // 1. 获取网页
    const response = await fetch('https://ip.164746.xyz/', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    
    // 调试：保存原始HTML（可选，用于排查问题）
    // fs.writeFileSync('debug.html', html);
    
    // 2. 提取 IP + 注释
    const ipList = extractIpsWithComments(html);
    if (ipList.length === 0) {
      // 降级方案：如果没有找到注释，至少提取IP并用默认注释
      const ipRegex = /(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g;
      const ips = [...new Set(html.match(ipRegex) || [])];
      if (ips.length === 0) throw new Error('未提取到任何 IP');
      
      console.log(`⚠️ 未找到注释，使用默认注释，共 ${ips.length} 个 IP`);
      for (const ip of ips) {
        ipList.push({ ip, comment: 'CDN节点' });
      }
    }
    
    // 3. 并发测速
    const CONCURRENCY_LIMIT = 10;
    const results = [];
    for (let i = 0; i < ipList.length; i += CONCURRENCY_LIMIT) {
      const batch = ipList.slice(i, i + CONCURRENCY_LIMIT);
      const batchPromises = batch.map(item => measureLatency(item.ip));
      const batchResults = await Promise.all(batchPromises);
      
      for (let j = 0; j < batch.length; j++) {
        if (batchResults[j].success) {
          results.push({
            ip: batchResults[j].ip,
            latency: batchResults[j].latency,
            comment: batch[j].comment
          });
        }
      }
      await sleep(1000); // 批次间延迟1秒
    }
    
    if (results.length === 0) {
      throw new Error('所有 IP 测速均失败');
    }
    
    // 4. 排序取最快 5 个
    results.sort((a, b) => a.latency - b.latency);
    const fastest = results.slice(0, 5);
    
    console.log('🏆 最快的 5 个 IP（含注释）:');
    fastest.forEach((item, idx) => {
      console.log(`   ${idx+1}. ${item.ip}  #${item.comment}  (${item.latency}ms)`);
    });
    
    // 5. 写入目标文件
    const outputLines = fastest.map(item => `${item.ip}#${item.comment}`);
    fs.writeFileSync('fastest-ips.txt', outputLines.join('\n') + '\n');
    console.log('💾 结果已写入 fastest-ips.txt');
    
    // 可选：输出JSON
    fs.writeFileSync('fastest-ips.json', JSON.stringify(fastest, null, 2));
    
  } catch (error) {
    console.error('❌ 脚本运行失败:', error);
    process.exit(1);
  }
}

main();
