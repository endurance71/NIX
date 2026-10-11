import { describe, expect, it } from 'vitest';
import { chatMessageAccessibilityLabel, shouldShowComposerCounter } from './chatMessageA11y';

describe('chatMessageAccessibilityLabel', () => {
  const formatReactions = (list: string) => `reakcje: ${list}`;

  it('reads sender, body and time', () => {
    expect(
      chatMessageAccessibilityLabel({ sender: 'Ty', body: ' Cześć ', time: '14:05', reactions: [], formatReactions })
    ).toBe('Ty: Cześć, 14:05');
  });

  it('adds the status and who reacted with what', () => {
    expect(
      chatMessageAccessibilityLabel({
        sender: 'Anna',
        body: 'Hej',
        time: '9:30',
        status: 'Nie wysłano',
        reactions: [
          { glyph: '❤️', by: 'Ty' },
          { glyph: '👍', by: 'Anna' },
        ],
        formatReactions,
      })
    ).toBe('Anna: Hej, 9:30, Nie wysłano, reakcje: ❤️ (Ty), 👍 (Anna)');
  });

  it('says which NiX a reply answers right after the text', () => {
    expect(
      chatMessageAccessibilityLabel({
        sender: 'Anna',
        body: 'Super!',
        replyContext: 'odpowiedź na Twojego NiX-a',
        time: '9:30',
        reactions: [],
        formatReactions,
      })
    ).toBe('Anna: Super!, odpowiedź na Twojego NiX-a, 9:30');
  });

  it('says an edited message was edited right after the time', () => {
    expect(
      chatMessageAccessibilityLabel({
        sender: 'Ty',
        body: 'Poprawione',
        time: '9:31',
        edited: 'edytowana',
        reactions: [],
        formatReactions,
      })
    ).toBe('Ty: Poprawione, 9:31, edytowana');
  });

  it('falls back to the sender when there is no body (expired tombstone)', () => {
    expect(
      chatMessageAccessibilityLabel({ sender: 'Ty', body: '', time: '', status: 'Wygasło', reactions: [], formatReactions })
    ).toBe('Ty, Wygasło');
  });
});

describe('shouldShowComposerCounter', () => {
  it('appears from 1800 characters of a 2000 limit', () => {
    expect(shouldShowComposerCounter(1799, 2000)).toBe(false);
    expect(shouldShowComposerCounter(1800, 2000)).toBe(true);
  });

  it('never stays hidden past a lower limit', () => {
    expect(shouldShowComposerCounter(500, 500)).toBe(true);
  });
});

describe('chatMessageAccessibilityLabel saved', () => {
  it('says who saved the message after the status', () => {
    expect(
      chatMessageAccessibilityLabel({
        sender: 'Ola',
        body: 'hej',
        time: '14:05',
        saved: 'zapisana przez Ciebie',
        reactions: [],
        formatReactions: (list) => list,
      }),
    ).toBe('Ola: hej, 14:05, zapisana przez Ciebie');
  });
});
