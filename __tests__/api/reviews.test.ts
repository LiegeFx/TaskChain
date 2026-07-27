import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/reviews/route';
import { GET } from '@/app/api/reviews/[userId]/route';
import { sql } from '@/lib/db';

// Mock the db module
vi.mock('@/lib/db', () => {
  return {
    sql: vi.fn(),
  };
});

describe('Reviews API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/reviews', () => {
    it('returns 400 for invalid rating', async () => {
      const req = new Request('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          contractId: 1,
          reviewerId: 2,
          freelancerId: 3,
          rating: 6, // Invalid rating
        }),
      });

      const response = await POST(req);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid input data');
    });

    it('returns 404 if contract not found', async () => {
      // Mock contract not found
      (sql as any).mockResolvedValueOnce([]);

      const req = new Request('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          contractId: 99,
          reviewerId: 2,
          freelancerId: 3,
          rating: 5,
        }),
      });

      const response = await POST(req);
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Contract not found');
    });

    it('successfully creates a verified review if contract is completed', async () => {
      // Mock contract status query (completed)
      (sql as any).mockResolvedValueOnce([{ status: 'completed', client_id: 2 }]);
      // Mock insert query
      (sql as any).mockResolvedValueOnce([{ id: 1, contract_id: 1, verified: true }]);

      const req = new Request('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          contractId: 1,
          reviewerId: 2,
          freelancerId: 3,
          rating: 5,
          comment: 'Great work!',
        }),
      });

      const response = await POST(req);
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.verified).toBe(true);
      expect(sql).toHaveBeenCalledTimes(2);
    });

    it('returns 409 on unique constraint violation', async () => {
      // Mock contract status query
      (sql as any).mockResolvedValueOnce([{ status: 'completed', client_id: 2 }]);
      // Mock insert query throwing unique violation
      const error: any = new Error('Unique constraint');
      error.code = '23505';
      (sql as any).mockRejectedValueOnce(error);

      const req = new Request('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          contractId: 1,
          reviewerId: 2,
          freelancerId: 3,
          rating: 5,
        }),
      });

      const response = await POST(req);
      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('One review allowed per contract.');
    });
  });

  describe('GET /api/reviews/[userId]', () => {
    it('returns 400 for invalid userId', async () => {
      const req = new Request('http://localhost/api/reviews/invalid');
      const response = await GET(req, { params: Promise.resolve({ userId: 'invalid' }) });
      expect(response.status).toBe(400);
    });

    it('returns paginated reviews', async () => {
      // Mock fetching reviews
      const mockRows = [
        { id: 2, contract_id: 2, rating: 4, total_count: '2' },
        { id: 1, contract_id: 1, rating: 5, total_count: '2' },
      ];
      (sql as any).mockResolvedValueOnce(mockRows);

      const req = new Request('http://localhost/api/reviews/3?page=1&limit=2');
      const response = await GET(req, { params: Promise.resolve({ userId: '3' }) });
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.data).toHaveLength(2);
      expect(data.data[0]).not.toHaveProperty('total_count'); // ensures mapping worked
      expect(data.meta.totalCount).toBe(2);
      expect(data.meta.page).toBe(1);
      expect(data.meta.totalPages).toBe(1);
      expect(sql).toHaveBeenCalledTimes(1);
    });
  });
});
