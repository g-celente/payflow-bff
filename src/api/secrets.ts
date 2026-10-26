import { createHash, timingSafeEqual } from 'node:crypto';

// Constant-time comparison of a received secret header with the expected one. Hashing first gives
// equal lengths, so neither the content nor the length leaks through the response time.
export function sameSecret(received: string | undefined, expected: string): boolean {
  if (received === undefined) {
    return false;
  }
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(received), digest(expected));
}
