// .github/workflows/speedtest.js

const fs = require('fs');

// 从 HTML 纯文本内容中直接提取 IP、速度和优选标识
function extractDataFromText(html) {
    // 1. 提取出包含测速数据的主要文本块
    // 查找 "IP地址 | 已发送 ..." 这个表头之后的内容
    const tableHeader = "IP地址 | 已发送 | 已接收 | 丢包率 | 平均延迟 | 下载速度 | 测速时间";
    const startIndex = html.indexOf(tableHeader);
    if (startIndex === -1) {
        console.log("❌ 未找到数据表格的表头");
        return [];
    }

    // 从表头开始，截取到文本末尾
    const dataText = html.substring(startIndex);
    
    // 2. 按行分割
    const lines = dataText.split(/\r?\n/);
    const ipData = [];

    for (const line of lines) {
        // 跳过表头行和空行
        if (line.includes('IP地址') || line.trim() === '') continue;
        
        // 匹配数据行：例如 "★ 172.64.53.41 复制  | 4 | 4 | 0.00% | 49.41 | 63.46MB/s | ..."
        // 正则表达式解释：
        // ^\s*                    - 行首的空白
        // (?:★\s*)?              - 可选的 ★ 符号
        // (\d+\.\d+\.\d+\.\d+)   - 捕获 IP 地址
        // \s*复制\s*             - 中间的 "复制" 文字
        // \|\s*(\d+)\s*\|        - 捕获 "已发送" 数值（这里用不到，但用于定位）
        // ... 中间跳过几列 ...
        // \|\s*([\d.]+MB/s)\s*\| - 捕获下载速度，例如 "63.46MB/s"
        const match = line.match(/^\s*(?:★\s*)?(\d+\.\d+\.\d+\.\d+)\s*复制\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*[\d.]+\%\s*\|\s*[\d.]+\s*\|\s*([\d.]+MB\/s)\s*\|/);
        
        if (match) {
            const ip = match[1];
            const speedRaw = match[2];
            // 提取速度数值
            const speedValue = parseFloat(speedRaw);
            
            // 判断是否为优选节点（行首有 ★）
            const isPreferred = line.trim().startsWith('★');
            const remark = isPreferred ? 'CF优选节点' : 'CF节点';
            
            ipData.push({
                ip: ip,
                comment: remark,
                speedMBps: speedValue,
                rawSpeed: speedRaw
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
        
        // 2. 从文本中提取数据
        const ipData = extractDataFromText(html);
        
        if (ipData.length === 0) {
            console.log('❌ 未提取到任何 IP 速度数据');
            console.log('💡 提示: 请检查网页源码中的数据格式是否发生变化');
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
