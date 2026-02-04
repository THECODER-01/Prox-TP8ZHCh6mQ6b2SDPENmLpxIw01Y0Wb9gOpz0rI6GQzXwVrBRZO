import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const dataDir = root + '/data';
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

export const readJSON = (name, defaults) => {
  const file = dataDir + '/' + name;
  try {
    if (!existsSync(file)) {
      writeFileSync(file, JSON.stringify(defaults || {}, null, 2));
      return defaults || {};
    }
    const raw = readFileSync(file, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return defaults || {};
  }
};

export const writeJSON = (name, data) => {
  const file = dataDir + '/' + name;
  writeFileSync(file, JSON.stringify(data, null, 2));
};
