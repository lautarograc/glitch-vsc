import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkGlitchTipConnection } from '../api';

// Try to read VS Code settings.json to get your real credentials
const settingsPath = path.join(os.homedir(), 'Library/Application Support/Code/User/settings.json'); // MacOS path
// Windows: process.env.APPDATA + '/Code/User/settings.json'
// Linux: os.homedir() + '/.config/Code/User/settings.json'

async function run() {
    let config = {
        "glitchtip.url": "https://app.glitchtip.com",
        "glitchtip.authToken": "",
        "glitchtip.organizationSlug": "",
        "glitchtip.projectSlug": ""
    };

    if (fs.existsSync(settingsPath)) {
        console.log("Reading VS Code settings...");
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        config = { ...config, ...settings };
    }

    // Override with arguments if provided: npm run test-cli -- --token=xyz
    // (Simple argument parsing logic would go here)

    if (!config['glitchtip.authToken']) {
        console.error("❌ No Auth Token found in settings.json");
        process.exit(1);
    }

    await checkGlitchTipConnection(
        config['glitchtip.url'],
        config['glitchtip.authToken'],
        config['glitchtip.organizationSlug'],
        config['glitchtip.projectSlug']
    );
}

run();
