// Starts the relay for the tests: the Node one (server/server.js, as on Render) by default, or the
// Cloudflare one (cloudflare/, in wrangler's local simulator) with RELAY=cf. Waits until it answers.
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const healthy = (port) =>
  new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });

let built = false;
async function startServer(port, env = {}) {
  let child;
  if (process.env.RELAY === 'cf') {
    const dir = path.join(ROOT, 'cloudflare');
    if (!built) {
      spawnSync(process.execPath, [path.join(dir, 'build.js')], { stdio: 'ignore' });
      built = true;
    }
    const vars = Object.entries(env).flatMap(([k, v]) => ['--var', `${k}:${v}`]);
    child = spawn(process.execPath, [path.join(dir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'dev', '--port', String(port), '--ip', '127.0.0.1', ...vars], {
      cwd: dir,
      stdio: 'ignore',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    });
  } else {
    child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
      env: { ...process.env, PORT: String(port), ...env },
      stdio: 'ignore',
    });
  }
  for (let i = 0; i < 120 && !(await healthy(port)); i++) await sleep(250);
  return {
    async stop() {
      // wrangler starts workerd as a child: end the whole tree, or the port stays taken.
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill();
      for (let i = 0; i < 40 && (await healthy(port)); i++) await sleep(250);
    },
  };
}

module.exports = { startServer };
