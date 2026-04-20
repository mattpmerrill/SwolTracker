import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vitest projects have their own cwd — compute SKILL.md path relative to this file.
const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(HERE, '..', '..', '..', 'SKILL.md');

function readSkill(): string {
  return readFileSync(SKILL_PATH, 'utf8');
}

// Minimal re-implementation of the frontmatter parser from api/mcp/skill.js
// kept in lock-step. If this test breaks, update both.
function parseFrontmatter(src: string): { frontmatter: Record<string, unknown> | null; body: string } {
  if (!src.startsWith('---\n')) return { frontmatter: null, body: src };
  const end = src.indexOf('\n---\n', 4);
  if (end === -1) return { frontmatter: null, body: src };
  const raw = src.slice(4, end);
  const body = src.slice(end + 5);
  const frontmatter: Record<string, unknown> = {};
  let currentKey: string | null = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(frontmatter[currentKey])) frontmatter[currentKey] = [];
      (frontmatter[currentKey] as string[]).push(listMatch[1].trim());
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

describe('SKILL.md', () => {
  it('exists and has frontmatter', () => {
    const src = readSkill();
    expect(src.startsWith('---\n')).toBe(true);
    const { frontmatter } = parseFrontmatter(src);
    expect(frontmatter).not.toBeNull();
  });

  it('frontmatter declares name, version, tone, capabilities, limitations, event_keys, context_keys', () => {
    const { frontmatter } = parseFrontmatter(readSkill());
    const fm = frontmatter as Record<string, unknown>;
    expect(fm.name).toBe('swoltracker');
    expect(fm.version).toBeDefined();
    expect(fm.tone).toBeDefined();
    expect(Array.isArray(fm.capabilities)).toBe(true);
    expect(Array.isArray(fm.limitations)).toBe(true);
    expect(Array.isArray(fm.event_keys)).toBe(true);
    expect(Array.isArray(fm.context_keys)).toBe(true);
  });

  it('event_keys match events actually emitted in code (not aspirational)', () => {
    const { frontmatter } = parseFrontmatter(readSkill());
    const events = (frontmatter as any).event_keys as string[];
    // Emitted by mcp/src/tools/actions.ts
    expect(events).toContain('swoltracker.workout_completed');
    expect(events).toContain('swoltracker.pr_detected');
    expect(events).toContain('swoltracker.workout_reminder');
    // Previously documented but never emitted — must NOT be here until implemented.
    expect(events).not.toContain('swoltracker.streak_at_risk');
    expect(events).not.toContain('swoltracker.weekly_summary_ready');
  });

  it('context_keys match the 7 modules in createContextModules', () => {
    const { frontmatter } = parseFrontmatter(readSkill());
    const keys = ((frontmatter as any).context_keys as string[]).sort();
    expect(keys).toEqual([
      'current_program',
      'gym_equipment',
      'maxes',
      'recent_logs',
      'streak',
      'unread_coach_notes',
      'upcoming_deload',
    ]);
  });

  it('body mentions every tool category', () => {
    const { body } = parseFrontmatter(readSkill());
    expect(body).toMatch(/### Query/);
    expect(body).toMatch(/### Action/);
    expect(body).toMatch(/### Meta/);
  });
});
