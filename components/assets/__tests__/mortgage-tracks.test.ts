/**
 * Unit tests for mortgage tracks helper functions
 * Tests tracksFromApi and tracksToApi conversion utilities
 */

import { tracksFromApi, tracksToApi, MortgageTrackInput } from '../mortgage-tracks';

describe('Mortgage Tracks Helper Functions', () => {
  describe('tracksFromApi', () => {
    it('should convert API format to form input format', () => {
      const apiTracks = [
        {
          id: 'track-1',
          name: 'Fixed Rate',
          amount: 200000,
          interestRate: 4.5,
          monthlyPayment: 1500,
          maturityDate: '2045-01-15',
          sortOrder: 0,
        },
        {
          id: 'track-2',
          name: 'Prime',
          amount: 100000,
          interestRate: 5.0,
          monthlyPayment: null, // null monthly payment should become empty string
          maturityDate: null,
          sortOrder: 1,
        },
      ];

      const result = tracksFromApi(apiTracks);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'track-1',
        name: 'Fixed Rate',
        amount: '200000',
        interestRate: '4.5',
        monthlyPayment: '1500',
        maturityDate: expect.any(Date),
      });
      expect(result[1]).toEqual({
        id: 'track-2',
        name: 'Prime',
        amount: '100000',
        interestRate: '5',
        monthlyPayment: '',
        maturityDate: undefined,
      });
    });

    it('should return empty array for undefined tracks', () => {
      expect(tracksFromApi(undefined)).toEqual([]);
    });

    it('should return empty array for empty tracks array', () => {
      expect(tracksFromApi([])).toEqual([]);
    });

    it('should handle null monthly payment', () => {
      const apiTracks = [
        {
          name: 'Track 1',
          amount: 100000,
          interestRate: 4.0,
          monthlyPayment: null,
          maturityDate: null,
        },
      ];

      const result = tracksFromApi(apiTracks);

      expect(result[0].monthlyPayment).toBe('');
    });

    it('should handle Date object for maturityDate', () => {
      const maturityDate = new Date('2045-06-15');
      const apiTracks = [
        {
          name: 'Track 1',
          amount: 100000,
          interestRate: 4.0,
          monthlyPayment: 500,
          maturityDate: maturityDate,
        },
      ];

      const result = tracksFromApi(apiTracks);

      expect(result[0].maturityDate).toBeInstanceOf(Date);
      expect(result[0].maturityDate?.toISOString()).toBe(maturityDate.toISOString());
    });

    it('should handle string date for maturityDate', () => {
      const apiTracks = [
        {
          name: 'Track 1',
          amount: 100000,
          interestRate: 4.0,
          monthlyPayment: 500,
          maturityDate: '2045-06-15T00:00:00.000Z',
        },
      ];

      const result = tracksFromApi(apiTracks);

      expect(result[0].maturityDate).toBeInstanceOf(Date);
    });

    it('should convert numbers to strings correctly', () => {
      const apiTracks = [
        {
          name: 'Track 1',
          amount: 123456.78,
          interestRate: 3.25,
          monthlyPayment: 1234.56,
          maturityDate: null,
        },
      ];

      const result = tracksFromApi(apiTracks);

      expect(result[0].amount).toBe('123456.78');
      expect(result[0].interestRate).toBe('3.25');
      expect(result[0].monthlyPayment).toBe('1234.56');
    });

    it('should preserve track id when present', () => {
      const apiTracks = [
        {
          id: 'existing-track-id',
          name: 'Track 1',
          amount: 100000,
          interestRate: 4.0,
          monthlyPayment: 500,
          maturityDate: null,
        },
      ];

      const result = tracksFromApi(apiTracks);

      expect(result[0].id).toBe('existing-track-id');
    });

    it('should handle track without id', () => {
      const apiTracks = [
        {
          name: 'New Track',
          amount: 100000,
          interestRate: 4.0,
          monthlyPayment: 500,
          maturityDate: null,
        },
      ];

      const result = tracksFromApi(apiTracks);

      expect(result[0].id).toBeUndefined();
    });
  });

  describe('tracksToApi', () => {
    it('should convert form input format to API format', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          id: 'track-1',
          name: 'Fixed Rate',
          amount: '200000',
          interestRate: '4.5',
          monthlyPayment: '1500',
          maturityDate: new Date('2045-01-15'),
        },
        {
          name: 'Prime',
          amount: '100000',
          interestRate: '5.0',
          monthlyPayment: '',
          maturityDate: undefined,
        },
      ];

      const result = tracksToApi(formTracks);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'track-1',
        name: 'Fixed Rate',
        amount: 200000,
        interestRate: 4.5,
        monthlyPayment: 1500,
        maturityDate: '2045-01-15',
        sortOrder: 0,
      });
      expect(result[1]).toEqual({
        id: undefined,
        name: 'Prime',
        amount: 100000,
        interestRate: 5.0,
        monthlyPayment: null,
        maturityDate: null,
        sortOrder: 1,
      });
    });

    it('should filter out tracks with empty name', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          name: 'Valid Track',
          amount: '100000',
          interestRate: '4.0',
          monthlyPayment: '500',
          maturityDate: undefined,
        },
        {
          name: '', // Empty name
          amount: '50000',
          interestRate: '3.0',
          monthlyPayment: '300',
          maturityDate: undefined,
        },
        {
          name: '   ', // Whitespace only name
          amount: '50000',
          interestRate: '3.0',
          monthlyPayment: '300',
          maturityDate: undefined,
        },
      ];

      const result = tracksToApi(formTracks);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Valid Track');
    });

    it('should filter out tracks with empty amount', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          name: 'Track 1',
          amount: '100000',
          interestRate: '4.0',
          monthlyPayment: '500',
          maturityDate: undefined,
        },
        {
          name: 'Track 2',
          amount: '', // Empty amount
          interestRate: '4.0',
          monthlyPayment: '500',
          maturityDate: undefined,
        },
      ];

      const result = tracksToApi(formTracks);

      expect(result).toHaveLength(1);
    });

    it('should assign sortOrder based on array index', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          name: 'Track A',
          amount: '100000',
          interestRate: '4.0',
          monthlyPayment: '',
          maturityDate: undefined,
        },
        {
          name: 'Track B',
          amount: '100000',
          interestRate: '5.0',
          monthlyPayment: '',
          maturityDate: undefined,
        },
        {
          name: 'Track C',
          amount: '100000',
          interestRate: '6.0',
          monthlyPayment: '',
          maturityDate: undefined,
        },
      ];

      const result = tracksToApi(formTracks);

      expect(result[0].sortOrder).toBe(0);
      expect(result[1].sortOrder).toBe(1);
      expect(result[2].sortOrder).toBe(2);
    });

    it('should handle empty array', () => {
      expect(tracksToApi([])).toEqual([]);
    });

    it('should convert empty monthlyPayment string to null', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          name: 'Track 1',
          amount: '100000',
          interestRate: '4.0',
          monthlyPayment: '',
          maturityDate: undefined,
        },
      ];

      const result = tracksToApi(formTracks);

      expect(result[0].monthlyPayment).toBeNull();
    });

    it('should convert undefined maturityDate to null', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          name: 'Track 1',
          amount: '100000',
          interestRate: '4.0',
          monthlyPayment: '500',
          maturityDate: undefined,
        },
      ];

      const result = tracksToApi(formTracks);

      expect(result[0].maturityDate).toBeNull();
    });

    it('should format maturityDate as yyyy-MM-dd string', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          name: 'Track 1',
          amount: '100000',
          interestRate: '4.0',
          monthlyPayment: '500',
          maturityDate: new Date('2045-06-15T12:00:00Z'),
        },
      ];

      const result = tracksToApi(formTracks);

      expect(result[0].maturityDate).toBe('2045-06-15');
    });

    it('should handle parseFloat edge cases', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          name: 'Track 1',
          amount: '0',
          interestRate: '0',
          monthlyPayment: '0',
          maturityDate: undefined,
        },
      ];

      const result = tracksToApi(formTracks);

      // The filter checks: track.name.trim() && track.amount
      // '0' is truthy as a string, so this track passes the filter
      // parseFloat('0') = 0 for amount
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(0);
      expect(result[0].interestRate).toBe(0);
      expect(result[0].monthlyPayment).toBe(0);
    });

    it('should trim track names', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          name: '  Fixed Rate  ',
          amount: '100000',
          interestRate: '4.0',
          monthlyPayment: '500',
          maturityDate: undefined,
        },
      ];

      const result = tracksToApi(formTracks);

      expect(result[0].name).toBe('Fixed Rate');
    });

    it('should preserve track id for existing tracks', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          id: 'existing-id-123',
          name: 'Track 1',
          amount: '100000',
          interestRate: '4.0',
          monthlyPayment: '500',
          maturityDate: undefined,
        },
      ];

      const result = tracksToApi(formTracks);

      expect(result[0].id).toBe('existing-id-123');
    });

    it('should handle decimal amounts and rates', () => {
      const formTracks: MortgageTrackInput[] = [
        {
          name: 'Track 1',
          amount: '123456.78',
          interestRate: '3.25',
          monthlyPayment: '1234.56',
          maturityDate: undefined,
        },
      ];

      const result = tracksToApi(formTracks);

      expect(result[0].amount).toBe(123456.78);
      expect(result[0].interestRate).toBe(3.25);
      expect(result[0].monthlyPayment).toBe(1234.56);
    });
  });

  describe('Round-trip conversion', () => {
    it('should preserve data through API -> Form -> API conversion', () => {
      const originalApiTracks = [
        {
          id: 'track-1',
          name: 'Fixed Rate',
          amount: 200000,
          interestRate: 4.5,
          monthlyPayment: 1500,
          maturityDate: '2045-01-15',
          sortOrder: 0,
        },
        {
          id: 'track-2',
          name: 'Prime',
          amount: 100000,
          interestRate: 5.0,
          monthlyPayment: null,
          maturityDate: null,
          sortOrder: 1,
        },
      ];

      const formFormat = tracksFromApi(originalApiTracks);
      const backToApi = tracksToApi(formFormat);

      expect(backToApi).toHaveLength(2);
      expect(backToApi[0].id).toBe('track-1');
      expect(backToApi[0].name).toBe('Fixed Rate');
      expect(backToApi[0].amount).toBe(200000);
      expect(backToApi[0].interestRate).toBe(4.5);
      expect(backToApi[0].monthlyPayment).toBe(1500);
      expect(backToApi[0].maturityDate).toBe('2045-01-15');
      expect(backToApi[0].sortOrder).toBe(0);

      expect(backToApi[1].id).toBe('track-2');
      expect(backToApi[1].name).toBe('Prime');
      expect(backToApi[1].amount).toBe(100000);
      expect(backToApi[1].interestRate).toBe(5);
      expect(backToApi[1].monthlyPayment).toBeNull();
      expect(backToApi[1].maturityDate).toBeNull();
      expect(backToApi[1].sortOrder).toBe(1);
    });
  });

  describe('Aggregate Calculations (Component Internal)', () => {
    // These test the totals calculation logic as implemented in the component
    it('should calculate total amount correctly', () => {
      const tracks: MortgageTrackInput[] = [
        {
          name: 'Track 1',
          amount: '200000',
          interestRate: '4.5',
          monthlyPayment: '1500',
          maturityDate: undefined,
        },
        {
          name: 'Track 2',
          amount: '150000',
          interestRate: '5.0',
          monthlyPayment: '800',
          maturityDate: undefined,
        },
        {
          name: 'Track 3',
          amount: '100000',
          interestRate: '3.5',
          monthlyPayment: '600',
          maturityDate: undefined,
        },
      ];

      const totals = tracks.reduce(
        (acc, track) => {
          const amount = parseFloat(track.amount) || 0;
          const payment = parseFloat(track.monthlyPayment) || 0;
          const rate = parseFloat(track.interestRate) || 0;
          return {
            amount: acc.amount + amount,
            payment: acc.payment + payment,
            weightedRate: acc.weightedRate + amount * rate,
          };
        },
        { amount: 0, payment: 0, weightedRate: 0 }
      );

      const avgRate = totals.amount > 0 ? totals.weightedRate / totals.amount : 0;

      expect(totals.amount).toBe(450000);
      expect(totals.payment).toBe(2900);
      // Weighted avg: (200000 * 4.5 + 150000 * 5.0 + 100000 * 3.5) / 450000
      // = (900000 + 750000 + 350000) / 450000 = 2000000 / 450000 = 4.444...
      expect(avgRate).toBeCloseTo(4.44, 1);
    });

    it('should handle empty tracks for totals', () => {
      const tracks: MortgageTrackInput[] = [];

      const totals = tracks.reduce(
        (acc, track) => {
          const amount = parseFloat(track.amount) || 0;
          const payment = parseFloat(track.monthlyPayment) || 0;
          const rate = parseFloat(track.interestRate) || 0;
          return {
            amount: acc.amount + amount,
            payment: acc.payment + payment,
            weightedRate: acc.weightedRate + amount * rate,
          };
        },
        { amount: 0, payment: 0, weightedRate: 0 }
      );

      const avgRate = totals.amount > 0 ? totals.weightedRate / totals.amount : 0;

      expect(totals.amount).toBe(0);
      expect(totals.payment).toBe(0);
      expect(avgRate).toBe(0);
    });

    it('should handle invalid/empty string values in tracks', () => {
      const tracks: MortgageTrackInput[] = [
        {
          name: 'Track 1',
          amount: '100000',
          interestRate: '4.0',
          monthlyPayment: '',
          maturityDate: undefined,
        },
        {
          name: 'Track 2',
          amount: '',
          interestRate: '',
          monthlyPayment: '',
          maturityDate: undefined,
        },
      ];

      const totals = tracks.reduce(
        (acc, track) => {
          const amount = parseFloat(track.amount) || 0;
          const payment = parseFloat(track.monthlyPayment) || 0;
          const rate = parseFloat(track.interestRate) || 0;
          return {
            amount: acc.amount + amount,
            payment: acc.payment + payment,
            weightedRate: acc.weightedRate + amount * rate,
          };
        },
        { amount: 0, payment: 0, weightedRate: 0 }
      );

      expect(totals.amount).toBe(100000);
      expect(totals.payment).toBe(0);
    });
  });
});
