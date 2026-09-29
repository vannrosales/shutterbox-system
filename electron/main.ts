import { app, BrowserWindow } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let phpProcess: ChildProcess | null = null;

const PORT = 8000;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

function getPhpBinaryPath(): string {
    const isWin = process.platform === 'win32';
    const phpName = isWin ? 'php.exe' : 'php';

    const path1 = path.join(process.resourcesPath, 'bin', phpName);
    const path2 = path.join(process.resourcesPath, 'resources', 'bin', phpName);

    if (fs.existsSync(path1)) return path1;
    if (fs.existsSync(path2)) return path2;

    return phpName;
}

function getLaravelAppPath(): string {
    const path1 = path.join(process.resourcesPath, 'app');
    const path2 = path.join(process.resourcesPath, 'resources', 'app');

    if (fs.existsSync(path1)) return path1;
    if (fs.existsSync(path2)) return path2;

    return path.resolve(__dirname, '..');
}

function startPhpServer(): void {
    const phpBinary = getPhpBinaryPath();
    const appPath = getLaravelAppPath();

    // Prepare SQLite database in user data directory for offline persistence
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }
    const dbPath = path.join(userDataPath, 'database.sqlite');
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, '');
    }

    const env = {
        ...process.env,
        APP_ENV: 'production',
        APP_DEBUG: 'false',
        DB_DATABASE: dbPath,
    };

    console.log(`[Electron] Starting PHP server using binary "${phpBinary}" in "${appPath}"`);

    phpProcess = spawn(phpBinary, ['artisan', 'serve', '--host=127.0.0.1', `--port=${PORT}`], {
        cwd: appPath,
        env,
        windowsHide: true,
    });

    phpProcess.stdout?.on('data', (data) => {
        console.log(`[PHP stdout]: ${data}`);
    });

    phpProcess.stderr?.on('data', (data) => {
        console.error(`[PHP stderr]: ${data}`);
    });

    phpProcess.on('error', (err) => {
        console.error('[Electron] Failed to start PHP process:', err);
    });

    phpProcess.on('close', (code) => {
        console.log(`[Electron] PHP process exited with code ${code}`);
    });
}

function stopPhpServer(): void {
    if (phpProcess) {
        console.log('[Electron] Terminating PHP server...');
        phpProcess.kill();
        phpProcess = null;
    }
}

function createWindow(): void {
    const iconPath = path.join(__dirname, '..', 'src-tauri', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Shutterbox System',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Retry connection until PHP server is ready
    let attempts = 0;
    const maxAttempts = 30;

    const loadApp = () => {
        if (!mainWindow) return;

        mainWindow.loadURL(SERVER_URL).catch(() => {
            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(loadApp, 300);
            } else {
                console.error('[Electron] Max connection attempts reached for PHP server.');
            }
        });
    };

    setTimeout(loadApp, 500);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', () => {
    startPhpServer();
    createWindow();
});

app.on('window-all-closed', () => {
    stopPhpServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopPhpServer();
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
