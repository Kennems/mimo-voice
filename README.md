# 🎙️ MiMo Voice

基于小米 MiMo-V2.5-ASR 的专业语音识别 Web 应用，支持 Token Plan API。

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)

## ✨ 功能

- 🎤 **实时录音** — 浏览器内录制，实时波形可视化
- 📁 **文件上传** — 拖放上传，支持 MP3/WAV/M4A/FLAC/OGG/WebM
- 🌐 **多语言** — 自动检测 / 中文 / 英文
- 📝 **流式输出** — 实时显示识别结果
- 📜 **历史记录** — 自动保存，快速加载
- 📥 **导出** — 复制、下载文本、批量导出 JSON
- 🔒 **本地存储** — API Key 仅存浏览器本地

## 🚀 快速开始

```bash
# 克隆仓库
git clone https://github.com/Kennems/mimo-voice.git
cd mimo-voice

# 安装依赖
pnpm install   # 或 npm install

# 配置 API Key
cp .env.example .env
# 编辑 .env 填入你的 MiMo API Key

# 启动
npm start
```

打开浏览器访问 http://localhost:3000

## ⚙️ 配置

编辑 `.env` 文件：

```env
PORT=3000
MIMO_API_KEY=tp-xxxxx
MIMO_CLUSTER=cn
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `MIMO_API_KEY` | Token Plan API Key | - |
| `MIMO_CLUSTER` | 集群 (cn/sgp/ams) | `cn` |

## 📁 项目结构

```
mimo-voice/
├── public/
│   ├── index.html        # 主页面
│   ├── css/style.css     # 样式（备用）
│   └── js/app.js         # 前端逻辑
├── src/
│   └── server.js         # Node.js 后端
├── uploads/              # 临时上传目录
├── .env                  # 环境变量（不提交）
├── .env.example          # 环境变量示例
├── package.json
└── README.md
```

## 🔧 API

### POST /api/transcribe

音频转录接口。

**请求头：**
- `Content-Type: application/json`
- `X-API-Key: your_key` — MiMo API Key
- `X-Cluster: cn` — 集群选择

**请求体：**
```json
{
  "audio": "data:audio/wav;base64,...",
  "mimeType": "audio/wav",
  "language": "auto"
}
```

**响应：**
```json
{
  "transcript": "识别出的文字",
  "usage": { "seconds": 5, "total_tokens": 100 },
  "model": "mimo-v2.5-asr"
}
```

## 🎯 对比

| 特性 | MiMo Voice | Whisper | Google STT |
|------|------------|---------|------------|
| 实时录音 | ✅ | ❌ | ✅ |
| 波形可视化 | ✅ | ❌ | ❌ |
| 流式输出 | ✅ | ❌ | ✅ |
| 中文优化 | ✅ | ○ | ✅ |
| 本地部署 | ✅ | ✅ | ❌ |
| Token Plan | ✅ | - | - |

## 📄 License

MIT
