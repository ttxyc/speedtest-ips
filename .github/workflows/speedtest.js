// .github/workflows/speedtest.js

const fs = require('fs');

// 从 HTML 表格中提取 IP、节点注释和各测速列的速度值
function extractIpSpeedData(html) {
  // 匹配所有表格行
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];
  
  const ipData = [];
  
  for (const row of rows) {
    // 跳过表头行
    if (row.includes('IP地址') && row.includes('节点')) continue;
    
    // 提取所有单元格内容
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      // 清理 HTML 标签和空白
      let content = cellMatch[1].replace(/<[^>]*>/g, '').trim();
      cells.push(content);
    }
    
    if (cells.length < 3) continue;
    
    // 第1列：IP地址
    const ip = cells[0];
    // 验证是否是有效的 IP 格式
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) continue;
    
    // 第2列：节点注释
    const comment = cells[1] || 'CDN节点';
    
    // 收集所有速度列（从第3列开始，跳过空值）
    const speeds = [];
    for (let i = 2; i < cells.length; i++) {
      const speedText = cells[i];
      if (speedText && speedText !== '-' && speedText !== 'N/A' && speedText !== '') {
        // 尝试解析速度数值（例如 "1.23 MB/s" 或 "1234 KB/s"）
        const speedMatch = speedText.match(/([\d.]+)\s*([KM]B\/s)/i);
        if (speedMatch) {
          let value = parseFloat(speedMatch[1]);
          const unit = speedMatch[2].toUpperCase();
          
          // 统一转换为 MB/s
          if (unit === 'KB/S') {
            value = value / 1024;
          }
          
          speeds.push(value);
        } else {
          // 尝试直接解析数字
          const numMatch = speedText.match(/[\d.]+/);
          if (numMatch) {
            speeds.push(parseFloat(numMatch[0]));
          }
        }
      }
    }
    
    if (speeds.length === 0) {
      console.log(`⚠️ ${ip} (${comment}) - 无有效速度数据`);
      continue;
    }
    
    // 取所有速度列的平均值作为最终速度
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    
    ipData.push({
      ip: ip,
      comment: comment,
      speedMBps: avgSpeed,
      speeds: speeds  // 保留原始速度数组用于调试
    });
  }
  
  return ipData;
}

async function main() {
  console.log('🚀 开始获取 IP 及下载速度数据...');
  
  try {
    // 1. 获取网页
    console.log('📡 正在获取网页数据: https://ip.164746.xyz/');
    const response = await fetch('https://ip.164746.xyz/', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    
    // 调试：保存 HTML 以便排查问题（可选）
    // fs.writeFileSync('debug.html', html);
    // console.log('HTML 长度:', html.length);
    
    // 2. 解析表格数据
    const ipData = extractIpSpeedData(html);
    
    if (ipData.length === 0) {
      console.log('❌ 未提取到任何 IP 速度数据');
      console.log('💡 提示: 网页结构可能发生了变化，请检查网页源代码');
      process.exit(1);
    }
    
    console.log(`📋 成功提取到 ${ipData.length} 个 IP 的速度数据`);
    
    // 3. 按下载速度从高到低排序（MB/s）
    ipData.sort((a, b) => b.speedMBps - a.speedMBps);
    
    // 4. 取最快的 5 个
    const fastest = ipData.slice(0, 5);
    
    console.log('\n🏆 下载速度最快的 5 个 IP:');
    fastest.forEach((item, idx) => {
      console.log(`   ${idx+1}. ${item.ip}  # ${item.speedMBps.toFixed(2)} MB/s  # ${item.comment}`);
    });
    
    // 5. 输出全部 IP 的速度（可选，用于调试）
    console.log('\n📊 所有 IP 速度排名:');
    ipData.forEach((item, idx) => {
      console.log(`   ${idx+1}. ${item.ip} - ${item.speedMBps.toFixed(2)} MB/s - ${item.comment}`);
    });
    
    // 6. 写入文件（格式：IP#速度MB/s#注释）
    const outputLines = fastest.map(item => `${item.ip}#${item.speedMBps.toFixed(2)} MB/s#${item.comment}`);
    fs.writeFileSync('fastest-ips.txt', outputLines.join('\n') + '\n');
    console.log('\n💾 结果已写入 fastest-ips.txt');
    console.log('📄 格式: IP#下载速度#注释');
    
    // 同时输出 JSON 格式
    fs.writeFileSync('fastest-ips.json', JSON.stringify(fastest, null, 2));
    
  } catch (error) {
    console.error('❌ 脚本运行失败:', error);
    process.exit(1);
  }
}

main();
