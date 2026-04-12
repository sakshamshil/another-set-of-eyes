#!/usr/bin/env node
import * as p from '@clack/prompts';
import { detect, HARNESSES } from './lib/detect.js';
import { install } from './lib/install.js';

const PLACEHOLDERS = [
  'my llm hallucinates but at least it tries',
  'vibe coding until production catches fire',
  'merge conflict in production on a friday',
  'my context window is full please summarize',
  'ship it and pray it works flawlessly?',
  'the diff looks fine until it really isnt',
  'i just restarted the server and it worked?',
];

async function main() {
  console.log('');
  p.intro('Another Set of Eyes — Agent Install');

  const url = await p.text({
    message: 'Your ASOE URL',
    placeholder: 'https://asoe.sakshamshil.xyz',
    defaultValue: 'https://asoe.sakshamshil.xyz',
    validate: (v) => v.startsWith('http') ? undefined : 'Must be a valid URL',
  });
  if (p.isCancel(url)) { p.cancel('Cancelled.'); process.exit(0); }

  const phrasePlaceholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)];
  const token = await p.text({
    message: 'Your passphrase',
    placeholder: `e.g. ${phrasePlaceholder}`,
    validate: (v) => v.trim().length < 12 ? 'Must be at least 12 characters' : undefined,
  });
  if (p.isCancel(token)) { p.cancel('Cancelled.'); process.exit(0); }

  const detected = detect();
  const options = Object.entries(HARNESSES).map(([k, h]) => ({
    value: k,
    label: h.label,
    hint: detected.includes(k) ? 'detected' : '',
  }));

  const selected = await p.multiselect({
    message: detected.length
      ? 'Install for (detected agents pre-selected)'
      : 'Which agents do you use?',
    options,
    initialValues: detected.length ? detected : [],
    required: true,
  });
  if (p.isCancel(selected)) { p.cancel('Cancelled.'); process.exit(0); }

  const spinner = p.spinner();
  spinner.start('Installing...');

  let shellProfile = null;
  for (const harness of selected) {
    const result = await install(harness, { url: url.trim(), token: token.trim() });
    if (result) shellProfile = result;
    spinner.message(`Installed for ${HARNESSES[harness].label}`);
  }

  spinner.stop('Installed.');

  const notes = [
    `Skill installed for: ${selected.map(k => HARNESSES[k].label).join(', ')}`,
  ];
  if (shellProfile) {
    notes.push(`Env vars written to ${shellProfile} — run: source ${shellProfile}`);
  }

  p.note(notes.join('\n'), 'Next steps');
  p.outro('Your agent will now push docs to ' + url.trim());
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
