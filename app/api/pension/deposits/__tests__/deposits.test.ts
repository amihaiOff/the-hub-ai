/**
 * Integration tests for /api/pension/deposits endpoints
 * Tests deposit CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock the auth-utils module
const mockGetCurrentUser = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock Prisma client
const mockPrisma = {
  pensionAccount: {
    findUnique: jest.fn(),
  },
  pensionDeposit: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

import { POST } from '../route';
import { GET, PUT, DELETE } from '../[id]/route';

describe('Pension Deposits API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockAccount = {
    id: 'account-123',
    userId: 'user-123',
    name: 'Test Account',
  };

  const mockDeposit = {
    id: 'deposit-123',
    accountId: 'account-123',
    depositDate: new Date('2024-01-15'),
    salaryMonth: new Date('2024-01-01'),
    amount: 5000,
    employer: 'Test Company',
    account: mockAccount,
  };

  describe('POST /api/pension/deposits', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 400 when account ID is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Account ID is required');
    });

    it('returns 400 when account ID is not a string', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 123,
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Account ID is required');
    });

    it('returns 400 when deposit date is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Deposit date is required');
    });

    it('returns 400 when deposit date is invalid', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: 'invalid-date',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid deposit date format');
    });

    it('returns 400 when salary month is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Salary month is required');
    });

    it('returns 400 when salary month is invalid', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: 'invalid-date',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid salary month format');
    });

    it('returns 400 when amount is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Amount must be a positive number');
    });

    it('returns 400 when amount is not a number', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 'five thousand',
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Amount must be a positive number');
    });

    it('returns 400 when amount is zero', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 0,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Amount must be a positive number');
    });

    it('returns 400 when amount is negative', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: -100,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Amount must be a positive number');
    });

    it('returns 400 when employer is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Employer name is required');
    });

    it('returns 400 when employer is not a string', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 123,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Employer name is required');
    });

    it('returns 400 when employer is empty string', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: '   ',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Employer name is required');
    });

    it('returns 404 when account not found', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionAccount.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'non-existent',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Account not found');
    });

    it('returns 403 when user does not own the account', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionAccount.findUnique.mockResolvedValue({
        ...mockAccount,
        userId: 'other-user',
      });

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('successfully creates a deposit', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.pensionDeposit.create.mockResolvedValue(mockDeposit);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('deposit-123');
      expect(data.data.amount).toBe(5000);
    });

    it('handles database error', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.pensionDeposit.create.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new NextRequest('http://localhost:3001/api/pension/deposits', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'account-123',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Test Company',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create deposit');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('GET /api/pension/deposits/[id]', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123');

      const response = await GET(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 404 when deposit not found', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/non-existent');

      const response = await GET(request, { params: Promise.resolve({ id: 'non-existent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Deposit not found');
    });

    it('returns 403 when user does not own the account', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue({
        ...mockDeposit,
        account: { ...mockAccount, userId: 'other-user' },
      });

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123');

      const response = await GET(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('successfully returns a deposit', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue(mockDeposit);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123');

      const response = await GET(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('deposit-123');
    });

    it('handles database error', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123');

      const response = await GET(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch deposit');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('PUT /api/pension/deposits/[id]', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({ amount: 6000 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 400 for invalid deposit date', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({ depositDate: 'invalid' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid deposit date format');
    });

    it('returns 400 for invalid salary month', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({ salaryMonth: 'invalid' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid salary month format');
    });

    it('returns 400 when amount is not a number', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({ amount: 'not a number' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Amount must be a positive number');
    });

    it('returns 400 when amount is zero', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({ amount: 0 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Amount must be a positive number');
    });

    it('returns 400 when employer is not a string', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({ employer: 123 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Employer name cannot be empty');
    });

    it('returns 400 when employer is empty string', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({ employer: '   ' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Employer name cannot be empty');
    });

    it('returns 404 when deposit not found', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/non-existent', {
        method: 'PUT',
        body: JSON.stringify({ amount: 6000 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'non-existent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Deposit not found');
    });

    it('returns 403 when user does not own the account', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue({
        ...mockDeposit,
        account: { ...mockAccount, userId: 'other-user' },
      });

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({ amount: 6000 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('successfully updates a deposit', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue(mockDeposit);
      mockPrisma.pensionDeposit.update.mockResolvedValue({
        ...mockDeposit,
        amount: 6000,
      });

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({ amount: 6000 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.amount).toBe(6000);
    });

    it('updates multiple fields at once', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue(mockDeposit);
      mockPrisma.pensionDeposit.update.mockResolvedValue({
        ...mockDeposit,
        amount: 7000,
        employer: 'New Company',
        depositDate: new Date('2024-02-15'),
        salaryMonth: new Date('2024-02-01'),
      });

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({
          amount: 7000,
          employer: 'New Company',
          depositDate: '2024-02-15',
          salaryMonth: '2024-02-01',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('handles database error', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue(mockDeposit);
      mockPrisma.pensionDeposit.update.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'PUT',
        body: JSON.stringify({ amount: 6000 }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to update deposit');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('DELETE /api/pension/deposits/[id]', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 404 when deposit not found', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/non-existent', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'non-existent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Deposit not found');
    });

    it('returns 403 when user does not own the account', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue({
        ...mockDeposit,
        account: { ...mockAccount, userId: 'other-user' },
      });

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('successfully deletes a deposit', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue(mockDeposit);
      mockPrisma.pensionDeposit.delete.mockResolvedValue(mockDeposit);

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Deposit deleted successfully');
    });

    it('handles database error', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionDeposit.findUnique.mockResolvedValue(mockDeposit);
      mockPrisma.pensionDeposit.delete.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new NextRequest('http://localhost:3001/api/pension/deposits/deposit-123', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'deposit-123' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete deposit');

      consoleErrorSpy.mockRestore();
    });
  });
});
