// advanced_statements.js checks `advancedStatementsEnabled` in storage internally
// and exits early if the setting is off — no need to guard here.
import type { PluginManifest } from '../types';

const manifest = {
  id: 'statements',
  matches: (url: string) =>
    url.includes('/learn/reports/student-performance') && url.includes('/activity'),
  scripts: ['plugins/statements/advanced_statements.js'],
} satisfies PluginManifest;

export default manifest;
