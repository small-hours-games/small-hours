import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { synthesizeSpeech } from '../../src/fetcher/gemini-tts.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockApiResponse(body, ok = true, status = 200) {
  fetch.mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

const AUDIO_BASE64 = Buffer.from('fake-audio-data').toString('base64');

const SUCCESS_RESPONSE = {
  candidates: [{
    content: {
      parts: [{
        inlineData: {
          data: AUDIO_BASE64,
          mimeType: 'audio/L16;codec=pcm;rate=24000',
        },
      }],
    },
  }],
};

describe('synthesizeSpeech', () => {
  describe('missing API key', () => {
    it('returns NO_API_KEY error when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;

      const result = await synthesizeSpeech('Hello');

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NO_API_KEY');
    });
  });

  describe('successful synthesis', () => {
    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.GEMINI_API_KEY;
    });

    it('returns ok: true with audioData buffer and mimeType', async () => {
      mockApiResponse(SUCCESS_RESPONSE);

      const result = await synthesizeSpeech('What is the capital of France?');

      expect(result.ok).toBe(true);
      expect(Buffer.isBuffer(result.audioData)).toBe(true);
      // Audio is now wrapped in a WAV header — verify header and PCM payload
      expect(result.audioData.subarray(0, 4).toString()).toBe('RIFF');
      expect(result.audioData.subarray(8, 12).toString()).toBe('WAVE');
      const pcmPayload = result.audioData.subarray(44);
      expect(pcmPayload.toString()).toBe('fake-audio-data');
      expect(result.mimeType).toBe('audio/wav');
    });

    it('sends correct request body with text and audio config', async () => {
      mockApiResponse(SUCCESS_RESPONSE);

      await synthesizeSpeech('Test text');

      expect(fetch).toHaveBeenCalledOnce();
      const [url, options] = fetch.mock.calls[0];
      expect(url).toContain('gemini-2.5-flash-preview-tts');
      expect(url).toContain('key=test-key');

      const body = JSON.parse(options.body);
      expect(body.contents[0].parts[0].text).toBe('Test text');
      expect(body.generationConfig.responseModalities).toEqual(['AUDIO']);
      expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Enceladus');
    });

    it('uses custom voice when provided', async () => {
      mockApiResponse(SUCCESS_RESPONSE);

      await synthesizeSpeech('Test', { voice: 'Puck' });

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Puck');
    });
  });

  describe('API errors', () => {
    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.GEMINI_API_KEY;
    });

    it('returns API_ERROR when HTTP response is not ok', async () => {
      mockApiResponse({ error: { message: 'Bad request' } }, false, 400);

      const result = await synthesizeSpeech('Test');

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('API_ERROR');
      expect(result.error.message).toContain('400');
    });

    it('returns NO_AUDIO when response has no inlineData', async () => {
      mockApiResponse({
        candidates: [{ content: { parts: [{ text: 'no audio here' }] } }],
      });

      const result = await synthesizeSpeech('Test');

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NO_AUDIO');
    });

    it('returns NO_AUDIO when candidates array is empty', async () => {
      mockApiResponse({ candidates: [] });

      const result = await synthesizeSpeech('Test');

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NO_AUDIO');
    });

    it('returns NETWORK_ERROR when fetch throws', async () => {
      fetch.mockRejectedValue(new Error('Connection refused'));

      const result = await synthesizeSpeech('Test');

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NETWORK_ERROR');
      expect(result.error.message).toBe('Connection refused');
    });
  });
});
