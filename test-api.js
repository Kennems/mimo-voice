// API Key 诊断脚本
// 运行: node test-api.js

const API_KEY = process.argv[2] || 'tp-ctxfnhkcbsdj5l7fev0wpd1yr4a1b643cc8u53ue6lfj3m57';

async function testApiKey() {
    console.log('🔍 MiMo API Key 诊断工具\n');
    console.log('API Key:', API_KEY.substring(0, 15) + '...');
    console.log('Key 长度:', API_KEY.length, '字符');
    console.log('');
    
    // 测试最小请求
    console.log('📡 测试 API 连接...\n');
    
    try {
        const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'mimo-v2.5-asr',
                messages: [{
                    role: 'user',
                    content: [{
                        type: 'input_audio',
                        input_audio: {
                            data: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
                        }
                    }]
                }],
                asr_options: {
                    language: 'auto'
                }
            })
        });
        
        console.log('HTTP 状态码:', response.status);
        console.log('');
        
        const responseText = await response.text();
        
        if (response.ok) {
            console.log('✅ API Key 有效！\n');
            try {
                const data = JSON.parse(responseText);
                console.log('响应:', JSON.stringify(data, null, 2));
            } catch (e) {
                console.log('响应:', responseText);
            }
        } else {
            console.log('❌ API 请求失败\n');
            try {
                const error = JSON.parse(responseText);
                console.log('错误信息:', error.error?.message || error.message || responseText);
                console.log('\n完整响应:', JSON.stringify(error, null, 2));
            } catch (e) {
                console.log('错误响应:', responseText);
            }
        }
        
    } catch (error) {
        console.log('❌ 网络错误:', error.message);
        console.log('\n可能原因:');
        console.log('1. 网络连接问题');
        console.log('2. 代理设置问题');
        console.log('3. DNS 解析问题');
    }
}

testApiKey().catch(console.error);
