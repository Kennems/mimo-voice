require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Token Plan Base URLs
const API_BASE_URLS = {
    cn: 'https://token-plan-cn.xiaomimimo.com/v1',
    sgp: 'https://token-plan-sgp.xiaomimimo.com/v1',
    ams: 'https://token-plan-ams.xiaomimimo.com/v1'
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// File upload config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 
                              'audio/mp4', 'audio/m4a', 'audio/flac', 'audio/ogg', 'audio/webm'];
        if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|m4a|flac|ogg|webm)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('不支持的音频格式'), false);
        }
    }
});

// API endpoint for audio transcription
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    try {
        // 从 header 或 body 获取配置
        const apiKey = req.headers['x-api-key'] || req.body.apiKey || process.env.MIMO_API_KEY;
        const cluster = req.headers['x-cluster'] || req.body.cluster || 'cn';
        
        console.log('API Key:', apiKey ? `${apiKey.substring(0, 15)}...` : 'none');
        console.log('Cluster:', cluster);
        
        if (!apiKey) {
            return res.status(400).json({ error: '请配置 API Key' });
        }

        let audioBase64;
        let mimeType;

        if (req.file) {
            console.log('File upload:', req.file.originalname, (req.file.size / 1024).toFixed(1) + 'KB');
            const audioBuffer = fs.readFileSync(req.file.path);
            audioBase64 = audioBuffer.toString('base64');
            mimeType = req.file.mimetype;
            fs.unlinkSync(req.file.path);
        } else if (req.body.audio) {
            const matches = req.body.audio.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                mimeType = matches[1];
                audioBase64 = matches[2];
            } else {
                audioBase64 = req.body.audio;
                mimeType = req.body.mimeType || 'audio/webm';
            }
            console.log('Audio data:', mimeType, (audioBase64.length * 0.75 / 1024).toFixed(1) + 'KB');
        } else {
            return res.status(400).json({ error: '未提供音频数据' });
        }

        const language = req.body.language || 'auto';
        
        // 使用 Token Plan Base URL
        const baseUrl = API_BASE_URLS[cluster] || API_BASE_URLS.cn;
        const apiUrl = `${baseUrl}/chat/completions`;
        
        console.log('Calling:', apiUrl);
        console.log('Language:', language);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'mimo-v2.5-asr',
                messages: [{
                    role: 'user',
                    content: [{
                        type: 'input_audio',
                        input_audio: {
                            data: `data:${mimeType};base64,${audioBase64}`
                        }
                    }]
                }],
                asr_options: {
                    language: language
                }
            })
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API error:', errorText);
            let errorMessage = 'API 请求失败';
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
            } catch (e) {
                errorMessage = errorText.substring(0, 200) || errorMessage;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        const transcript = data.choices[0].message.content;
        console.log('Success:', transcript.substring(0, 50) + '...');
        console.log('Usage:', data.usage);
        
        res.json({
            transcript: transcript,
            usage: data.usage,
            model: data.model
        });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handling
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '文件大小超过 25MB 限制' });
        }
    }
    res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎙️  MiMo Voice - 语音识别服务已启动                      ║
║                                                           ║
║   📍 访问地址: http://localhost:${PORT}                      ║
║   🔑 支持 Token Plan API Key                              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
