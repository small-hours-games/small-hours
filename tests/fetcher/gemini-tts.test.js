import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { synthesizeSpeech, extractCleanPcm, wrapPcmAsWav } from '../../src/fetcher/gemini-tts.js';

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

    it('uses a deeper host voice at a natural pace for game-show narration', async () => {
      mockApiResponse(SUCCESS_RESPONSE);
      await synthesizeSpeech('What is the capital of France?', { style: 'game-show' });
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
      expect(body.contents[0].parts[0].text).toContain('television quiz-show host');
      expect(body.contents[0].parts[0].text).toContain('deeper, lower-pitched male voice');
      expect(body.contents[0].parts[0].text).toContain('natural pace');
      expect(body.contents[0].parts[0].text).not.toMatch(/brisk|quickly/);
      expect(body.contents[0].parts[0].text).toContain('Do not add commentary, clues');
      expect(body.contents[0].parts[0].text).toContain('Transcript:\nWhat is the capital of France?');
    });

    it('falls back to secondary Gemini TTS models when primary model returns 429', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Quota exceeded'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(SUCCESS_RESPONSE),
          text: () => Promise.resolve(JSON.stringify(SUCCESS_RESPONSE)),
        });

      const result = await synthesizeSpeech('Question 3?', { style: 'game-show' });
      expect(result.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0][0]).toContain('gemini-2.5-flash-preview-tts');
      expect(fetch.mock.calls[1][0]).toContain('gemini-3.1-flash-tts-preview');
    });

    it('strips nested RIFF/WAVE header and trailing C2PA watermark chunk to prevent 0.3s white noise', () => {
      const purePcm = Buffer.alloc(4800, 0x12);
      const innerWav = wrapPcmAsWav(purePcm, 24000, 1, 16);
      const c2paTail = Buffer.from('000017b86a756d62c2pa.editedApplied imperceptible SynthID watermark', 'latin1');
      const gemini38Payload = Buffer.concat([innerWav, c2paTail]);

      const cleaned = extractCleanPcm(gemini38Payload);
      expect(cleaned.length).toBe(purePcm.length);
      expect(cleaned.equals(purePcm)).toBe(true);
      expect(cleaned.includes(Buffer.from('c2pa'))).toBe(false);
    });

    it('keeps audio that happens to contain the bytes c2pa', () => {
      const start = Buffer.alloc(4800, 0x12);
      const samples = Buffer.concat([start, Buffer.from('c2pa', 'latin1'), Buffer.alloc(32 * 1024, 0x34)]);
      expect(extractCleanPcm(wrapPcmAsWav(samples, 24000, 1, 16)).length).toBe(samples.length & ~1);
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

    it('tries the next model when a reply has no audio', async () => {
      fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'no audio' }] } }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => SUCCESS_RESPONSE });
      const result = await synthesizeSpeech('Test');
      expect(result.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
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
