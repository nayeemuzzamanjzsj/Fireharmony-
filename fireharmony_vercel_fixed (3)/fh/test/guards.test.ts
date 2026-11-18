import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Project Compliance & Integrity Guard Tests', () => {
  it('scans src/ and server/ for banned classifications and unapproved claim phrases', () => {
    const bannedPhrases = [
      'verified fire',
      'real fire',
      'brick kiln',
      'VIIRS detects X% more fires',
      'accuracy',
      'ImageStudio',
      'Chatbot',
      'Satellite Thermal Studio',
      'EO Research Assistant',
      'gemini',
    ];

    const dirsToScan = ['src', 'server'];
    const violations: { file: string; phrase: string }[] = [];

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js'))
        ) {
          const content = fs.readFileSync(fullPath, 'utf8');

          for (const phrase of bannedPhrases) {
            const regex = new RegExp(`\\b${phrase}\\b`, 'i');
            if (regex.test(content)) {
              violations.push({ file: fullPath, phrase });
            }
          }
        }
      }
    }

    for (const d of dirsToScan) {
      if (fs.existsSync(d)) scanDir(d);
    }

    assert.deepStrictEqual(
      violations,
      [],
      `Found banned phrases in codebase: ${JSON.stringify(violations)}`
    );
  });

  it('confirms no server secrets are exposed in client source code', () => {
    const clientSecretLeaks: { file: string; secret: string }[] = [];
    const sensitiveTokens = ['FIRMS_MAP_KEY', 'CRON_SECRET', 'DATABASE_URL', 'ADMIN_PIN'];

    function scanClient(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanClient(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.html'))
        ) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const tok of sensitiveTokens) {
            if (content.includes(`process.env.${tok}`) || content.includes(`VITE_${tok}`)) {
              clientSecretLeaks.push({ file: fullPath, secret: tok });
            }
          }
        }
      }
    }

    scanClient('src');
    assert.deepStrictEqual(
      clientSecretLeaks,
      [],
      `Client code must not access server secrets: ${JSON.stringify(clientSecretLeaks)}`
    );
  });
});
