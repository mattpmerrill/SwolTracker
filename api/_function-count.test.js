import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vercel turns every .js file under api/ into a Serverless Function unless its name starts with
// `_`. The Hobby plan allows 12 per deployment and fails the deploy (after a green build) above
// that, so this catches it locally. Test files count too, which is why they start with `_`.
const API_DIR = fileURLToPath(new URL('.', import.meta.url));
const HOBBY_FUNCTION_LIMIT = 12;

function deployedFunctions(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return deployedFunctions(path);
    return entry.name.endsWith('.js') && !entry.name.startsWith('_') ? [relative(API_DIR, path)] : [];
  });
}

describe('api/ Vercel functions', () => {
  const functions = deployedFunctions(API_DIR);

  it(`stays within the Hobby plan limit of ${HOBBY_FUNCTION_LIMIT}`, () => {
    expect(functions.length, functions.join(', ')).toBeLessThanOrEqual(HOBBY_FUNCTION_LIMIT);
  });

  it('never deploys a test file as a function', () => {
    expect(functions.filter((name) => name.endsWith('.test.js'))).toEqual([]);
  });
});
