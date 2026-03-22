// Gemini TTS module — generates speech audio via the Gemini API.
// Uses Vertex AI endpoint with responseModalities: ["AUDIO"].

const GEMINI_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const DEFAULT_VOICE = 'Kore';

/**
 * Synthesize speech from text using the Gemini API.
 *
 * @param {string} text - Text to convert to speech
 * @param {object} [options]
 * @param {string} [options.voice] - Voice name (default: "Kore")
 * @returns {Promise<{ok: true, audioData: Buffer, mimeType: string} | {ok: false, error: {code: string, message: string}}>}
 */
export async function synthesizeSpeech(text, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { code: 'NO_API_KEY', message: 'GEMINI_API_KEY not set' } };
  }

  const voice = options.voice || DEFAULT_VOICE;

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text }],
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
      return { ok: false, error: { code: 'API_ERROR', message: `HTTP ${response.status}: ${body.slice(0, 200)}` } };
    }

    const data = await response.json();

    // Extract audio from response
    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];

    if (!part?.inlineData?.data) {
      return { ok: false, error: { code: 'NO_AUDIO', message: 'Response did not contain audio data' } };
    }

    const audioData = Buffer.from(part.inlineData.data, 'base64');
    const mimeType = part.inlineData.mimeType || 'audio/wav';

    return { ok: true, audioData, mimeType };
  } catch (err) {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}
