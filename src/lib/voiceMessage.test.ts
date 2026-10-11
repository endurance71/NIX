import { describe, expect, it } from 'vitest';
import {
  downsampleWaveform,
  meteringToLevel,
  VOICE_BAR_FLOOR,
  VOICE_MIN_DURATION_MS,
  voiceObjectPath,
  voicePlaybackProgress,
  voiceRecordingOutcome,
  waveformBars,
} from './voiceMessage';

describe('meteringToLevel', () => {
  it('maps dBFS to 0–100 with silence at 0 and full scale at 100', () => {
    expect(meteringToLevel(-160)).toBe(0);
    expect(meteringToLevel(-50)).toBe(0);
    expect(meteringToLevel(0)).toBe(100);
    expect(meteringToLevel(-25)).toBeGreaterThan(50);
    expect(meteringToLevel(undefined)).toBe(0);
    expect(meteringToLevel(Number.NaN)).toBe(0);
  });
});

describe('downsampleWaveform', () => {
  it('averages into the requested number of buckets', () => {
    expect(downsampleWaveform([0, 100, 0, 100], 2)).toEqual([50, 50]);
    expect(downsampleWaveform(Array.from({ length: 600 }, () => 40), 48)).toHaveLength(48);
  });
  it('keeps short takes as they are and clamps junk', () => {
    expect(downsampleWaveform([10, 200, -5], 48)).toEqual([10, 100, 0]);
    expect(downsampleWaveform([], 48)).toEqual([]);
  });
});

describe('waveformBars', () => {
  it('resamples to the bar count within the floor and 1', () => {
    const bars = waveformBars([0, 100], 5);
    expect(bars).toHaveLength(5);
    expect(bars[0]).toBe(VOICE_BAR_FLOOR);
    expect(bars[4]).toBe(1);
    expect(bars[2]).toBeCloseTo(0.5);
  });
  it('draws a quiet line without samples', () => {
    expect(waveformBars([], 3)).toEqual([VOICE_BAR_FLOOR, VOICE_BAR_FLOOR, VOICE_BAR_FLOOR]);
  });
});

describe('recording outcome', () => {
  it('keeps a long enough take, cancels or rejects a too-short one', () => {
    expect(voiceRecordingOutcome({ durationMs: 5_000, cancelled: false })).toBe('send');
    expect(voiceRecordingOutcome({ durationMs: 5_000, cancelled: true })).toBe('cancel');
    expect(voiceRecordingOutcome({ durationMs: VOICE_MIN_DURATION_MS - 1, cancelled: false })).toBe('tooShort');
  });
});

describe('voiceObjectPath / voicePlaybackProgress', () => {
  it('builds the lowercase <sender>/<receiver>/<id>.m4a path the storage policy expects', () => {
    expect(voiceObjectPath('AA', 'Bb', 'C-1')).toBe('aa/bb/c-1.m4a');
  });
  it('progress is clamped and tolerant of missing durations', () => {
    expect(voicePlaybackProgress(5, 10_000)).toBe(0.5);
    expect(voicePlaybackProgress(50, 10_000)).toBe(1);
    expect(voicePlaybackProgress(5, 0)).toBe(0);
  });
});
