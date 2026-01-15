/**
 * Shared utility functions for content processing
 */

import { fileTypeFromBuffer } from 'file-type';

/**
 * Calculate dimensions that fit within a pixel limit while maintaining aspect ratio
 * Ensures even dimensions (required for some video codecs)
 * @param width Original width
 * @param height Original height
 * @param maxPixels Maximum total pixels
 * @returns Adjusted [width, height] with even dimensions
 */
export function calculateDownscaledDimensions(width: number, height: number, maxPixels: number): [number, number] {
  const currentPixels = width * height;

  if (currentPixels <= maxPixels) {
    // Already within limit, just ensure even dimensions
    return [Math.floor(width / 2) * 2, Math.floor(height / 2) * 2];
  }

  // Calculate scale factor
  const scale = Math.sqrt(maxPixels / currentPixels);

  // Apply scale and ensure even dimensions
  let newWidth = Math.floor((width * scale) / 2) * 2;
  let newHeight = Math.floor((height * scale) / 2) * 2;

  // Ensure minimum dimensions
  if (newWidth < 2) newWidth = 2;
  if (newHeight < 2) newHeight = 2;

  return [newWidth, newHeight];
}

/**
 * Detect MIME type from buffer
 * @param buffer File buffer
 * @returns MIME type or null if unknown
 */
export async function detectMimeType(buffer: Buffer): Promise<string | null> {
  const result = await fileTypeFromBuffer(buffer);
  return result?.mime ?? null;
}

/**
 * Validate that a file matches expected MIME types
 * @param buffer File buffer
 * @param allowedTypes Array of allowed MIME type patterns (e.g., ['image/*', 'video/mp4'])
 * @returns True if file matches allowed types
 */
export async function validateFileType(buffer: Buffer, allowedTypes: string[]): Promise<boolean> {
  const mimeType = await detectMimeType(buffer);
  if (!mimeType) return false;

  for (const allowed of allowedTypes) {
    if (allowed.endsWith('/*')) {
      const prefix = allowed.slice(0, -2);
      if (mimeType.startsWith(prefix + '/')) return true;
    } else if (mimeType === allowed) {
      return true;
    }
  }

  return false;
}

/**
 * Convert buffer to base64 data URL
 * @param buffer File buffer
 * @param mimeType MIME type of the file
 * @returns Base64 data URL
 */
export function bufferToDataURL(buffer: Buffer, mimeType: string): string {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Parse base64 data URL
 * @param dataURL Base64 data URL
 * @returns Object with mimeType and data (base64 string)
 */
export function parseDataURL(dataURL: string): { mimeType: string; data: string } {
  const match = dataURL.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL format');
  }
  const mimeType = match[1];
  const data = match[2];

  if (!mimeType || !data) {
    throw new Error('Invalid data URL format');
  }

  return { mimeType, data };
}
