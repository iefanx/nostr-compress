import { 
  Input, 
  Output, 
  Conversion, 
  ALL_FORMATS, 
  BlobSource, 
  BufferTarget,
  Mp3OutputFormat,
  AdtsOutputFormat,
  FlacOutputFormat,
} from 'mediabunny';
import { registerMp3Encoder } from '@mediabunny/mp3-encoder';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { registerFlacEncoder } from '@mediabunny/flac-encoder';
import { registerAc3Encoder, registerAc3Decoder } from '@mediabunny/ac3';
import exifr from 'exifr';

// Register audio encoders/decoders globally
registerMp3Encoder();
registerAacEncoder();
registerFlacEncoder();
registerAc3Encoder();
registerAc3Decoder();

export type AudioCompressionSettings = {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  format: 'mp3' | 'aac' | 'flac';
};

export type ProgressCallback = (progress: number) => void;

export async function compressAudio(
  file: File,
  settings: AudioCompressionSettings,
  removeSensitiveData: boolean,
  onProgress: ProgressCallback
): Promise<Blob> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });

  let outputFormat;
  switch (settings.format) {
    case 'mp3': outputFormat = new Mp3OutputFormat(); break;
    case 'aac': outputFormat = new AdtsOutputFormat(); break;
    case 'flac': outputFormat = new FlacOutputFormat(); break;
    default: outputFormat = new Mp3OutputFormat(); break;
  }
  
  const output = new Output({
    format: outputFormat,
    target: new BufferTarget(),
  });

  // Target bitrates based on quality
  // FLAC is lossless, so bitrate setting is mostly ignored/handled internally, 
  // but for AAC/MP3 we specify bitrates
  const bitrateMap = {
    low: 64_000,
    medium: 128_000,
    high: 192_000,
    ultra: 320_000
  };

  const targetBitrate = bitrateMap[settings.quality];

  const conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    audio: {
      bitrate: targetBitrate,
    },
    // Leaving video undefined will naturally drop any video tracks if present,
    // but since this is an audio compressor, we are focusing on audio.
    // If the user wants to convert video to audio, this will strip video.
    tags: removeSensitiveData ? {} : undefined, // Conditionally drop or keep metadata
  });

  if (!conversion.isValid) {
    throw new Error('Conversion is not valid for this audio file.');
  }

  conversion.onProgress = (progress) => {
    onProgress(progress);
  };

  await conversion.execute();

  const buffer = (output.target as BufferTarget).buffer;
  const mimeType = {
    mp3: 'audio/mpeg',
    aac: 'audio/aac',
    flac: 'audio/flac'
  }[settings.format];

  if (!buffer) {
    throw new Error('Compression failed: output buffer is empty');
  }

  return new Blob([buffer], { type: mimeType });
}

export async function getAudioMetadata(file: Blob) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });

  const duration = await input.computeDuration();
  
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
    size: file.size,
    latitude,
    longitude,
    make,
    model,
    dateTimeOriginal
  };
}
