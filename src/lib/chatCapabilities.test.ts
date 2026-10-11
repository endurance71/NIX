import { describe, expect, it } from 'vitest';
import { isMissingChatFeatureError, NO_CHAT_CAPABILITIES, parseChatCapabilities } from './chatCapabilities';

describe('chatCapabilities', () => {
  it('parses the probe and treats anything else as unsupported', () => {
    expect(parseChatCapabilities({ v: 1, saved_messages: true, voice_messages: true })).toEqual({
      savedMessages: true,
      voiceMessages: true,
    });
    expect(parseChatCapabilities({ saved_messages: 'yes' })).toEqual(NO_CHAT_CAPABILITIES);
    expect(parseChatCapabilities(null)).toEqual(NO_CHAT_CAPABILITIES);
    expect(parseChatCapabilities([])).toEqual(NO_CHAT_CAPABILITIES);
  });

  it('recognizes a backend without the feature', () => {
    expect(isMissingChatFeatureError({ code: 'PGRST202', message: 'x' })).toBe(true);
    expect(isMissingChatFeatureError({ code: 'UNKNOWN', postgrestCode: '42883' })).toBe(true);
    expect(isMissingChatFeatureError(new Error('Bucket not found'))).toBe(true);
    expect(isMissingChatFeatureError({ code: 'NOT_FOUND', message: 'Wiadomość już zniknęła.' })).toBe(false);
    expect(isMissingChatFeatureError(null)).toBe(false);
  });
});
