#!/usr/bin/env node
/* eslint-disable no-console */

const { spawn, spawnSync, execSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const qrcode = require('qrcode-terminal');

const SESSION_NAME = 'aoi-terminals';

function usage(exitCode = 0) {
  const msg = `
Usage:
  aoi-terminals                 Start (default)
  aoi-terminals start           Start in tmux
  aoi-terminals stop            Stop tmux session
  aoi-terminals doctor          Check prerequisites

Env:
  TERMINAL_TOKEN=...            Set fixed login token (otherwise auto-generate)
  TERMINAL_PUBLIC_BASE_URL=...  Public base URL for share link (recommended for phone)
  AOI_TERMINALS_DIR=...         Base dir (default: ~/.aoi-terminals)
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function hasCmd(cmd) {
  const r = spawnSync('bash', ['-lc', `command -v ${cmd} >/dev/null 2>&1`], { stdio: 'ignore' });
  return r.status === 0;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function getBaseDir() {
  const raw = process.env.AOI_TERMINALS_DIR;
  if (raw && raw.trim() !== '') return raw;
  return path.join(os.homedir(), '.aoi-terminals');
}

function getAppDir(baseDir) {
  return path.join(baseDir, 'npm-app');
}

function generateToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function detectPublicBaseUrl() {
  const explicit = process.env.TERMINAL_PUBLIC_BASE_URL;
  if (explicit && explicit.trim() !== '') return explicit.replace(/\/$/, '');

  const port = 3101;

  if (hasCmd('tailscale')) {
    try {
      const json = execSync('tailscale status --json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
      const j = JSON.parse(json);
      const dns = String(j?.Self?.DNSName || '').replace(/\.$/, '');
      if (dns) return `http://${dns}:${port}`;
    } catch {
      // ignore
    }

    try {
      const ip = execSync('tailscale ip -4 | head -n 1', { stdio: ['ignore', 'pipe', 'ignore'], shell: true })
        .toString('utf8')
        .trim();
      if (ip) return `http://${ip}:${port}`;
    } catch {
      // ignore
    }
  }

  return `http://localhost:${port}`;
}

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDir(from, to);
      continue;
    }
    if (e.isSymbolicLink()) continue;
    await fsp.copyFile(from, to);
  }
}

async function ensureAppFiles(appDir) {
  const marker = path.join(appDir, '.aoi-terminals-installed');
  if (fs.existsSync(marker)) return;

  const packageRoot = path.resolve(__dirname, '..');
  const srcBackend = path.join(packageRoot, 'backend');
  const srcFrontend = path.join(packageRoot, 'frontend');

  await fsp.mkdir(appDir, { recursive: true });

  await copyDir(srcBackend, path.join(appDir, 'backend'));
  await copyDir(srcFrontend, path.join(appDir, 'frontend'));

  await fsp.writeFile(marker, `installedAt=${new Date().toISOString()}\n`, 'utf8');
}

async function ensureNodeDeps(appDir) {
  const backendDir = path.join(appDir, 'backend');
  const frontendDir = path.join(appDir, 'frontend');
  const npmCacheDir = path.join(path.dirname(appDir), '.npm-cache');
  const npmEnv = { ...process.env, npm_config_cache: npmCacheDir };

  if (!fs.existsSync(path.join(backendDir, 'node_modules'))) {
    console.log('[aoi-terminals] installing backend deps...');
    run('npm', ['ci'], { cwd: backendDir, env: npmEnv });
  }

  if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
    console.log('[aoi-terminals] installing frontend deps...');
    run('npm', ['ci'], { cwd: frontendDir, env: npmEnv });
  }
}

function checkDoctor() {
  const problems = [];
  if (!hasCmd('node')) problems.push('node is missing');
  if (!hasCmd('npm')) problems.push('npm is missing');
  if (!hasCmd('tmux')) problems.push('tmux is missing (sudo apt-get update && sudo apt-get install -y tmux)');
  if (problems.length === 0) {
    console.log('[aoi-terminals] OK');
    return;
  }
  console.log('[aoi-terminals] Missing:');
  for (const p of problems) console.log(`- ${p}`);
  process.exit(1);
}

function tmuxHasSession() {
  const r = spawnSync('tmux', ['has-session', '-t', SESSION_NAME], { stdio: 'ignore' });
  return r.status === 0;
}

