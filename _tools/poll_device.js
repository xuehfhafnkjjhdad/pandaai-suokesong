// 轮询 GitHub device flow 的 access_token，拿到后自动存入凭据并推送
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:64140';
const CID = '01ab8ac9400c4e429b23';
const DEVICE = process.argv[2];
const REPO_DIR = 'E:/pandaAI';
const TMP = path.join(REPO_DIR, '.workbuddy', 'tmp');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curl(args) {
  return execFileSync('curl', ['-x', PROXY, '-sS', '-m', '40', ...args], { encoding: 'utf8' });
}

async function waitToken() {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(5000);
    let out;
    try {
      out = curl([
        '-H', 'Accept: application/json',
        '-d', `client_id=${CID}&device_code=${DEVICE}&grant_type=urn:ietf:params:oauth:grant-type:device_code`,
        'https://github.com/login/oauth/access_token',
      ]);
    } catch (e) {
      console.log('poll_net_error', e.message.slice(0, 80));
      continue;
    }
    let j;
    try { j = JSON.parse(out); } catch (e) { console.log('poll_bad_json', out.slice(0, 120)); continue; }
    if (j.access_token) { console.log('TOKEN_OK'); return j.access_token; }
    if (j.error === 'authorization_pending') { console.log('waiting_user…'); continue; }
    if (j.error === 'slow_down') { await sleep(5000); continue; }
    console.log('TOKEN_FAILED', JSON.stringify(j));
    return null;
  }
  console.log('TOKEN_TIMEOUT');
  return null;
}

(async () => {
  const token = await waitToken();
  if (!token) process.exit(1);

  fs.mkdirSync(TMP, { recursive: true });
  const storeFile = path.join(TMP, 'gitcred');
  fs.writeFileSync(storeFile, `https://x-access-token:${token}@github.com\n`, 'utf8');

  try {
    const out = execFileSync('git', [
      '-C', REPO_DIR,
      '-c', 'credential.helper=',
      '-c', `credential.helper=store --file=${storeFile}`,
      'push', '-u', 'origin', 'dev',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('PUSH_OK');
    console.log(out);
  } catch (e) {
    console.log('PUSH_FAILED');
    console.log((e.stdout || '') + (e.stderr || '') + (e.message || ''));
    process.exit(1);
  } finally {
    try { fs.unlinkSync(storeFile); } catch (e) {}
  }
  process.exit(0);
})();
