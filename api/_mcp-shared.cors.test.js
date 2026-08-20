import { describe, it, expect } from 'vitest';
import { allowedOrigins, pickAllowedOrigin } from './_mcp-shared.js';

describe('CORS allow list', () => {
  it('defaults to the production app and local Vite origins', () => {
    expect(allowedOrigins({})).toEqual([
      'https://swol-tracker.vercel.app',
      'https://swol-tracker-matts-projects-628fad4b.vercel.app',
      'http://localhost:5173',
      'http://localhost:4173',
    ]);
  });

  it('parses ALLOWED_ORIGINS from env', () => {
    expect(allowedOrigins({ ALLOWED_ORIGINS: 'https://swoltracker.app, http://localhost:3000' }))
      .toEqual(['https://swoltracker.app', 'http://localhost:3000']);
  });

  it('echoes a listed origin and rejects everything else (never *)', () => {
    const allowed = ['https://swol-tracker.vercel.app'];
    expect(pickAllowedOrigin('https://swol-tracker.vercel.app', allowed)).toBe('https://swol-tracker.vercel.app');
    expect(pickAllowedOrigin('https://evil.example', allowed)).toBeNull();
    expect(pickAllowedOrigin(undefined, allowed)).toBeNull();
    expect(pickAllowedOrigin('*', allowed)).toBeNull();
  });
});
