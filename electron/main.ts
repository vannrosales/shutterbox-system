import { app, BrowserWindow } from 'electron';
import path from 'path';
import { spawn, execSync, ChildProcess } from 'child_process';
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

function prepareEnvironment(appPath: string): { env: Record<string, string>; dbPath: string } {
    const userDataPath = app.getPath('userData');
    const storagePath = path.join(userDataPath, 'storage');
    const viewsPath = path.join(storagePath, 'framework', 'views');
    const cachePath = path.join(storagePath, 'framework', 'cache');
    const sessionsPath = path.join(storagePath, 'framework', 'sessions');
    const logsPath = path.join(storagePath, 'logs');

    // Create user-writable storage directories
    [userDataPath, storagePath, viewsPath, cachePath, sessionsPath, logsPath].forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    const dbPath = path.join(userDataPath, 'database.sqlite');
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, '');
    }

    // Resolve APP_KEY from .env or fallback key
    let appKey = 'base64:4sF4uV+J3+GZ80w6W5zP3o8K8L7M6N5P4Q3R2S1T0U=';
    const envFile = path.join(appPath, '.env');
    if (fs.existsSync(envFile)) {
        const content = fs.readFileSync(envFile, 'utf8');
        const match = content.match(/^APP_KEY=(.+)$/m);
        if (match && match[1].trim()) {
            appKey = match[1].trim();
        }
    }

    const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        APP_ENV: 'production',
        APP_DEBUG: 'true',
        APP_KEY: appKey,
        APP_URL: SERVER_URL,
        DB_CONNECTION: 'sqlite',
        DB_DATABASE: dbPath,
        VIEW_COMPILED_PATH: viewsPath,
        SESSION_DRIVER: 'cookie',
        LOG_CHANNEL: 'single',
    };

    return { env, dbPath };
}

function startPhpServer(): void {
    const phpBinary = getPhpBinaryPath();
    const appPath = getLaravelAppPath();
    const userDataPath = app.getPath('userData');

    const { env } = prepareEnvironment(appPath);

    // Run database migrations synchronously on startup
    try {
        console.log('[Electron] Running database migrations...');
        execSync(`"${phpBinary}" artisan migrate --force`, {
            cwd: appPath,
            env,
            windowsHide: true,
        });
        console.log('[Electron] Migrations completed successfully.');
    } catch (migErr) {
        console.error('[Electron] Migration warning:', migErr);
    }

    console.log(`[Electron] Starting PHP server using binary "${phpBinary}" in "${appPath}"`);

    const logFile = path.join(userDataPath, 'php_server.log');
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    phpProcess = spawn(phpBinary, ['artisan', 'serve', '--host=127.0.0.1', `--port=${PORT}`], {
        cwd: appPath,
        env,
        windowsHide: true,
    });

    phpProcess.stdout?.pipe(logStream);
    phpProcess.stderr?.pipe(logStream);

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
