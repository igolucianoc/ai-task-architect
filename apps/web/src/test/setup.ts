import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/vue';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
