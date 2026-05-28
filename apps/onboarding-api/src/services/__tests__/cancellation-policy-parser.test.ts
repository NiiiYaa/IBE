import { describe, it, expect } from 'vitest';
import { parseCancellationPolicy } from '../harvesters/cancellation-policy-parser.js';

describe('parseCancellationPolicy', () => {
  it('returns null for null input', () => {
    expect(parseCancellationPolicy(null)).toBeNull();
  });

  it('parses non-refundable', () => {
    expect(parseCancellationPolicy('Non-Refundable')).toEqual({ type: 'non_refundable' });
    expect(parseCancellationPolicy('Fully Non-Refundable')).toEqual({ type: 'non_refundable' });
    expect(parseCancellationPolicy('Non Refundable Rate')).toEqual({ type: 'non_refundable' });
  });

  it('parses free cancellation N days', () => {
    const result = parseCancellationPolicy('Free cancellation until 3 days before arrival');
    expect(result).toEqual({
      type: 'custom',
      deadlineDays: 3,
      noShowPenalty: { value: 100, chargeType: 'percent' },
      frames: [],
    });
  });

  it('parses free cancellation in hours (rounds up to days)', () => {
    const result = parseCancellationPolicy('Free cancellation until 48h before check-in');
    expect(result).toMatchObject({ type: 'custom', deadlineDays: 2 });
  });

  it('parses 72h as 3 days', () => {
    const result = parseCancellationPolicy('Cancel free until 72 hours before arrival');
    expect(result).toMatchObject({ type: 'custom', deadlineDays: 3 });
  });

  it('parses percentage penalty within N days', () => {
    const result = parseCancellationPolicy('50% charge if cancelled within 7 days');
    expect(result).toEqual({
      type: 'custom',
      deadlineDays: 7,
      noShowPenalty: { value: 100, chargeType: 'percent' },
      frames: [{ daysBeforeCheckin: 7, penaltyValue: 50, chargeType: 'percent' }],
    });
  });

  it('returns null for unrecognised text', () => {
    expect(parseCancellationPolicy('Best available rate')).toBeNull();
  });
});
