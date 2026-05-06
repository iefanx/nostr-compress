import exifr from 'exifr';
import * as piexif from 'piexifjs';
import type { CompressionSettings } from './VideoCompressor';

export type ImageMetadata = {
  width: number;
  height: number;
  size: number;
  make?: string;
  model?: string;
  latitude?: number;
  longitude?: number;
  dateTimeOriginal?: string;
  hasSensitiveData: boolean;
};

export async function getImageMetadata(file: Blob): Promise<ImageMetadata> {
  const meta: ImageMetadata = {
    width: 0,
    height: 0,
    size: file.size,
    hasSensitiveData: false
  };

  try {
    // Basic width/height using Image
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    meta.width = img.width;
    meta.height = img.height;
    URL.revokeObjectURL(url);

    // Parse EXIF
    const exif = await exifr.parse(file);
    if (exif) {
      if (exif.Make) meta.make = exif.Make;
      if (exif.Model) meta.model = exif.Model;
      if (exif.latitude !== undefined) meta.latitude = exif.latitude;
      if (exif.longitude !== undefined) meta.longitude = exif.longitude;
      if (exif.DateTimeOriginal) meta.dateTimeOriginal = new Date(exif.DateTimeOriginal).toLocaleString();
      
      if (meta.latitude !== undefined || meta.longitude !== undefined || meta.make || meta.model) {
        meta.hasSensitiveData = true;
      }
    }
  } catch (err) {
    console.error("Error reading image metadata", err);
  }

  return meta;
}

const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export async function compressImage(
  file: File,
  settings: CompressionSettings,
  removeSensitiveData: boolean,
  onProgress: (progress: number) => void
): Promise<Blob> {
  onProgress(0.1);

  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  
  onProgress(0.3);

  // Determine target size while maintaining aspect ratio
  let targetWidth = img.width;
  let targetHeight = img.height;
  
  // Use settings.resolution as the max dimension
  const maxDim = settings.resolution;
  if (img.width > maxDim || img.height > maxDim) {
    if (img.width > img.height) {
      targetWidth = maxDim;
      targetHeight = Math.round(img.height * (maxDim / img.width));
    } else {
      targetHeight = maxDim;
      targetWidth = Math.round(img.width * (maxDim / img.height));
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get canvas context");

  // Draw image
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  onProgress(0.6);

  // Quality mapping
  const qualityMap = {
    low: 0.5,
    medium: 0.7,
    high: 0.85,
    ultra: 0.95
  };
  const quality = qualityMap[settings.quality] || 0.7;

  // We export to JPEG to have EXIF support if needed
  let blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });

  URL.revokeObjectURL(url);

  if (!blob) throw new Error("Canvas toBlob failed");
  onProgress(0.8);

  // Handle EXIF
  if (!removeSensitiveData && file.type === 'image/jpeg') {
    try {
      // Try to copy EXIF from original
      const origDataUrl = await blobToDataURL(file);
      const exifObj = piexif.load(origDataUrl);
      
      // Dump to binary
      const exifStr = piexif.dump(exifObj);
      
      // Insert to new blob
      const newBlobDataUrl = await blobToDataURL(blob);
      const finalDataUrl = piexif.insert(exifStr, newBlobDataUrl);
      
      // Convert back to blob
      const fetchRes = await fetch(finalDataUrl);
      blob = await fetchRes.blob();
    } catch (err) {
      console.warn("Failed to copy EXIF data:", err);
    }
  }

  onProgress(1.0);
  return blob;
}
