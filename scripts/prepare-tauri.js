import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const tauriResourcesDir = path.join(rootDir, 'src-tauri', 'resources');
const binTargetDir = path.join(tauriResourcesDir, 'bin');
const appTargetDir = path.join(tauriResourcesDir, 'app');

console.log('[Tauri Prepare] Preparing resources for Tauri build...');

// 1. Build Vite assets first
console.log('[Tauri Prepare] Running Vite build...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

// 2. Prepare clean directory structure
fs.mkdirSync(binTargetDir, { recursive: true });
fs.mkdirSync(appTargetDir, { recursive: true });

// 3. Find system PHP binary
let phpPath = '';
if (process.platform === 'win32') {
    try {
        const output = execSync('where.exe php', { encoding: 'utf8' });
        const lines = output.trim().split(/\r?\n/);
        if (lines.length > 0 && lines[0]) {
            phpPath = lines[0].trim();
        }
    } catch (e) {}

    if (!phpPath || !fs.existsSync(phpPath)) {
        const fallbackPaths = [
            'C:\\laragon\\bin\\php\\php-8.4.25-nts-Win32-vs17-x64\\php.exe',
            'C:\\php\\php.exe'
        ];
        for (const p of fallbackPaths) {
            if (fs.existsSync(p)) {
                phpPath = p;
                break;
            }
        }
    }
} else {
    try {
        const output = execSync('which php', { encoding: 'utf8' });
        phpPath = output.trim();
    } catch (e) {}
}

if (!phpPath || !fs.existsSync(phpPath)) {
    console.error('[Tauri Prepare] ERROR: Could not locate PHP executable!');
    process.exit(1);
}

console.log(`[Tauri Prepare] Found PHP executable at: ${phpPath}`);

// Copy PHP binary and runtime dependencies
if (process.platform === 'win32') {
    const phpDir = path.dirname(phpPath);
    console.log(`[Tauri Prepare] Copying PHP runtime files from ${phpDir} to ${binTargetDir}...`);

    fs.cpSync(phpDir, binTargetDir, { recursive: true });

    const phpIniPath = path.join(binTargetDir, 'php.ini');
    if (!fs.existsSync(phpIniPath)) {
        const phpIniProd = path.join(binTargetDir, 'php.ini-production');
        const phpIniDev = path.join(binTargetDir, 'php.ini-development');
        if (fs.existsSync(phpIniProd)) {
            fs.copyFileSync(phpIniProd, phpIniPath);
        } else if (fs.existsSync(phpIniDev)) {
            fs.copyFileSync(phpIniDev, phpIniPath);
        }
    }

    if (fs.existsSync(phpIniPath)) {
        let iniContent = fs.readFileSync(phpIniPath, 'utf8');

        // Set extension_dir to ext
        if (!iniContent.includes('extension_dir = "ext"')) {
            iniContent = 'extension_dir = "ext"\n' + iniContent;
        }

        const requiredExts = [
            'pdo_sqlite',
            'sqlite3',
            'mbstring',
            'openssl',
            'curl',
            'fileinfo',
            'bcmath',
            'ctype',
            'json',
            'tokenizer',
            'xml'
        ];

        requiredExts.forEach((ext) => {
            const regex = new RegExp(`^;\\s*extension\\s*=\\s*${ext}`, 'gm');
            iniContent = iniContent.replace(regex, `extension=${ext}`);
        });

        fs.writeFileSync(phpIniPath, iniContent);
        console.log('[Tauri Prepare] Configured php.ini with SQLite and required extensions.');
    }
} else {
    console.log(`[Tauri Prepare] Copying PHP binary to ${binTargetDir}...`);
    fs.copyFileSync(phpPath, path.join(binTargetDir, 'php'));
    fs.chmodSync(path.join(binTargetDir, 'php'), 0o755);
}

// 4. Copy Laravel Application Files
console.log(`[Tauri Prepare] Copying Laravel app files to ${appTargetDir}...`);

const copyItems = [
    'app',
    'bootstrap',
    'config',
    'database',
    'public',
    'resources',
    'routes',
    'storage',
    'vendor',
    'artisan',
    '.env'
];

copyItems.forEach((item) => {
    const srcPath = path.join(rootDir, item);
    const destPath = path.join(appTargetDir, item);
    if (fs.existsSync(srcPath)) {
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
            fs.cpSync(srcPath, destPath, { recursive: true });
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
});

// Ensure default storage directories exist
const storageDirs = [
    path.join(appTargetDir, 'storage', 'app'),
    path.join(appTargetDir, 'storage', 'framework', 'views'),
    path.join(appTargetDir, 'storage', 'framework', 'sessions'),
    path.join(appTargetDir, 'storage', 'framework', 'cache'),
    path.join(appTargetDir, 'storage', 'logs')
];
storageDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

console.log('[Tauri Prepare] Tauri resources preparation complete!');
