/**
 * Image content block with automatic downscaling and format conversion
 */

import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { RESOLUTION_1MP } from '../constants.js';
import { bufferToDataURL, calculateDownscaledDimensions, detectMimeType } from './processors.js';

/**
 * Supported image MIME types
 */
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/webp',
  'image/x-psd',
];

/**
 * Image content block
 * Automatically downscales large images and converts to PNG base64
 */
export class ImageContent {
  private buffer: Buffer;
  private mimeType: string;

  private constructor(buffer: Buffer, mimeType: string) {
    this.buffer = buffer;
    this.mimeType = mimeType;
  }

  /**
   * Create image content from file path
   * @param path Path to image file
   * @returns ImageContent instance
   */
  static async fromFile(path: string): Promise<ImageContent> {
    const buffer = await readFile(path);
    return ImageContent.fromBuffer(buffer);
  }

  /**
   * Create image content from buffer
   * @param buffer Image data buffer
   * @returns ImageContent instance
   */
  static async fromBuffer(buffer: Buffer): Promise<ImageContent> {
    // Detect MIME type
    const mimeType = await detectMimeType(buffer);
    if (!mimeType) {
      throw new Error('Unable to detect image MIME type');
    }

    // Validate image type
    if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
      throw new Error(`Unsupported image type: ${mimeType}`);
    }

    // Verify image can be loaded
    try {
      const image = sharp(buffer);
      await image.metadata();
    } catch (error) {
      throw new Error(`Invalid image data: ${error instanceof Error ? error.message : String(error)}`);
    }

    return new ImageContent(buffer, mimeType);
  }

  /**
   * Create image content from base64 data URL
   * @param dataURL Base64 data URL
   * @returns ImageContent instance
   */
  static fromDataURL(dataURL: string): Promise<ImageContent> {
    const match = dataURL.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return Promise.reject(new Error('Invalid data URL format'));
    }

    const mimeType = match[1];
    const base64Data = match[2];

    if (!mimeType || !base64Data) {
      return Promise.reject(new Error('Invalid data URL format'));
    }

    const buffer = Buffer.from(base64Data, 'base64');
    return Promise.resolve(new ImageContent(buffer, mimeType));
  }

  /**
   * Convert image to base64 data URL
   * Automatically downscales to fit within maxPixels and converts to PNG
   * @param maxPixels Maximum total pixels (default: 1MP)
   * @returns Base64 data URL
   */
  async toBase64URL(maxPixels: number = RESOLUTION_1MP): Promise<string> {
    const image = sharp(this.buffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Unable to get image dimensions');
    }

    // Calculate downscaled dimensions
    const [newWidth, newHeight] = calculateDownscaledDimensions(metadata.width, metadata.height, maxPixels);

    // Resize and convert to PNG
    const processedBuffer = await image.resize(newWidth, newHeight, { fit: 'inside' }).png().toBuffer();

    return bufferToDataURL(processedBuffer, 'image/png');
  }

  /**
   * Get image dimensions
   * @returns Object with width and height
   */
  async getDimensions(): Promise<{ width: number; height: number }> {
    const metadata = await sharp(this.buffer).metadata();
    return {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    };
  }

  /**
   * Get image MIME type
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
