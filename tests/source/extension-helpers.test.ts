import { expect, test } from 'bun:test';
import { getExtensionPopupUrl } from '../helpers/extension.js';

test('builds popup URL for a loaded extension', () => {
  expect(getExtensionPopupUrl('abc123')).toBe('chrome-extension://abc123/popup/popup.html');
});

test('throws when extension id is missing', () => {
  expect(() => getExtensionPopupUrl('')).toThrow('Extension service worker is not available');
});
