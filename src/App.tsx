import React, { useState, useRef, useEffect } from 'react';
import { Upload, Video, Settings, Download, Zap, CheckCircle, AlertCircle, RefreshCw, Layers, ShieldCheck, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { compressVideo, getVideoMetadata, getSupportedCodecs } from './VideoCompressor';
import type { CompressionSettings } from './VideoCompressor';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportedCodecs, setSupportedCodecs] = useState<string[]>([]);
  const [settings, setSettings] = useState<CompressionSettings>({
    quality: 'medium',
    resolution: 1080,
    format: 'mp4',
    codec: 'avc', // Will be upgraded to hevc in useEffect if supported
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchCodecs = async () => {
      try {
        const codecs = await getSupportedCodecs();
        setSupportedCodecs(codecs.video);
        // Priority: HEVC (for MP4/MOV) > AV1 (for WebM) > VP9 (for WebM) > AVC
        if (codecs.video.includes('hevc')) setSettings(s => ({ ...s, codec: 'hevc', format: 'mp4' }));
        else if (codecs.video.includes('av1')) setSettings(s => ({ ...s, codec: 'av1', format: 'webm' }));
        else if (codecs.video.includes('vp9')) setSettings(s => ({ ...s, codec: 'vp9', format: 'webm' }));
        else setSettings(s => ({ ...s, codec: 'avc', format: 'mp4' }));
      } catch (err) {
        console.error('Error fetching codecs:', err);
      }
    };
    fetchCodecs();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResultBlob(null);
      setError(null);
      try {
        const meta = await getVideoMetadata(selectedFile);
        setMetadata(meta);
        // Auto-select resolution based on input
        if (meta.height >= 1080) setSettings(s => ({ ...s, resolution: 1080 }));
        else if (meta.height >= 720) setSettings(s => ({ ...s, resolution: 720 }));
        else setSettings(s => ({ ...s, resolution: 480 }));
        
        // Detect original format
        if (selectedFile.name.toLowerCase().endsWith('.mov')) {
           // If it's a MOV, suggest MP4 for better compression
           setSettings(s => ({ ...s, format: 'mp4' }));
        }
      } catch (err) {
        console.error(err);
        setError('Could not read video metadata.');
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('video/')) {
      const target = { files: e.dataTransfer.files } as any;
      handleFileChange({ target } as any);
    }
  };

  const handleCompress = async () => {
    if (!file) return;

    setIsCompressing(true);
    setProgress(0);
    setResultBlob(null);
    setError(null);

    try {
      const blob = await compressVideo(file, settings, (p) => setProgress(p * 100));
      setResultBlob(blob);
    } catch (err: any) {
      setError(err.message || 'Compression failed.');
    } finally {
      setIsCompressing(false);
    }
  };

  const downloadResult = () => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optimized_${file?.name.split('.')[0] || 'video'}.${settings.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container">
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', marginBottom: '1.5rem' }}
      >
        <h1 className="main-title">Nostr Compress</h1>
        <p className="subtitle">
          Reduce video size by <strong>50-90%</strong> for Nostr without losing substantial quality. 
          Save community CDN bandwidth and make your posts load instantly.
        </p>
      </motion.header>

      <main>
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card drop-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="icon-wrapper float">
                <Upload size={32} color="white" />
              </div>
              <div>
                <h2>Drop your video here</h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '0.5rem' }}>
                  or click to browse files
                </p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="video/*" 
                style={{ display: 'none' }} 
              />
            </motion.div>
          ) : (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="card"
            >
              <div className="file-info">
                <div className="icon-wrapper" style={{ width: 48, height: 48 }}>
                  <Video size={24} color="white" />
                </div>
                <div className="file-details">
                  <div className="file-name">{file.name}</div>
                  <div className="file-meta">
                    {metadata ? `${formatDuration(metadata.duration)} • ${metadata.width}x${metadata.height} • ${formatSize(metadata.size)}` : 'Loading...'}
                  </div>
                </div>
                <button className="badge" onClick={() => { setFile(null); setResultBlob(null); }} style={{ cursor: 'pointer', border: 'none' }}>Change</button>
              </div>

              <div className="settings-grid">
                <div className="setting-group">
                  <label><ShieldCheck size={14} style={{ marginRight: 6 }} /> Quality Preset</label>
                  <select 
                    value={settings.quality}
                    onChange={(e) => setSettings({...settings, quality: e.target.value as any})}
                  >
                    <option value="low">Low (Smallest size)</option>
                    <option value="medium">Medium (Standard)</option>
                    <option value="high">High (Good Detail)</option>
                    <option value="ultra">Ultra (Maintain Quality)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <button 
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: 'rgba(255,255,255,0.5)', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    fontSize: '0.9rem',
                    padding: 0
                  }}
                >
                  {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  Advanced Settings
                </button>
              </div>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="settings-grid" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="setting-group">
                        <label><Layers size={14} style={{ marginRight: 6 }} /> Output Format</label>
                        <select 
                          value={settings.format}
                          onChange={(e) => setSettings({...settings, format: e.target.value as any})}
                        >
                          <option value="mp4">MP4 (Best Compatibility)</option>
                          <option value="webm">WebM (Best Compression)</option>
                          <option value="mov">MOV (Original QuickTime)</option>
                        </select>
                      </div>

                      <div className="setting-group">
                        <label><Zap size={14} style={{ marginRight: 6 }} /> Target Resolution</label>
                        <select 
                          value={settings.resolution}
                          onChange={(e) => setSettings({...settings, resolution: Number(e.target.value) as any})}
                        >
                          <option value={480}>480p (Fast)</option>
                          <option value={720}>720p (HD)</option>
                          <option value={1080}>1080p (Full HD)</option>
                          {metadata && metadata.width > 1920 && <option value={metadata.width}>Original ({metadata.width}p)</option>}
                        </select>
                      </div>

                      <div className="setting-group">
                        <label><Settings size={14} style={{ marginRight: 6 }} /> Codec</label>
                        <select 
                          value={settings.codec}
                          onChange={(e) => setSettings({...settings, codec: e.target.value})}
                        >
                          {supportedCodecs.map(c => (
                            <option key={c} value={c}>
                              {c.toUpperCase()} {['av1', 'vp9', 'hevc'].includes(c) ? '(Modern/Efficient)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {file.name.toLowerCase().endsWith('.mov') && settings.format === 'mov' && (
                <div className="file-info" style={{ marginTop: '1.5rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <Info size={18} color="var(--primary)" />
                  <div className="file-details" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
                    Tip: Converting <strong>MOV</strong> to <strong>MP4</strong> or <strong>WebM</strong> is recommended for Nostr compatibility.
                  </div>
                </div>
              )}

              {isCompressing ? (
                <div className="progress-container">
                  <div className="progress-info">
                    <span>Optimizing your video...</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="progress-bar">
                    <motion.div 
                      className="progress-fill" 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ ease: "linear", duration: 0.1 }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {!resultBlob ? (
                    <button className="button" onClick={handleCompress} disabled={isCompressing}>
                      <Zap size={20} /> Optimize
                    </button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="file-info" style={{ marginTop: '2rem', border: '1px solid var(--success)' }}>
                        <div className="icon-wrapper badge-success" style={{ width: 40, height: 40 }}>
                          <CheckCircle size={20} color="var(--success)" />
                        </div>
                        <div className="file-details">
                          <div className="file-name">Optimization Complete!</div>
                          <div className="file-meta">
                            {formatSize(resultBlob.size)} ({Math.round((1 - (resultBlob.size / file.size)) * 100)}% reduced)
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="button" onClick={downloadResult} style={{ flex: 2 }}>
                          <Download size={20} /> Download
                        </button>
                        <button className="button" onClick={() => setResultBlob(null)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--card-border)' }}>
                          <RefreshCw size={20} /> Retry
                        </button>
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {error && (
                <div className="file-info" style={{ marginTop: '1rem', border: '1px solid var(--error)', background: 'rgba(245, 61, 61, 0.05)' }}>
                  <AlertCircle size={20} color="var(--error)" />
                  <div className="file-details" style={{ color: 'var(--error)' }}>{error}</div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="main-footer">
        Uses <strong>WebCodecs</strong> (67x faster than traditional FFmpeg WASM)
        <div className="privacy-badge">
          100% Client-Side • Your videos never leave your browser
        </div>
      </footer>
    </div>
  );
}

export default App;
