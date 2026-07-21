const { execSync } = require('child_process');

// 用 Chrome DevTools Protocol 截图，支持更精确控制
const script = `
tell application "Google Chrome"
    activate
    set URL of active tab of front window to "http://localhost:3000"
end tell
delay 4
do shell script "screencapture -x /Users/ken/Work/CodexWork/voice-recognition-app/screenshot.png"
`;

// 直接用 Chrome headless 但等更久
execSync(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless=new \
    --screenshot=/Users/ken/Work/CodexWork/voice-recognition-app/screenshot.png \
    --window-size=1440,900 \
    --force-device-scale-factor=3 \
    --disable-gpu \
    --hide-scrollbars \
    --virtual-time-budget=5000 \
    http://localhost:3000`, { stdio: 'pipe' });

console.log('Screenshot taken');
