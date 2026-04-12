import fs from 'fs';
import path from 'path';
import os from 'os';

export const HARNESSES = {
  'claude-code': {
    label: 'Claude Code',
    detect: () => fs.existsSync(path.join(os.homedir(), '.claude')),
    skillDir: () => path.join(os.homedir(), '.claude', 'skills'),
    envConfig: 'settings',
  },
  'codex': {
    label: 'Codex CLI',
    detect: () => fs.existsSync(path.join(os.homedir(), '.codex')),
    skillDir: () => path.join(os.homedir(), '.codex', 'skills'),
    envConfig: 'shell',
  },
  'opencode': {
    label: 'OpenCode',
    detect: () => fs.existsSync(path.join(os.homedir(), '.config', 'opencode')),
    skillDir: () => path.join(os.homedir(), '.config', 'opencode', 'skills'),
    envConfig: 'shell',
  },
  'cursor': {
    label: 'Cursor',
    detect: () => fs.existsSync(path.join(os.homedir(), '.cursor')),
    skillDir: () => path.join(os.homedir(), '.cursor', 'skills'),
    envConfig: 'shell',
  },
  'windsurf': {
    label: 'Windsurf',
    detect: () => fs.existsSync(path.join(os.homedir(), '.codeium', 'windsurf')),
    skillDir: () => path.join(os.homedir(), '.codeium', 'windsurf', 'skills'),
    envConfig: 'shell',
  },
};

export function detect() {
  return Object.entries(HARNESSES)
    .filter(([, h]) => h.detect())
    .map(([k]) => k);
}
