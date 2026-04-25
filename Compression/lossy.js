// compression/lossy.js

// Using ES6 imports or assuming global availability (e.g. from popup.html <script> tags)
// If you bundle them as modules, you might uncomment these:
// import jpeg from '../lib/jpeg-js/index.js';
// import lamejs from '../lib/lamejs/lame.min.js';
// import { createFFmpeg, fetchFile } from '../lib/ffmpeg.wasm/ffmpeg.min.js';



/**
 * Compresses a JPEG, audio, or video file using lossy algorithms.
 * @param {File} file - The File object from the upload input.
 * @param {number} quality - Quality level from 0.0 (max compression) to 1.0 (max quality).
 *                           Default: 0.7 for images, 0.6 for audio, 0.5 for video.
 * @returns {Promise<CompressionResult>} - See Shared Interface Contract below.
 */
async function compressLossy(file, quality) {
    const originalSize = file.size;
    let compressedBlob;
    let outputFileName = file.name;

    if (file.type === 'image/jpeg' || file.type === 'image/webp') {
        const q = quality !== undefined ? quality : 0.7;
        
        compressedBlob = await new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(img.src);
                    resolve(blob);
                }, file.type, q);
            };
            img.onerror = () => reject(new Error('Failed to load image for compression'));
        });
    }
    else if (file.type === 'audio/mpeg' || file.type === 'audio/wav' || file.type === 'audio/flac' || file.type === 'audio/aac' || file.type === 'audio/x-m4a') {
        const q = quality !== undefined ? quality : 0.6;
        const arrayBuffer = await file.arrayBuffer();

        // Decode audio natively
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const originalBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const channels = originalBuffer.numberOfChannels;
        
        const srMap = {
            96000:0, 88200:1, 64000:2, 48000:3, 44100:4, 32000:5,
            24000:6, 22050:7, 16000:8, 12000:9, 11025:10, 8000:11, 7350:12
        };
        let srIndex = srMap[originalBuffer.sampleRate];
        let targetSampleRate = originalBuffer.sampleRate;
        if (srIndex === undefined) {
            srIndex = 4;
            targetSampleRate = 44100;
        }

        const offlineCtx = new OfflineAudioContext(channels, Math.ceil(originalBuffer.duration * targetSampleRate), targetSampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = originalBuffer;
        source.connect(offlineCtx.destination);
        source.start(0);
        const audioBuffer = await offlineCtx.startRendering();

        let rawKbps = Math.floor(64 + q * 192) * 1000;
        const allowedBitrates = channels === 1 ? [48000, 64000, 96000, 128000] : [96000, 128000, 160000, 192000];
        const kbps = allowedBitrates.reduce((prev, curr) => Math.abs(curr - rawKbps) < Math.abs(prev - rawKbps) ? curr : prev);
        const chunks = [];

        await new Promise((resolve, reject) => {
            const encoder = new AudioEncoder({
                output: (chunk) => {
                    const data = new Uint8Array(chunk.byteLength);
                    chunk.copyTo(data);
                    
                    const frameLength = data.length + 7;
                    const header = new Uint8Array(7);
                    header[0] = 0xFF;
                    header[1] = 0xF1;
                    header[2] = (1 << 6) | (srIndex << 2) | ((channels >> 2) & 0x01);
                    header[3] = ((channels & 0x03) << 6) | ((frameLength >> 11) & 0x03);
                    header[4] = (frameLength >> 3) & 0xFF;
                    header[5] = ((frameLength & 0x07) << 5) | 0x1F;
                    header[6] = 0xFC;
                    
                    chunks.push(header);
                    chunks.push(data);
                },
                error: reject
            });

            encoder.configure({
                codec: 'mp4a.40.2',
                sampleRate: targetSampleRate,
                numberOfChannels: channels,
                bitrate: kbps
            });

            const totalFrames = audioBuffer.length;
            const planarData = new Float32Array(totalFrames * channels);
            for (let c = 0; c < channels; c++) {
                planarData.set(audioBuffer.getChannelData(c), c * totalFrames);
            }

            const framesPerChunk = targetSampleRate; 
            let offset = 0;
            let timestamp = 0;

            while (offset < totalFrames) {
                const frames = Math.min(framesPerChunk, totalFrames - offset);
                const chunkData = new Float32Array(frames * channels);
                
                for (let c = 0; c < channels; c++) {
                    chunkData.set(planarData.subarray(c * totalFrames + offset, c * totalFrames + offset + frames), c * frames);
                }

                const audioData = new AudioData({
                    format: 'f32-planar',
                    sampleRate: targetSampleRate,
                    numberOfFrames: frames,
                    numberOfChannels: channels,
                    timestamp: timestamp,
                    data: chunkData
                });

                encoder.encode(audioData);
                audioData.close();
                
                offset += frames;
                timestamp += (frames / targetSampleRate) * 1e6;
            }

            encoder.flush().then(() => {
                encoder.close();
                resolve();
            }).catch(reject);
        });

        compressedBlob = new Blob(chunks, { type: 'audio/aac' });
        outputFileName = outputFileName.replace(/\.(wav|mp3|flac|m4a)$/i, '.aac');
    }
    else if (file.type === 'video/mp4' || file.type === 'video/webm') {
        const q = quality !== undefined ? quality : 0.5;
        
        // Native Browser Video Compression via Canvas & MediaRecorder
        compressedBlob = await new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.muted = false;
            video.playsInline = true;

            video.onloadedmetadata = () => {
                // Scale down dimensions to save space (e.g. 0.5 quality = 75% scale = ~56% size)
                const scale = 0.5 + (q * 0.5);
                const canvas = document.createElement('canvas');
                canvas.width = Math.floor(video.videoWidth * scale);
                canvas.height = Math.floor(video.videoHeight * scale);
                const ctx = canvas.getContext('2d');

                video.play().catch(reject);

                video.onplay = () => {
                    // 1. Get video stream from our resized Canvas
                    const canvasStream = canvas.captureStream(30); // 30 FPS max
                    const videoTrack = canvasStream.getVideoTracks()[0];
                    
                    // 2. Get original audio stream directly from the playing video
                    let stream;
                    try {
                        const originalStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
                        const audioTracks = originalStream.getAudioTracks();
                        stream = new MediaStream([videoTrack, ...audioTracks]);
                    } catch (e) {
                        // Fallback if audio capture fails
                        stream = new MediaStream([videoTrack]);
                    }

                    // 3. Configure MediaRecorder with target bitrate
                    const targetVideoBps = Math.floor(500000 + (q * 2000000)); // 500kbps to 2.5Mbps
                    let mediaRecorder;
                    
                    // Chrome prefers WebM for MediaRecorder
                    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') 
                        ? 'video/webm; codecs=vp9' 
                        : 'video/webm';

                    mediaRecorder = new MediaRecorder(stream, { 
                        mimeType: mimeType,
                        videoBitsPerSecond: targetVideoBps
                    });

                    const chunks = [];
                    mediaRecorder.ondataavailable = e => {
                        if (e.data && e.data.size > 0) chunks.push(e.data);
                    };

                    mediaRecorder.onstop = () => {
                        const blob = new Blob(chunks, { type: 'video/webm' });
                        URL.revokeObjectURL(video.src);
                        resolve(blob);
                    };

                    mediaRecorder.start();

                    // 4. Render frames to Canvas
                    const drawFrame = () => {
                        if (video.paused || video.ended) {
                            if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
                            return;
                        }
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        requestAnimationFrame(drawFrame);
                    };
                    drawFrame();
                };

                video.onended = () => {
                    if (video.captureStream) {
                         video.captureStream().getTracks().forEach(t => t.stop());
                    }
                };
            };
            
            video.onerror = () => reject(new Error("Failed to load video for compression"));
        });
        
        outputFileName = outputFileName.replace(/\.mp4$/i, '.webm');
    }
    else {
        throw new Error(`Unsupported file type for lossy compression: ${file.type}`);
    }

    let compressedSize = compressedBlob.size;

    // --- Negative Compression Check ---
    if (compressedSize > originalSize) {
        compressedBlob = file;
        compressedSize = originalSize;
    }

    const ratio = (originalSize / compressedSize).toFixed(2) + ':1';
    const spaceSavings = (((originalSize - compressedSize) / originalSize) * 100).toFixed(1) + '%';

    return {
        compressedBlob: compressedBlob,
        originalSize: originalSize,
        compressedSize: compressedSize,
        ratio: ratio,
        spaceSavings: spaceSavings,
        outputFileName: outputFileName,
        isLossless: false
    };
}

/**
 * Decompresses (decodes) a previously lossy-compressed file.
 * @param {File} file - The compressed File object.
 * @param {string} originalType - The MIME type of the original file.
 * @returns {Promise<Blob>} - The decoded file as a Blob.
 */
async function decompressLossy(file, originalType) {
    // Lossy decompression returns the decoded playable/viewable Blob
    // Often, the lossy file IS the playable format, so for images/audio/video we can simply return the file itself.
    // If exact decoding to raw data is needed for verifyLossy (PSNR), we still just return the file as a Blob, 
    // and verifyLossy will decode it using AudioContext / Image decoding.

    // For JPEG, MP3, MP4, they are already standard formats. We just return it.
    // Wait, the interface says "For JPEG and video, this means re-decoding to a viewable/playable format."
    // Actually, compressed JPEG/MP4 are already viewable/playable formats.
    return new Blob([await file.arrayBuffer()], { type: file.type });
}

export { compressLossy, decompressLossy };
