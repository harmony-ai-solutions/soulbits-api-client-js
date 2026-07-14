import type { FetchClient, components } from './types.js';
import { unwrap } from './errors.js';

// ── Request body types from the OpenAPI spec ────────────────────────────────
type ChatBody = components['schemas']['ChatCompletionRequest'];
type EmbeddingBody = components['schemas']['EmbeddingRequest'];
type RerankBody = components['schemas']['RerankRequest'];
type TTSBody = components['schemas']['TTSRequest'];
type STTBody = components['schemas']['STTRequest'];
type VADBody = components['schemas']['VADRequest'];
type SpeakerEmbedBody = components['schemas']['SpeakerEmbedRequest'];
type AudioConvertBody = components['schemas']['AudioConversionRequest'];
type VoiceConvertBody = components['schemas']['VoiceConversionRequest'];
type ImageGenBody = components['schemas']['ImageGenerationRequest'];

/**
 * Inference API — chat, embeddings, rerank, TTS, STT, VAD, speaker embedding,
 * audio/voice conversion, image generation (deprecated).
 */
export function createInferenceAPI(client: FetchClient) {
  return {
    // ── Chat ────────────────────────────────────────────────────────────

    /**
     * Chat completions (LLM). OpenAI-compatible but NON-streaming.
     * `stream: true` is silently ignored by the gateway.
     */
    chat(body: ChatBody) {
      return client.POST('/v1/chat/completions', { body });
    },

    /** Convenience: chat and throw on error. */
    async chatOrThrow(body: ChatBody) {
      return unwrap(await this.chat(body));
    },

    // ── Embeddings ──────────────────────────────────────────────────────

    /**
     * Text embeddings. OpenAI-compatible (served by Infinity engine).
     * Supports Matryoshka `dimensions` and multimodal `modality`.
     */
    embeddings(body: EmbeddingBody) {
      return client.POST('/v1/embeddings', { body });
    },

    /** Convenience: embeddings and throw on error. */
    async embeddingsOrThrow(body: EmbeddingBody) {
      return unwrap(await this.embeddings(body));
    },

    // ── Rerank ──────────────────────────────────────────────────────────

    /**
     * Rerank documents by relevance. Cohere-compatible (served by Infinity engine).
     */
    rerank(body: RerankBody) {
      return client.POST('/v1/rerank', { body });
    },

    /** Convenience: rerank and throw on error. */
    async rerankOrThrow(body: RerankBody) {
      return unwrap(await this.rerank(body));
    },

    // ── TTS ─────────────────────────────────────────────────────────────

    /**
     * Text-to-Speech. Harmony Speech Engine — NOT OpenAI-shaped.
     * Requires `mode`, audio format via `output_options.format`.
     */
    tts(body: TTSBody) {
      return client.POST('/v1/audio/speech', { body });
    },

    /** Convenience: TTS and throw on error. */
    async ttsOrThrow(body: TTSBody) {
      return unwrap(await this.tts(body));
    },

    // ── STT ─────────────────────────────────────────────────────────────

    /**
     * Speech-to-Text. JSON-only (NOT multipart). Audio is base64 inside JSON.
     */
    stt(body: STTBody) {
      return client.POST('/v1/audio/transcriptions', { body });
    },

    /** Convenience: STT and throw on error. */
    async sttOrThrow(body: STTBody) {
      return unwrap(await this.stt(body));
    },

    // ── VAD ─────────────────────────────────────────────────────────────

    /**
     * Voice Activity Detection.
     */
    vad(body: VADBody) {
      return client.POST('/v1/audio/vad', { body });
    },

    /** Convenience: VAD and throw on error. */
    async vadOrThrow(body: VADBody) {
      return unwrap(await this.vad(body));
    },

    // ── Speaker Embedding ───────────────────────────────────────────────

    /**
     * Create a speaker embedding from an audio sample.
     */
    speakerEmbed(body: SpeakerEmbedBody) {
      return client.POST('/v1/embed/speaker', { body });
    },

    /** Convenience: speaker embedding and throw on error. */
    async speakerEmbedOrThrow(body: SpeakerEmbedBody) {
      return unwrap(await this.speakerEmbed(body));
    },

    // ── Audio Conversion ────────────────────────────────────────────────

    /**
     * Audio conversion / enhancement (e.g. denoising via VoiceFixer).
     */
    audioConvert(body: AudioConvertBody) {
      return client.POST('/v1/audio/convert', { body });
    },

    /** Convenience: audio conversion and throw on error. */
    async audioConvertOrThrow(body: AudioConvertBody) {
      return unwrap(await this.audioConvert(body));
    },

    // ── Voice Conversion ────────────────────────────────────────────────

    /**
     * Voice conversion. At least one of `target_audio` / `target_embedding` required.
     */
    voiceConvert(body: VoiceConvertBody) {
      return client.POST('/v1/voice/convert', { body });
    },

    /** Convenience: voice conversion and throw on error. */
    async voiceConvertOrThrow(body: VoiceConvertBody) {
      return unwrap(await this.voiceConvert(body));
    },

    // ── Image Generation (deprecated) ───────────────────────────────────

    /**
     * ⚠️ NOT CURRENTLY SERVED. No image-generation worker is deployed.
     */
    imageGen(body: ImageGenBody) {
      return client.POST('/v1/images/generations', { body });
    },

    /** Convenience: image generation (will throw). */
    async imageGenOrThrow(body: ImageGenBody) {
      return unwrap(await this.imageGen(body));
    },
  };
}

export type InferenceAPI = ReturnType<typeof createInferenceAPI>;
