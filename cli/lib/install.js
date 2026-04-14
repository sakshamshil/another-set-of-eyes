import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { HARNESSES } from './detect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_SRC = path.join(__dirname, '..', 'assets', 'SKILL.md');

function writeSkill(skillDir) {
  const dest = path.join(skillDir, 'push-doc');
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(SKILL_SRC, path.join(dest, 'SKILL.md'));
}

function setEnvClaudeCode(url, token) {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
  }
  settings.env = { ...settings.env, ASOE_URL: url, ASOE_TOKEN: token };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function setEnvConfig(url, token) {
  const configDir = path.join(os.homedir(), '.asoe');
  const configPath = path.join(configDir, 'config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  }
  config.url = url;
  config.token = token;
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  // Restrict read permissions on Unix so other users can't read it
  if (process.platform !== 'win32') {
    fs.chmodSync(configPath, 0o600);
  }
  return configPath;
}

export async function install(harness, { url, token }) {
  const h = HARNESSES[harness];
  writeSkill(h.skillDir());

  if (h.envConfig === 'settings') {
    setEnvClaudeCode(url, token);
  } else {
    return setEnvConfig(url, token);
  }
}