function tmuxStop() {
  if (!hasCmd('tmux')) {
    console.log('[aoi-terminals] tmux not found');
    process.exit(1);
  }
  if (!tmuxHasSession()) {
    console.log('[aoi-terminals] no session');
    return;
  }
  run('tmux', ['kill-session', '-t', SESSION_NAME]);
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function issueShareLink({ backendHttpBase, publicBaseUrl, terminalToken }) {
  const authRes = await fetch(`${backendHttpBase}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: terminalToken }),
  });
  if (!authRes.ok) return null;

  const setCookie = authRes.headers.get('set-cookie') || '';
  if (!setCookie) return null;
  const cookie = setCookie.split(';')[0];

  const linkRes = await fetch(`${backendHttpBase}/link-token`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  if (!linkRes.ok) return null;

  const j = await linkRes.json().catch(() => null);
  if (!j || !j.ok || !j.token) return null;
  const shareUrl = `${publicBaseUrl.replace(/\/$/, '')}/?token=${encodeURIComponent(String(j.token))}`;
  return { shareUrl, expiresAt: j.expiresAt ?? null };
}

async function start() {
  checkDoctor();

  const baseDir = getBaseDir();
  const appDir = getAppDir(baseDir);

  await ensureAppFiles(appDir);
  await ensureNodeDeps(appDir);

  const terminalToken = (process.env.TERMINAL_TOKEN && process.env.TERMINAL_TOKEN.trim() !== '')
    ? process.env.TERMINAL_TOKEN.trim()
    : generateToken();

  const publicBaseUrl = detectPublicBaseUrl();
  const allowedOrigins = [
    'http://localhost:3101',
    'http://127.0.0.1:3101',
    publicBaseUrl.replace(/\/$/, ''),
  ]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(',');

  const backendDir = path.join(appDir, 'backend');
  const frontendDir = path.join(appDir, 'frontend');
  const npmCacheDir = path.join(baseDir, '.npm-cache');

  if (tmuxHasSession()) {
    console.log(`[aoi-terminals] tmux session already exists: ${SESSION_NAME}`);
    console.log(`Attach: tmux attach -t ${SESSION_NAME}`);
    return;
  }

  console.log(`[aoi-terminals] starting tmux session: ${SESSION_NAME}`);

  run('tmux', [
    'new-session',
    '-d',
    '-s',
    SESSION_NAME,
    '-n',
    'backend',
    `cd "${backendDir}" && npm_config_cache="${npmCacheDir}" npm run build && npm_config_cache="${npmCacheDir}" PORT=3102 ALLOWED_ORIGINS="${allowedOrigins}" TERMINAL_TOKEN="${terminalToken}" TERMINAL_COOKIE_SECURE=0 npm run start`,
  ]);

  run('tmux', [
    'new-window',
    '-t',
    `${SESSION_NAME}:1`,
    '-n',
    'frontend',
    `cd "${frontendDir}" && npm_config_cache="${npmCacheDir}" npm run dev -- --hostname 0.0.0.0 --port 3101`,
  ]);

  console.log('---');
  console.log('Open (local): http://localhost:3101');
  console.log(`Login token: ${terminalToken}`);
  console.log(`Public base: ${publicBaseUrl}`);

  const ok = await waitForHealth('http://127.0.0.1:3102/health', 20000);
  if (ok) {
    const share = await issueShareLink({
      backendHttpBase: 'http://127.0.0.1:3102',
      publicBaseUrl,
      terminalToken,
    });

    if (share?.shareUrl) {
      console.log('---');
      console.log('Share URL (one-time):');
      console.log(share.shareUrl);
      if (share.expiresAt) console.log(`ExpiresAt(ms): ${share.expiresAt}`);
      qrcode.generate(share.shareUrl, { small: false });
    } else {
      console.log('[aoi-terminals] share link: skipped (set TERMINAL_PUBLIC_BASE_URL if you want phone-friendly URL)');
    }
  } else {
    console.log('[aoi-terminals] backend health timeout (share link skipped)');
  }

  console.log('---');
  console.log(`Attach logs: tmux attach -t ${SESSION_NAME}`);
  console.log(`Stop: aoi-terminals stop`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === 'start') {
    await start();
    return;
  }
  if (cmd === 'stop') {
    tmuxStop();
    return;
  }
  if (cmd === 'doctor') {
    checkDoctor();
    return;
  }
  if (cmd === '-h' || cmd === '--help' || cmd === 'help') {
    usage(0);
    return;
  }

  console.log(`[aoi-terminals] unknown command: ${cmd}`);
  usage(1);
}

main().catch((err) => {
  console.error('[aoi-terminals] fatal:', err?.stack || err);
  process.exit(1);
});
