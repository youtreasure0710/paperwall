import { describe, expect, it } from 'vitest';
import { classifyText } from '@/lib/classification';

describe('classifyText', () => {
  it('classifies survey keywords', () => {
    expect(classifyText('A Survey of Agent Systems', '')).toBe('Survey');
  });

  it('classifies agent keywords', () => {
    expect(classifyText('Tool Use Planning for LLM Agent', '')).toBe('Agent');
  });

  it('falls back to other', () => {
    expect(classifyText('Unknown Topic', 'random text')).toBe('Other');
  });
});
