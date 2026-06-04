// .github/workflows/speedtest.js

const fs = require('fs');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 测速单个 IP（返回延迟，单位 ms）
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

// 从 HTML 表格中提取 IP 和对应的节点注释
function extractIpsWithComments(html) {
  // 简单正则匹配：<td>IP</td><td>节点</td> 或类似结构
  // 实际网页结构为 <tr><td>IP地址</td><td>节点</td><td>测速1</td>...</tr>
  // 我们用更稳健的方式：按行匹配
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const ipComments = [];
  for (const row of rows) {
    // 跳过表头
    if (row.includes('IP地址') && row.includes('节点')) continue;
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 2) continue;
    let ip = '', comment = '';
    for (let i = 0; i < cells.length; i++) {
      const cellText = cells[i].replace(/<[^>]*>/g, '').trim();
      if (i === 0 && /^(\d{1,3}\.){3}\d{1,3}$/.test(cellText)) {
        ip = cellText;
      } else if (i === 1 && cellText) {
        comment = cellText;
        break; // 找到注释就停止
      }
    }
    if (ip && comment) {
      ipComments.push({ ip, comment });
    }
  }
  return ipComments;
}

async function main() {
  console.log('🚀 开始获取 IP 及节点信息...');
  try {
    // 1. 获取网页
    const response = await fetch('https://ip.164746.xyz/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await response.text();

    // 2. 提取 IP + 注释
    const ipList = extractIpsWithComments(html);
    console.log(`📋 共提取到 ${ipList.length} 个 IP（含注释）`);
    if (ipList.length === 0) throw new Error('未提取到任何 IP 及注释');

    // 3. 并发测速（限制并发数）
    const CONCURRENCY_LIMIT = 15;
    const results = [];
    for (let i = 0; i < ipList.length; i += CONCURRENCY_LIMIT) {
      const batch = ipList.slice(i, i + CONCURRENCY_LIMIT);
      const batchPromises = batch.map(item => measureLatency(item.ip));
      const batchResults = await Promise.all(batchPromises);
      // 合并注释信息
      for (let j = 0; j < batch.length; j++) {
        if (batchResults[j].success) {
          results.push({
            ip: batchResults[j].ip,
            latency: batchResults[j].latency,
            comment: batch[j].comment
          });
        }
      }
      await sleep(500);
    }

    // 4. 排序取最快 5 个
    results.sort((a, b) => a.latency - b.latency);
    const fastest = results.slice(0, 5);

    console.log('🏆 最快的 5 个 IP（含注释）:');
    fastest.forEach((item, idx) => {
      console.log(`   ${idx+1}. ${item.ip}  #${item.comment}  (${item.latency}ms)`);
    });

    // 5. 写入目标文件（格式：IP#注释）
    const outputLines = fastest.map(item => `${item.ip}#${item.comment}`);
    fs.writeFileSync('fastest-ips.txt', outputLines.join('\n') + '\n');
    console.log('💾 结果已写入 fastest-ips.txt');

    // 可选：同时生成 JSON 便于其他用途
    fs.writeFileSync('fastest-ips.json', JSON.stringify(fastest, null, 2));

  } catch (error) {
    console.error('❌ 脚本运行失败:', error);
    process.exit(1);
  }
}

main();
