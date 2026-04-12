import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { HARNESSES } from './detect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_SRC = path.join(__dirname, '..', 'assets', 'SKILL.md');

function getShellProfile() {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh'))  return path.join(os.homedir(), '.zshrc');
  if (shell.includes('fish')) return path.join(os.homedir(), '.config', 'fish', 'config.fish');
  if (shell.includes('bash')) return path.join(os.homedir(), '.bashrc');
  return path.join(os.homedir(), '.profile');
}

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

function setEnvShell(url, token) {
  const profile = getShellProfile();
  const lines = [
    '',
    '# ASOE — Another Set of Eyes',
    `export ASOE_URL="${url}"`,
    `export ASOE_TOKEN="${token}"`,
  ].join('\n');

  const existing = fs.existsSync(profile) ? fs.readFileSync(profile, 'utf8') : '';
  if (existing.includes('ASOE_TOKEN')) {
    // Update in place
    const updated = existing
      .replace(/^export ASOE_URL=.*/m, `export ASOE_URL="${url}"`)
      .replace(/^export ASOE_TOKEN=.*/m, `export ASOE_TOKEN="${token}"`);
    fs.writeFileSync(profile, updated);
  } else {
    fs.appendFileSync(profile, lines + '\n');
  }
  return profile;
}

export async function install(harness, { url, token }) {
  const h = HARNESSES[harness];
  writeSkill(h.skillDir());

  if (h.envConfig === 'settings') {
    setEnvClaudeCode(url, token);
  } else {
    return setEnvShell(url, token);
  }
}
