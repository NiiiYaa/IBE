import type { HarvestedCancellationPolicy } from '@ibe/onboarding-flows';

export function parseCancellationPolicy(text: string | null): HarvestedCancellationPolicy | null {
  if (!text) return null;
  const t = text.trim();

  if (/non.?refundable|no.?refund/i.test(t)) {
    return { type: 'non_refundable' };
  }

  // "free cancellation until N days"
  const dayMatch = t.match(/free\s+cancel\w*\s+(?:until\s+)?(\d+)\s*day/i)
    ?? t.match(/cancel\w*\s+(?:free|no.?charge|no.?penalty)[^.]*?(\d+)\s*day/i);
  if (dayMatch) {
    return {
      type: 'custom',
      deadlineDays: parseInt(dayMatch[1]!),
      noShowPenalty: { value: 100, chargeType: 'percent' },
      frames: [],
    };
  }

  // "until Xh" — convert hours to days (ceil)
  const hourMatch = t.match(/(?:free\s+cancel\w*|cancel\w*\s+free)[^.]*?(\d+)\s*h(?:our)?s?/i);
  if (hourMatch) {
    return {
      type: 'custom',
      deadlineDays: Math.ceil(parseInt(hourMatch[1]!) / 24),
      noShowPenalty: { value: 100, chargeType: 'percent' },
      frames: [],
    };
  }

  // "N% charge if cancelled within X days"
  const penaltyMatch = t.match(/(\d+)%\s+(?:charge|penalty|fee)\s+if\s+cancel\w+\s+within\s+(\d+)\s*day/i);
  if (penaltyMatch) {
    const penaltyValue = parseInt(penaltyMatch[1]!);
    const deadlineDays = parseInt(penaltyMatch[2]!);
    return {
      type: 'custom',
      deadlineDays,
      noShowPenalty: { value: 100, chargeType: 'percent' },
      frames: [{ daysBeforeCheckin: deadlineDays, penaltyValue, chargeType: 'percent' }],
    };
  }

  return null;
}
