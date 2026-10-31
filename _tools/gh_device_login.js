// GitHub OAuth Device Flow —— 用于无 GUI 环境下的 git 推送授权
// 用法：node gh_device_login.js
// 成功后把 access_token 写入 .workbuddy/tmp/gh_token.txt，由调用方存入凭据管理器后删除
const https = require('https');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = '01ab8ac9400c4e429b23'; // GitHub 官方 Git Credential Manager 的公开 client id
const SCOPE = 'repo';

function post(host, p, body) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(body).toString();
    const req = https.request(
      { host, path: p, method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                   'Content-Length': Buffer.byteLength(data),
                   Accept: 'application/json' } },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(b.slice(0, 300))); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dc = await post('github.com', '/login/device/code', {
    client_id: CLIENT_ID,
    scope: SCOPE,
  });
  if (!dc.device_code) {
    console.log('DEVICE_CODE_FAILED', JSON.stringify(dc));
    process.exit(1);
  }
  console.log('=== 请在浏览器打开 ===');
  console.log(dc.verification_uri);
  console.log('=== 输入这串码 ===');
  console.log(dc.user_code);
  console.log('====================');
  console.log('等待授权中（最长 15 分钟）…');

  const interval = (dc.interval || 5) * 1000;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const r = await post('github.com', '/login/oauth/access_token', {
      client_id: CLIENT_ID,
      device_code: dc.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    if (r.access_token) {
      const dir = path.join(__dirname, '..', '.workbuddy', 'tmp');
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, 'gh_token.txt');
      fs.writeFileSync(f, r.access_token, 'utf8');
      console.log('AUTH_OK token_saved=' + f);
      process.exit(0);
    }
    if (r.error === 'authorization_pending') continue;
    if (r.error === 'slow_down') { await sleep(interval); continue; }
    console.log('AUTH_FAILED', JSON.stringify(r));
    process.exit(1);
  }
  console.log('AUTH_TIMEOUT');
  process.exit(1);
})().catch((e) => {
  console.log('ERROR', e.message);
  process.exit(1);
});
