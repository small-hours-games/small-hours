// Gemini TTS module — generates speech audio via the Gemini API.
// Uses the Gemini generateContent endpoint with responseModalities: ["AUDIO"].

const GEMINI_TTS_MODELS = [
  { name: 'gemini-2.5-flash-preview-tts', supportsStylePrompt: true },
  { name: 'gemini-3.1-flash-tts-preview', supportsStylePrompt: true },
  { name: 'gemini-3.8-flash-tts', supportsStylePrompt: false },
  { name: 'gemini-3.8-flash-lite-tts', supportsStylePrompt: false },
];

export const GAME_SHOW_STYLE = 'Perform as a confident television quiz-show host with a deeper, lower-pitched male voice. Speak with energy but at a clear, natural pace, pausing briefly at commas and question marks. Read only the supplied transcript exactly as written, in its original language. Do not add commentary, clues, extra words, music, or sound effects.';

const DEFAULT_VOICE = 'Enceladus';
const GAME_SHOW_VOICE = 'Charon';
const C2PA_TAIL_BYTES = 16 * 1024;

/**
 * Extract pure 16-bit PCM audio bytes from a Gemini inlineData buffer.
 * Newer Gemini 3.8 TTS models return a full RIFF/WAVE container with a
 * trailing ~6 KB C2PA (SynthID) metadata chunk after the `data` chunk;
 * wrapping that whole container as PCM produces ~0.3s of loud white noise.
 *
 * @param {Buffer} rawBuffer
 * @returns {Buffer}
 */
export function extractCleanPcm(rawBuffer) {
  if (!Buffer.isBuffer(rawBuffer) || rawBuffer.length === 0) return Buffer.alloc(0);
  let pcm = rawBuffer;

  // Unwrap nested RIFF/WAVE container if present
  while (
    pcm.length >= 44 &&
    pcm.subarray(0, 4).toString('ascii') === 'RIFF' &&
    pcm.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    let offset = 12;
    let foundData = null;
    while (offset + 8 <= pcm.length) {
      const chunkId = pcm.subarray(offset, offset + 4).toString('ascii');
      const chunkSize = pcm.readUInt32LE(offset + 4);
      const dataStart = offset + 8;
      if (chunkId === 'data') {
        const dataEnd = Math.min(pcm.length, dataStart + chunkSize);
        foundData = pcm.subarray(dataStart, dataEnd);
        break;
      }
      offset = dataStart + chunkSize + (chunkSize % 2);
    }
    if (foundData) {
      pcm = foundData;
    } else {
      pcm = pcm.subarray(44);
      break;
    }
  }

  // Safety net: strip a trailing C2PA / JUMBF watermark manifest. Only look in
  // the tail so audio samples that happen to spell "c2pa" never cut the clip.
  const tailStart = Math.max(0, pcm.length - C2PA_TAIL_BYTES);
  const tailIdx = pcm.subarray(tailStart).indexOf('c2pa');
  const c2paIdx = tailIdx === -1 ? -1 : tailStart + tailIdx;
  if (c2paIdx !== -1) {
    // The JUMBF box header starts up to 64 bytes before the "c2pa" label
    const cut = Math.max(0, (c2paIdx - 64) & ~1);
    pcm = pcm.subarray(0, cut);
  }

  // Ensure even byte length for 16-bit mono samples when real PCM length > 1
  if (pcm.length > 32 && pcm.length % 2 !== 0) {
    pcm = pcm.subarray(0, pcm.length - 1);
  }
  return pcm;
}

export function wrapPcmAsWav(pcm, sampleRate, channels, bitsPerSample) {
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // fmt chunk size
  header.writeUInt16LE(1, 20);           // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Synthesize speech from text using the Gemini API, falling back across
 * available Gemini TTS models when per-model rate limits (HTTP 429) occur.
 *
 * @param {string} text - Text to convert to speech
 * @param {object} [options]
 * @param {string} [options.voice] - Voice name (default: "Enceladus", or "Charon" for game-show)
 * @returns {Promise<{ok: true, audioData: Buffer, mimeType: string} | {ok: false, error: {code: string, message: string}}>}
 */
export async function synthesizeSpeech(text, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { code: 'NO_API_KEY', message: 'GEMINI_API_KEY not set' } };
  }

  const voice = options.voice || (options.style === 'game-show' ? GAME_SHOW_VOICE : DEFAULT_VOICE);
  let lastError = { code: 'API_ERROR', message: 'TTS synthesis failed' };

  for (const model of GEMINI_TTS_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent`;
    const transcript = (options.style === 'game-show' && model.supportsStylePrompt)
      ? `${GAME_SHOW_STYLE}\n\nTranscript:\n${text}`
      : text;

    try {
      const response = await fetch(`${endpoint}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: transcript }],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        lastError = { code: 'API_ERROR', message: `HTTP ${response.status}: ${body.slice(0, 200)}` };
        // On quota/rate-limit (429) or transient overload (503), try the next TTS model in the pool
        if (response.status === 429 || response.status === 503) {
          continue;
        }
        return { ok: false, error: lastError };
      }

      const data = await response.json();

      // Extract audio from response
      const candidate = data.candidates?.[0];
      const part = candidate?.content?.parts?.[0];

      if (!part?.inlineData?.data) {
        // Preview TTS models sometimes answer without audio; try the next model.
        lastError = { code: 'NO_AUDIO', message: 'Response did not contain audio data' };
        continue;
      }

      const raw = Buffer.from(part.inlineData.data, 'base64');
      const pcm = extractCleanPcm(raw);
      const audioData = wrapPcmAsWav(pcm, 24000, 1, 16);

      return { ok: true, audioData, mimeType: 'audio/wav' };
    } catch (err) {
      return { ok: false, error: { code: 'NETWORK_ERROR', message: err.message } };
    }
  }

  return { ok: false, error: lastError };
}
