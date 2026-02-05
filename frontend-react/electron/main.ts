/**
 * Electron 主进程入口
 * 初始化应用窗口和本地推理服务
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { registerIpcHandlers, removeIpcHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true, // 安全：使用 contextBridge
            sandbox: false, // 需要 false 以支持 native modules
        },
    });

    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // 注册 IPC handlers
    registerIpcHandlers(mainWindow);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    removeIpcHandlers();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 优雅关闭
app.on('before-quit', async () => {
    removeIpcHandlers();
});
