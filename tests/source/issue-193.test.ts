import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const darkThemeCss = readFileSync(
  resolve(import.meta.dir, '../../src/plugins/dark-theme/dark-theme.css'),
  'utf8'
);

test('dark theme keeps virtual machines resource text readable', () => {
  expect(darkThemeCss).toContain('cu-self-service-virtual-machines-feature-list .banner');
  expect(darkThemeCss).toContain(
    'cu-self-service-virtual-machines-feature-list .banner-text .text-primary'
  );
  expect(darkThemeCss).toContain(
    'cu-self-service-virtual-machines-feature-list .banner-text .text-secondary'
  );
  expect(darkThemeCss).toContain('cu-self-service-virtual-machines-feature-list cu-resource-card');
  expect(darkThemeCss).toContain('cu-instance-list .banner');
  expect(darkThemeCss).toContain('cu-instance-list .not-found-text');
  expect(darkThemeCss).toContain('background-color: var(--culms-dark-bg-secondary) !important;');
  expect(darkThemeCss).toContain('color: var(--culms-dark-text-secondary) !important;');
});
