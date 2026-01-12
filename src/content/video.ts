/**
 * Video content block with automatic transcoding and downscaling
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { readFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { RESOLUTION_480P } from '../constants.js';
import { calculateDownscaledDimensions, bufferToDataURL, detectMimeType } from './processors.js';

// Set FFmpeg path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Supported video MIME types
 */
const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/mpeg',
  'video/x-flv',
  'video/x-ms-wmv',
  'image/gif', // Animated GIFs are supported
];

/**
 * Video content block
 * Automatically transcodes to MP4 H.264 and downscales to 480p
 */
export class VideoContent {
  private buffer: Buffer;
  private mimeType: string;

  private constructor(buffer: Buffer, mimeType: string) {
    this.buffer = buffer;
    this.mimeType = mimeType;
  }

  /**
   * Create video content from file path
   * @param path Path to video file
   * @returns VideoContent instance
   */
  static async fromFile(path: string): Promise<VideoContent> {
    const buffer = await readFile(path);
    return VideoContent.fromBuffer(buffer);
  }

  /**
   * Create video content from buffer
   * @param buffer Video data buffer
   * @returns VideoContent instance
   */
  static async fromBuffer(buffer: Buffer): Promise<VideoContent> {
    if (!ffmpegPath) {
      throw new Error('FFmpeg is not available. Install ffmpeg-static package.');
    }

    // Detect MIME type
    const mimeType = await detectMimeType(buffer);
    if (!mimeType) {
      throw new Error('Unable to detect video MIME type');
    }

    // Validate video type
    if (!SUPPORTED_VIDEO_TYPES.includes(mimeType)) {
      throw new Error(`Unsupported video type: ${mimeType}`);
    }

    return new VideoContent(buffer, mimeType);
  }

  /**
   * Convert video to base64 data URL
   * Transcodes to MP4 H.264 and downscales to fit within maxPixels
   * @param maxPixels Maximum total pixels (default: 480p = 640×480)
   * @param fps Optional target FPS
   * @returns Base64 data URL
   */
  async toBase64URL(maxPixels: number = RESOLUTION_480P, fps?: number): Promise<string> {
    if (!ffmpegPath) {
      throw new Error('FFmpeg is not available. Install ffmpeg-static package.');
    }

    // Create temp directory for processing
    const tempDir = await mkdtemp(join(tmpdir(), 'stirrup-video-'));
    const inputPath = join(tempDir, 'input');
    const outputPath = join(tempDir, 'output.mp4');

    try {
      // Write input buffer to temp file
      await require('fs/promises').writeFile(inputPath, this.buffer);

      // Get video metadata
      const metadata = await this.getMetadata(inputPath);

      // Calculate target dimensions
      let targetWidth = metadata.width;
      let targetHeight = metadata.height;

      if (metadata.width * metadata.height > maxPixels) {
        [targetWidth, targetHeight] = calculateDownscaledDimensions(metadata.width, metadata.height, maxPixels);
      }

      // Transcode video
      await new Promise<void>((resolve, reject) => {
        let command = ffmpeg(inputPath)
          .output(outputPath)
          .videoCodec('libx264')
          .videoBitrate('1000k')
          .size(`${targetWidth}x${targetHeight}`)
          .outputOptions([
            '-preset veryfast',
            '-movflags +faststart', // Enable web streaming
            '-pix_fmt yuv420p', // Ensure compatibility
          ]);

        // Set FPS if specified
        if (fps) {
          command = command.fps(fps);
        }

        // Add audio codec if audio stream exists
        if (metadata.hasAudio) {
          command = command.audioCodec('aac').audioBitrate('128k');
        } else {
          command = command.noAudio();
        }

        command
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
      return bufferToDataURL(outputBuffer, 'video/mp4');
    } finally {
      // Cleanup temp directory
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Get video metadata
   * @param path Path to video file
   * @returns Video metadata
   */
  private async getMetadata(
    path: string
  ): Promise<{ width: number; height: number; duration: number; hasAudio: boolean }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(path, (err, data) => {
        if (err) {
          return reject(err);
        }

        const videoStream = data.streams.find((s) => s.codec_type === 'video');
        const audioStream = data.streams.find((s) => s.codec_type === 'audio');

        if (!videoStream) {
          return reject(new Error('No video stream found'));
        }

        resolve({
          width: videoStream.width ?? 640,
          height: videoStream.height ?? 480,
          duration: data.format.duration ?? 0,
          hasAudio: !!audioStream,
        });
      });
    });
  }

  /**
   * Get video MIME type
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
