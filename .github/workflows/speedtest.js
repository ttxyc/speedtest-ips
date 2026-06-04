// .github/workflows/speedtest.js

const fs = require('fs');

// 解析纯文本表格，提取 IP、备注和下载速度
function parseTextTable(html) {
    // 按行分割
    const lines = html.split(/\r?\n/);
    const ipData = [];

    for (const line of lines) {
        // 跳过表头、空行和分隔线
        if (line.includes('IP地址') || line.includes('---') || line.trim() === '') {
            continue;
        }

        // 匹配行的主要部分：IP地址、备注、下载速度等
        // 格式示例：| ★ 172.64.53.41 复制  | 4 | 4 | 0.00% | 49.41 | 63.46MB/s | ... |
        // 或者：| 108.162.198.63 复制  | 4 | 4 | 0.00% | 57.99 | 46.66MB/s | ... |
        const parts = line.split('|').map(part => part.trim());
        if (parts.length < 6) continue; // 至少需要 IP 和速度列

        // 第一列是 IP 和可能的备注（如 ★ 和 "复制"）
        let ipColumn = parts[1];
        // 移除以 "★" 和 "复制" 为代表的特殊字符
        let ip = ipColumn.replace(/[★☆]/g, '').replace(/复制/g, '').trim();
        
        // 验证 IP 格式
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(ip)) continue;

        // 查找备注：如果 IP 列包含 ★，则提取它作为备注的一部分
        let remark = 'CF节点';
        if (ipColumn.includes('★')) {
            remark = '优选节点';
        } else {
            remark = '普通节点';
        }

        // 第6列（索引5）是 "下载速度" 列
        let speedColumn = parts.length > 5 ? parts[5] : '';
        let speedMBps = 0;
        
        if (speedColumn) {
            // 提取速度数值，例如 "63.46MB/s" -> 63.46
            const speedMatch = speedColumn.match(/^([\d.]+)/);
            if (speedMatch) {
                speedMBps = parseFloat(speedMatch[1]);
            }
        }

        if (speedMBps === 0) {
            console.log(`⚠️ 跳过 ${ip} (${remark})，无有效下载速度`);
            continue;
        }

        ipData.push({
            ip: ip,
            comment: remark,
            speedMBps: speedMBps,
            rawSpeed: speedColumn
        });
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
        
        // 调试：保存 HTML 以便排查问题（可选）
        // fs.writeFileSync('debug.html', html);
        // console.log('HTML 前500字符:', html.substring(0, 500));
        
        // 2. 解析文本表格数据
        const ipData = parseTextTable(html);
        
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
            console.log(`   ${idx+1}. ${item.ip}  # ${item.speedMBps.toFixed(2)} MB/s  # ${item.comment} (原始: ${item.rawSpeed})`);
        });
        
        // 5. 写入文件（格式：IP#速度MB/s#备注）
        const outputLines = fastest.map(item => `${item.ip}#${item.speedMBps.toFixed(2)} MB/s#${item.comment}`);
        fs.writeFileSync('fastest-ips.txt', outputLines.join('\n') + '\n');
        console.log('\n💾 结果已写入 fastest-ips.txt');
        console.log('📄 格式: IP#下载速度#备注');
        
        // 同时输出 JSON 格式
        fs.writeFileSync('fastest-ips.json', JSON.stringify(fastest, null, 2));
        
    } catch (error) {
        console.error('❌ 脚本运行失败:', error);
        process.exit(1);
    }
}

main();
