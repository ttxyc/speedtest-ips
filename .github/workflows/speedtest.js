// .github/workflows/speedtest.js

const fs = require('fs');

// 解析 Markdown 风格表格，提取 IP、备注和下载速度
function parseMarkdownTable(html) {
    // 按行分割
    const lines = html.split(/\r?\n/);
    const ipData = [];
    let isInsideTable = false;

    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // 检测表格开始（包含 "IP地址" 和 "|" 的行）
        if (trimmedLine.includes('IP地址') && trimmedLine.includes('|')) {
            isInsideTable = true;
            continue;
        }
        
        // 跳过表格分隔线（例如 |---|---|---|---|---|---|---|）
        if (isInsideTable && trimmedLine.includes('---') && trimmedLine.includes('|')) {
            continue;
        }
        
        // 如果已经在表格内，并且当前行以 '|' 开头或包含 '|'，则解析
        if (isInsideTable && trimmedLine.startsWith('|') && trimmedLine.includes('|')) {
            // 按 '|' 分割并清理每个单元格
            const cells = trimmedLine.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
            
            if (cells.length >= 6) {
                // 第一列是 IP 地址（可能包含 ★ 和 "复制"）
                let ipColumn = cells[0];
                // 移除特殊符号和文字
                let ip = ipColumn.replace(/[★☆]/g, '').replace(/复制/g, '').trim();
                
                // 验证 IP 格式
                const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                if (!ipRegex.test(ip)) {
                    continue;
                }
                
                // 确定备注（是否优选）
                let remark = 'CF节点';
                if (ipColumn.includes('★')) {
                    remark = 'CF优选节点';
                }
                
                // 第6列（索引5）是下载速度
                let speedColumn = cells.length > 5 ? cells[5] : '';
                let speedMBps = 0;
                
                if (speedColumn) {
                    // 提取速度数值，例如 "63.46MB/s" -> 63.46
                    const speedMatch = speedColumn.match(/^([\d.]+)/);
                    if (speedMatch) {
                        speedMBps = parseFloat(speedMatch[1]);
                    }
                }
                
                // 只记录有有效速度的 IP
                if (speedMBps > 0) {
                    ipData.push({
                        ip: ip,
                        comment: remark,
                        speedMBps: speedMBps,
                        rawSpeed: speedColumn
                    });
                }
            }
        }
        
        // 检测表格结束（遇到空行或非表格行）
        if (isInsideTable && trimmedLine === '') {
            isInsideTable = false;
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
        
        // 调试：打印 HTML 长度和开头部分
        console.log(`📄 获取到 HTML，长度: ${html.length} 字符`);
        console.log('📄 HTML 开头 300 字符:', html.substring(0, 300));
        
        // 2. 解析表格数据
        const ipData = parseMarkdownTable(html);
        
        if (ipData.length === 0) {
            console.log('❌ 未提取到任何 IP 速度数据');
            console.log('💡 提示: 网页文本格式可能发生了变化，请检查网页源代码');
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
