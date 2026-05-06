import { 
  Input, 
  Output, 
  Conversion, 
  ALL_FORMATS, 
  BlobSource, 
  Mp4OutputFormat, 
  WebMOutputFormat,
  MovOutputFormat,
  BufferTarget, 
  QUALITY_MEDIUM, 
  getEncodableVideoCodecs
} from 'mediabunny';
import exifr from 'exifr';

export type CompressionSettings = {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  resolution: number;
  format: 'mp4' | 'webm' | 'mov';
  codec?: string;
};

export type ProgressCallback = (progress: number) => void;

export async function getSupportedCodecs() {
  const videoCodecs = await getEncodableVideoCodecs();
  return {
    video: videoCodecs,
  };
}

export async function compressVideo(
  file: File,
  settings: CompressionSettings,
  removeSensitiveData: boolean,
  onProgress: ProgressCallback
): Promise<Blob> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });

  // Calculate an ideal bitrate based on resolution to mimic FFmpeg's efficiency
  // Resolution * Aspect Ratio (est 16:9) * FrameRate (est 30) * BitsPerPixel
  const width = settings.resolution;
  const height = Math.round(width * (9 / 16));
  const estimatedFps = 30;
  
  // Bits Per Pixel (BPP) multipliers - Hardware encoders (WebCodecs) generally need 
  // ~2x the bitrate of high-end software encoders (FFmpeg libx264) to look as sharp.
  const bppMap = {
    low: 0.12,    // Substantial boost for mobile/low-end
    medium: 0.22, // High-quality standard
    high: 0.35,   // Pro-level fidelity
    ultra: 0.55   // Near-zero artifacting
  };

  const targetBitrate = Math.round(width * height * estimatedFps * bppMap[settings.quality]);

  let outputFormat;
  switch (settings.format) {
    case 'webm': outputFormat = new WebMOutputFormat(); break;
    case 'mov': outputFormat = new MovOutputFormat(); break;
    default: outputFormat = new Mp4OutputFormat(); break;
  }
  
  const output = new Output({
    format: outputFormat,
    target: new BufferTarget(),
  });

  // "Out of the box" idea: Use an OffscreenCanvas to apply subtle sharpening/contrast 
  // to make the video look punchier and sharper, mimicking professional grading.
  let offscreenCanvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;

  const conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: {
      width: settings.resolution,
      bitrate: targetBitrate,
      codec: settings.codec as any,
      // For Ultra quality, software encoders (if available) are often superior to hardware at the same size
      hardwareAcceleration: settings.quality === 'ultra' ? 'prefer-software' : 'prefer-hardware',
      keyFrameInterval: 2,
      // Apply perceptual sharpening for High/Ultra presets
      process: (settings.quality === 'high' || settings.quality === 'ultra') ? async (sample) => {
        if (!offscreenCanvas) {
          offscreenCanvas = new OffscreenCanvas(sample.displayWidth, sample.displayHeight);
          ctx = offscreenCanvas.getContext('2d', { willReadFrequently: false });
        }

        if (ctx) {
          // Subtle boost to contrast and brightness makes the image look "sharper"
          // and helps the encoder preserve edges.
          ctx.filter = 'contrast(1.08) brightness(1.04) saturate(1.02)';
          sample.draw(ctx, 0, 0, sample.displayWidth, sample.displayHeight);
          return offscreenCanvas;
        }

        return sample;
      } : undefined
    },
    audio: {
      bitrate: QUALITY_MEDIUM,
    },
    tags: removeSensitiveData ? {} : undefined, 
  });

  if (!conversion.isValid) {
    throw new Error('Conversion is not valid for this file.');
  }

  conversion.onProgress = (progress) => {
    onProgress(progress);
  };

  await conversion.execute();

  const buffer = (output.target as BufferTarget).buffer;
  const mimeType = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime'
  }[settings.format];

  if (!buffer) {
    throw new Error('Compression failed: output buffer is empty');
  }

  return new Blob([buffer], { type: mimeType });
}

export async function getVideoMetadata(file: Blob) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });

  const duration = await input.computeDuration();
  const videoTrack = await input.getPrimaryVideoTrack();
  
  let width = 0;
  let height = 0;
  
  if (videoTrack) {
    width = await videoTrack.getDisplayWidth();
    height = await videoTrack.getDisplayHeight();
  }

  let latitude: number | undefined;
  let longitude: number | undefined;
  let make: string | undefined;
  let model: string | undefined;
  let dateTimeOriginal: string | undefined;

  try {
    const exif = await exifr.parse(file);
    if (exif) {
      if (exif.latitude !== undefined) latitude = exif.latitude;
      if (exif.longitude !== undefined) longitude = exif.longitude;
      if (exif.Make) make = exif.Make;
      if (exif.Model) model = exif.Model;
      if (exif.DateTimeOriginal) dateTimeOriginal = new Date(exif.DateTimeOriginal).toLocaleString();
    }
  } catch (err) {
    // Ignore, file might not have parsable EXIF
  }

  return {
    duration,
    width,
    height,
    size: file.size,
    latitude,
    longitude,
    make,
    model,
    dateTimeOriginal
  };
}
