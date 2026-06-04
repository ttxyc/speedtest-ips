// .github/workflows/speedtest.js

const fs = require('fs');

// 解析 HTML 表格，提取 IP、下载速度和优选标识
function parseHtmlTable(html) {
    const ipData = [];
    
    // 1. 找到表格体 <tbody> 中的每一行 <tr>
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) {
        console.log("❌ 未找到表格体 <tbody>");
        return [];
    }
    
    const tbodyContent = tbodyMatch[1];
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tbodyContent)) !== null) {
        const rowHtml = rowMatch[1];
        
        // 提取所有单元格 <td> 的内容
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells = [];
        let cellMatch;
        
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
            let cellContent = cellMatch[1];
            // 清理单元格内的 HTML 标签，但保留特殊标记（如 ★）
            cellContent = cellContent.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
                                     .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1')
                                     .replace(/<button[^>]*>([\s\S]*?)<\/button>/gi, '')
                                     .replace(/<span[^>]*class="copy-btn"[^>]*>[\s\S]*?<\/span>/gi, '')
                                     .trim();
            cells.push(cellContent);
        }
        
        // 需要至少 7 列数据（IP, 已发送, 已接收, 丢包率, 平均延迟, 下载速度, 测速时间）
        if (cells.length < 7) continue;
        
        // 第1列是 IP 地址（可能包含 ★ 和 "复制" 文字）
        let ipColumn = cells[0];
        // 提取 IP 地址（正则匹配）
        const ipMatch = ipColumn.match(/(\d{1,3}\.){3}\d{1,3}/);
        if (!ipMatch) continue;
        const ip = ipMatch[0];
        
        // 检查是否为优选节点（第一列是否包含 ★）
        const isPreferred = ipColumn.includes('★');
        const remark = isPreferred ? 'CF优选节点' : 'CF节点';
        
        // 第6列是下载速度（索引5），例如 "63.46MB/s"
        let speedColumn = cells[5] || '';
        let speedMBps = 0;
        const speedMatch = speedColumn.match(/([\d.]+)\s*MB\/s/i);
        if (speedMatch) {
            speedMBps = parseFloat(speedMatch[1]);
        }
        
        if (speedMBps > 0) {
            ipData.push({
                ip: ip,
                comment: remark,
                speedMBps: speedMBps,
                rawSpeed: speedColumn
            });
        }
    }
    
    return ipData;
}

async function main() {
    console.log('🚀 开始解析网页中的下载速度数据...');
    
    try {
        // 1. 获取网页
        console.log('📡 正在获取网页数据: https://ip.164746.xyz/');
        const response = await fetch('https://ip.164746.xyz/', {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const html = await response.text();
        
        console.log(`📄 获取到 HTML，长度: ${html.length} 字符`);
        
        // 2. 解析 HTML 表格数据
        const ipData = parseHtmlTable(html);
        
        if (ipData.length === 0) {
            console.log('❌ 未提取到任何 IP 速度数据');
            console.log('💡 提示: 请检查网页中的表格结构是否与脚本匹配');
            process.exit(1);
        }
        
        console.log(`📋 成功提取到 ${ipData.length} 个 IP 的速度数据`);
        
        // 3. 按下载速度从高到低排序
        ipData.sort((a, b) => b.speedMBps - a.speedMBps);
        
        // 4. 取最快的 5 个
        const fastest = ipData.slice(0, 5);
        
        console.log('\n🏆 下载速度最快的 5 个 IP:');
        fastest.forEach((item, idx) => {
            console.log(`   ${idx+1}. ${item.ip}  # ${item.speedMBps.toFixed(2)} MB/s  # ${item.comment}`);
        });
        
        // 5. 写入文件（格式：IP#速度MB/s#备注）
        const outputLines = fastest.map(item => `${item.ip}#${item.speedMBps.toFixed(2)} MB/s#${item.comment}`);
        fs.writeFileSync('fastest-ips.txt', outputLines.join('\n') + '\n');
        console.log('\n💾 结果已写入 fastest-ips.txt');
        
        // 同时输出 JSON 格式
        fs.writeFileSync('fastest-ips.json', JSON.stringify(fastest, null, 2));
        
    } catch (error) {
        console.error('❌ 脚本运行失败:', error);
        process.exit(1);
    }
}

main();
