const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

const isDev = Boolean(process.env.ELECTRON_DEV_URL);
const devServerUrl = process.env.ELECTRON_DEV_URL || 'http://localhost:19006';

/** @type {http.Server | null} */
let staticServer = null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function resolveDistDir() {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, 'dist-web'),
    path.join(process.cwd(), 'dist-web'),
    path.join(__dirname, '..', 'dist-web'),
  ];

  for (const candidate of candidates) {
    const indexPath = path.join(candidate, 'index.html');
    if (fs.existsSync(indexPath)) {
      return candidate;
    }
  }

  return candidates[0];
}

/**
 * @param {string} rootDir
 * @returns {Promise<{url: string, server: http.Server}>}
 */
function createStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        let pathname = decodeURIComponent(reqUrl.pathname);

        if (pathname.endsWith('/')) {
          pathname += 'index.html';
        }

        const relativePath = pathname.replace(/^\/+/, '');
        let filePath = path.normalize(path.join(rootDir, relativePath));

        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(rootDir, 'index.html');
        }

        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const stream = fs.createReadStream(filePath);

        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        });

        stream.on('error', () => {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Internal Server Error');
        });

        stream.pipe(res);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      }
    });

    server.on('error', (error) => reject(error));

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to start static server'));
        return;
      }
      resolve({ url: `http://127.0.0.1:${address.port}`, server });
    });
  });
}

/**
 * @returns {Promise<BrowserWindow>}
 */
async function createMainWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#070b16',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await win.loadURL(devServerUrl);
  } else {
    const { url, server } = await createStaticServer(resolveDistDir());
    staticServer = server;
    await win.loadURL(url);
  }

  return win;
}

async function bootstrap() {
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
}

app.whenReady().then(bootstrap).catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[electron] bootstrap failed', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
});
