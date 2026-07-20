const state = {
    isRecording: false, mediaRecorder: null, audioChunks: [],
    audioContext: null, analyser: null, animationId: null,
    recordingStartTime: null, timerInterval: null,
    currentLanguage: 'auto', currentTranscript: '',
    history: JSON.parse(localStorage.getItem('asr_history') || '[]'),
    settings: JSON.parse(localStorage.getItem('asr_settings') || '{"stream":false,"autoCopy":false,"saveHistory":true}')
};
const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
    loadSettings(); renderHistory(); setupDragDrop(); checkApiKey();
});

function loadSettings() {
    $('apiKeyInput').value = localStorage.getItem('asr_api_key') || '';
    $('clusterSelect').value = localStorage.getItem('asr_cluster') || 'cn';
    setToggle('streamToggle', state.settings.stream);
    setToggle('autoCopyToggle', state.settings.autoCopy);
    setToggle('historyToggle', state.settings.saveHistory);
}

function setToggle(id, on) { $(id).className = 'toggle' + (on ? ' on' : ''); }

function saveApiKey(k) { localStorage.setItem('asr_api_key', k.trim()); toast('API Key 已保存'); }
function saveCluster(c) { localStorage.setItem('asr_cluster', c); toast('集群已切换'); }
function checkApiKey() { if (!localStorage.getItem('asr_api_key')) toast('请先配置 API Key', 'error'); }
function toggleStream() { state.settings.stream = !state.settings.stream; setToggle('streamToggle', state.settings.stream); save(); }
function toggleAutoCopy() { state.settings.autoCopy = !state.settings.autoCopy; setToggle('autoCopyToggle', state.settings.autoCopy); save(); }
function toggleHistory() { state.settings.saveHistory = !state.settings.saveHistory; setToggle('historyToggle', state.settings.saveHistory); save(); }
function save() { localStorage.setItem('asr_settings', JSON.stringify(state.settings)); }

function setLanguage(lang) {
    state.currentLanguage = lang;
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
}

async function toggleRecording() { state.isRecording ? stopRecording() : await startRecording(); }

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const src = state.audioContext.createMediaStreamSource(stream);
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 2048; state.analyser.smoothingTimeConstant = 0.85;
        src.connect(state.analyser);
        let mt = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mt)) { mt = 'audio/webm'; if (!MediaRecorder.isTypeSupported(mt)) mt = ''; }
        state.mediaRecorder = new MediaRecorder(stream, mt ? { mimeType: mt } : {});
        state.audioChunks = [];
        state.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) state.audioChunks.push(e.data); };
        state.mediaRecorder.onstop = async () => {
            const blob = new Blob(state.audioChunks, { type: state.mediaRecorder.mimeType || 'audio/webm' });
            await processAudio(await convertToWav(blob), 'audio/wav');
            stream.getTracks().forEach(t => t.stop());
        };
        state.mediaRecorder.start(100);
        state.isRecording = true;
        $('recordBtn').classList.add('recording');
        $('statusDot').classList.add('active');
        $('statusText').textContent = '录制中';
        $('waveformPlaceholder').style.display = 'none';
        state.recordingStartTime = Date.now();
        state.timerInterval = setInterval(() => {
            const s = Math.floor((Date.now() - state.recordingStartTime) / 1000);
            $('recordTime').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
        }, 100);
        drawWaveform();
        toast('开始录制');
    } catch (e) {
        toast(e.name === 'NotAllowedError' ? '请允许麦克风权限' : '麦克风错误: ' + e.message, 'error');
    }
}

function stopRecording() {
    if (!state.mediaRecorder || !state.isRecording) return;
    state.mediaRecorder.stop(); state.isRecording = false;
    $('recordBtn').classList.remove('recording');
    $('statusDot').classList.remove('active');
    $('statusText').textContent = '处理中';
    clearInterval(state.timerInterval);
    if (state.animationId) { cancelAnimationFrame(state.animationId); state.animationId = null; }
    if (state.audioContext) { state.audioContext.close(); state.audioContext = null; }
}

