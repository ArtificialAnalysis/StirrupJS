/**
 * Audio content block with automatic transcoding to MP3
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { readFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AUDIO_BITRATE } from '../constants.js';
import { bufferToDataURL, detectMimeType } from './processors.js';

// Set FFmpeg path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Supported audio MIME types
 */
const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/flac',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/x-m4a',
];

/**
 * Audio content block
 * Automatically transcodes to MP3 with specified bitrate
 */
export class AudioContent {
  private buffer: Buffer;
  private mimeType: string;

  private constructor(buffer: Buffer, mimeType: string) {
    this.buffer = buffer;
    this.mimeType = mimeType;
  }

  /**
   * Create audio content from file path
   * @param path Path to audio file
   * @returns AudioContent instance
   */
  static async fromFile(path: string): Promise<AudioContent> {
    const buffer = await readFile(path);
    return AudioContent.fromBuffer(buffer);
  }

  /**
   * Create audio content from buffer
   * @param buffer Audio data buffer
   * @returns AudioContent instance
   */
  static async fromBuffer(buffer: Buffer): Promise<AudioContent> {
    if (!ffmpegPath) {
      throw new Error('FFmpeg is not available. Install ffmpeg-static package.');
    }

    // Detect MIME type
    const mimeType = await detectMimeType(buffer);
    if (!mimeType) {
      throw new Error('Unable to detect audio MIME type');
    }

    // Validate audio type
    if (!SUPPORTED_AUDIO_TYPES.includes(mimeType)) {
      throw new Error(`Unsupported audio type: ${mimeType}`);
    }

    return new AudioContent(buffer, mimeType);
  }

  /**
   * Convert audio to base64 data URL
   * Transcodes to MP3 with specified bitrate
   * @param bitrate Audio bitrate (default: 192k)
   * @returns Base64 data URL
   */
  async toBase64URL(bitrate: string = AUDIO_BITRATE): Promise<string> {
    if (!ffmpegPath) {
      throw new Error('FFmpeg is not available. Install ffmpeg-static package.');
    }

    // Create temp directory for processing
    const tempDir = await mkdtemp(join(tmpdir(), 'stirrup-audio-'));
    const inputPath = join(tempDir, 'input');
    const outputPath = join(tempDir, 'output.mp3');

    try {
      // Write input buffer to temp file
      await require('fs/promises').writeFile(inputPath, this.buffer);

      // Transcode audio to MP3
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .output(outputPath)
          .audioCodec('libmp3lame')
          .audioBitrate(bitrate)
          .audioChannels(2)
          .audioFrequency(44100)
          .on('error', (err) => {
            reject(new Error(`FFmpeg error: ${err.message}`));
          })
          .on('end', () => {
            resolve();
          })
          .run();
      });

      // Read output and convert to base64
      const outputBuffer = await readFile(outputPath);
      return bufferToDataURL(outputBuffer, 'audio/mpeg');
    } finally {
      // Cleanup temp directory
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Get audio metadata
   * @returns Audio metadata
   */
  async getMetadata(): Promise<{
    duration: number;
    bitrate: number;
    sampleRate: number;
    channels: number;
  }> {
    const tempDir = await mkdtemp(join(tmpdir(), 'stirrup-audio-metadata-'));
    const inputPath = join(tempDir, 'input');

    try {
      // Write input buffer to temp file
      await require('fs/promises').writeFile(inputPath, this.buffer);

      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, data) => {
          if (err) {
            return reject(err);
          }

          const audioStream = data.streams.find((s) => s.codec_type === 'audio');

          if (!audioStream) {
            return reject(new Error('No audio stream found'));
          }

          resolve({
            duration: data.format.duration ?? 0,
            bitrate: parseInt(String(data.format.bit_rate ?? 0), 10),
            sampleRate: audioStream.sample_rate ?? 44100,
            channels: audioStream.channels ?? 2,
          });
        });
      });
    } finally {
      // Cleanup temp directory
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Get audio MIME type
   */
  getMimeType(): string {
    return this.mimeType;
  }

  /**
   * Get raw buffer
   */
  getBuffer(): Buffer {
    return this.buffer;
  }
}
