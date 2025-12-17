#!/usr/bin/env node

/**
 * Postinstall script for trak-board npm package
 * Downloads pre-built binaries for the current platform from GitHub releases
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = 'hgeldenhuys/trak';
const BIN_DIR = path.join(__dirname, '..', 'bin');

// Platform/arch mapping
const PLATFORM_MAP = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows'
};

const ARCH_MAP = {
  arm64: 'arm64',
  x64: 'x64',
  x86_64: 'x64'
};

function getPlatformArch() {
  const platform = PLATFORM_MAP[process.platform];
  const arch = ARCH_MAP[process.arch];

  if (!platform || !arch) {
    console.error(`Unsupported platform: ${process.platform}-${process.arch}`);
    console.error('Supported platforms: darwin-arm64, linux-x64');
    process.exit(1);
  }

  return { platform, arch };
}

function getPackageVersion() {
  const packageJson = require('../package.json');
  return packageJson.version;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'trak-board-installer' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        httpsGet(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getLatestRelease() {
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;
  const data = await httpsGet(url);
  return JSON.parse(data.toString());
}

async function downloadBinary(url, destPath) {
  console.log(`  Downloading: ${path.basename(destPath)}...`);
  const data = await httpsGet(url);
  fs.writeFileSync(destPath, data);
  fs.chmodSync(destPath, 0o755);
  console.log(`  Downloaded: ${(data.length / 1024 / 1024).toFixed(1)} MB`);
}

async function main() {
  const { platform, arch } = getPlatformArch();
  const version = getPackageVersion();

  console.log(`\ntrak-board postinstall`);
  console.log(`======================`);
  console.log(`Platform: ${platform}-${arch}`);
  console.log(`Version: v${version}`);

  // Ensure bin directory exists
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  // Try to get the release for this version first, fall back to latest
  let releaseTag = `v${version}`;
  let releaseUrl = `https://github.com/${REPO}/releases/download/${releaseTag}`;

  const binaries = [
    { name: 'board-cli', dest: '.board-binary' },
    { name: 'board-tui', dest: '.board-tui-binary' },
    { name: 'board-web', dest: '.board-web-binary' }
  ];

  console.log(`\nDownloading binaries from release ${releaseTag}...`);

  let downloadSuccess = true;
  for (const binary of binaries) {
    const fileName = `${binary.name}-${platform}-${arch}`;
    const url = `${releaseUrl}/${fileName}`;
    const destPath = path.join(BIN_DIR, binary.dest);

    try {
      await downloadBinary(url, destPath);
    } catch (err) {
      console.error(`  Failed to download ${fileName}: ${err.message}`);
      downloadSuccess = false;
    }
  }

  if (!downloadSuccess) {
    // Try latest release as fallback
    console.log(`\nFalling back to latest release...`);
    try {
      const release = await getLatestRelease();
      releaseTag = release.tag_name;
      releaseUrl = `https://github.com/${REPO}/releases/download/${releaseTag}`;

      console.log(`Found release: ${releaseTag}`);

      for (const binary of binaries) {
        const fileName = `${binary.name}-${platform}-${arch}`;
        const url = `${releaseUrl}/${fileName}`;
        const destPath = path.join(BIN_DIR, binary.dest);

        try {
          await downloadBinary(url, destPath);
        } catch (err) {
          console.error(`  Failed to download ${fileName}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`Failed to get latest release: ${err.message}`);
    }
  }

  // Verify installation
  const boardPath = path.join(BIN_DIR, '.board-binary');
  const tuiPath = path.join(BIN_DIR, '.board-tui-binary');
  const webPath = path.join(BIN_DIR, '.board-web-binary');

  if (fs.existsSync(boardPath) && fs.existsSync(tuiPath) && fs.existsSync(webPath)) {
    console.log(`\nInstallation successful!`);
    console.log(`\nUsage:`);
    console.log(`  board --help           # CLI help`);
    console.log(`  board-web              # Start web server (port 3345)`);
    if (platform === 'darwin') {
      console.log(`  TMPDIR=/tmp board-tui  # Launch TUI (macOS workaround)`);
    } else {
      console.log(`  board-tui              # Launch TUI`);
    }
  } else {
    console.log(`\nPartial installation - some binaries may be missing.`);
    console.log(`You can try running the install script manually:`);
    console.log(`  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install-binary.sh | bash`);
  }
}

// Only run if this is a global install or explicit postinstall
// Skip for local dev installs
if (process.env.npm_config_global === 'true' || process.env.TRAK_FORCE_POSTINSTALL === 'true') {
  main().catch((err) => {
    console.error('Postinstall failed:', err.message);
    // Don't fail the install - user can download manually
    process.exit(0);
  });
} else {
  console.log('Skipping binary download (local install). Run with TRAK_FORCE_POSTINSTALL=true to force.');
}