async function convertToWav(blob) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const oc = new OfflineAudioContext(1, buf.length * 16000 / buf.sampleRate, 16000);
    const s = oc.createBufferSource(); s.buffer = buf; s.connect(oc.destination); s.start();
    const rb = await oc.startRendering();
    const ch = rb.getChannelData(0), sr = rb.sampleRate, len = rb.length;
    const ab = new ArrayBuffer(44 + len * 2), v = new DataView(ab);
    const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE');
    w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, len * 2, true);
    for (let i = 0, o = 44; i < len; i++, o += 2) { const x = Math.max(-1, Math.min(1, ch[i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7FFF, true); }
    return new Blob([ab], { type: 'audio/wav' });
}

function drawWaveform() {
    const c = $('waveformCanvas'), ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
    c.width = r.width * dpr; c.height = r.height * dpr; ctx.scale(dpr, dpr);
    const W = r.width, H = r.height;
    (function draw() {
        if (!state.isRecording || !state.analyser) return;
        state.animationId = requestAnimationFrame(draw);
        const bl = state.analyser.frequencyBinCount, d = new Uint8Array(bl);
        ctx.clearRect(0, 0, W, H);
        // waveform line
        state.analyser.getByteTimeDomainData(d);
        ctx.beginPath(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#0071e3';
        const sw = W / bl; let x = 0;
        for (let i = 0; i < bl; i++) { const y = (d[i] / 128) * H / 2; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); x += sw; }
        ctx.stroke();
        // frequency bars
        state.analyser.getByteFrequencyData(d);
        const bc = 48, bw = W / bc - 1.5, step = Math.floor(bl / bc);
        for (let i = 0; i < bc; i++) {
            const bh = (d[i * step] / 255) * H * 0.8, bx = i * (bw + 1.5), by = H - bh;
            const g = ctx.createLinearGradient(bx, by, bx, H);
            g.addColorStop(0, 'rgba(0,113,227,0.7)'); g.addColorStop(1, 'rgba(0,113,227,0.1)');
            ctx.fillStyle = g; ctx.beginPath();
            if (ctx.roundRect) { ctx.roundRect(bx, by, bw, bh, 2); } else { ctx.fillRect(bx, by, bw, bh); } ctx.fill();
        }
    })();
}

function setupDragDrop() {
    const z = $('uploadZone');
    z.addEventListener('dragover', e => { e.preventDefault(); z.style.borderColor = '#0071e3'; z.style.background = 'rgba(0,113,227,0.03)'; });
    z.addEventListener('dragleave', e => { e.preventDefault(); z.style.borderColor = ''; z.style.background = ''; });
    z.addEventListener('drop', e => { e.preventDefault(); z.style.borderColor = ''; z.style.background = ''; if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
}

function handleFileSelect(e) { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }

async function handleFile(file) {
    if (file.size > 25 * 1024 * 1024) { toast('文件超过 25MB', 'error'); return; }
    $('statusText').textContent = '处理: ' + file.name;
    if (file.type === 'audio/wav' || file.type === 'audio/mpeg' || file.name.match(/\.(wav|mp3)$/i)) {
        await processAudio(file, file.type);
    } else {
        toast('正在转换格式...');
        try { await processAudio(await convertToWav(file), 'audio/wav'); } catch (e) { toast('转换失败', 'error'); }
    }
}

async function processAudio(blob, mime) {
    const key = localStorage.getItem('asr_api_key'), cluster = localStorage.getItem('asr_cluster') || 'cn';
    if (!key) { toast('请配置 API Key', 'error'); return; }
    $('loadingOverlay').style.display = 'flex';
    try {
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
        const resp = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': key, 'X-Cluster': cluster }, body: JSON.stringify({ audio: 'data:' + mime + ';base64,' + b64, mimeType: mime, language: state.currentLanguage }) });
        if (!resp.ok) { const err = await resp.json(); throw new Error(err.error || '请求失败'); }
        const data = await resp.json();
        state.currentTranscript = data.transcript;
        $('transcriptPlaceholder').style.display = 'none';
        $('transcriptContent').style.display = 'block';
        $('transcriptContent').textContent = data.transcript;
        if (data.usage) {
            $('statsContainer').style.display = 'grid';
            $('statDuration').textContent = data.usage.seconds ? data.usage.seconds + 's' : '-';
            $('statWords').textContent = state.currentTranscript.length + '字';
            $('statTokens').textContent = data.usage.total_tokens || '-';
        }
        $('copyBtn').disabled = false; $('downloadBtn').disabled = false;
        $('statusDot').className = 'dot active'; $('statusDot').style.background = '#34c759'; $('statusDot').style.animation = 'none';
        $('statusText').textContent = '完成';
        if (state.settings.saveHistory) addToHistory(data.transcript, data.usage);
        if (state.settings.autoCopy) await copyToClipboard(data.transcript);
        toast('识别完成');
    } catch (e) {
        toast('识别失败: ' + e.message, 'error');
        $('statusDot').className = 'dot active'; $('statusDot').style.background = '#ff3b30'; $('statusDot').style.animation = 'none';
        $('statusText').textContent = '失败';
    } finally { $('loadingOverlay').style.display = 'none'; }
}

async function copyTranscript() { await copyToClipboard(state.currentTranscript); toast('已复制'); }
async function copyToClipboard(t) { try { await navigator.clipboard.writeText(t); } catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } }

function downloadTranscript() {
    if (!state.currentTranscript) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([state.currentTranscript], { type: 'text/plain;charset=utf-8' }));
    a.download = 'transcript_' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-') + '.txt'; a.click(); URL.revokeObjectURL(a.href);
}

function addToHistory(text, usage) {
    state.history.unshift({ id: Date.now(), text, language: state.currentLanguage, timestamp: new Date().toISOString(), duration: usage?.seconds || 0, tokens: usage?.total_tokens || 0 });
    if (state.history.length > 100) state.history.pop();
    localStorage.setItem('asr_history', JSON.stringify(state.history)); renderHistory();
}

function renderHistory() {
    const list = $('historyList');
    if (!state.history.length) { list.innerHTML = '<div class="history-empty">暂无历史记录</div>'; return; }
    list.innerHTML = state.history.map(i => {
        const ago = Date.now() - new Date(i.timestamp);
        const time = ago < 60000 ? '刚刚' : ago < 3600000 ? Math.floor(ago / 60000) + '分钟前' : ago < 86400000 ? Math.floor(ago / 3600000) + '小时前' : new Date(i.timestamp).toLocaleDateString('zh-CN');
        const lang = { auto: '自动', zh: '中文', en: 'EN' }[i.language] || i.language;
        return '<div class="history-item" onclick="loadHistory(' + i.id + ')">' +
            '<div class="history-head"><span class="history-time">' + time + '</span><span class="history-lang">' + lang + '</span></div>' +
            '<div class="history-text">' + esc(i.text) + '</div>' +
            '<div class="history-meta">' + (i.duration ? '<span>⏱ ' + i.duration + 's</span>' : '') + '<span>' + i.text.length + '字</span>' + (i.tokens ? '<span>' + i.tokens + 'tk</span>' : '') + '</div></div>';
    }).join('');
}

function loadHistory(id) {
    const i = state.history.find(h => h.id === id); if (!i) return;
    state.currentTranscript = i.text;
    $('transcriptPlaceholder').style.display = 'none'; $('transcriptContent').style.display = 'block'; $('transcriptContent').textContent = i.text;
    $('copyBtn').disabled = false; $('downloadBtn').disabled = false;
    $('statsContainer').style.display = 'grid';
    $('statDuration').textContent = i.duration ? i.duration + 's' : '-';
    $('statWords').textContent = i.text.length + '字'; $('statTokens').textContent = i.tokens || '-';
    toast('已加载');
}

function clearHistory() { if (confirm('清除所有历史？')) { state.history = []; localStorage.setItem('asr_history', '[]'); renderHistory(); toast('已清除'); } }

function toast(msg, type = 'success') {
    const t = $('toast'), icon = t.querySelector('.toast-icon'), text = $('toastText');
    t.className = 'toast ' + type; icon.textContent = type === 'success' ? '✓' : '✕'; text.textContent = msg;
    t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500);
}

function clearAll() {
    if (!confirm('清除所有数据？')) return;
    state.currentTranscript = '';
    $('transcriptContent').style.display = 'none'; $('transcriptPlaceholder').style.display = 'flex';
    $('statsContainer').style.display = 'none'; $('copyBtn').disabled = true; $('downloadBtn').disabled = true;
    $('recordTime').textContent = '00:00'; $('statusDot').className = 'dot'; $('statusDot').style.background = ''; $('statusText').textContent = '就绪';
    toast('已清除');
}

function exportAll() {
    if (!state.history.length) { toast('暂无历史', 'error'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ date: new Date().toISOString(), items: state.history }, null, 2)], { type: 'application/json' }));
    a.download = 'asr_' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); URL.revokeObjectURL(a.href);
    toast('已导出 ' + state.history.length + ' 条');
}

function showSettings() { $('apiKeyInput').scrollIntoView({ behavior: 'smooth' }); $('apiKeyInput').focus(); }
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// Dark mode
function toggleDark() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

// Init theme from localStorage or system
(function() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
})();
