import { describe, it, expect } from 'vitest';
import { DefaultGeneratedAudioFile } from '../speech-result.js';

describe('DefaultGeneratedAudioFile', () => {
  describe('constructed from Uint8Array', () => {
    it('returns the uint8Array directly', () => {
      const data = new Uint8Array([1, 2, 3]);
      const file = new DefaultGeneratedAudioFile({
        data,
        mediaType: 'audio/mpeg',
      });
      expect(file.uint8Array).toBe(data);
    });

    it('lazily computes base64', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const file = new DefaultGeneratedAudioFile({
        data,
        mediaType: 'audio/mpeg',
      });
      expect(file.base64).toBe(btoa('Hello'));
    });

    it('returns the same base64 on repeated access', () => {
      const data = new Uint8Array([1, 2, 3]);
      const file = new DefaultGeneratedAudioFile({
        data,
        mediaType: 'audio/mpeg',
      });
      const first = file.base64;
      const second = file.base64;
      expect(first).toBe(second);
    });
  });

  describe('constructed from base64 string', () => {
    it('returns the base64 directly', () => {
      const b64 = btoa('Hello');
      const file = new DefaultGeneratedAudioFile({
        data: b64,
        mediaType: 'audio/mpeg',
      });
      expect(file.base64).toBe(b64);
    });

    it('lazily computes uint8Array', () => {
      const b64 = btoa('Hello');
      const file = new DefaultGeneratedAudioFile({
        data: b64,
        mediaType: 'audio/mpeg',
      });
      expect(file.uint8Array).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('returns the same uint8Array on repeated access', () => {
      const b64 = btoa('Hello');
      const file = new DefaultGeneratedAudioFile({
        data: b64,
        mediaType: 'audio/mpeg',
      });
      const first = file.uint8Array;
      const second = file.uint8Array;
      expect(first).toBe(second);
    });
  });

  describe('format derivation', () => {
    it('derives mp3 from audio/mpeg', () => {
      const file = new DefaultGeneratedAudioFile({
        data: new Uint8Array([1]),
        mediaType: 'audio/mpeg',
      });
      expect(file.format).toBe('mp3');
    });

    it('derives wav from audio/wav', () => {
      const file = new DefaultGeneratedAudioFile({
        data: new Uint8Array([1]),
        mediaType: 'audio/wav',
      });
      expect(file.format).toBe('wav');
    });

    it('derives opus from audio/opus', () => {
      const file = new DefaultGeneratedAudioFile({
        data: new Uint8Array([1]),
        mediaType: 'audio/opus',
      });
      expect(file.format).toBe('opus');
    });

    it('derives pcm from audio/pcm', () => {
      const file = new DefaultGeneratedAudioFile({
        data: new Uint8Array([1]),
        mediaType: 'audio/pcm',
      });
      expect(file.format).toBe('pcm');
    });
  });

  it('exposes mediaType', () => {
    const file = new DefaultGeneratedAudioFile({
      data: new Uint8Array([1]),
      mediaType: 'audio/wav',
    });
    expect(file.mediaType).toBe('audio/wav');
  });
});
