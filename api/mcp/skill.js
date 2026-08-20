// Serves the SKILL.md at /api/mcp/skill so agents can fetch it at connect time.
// Public endpoint — no auth. The document itself is non-sensitive guidance.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setCorsHeaders } from '../_mcp-shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(__dirname, '..', '..', 'SKILL.md');

let SKILL_CONTENT = '';
let SKILL_LOAD_ERROR = null;
try {
  SKILL_CONTENT = readFileSync(SKILL_PATH, 'utf8');
} catch (err) {
  SKILL_LOAD_ERROR = err?.message ?? String(err);
}

function parseFrontmatter(src) {
  if (!src.startsWith('---\n')) return { frontmatter: null, body: src };
  const end = src.indexOf('\n---\n', 4);
  if (end === -1) return { frontmatter: null, body: src };
  const raw = src.slice(4, end);
  const body = src.slice(end + 5);
  const frontmatter = {};
  let currentKey = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(frontmatter[currentKey])) frontmatter[currentKey] = [];
      frontmatter[currentKey].push(listMatch[1].trim());
      continue;
    }
    const kvMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      currentKey = key;
      if (value === '') frontmatter[key] = [];
      else frontmatter[key] = value;
    }
  }
  return { frontmatter, body };
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' });

  if (SKILL_LOAD_ERROR) {
    return res.status(500).json({ error: `SKILL.md unreadable: ${SKILL_LOAD_ERROR}` });
  }

  const accept = (req.headers.accept ?? '').toLowerCase();
  const wantsJson = accept.includes('application/json');

  if (wantsJson) {
    const { frontmatter, body } = parseFrontmatter(SKILL_CONTENT);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(JSON.stringify({ frontmatter, markdown: body }));
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(SKILL_CONTENT);
}
