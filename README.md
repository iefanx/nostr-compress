# Nostr Compress

High-performance, privacy-focused video compression tool designed for the Nostr ecosystem.

## Why Nostr Compress?

Compression is essential before uploading videos to Nostr relays and CDNs:

- **50-90% Size Reduction**: Significantly reduce the file size without noticeable quality loss.
- **Save Bandwidth**: Put less stress on Nostr CDNs and media servers.
- **Fast Loading**: Optimized videos load much faster in Nostr clients like Amethyst, Damus, and Primal.
- **Privacy First**: All processing happens 100% locally in your browser. Your videos are never uploaded to a server for processing.

## Performance

Built on top of **WebCodecs**, Nostr Compress is up to **67x faster** than traditional FFmpeg WASM. By leveraging your device's hardware acceleration directly in the browser, it provides near-native performance without any data leaving your machine.

## Features

- Supports MP4, WebM, and MOV formats.
- Modern codec support (AV1, HEVC, VP9).
- Automatic resolution optimization.
- Real-time progress tracking.
- Zero server dependencies.

## License

Built with [MediaBunny](https://mediabunny.dev).
