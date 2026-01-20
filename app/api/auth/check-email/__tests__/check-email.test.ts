/**
 * Integration tests for /api/auth/check-email endpoint
 * Tests email allowlist checking
 */

import { NextRequest } from 'next/server';

// Need to set up env before importing the route
const originalEnv = process.env.ALLOWED_EMAILS;

describe('Check Email API', () => {
  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.ALLOWED_EMAILS = originalEnv;
    } else {
      delete process.env.ALLOWED_EMAILS;
    }
    // Clear module cache to reload with new env
    jest.resetModules();
  });

  describe('POST /api/auth/check-email', () => {
    it('returns 400 when email is missing', async () => {
      process.env.ALLOWED_EMAILS = 'test@example.com';
      jest.resetModules();
      const { POST } = await import('../route');

      const request = new NextRequest('http://localhost:3001/api/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.allowed).toBe(false);
    });

    it('returns 400 when email is not a string', async () => {
      process.env.ALLOWED_EMAILS = 'test@example.com';
      jest.resetModules();
      const { POST } = await import('../route');

      const request = new NextRequest('http://localhost:3001/api/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({ email: 123 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.allowed).toBe(false);
    });

    it('returns not allowed when allowlist is empty', async () => {
      delete process.env.ALLOWED_EMAILS;
      jest.resetModules();
      const { POST } = await import('../route');

      const request = new NextRequest('http://localhost:3001/api/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(false);
    });

    it('returns allowed for email in allowlist', async () => {
      process.env.ALLOWED_EMAILS = 'allowed@example.com,another@example.com';
      jest.resetModules();
      const { POST } = await import('../route');

      const request = new NextRequest('http://localhost:3001/api/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({ email: 'allowed@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(true);
    });

    it('returns not allowed for email not in allowlist', async () => {
      process.env.ALLOWED_EMAILS = 'allowed@example.com';
      jest.resetModules();
      const { POST } = await import('../route');

      const request = new NextRequest('http://localhost:3001/api/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({ email: 'notallowed@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(false);
    });

    it('normalizes email to lowercase', async () => {
      process.env.ALLOWED_EMAILS = 'allowed@example.com';
      jest.resetModules();
      const { POST } = await import('../route');

      const request = new NextRequest('http://localhost:3001/api/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({ email: 'ALLOWED@EXAMPLE.COM' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(true);
    });

    it('trims whitespace from email', async () => {
      process.env.ALLOWED_EMAILS = 'allowed@example.com';
      jest.resetModules();
      const { POST } = await import('../route');

      const request = new NextRequest('http://localhost:3001/api/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({ email: '  allowed@example.com  ' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(true);
    });

    it('handles allowlist with spaces around commas', async () => {
      process.env.ALLOWED_EMAILS = 'one@example.com , two@example.com , three@example.com';
      jest.resetModules();
      const { POST } = await import('../route');

      const request = new NextRequest('http://localhost:3001/api/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({ email: 'two@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(true);
    });

    it('returns 500 on JSON parse error', async () => {
      process.env.ALLOWED_EMAILS = 'test@example.com';
      jest.resetModules();
      const { POST } = await import('../route');

      const request = new NextRequest('http://localhost:3001/api/auth/check-email', {
        method: 'POST',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.allowed).toBe(false);
    });
  });
});
