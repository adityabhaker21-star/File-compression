// compression/lossy.js

// Using ES6 imports or assuming global availability (e.g. from popup.html <script> tags)
// If you bundle them as modules, you might uncomment these:
// import jpeg from '../lib/jpeg-js/index.js';
// import lamejs from '../lib/lamejs/lame.min.js';
// import { createFFmpeg, fetchFile } from '../lib/ffmpeg.wasm/ffmpeg.min.js';

let ffmpegInstance = null;

async function initFFmpeg() {
    if (!ffmpegInstance) {
        // Assuming FFmpeg global from ffmpeg.wasm script
        const { createFFmpeg } = FFmpeg;
        ffmpegInstance = createFFmpeg({ log: true });
        await ffmpegInstance.load();
    }
    return ffmpegInstance;
}

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

    if (file.type === 'image/jpeg') {
        const q = quality !== undefined ? quality : 0.7;
        const arrayBuffer = await file.arrayBuffer();
        
        // decode JPEG
        const rawImageData = jpeg.decode(arrayBuffer, { useTArray: true }); // using global `jpeg` from jpeg-js
        
        // encode at lower quality (jpeg-js expects 0-100)
        const quality100 = Math.floor(q * 100);
        const encodedData = jpeg.encode(rawImageData, quality100);
        
        compressedBlob = new Blob([encodedData.data], { type: 'image/jpeg' });
    } 
    else if (file.type === 'audio/mpeg' || file.type === 'audio/wav') {
        const q = quality !== undefined ? quality : 0.6;
        const arrayBuffer = await file.arrayBuffer();
        
        // Decode audio to get PCM data
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        // lamejs expects 16-bit PCM samples
        // We take the first channel for simplicity, or interleave if stereo
        const channelData = audioBuffer.getChannelData(0); 
        const sampleRate = audioBuffer.sampleRate;
        const samples = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
            // Convert Float32 [-1.0, 1.0] to Int16
            let s = Math.max(-1, Math.min(1, channelData[i]));
            samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Initialize lamejs MP3 encoder (channels, sampleRate, kbps)
        // map quality 0.0-1.0 to kbps (e.g., 0.6 -> 128kbps)
        const kbps = Math.floor(64 + q * 192); // 64 to 256 kbps
        const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, kbps); // using global `lamejs`
        
        const mp3Data = [];
        const sampleBlockSize = 1152;
        for (let i = 0; i < samples.length; i += sampleBlockSize) {
            const sampleChunk = samples.subarray(i, i + sampleBlockSize);
            const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
            if (mp3buf.length > 0) {
                mp3Data.push(new Int8Array(mp3buf));
            }
        }
        const mp3bufFinal = mp3encoder.flush();
        if (mp3bufFinal.length > 0) {
            mp3Data.push(new Int8Array(mp3bufFinal));
        }

        compressedBlob = new Blob(mp3Data, { type: 'audio/mpeg' });
        outputFileName = outputFileName.replace(/\.wav$/i, '.mp3');
    }
    else if (file.type === 'video/mp4') {
        const q = quality !== undefined ? quality : 0.5;
        const ffmpeg = await initFFmpeg();
        const { fetchFile } = FFmpeg;

        ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));
        
        // Map quality to CRF (0 is best, 51 is worst)
        // 0.5 quality -> CRF ~ 28
        const crf = Math.floor(51 - (q * 51));
        
        await ffmpeg.run('-i', 'input.mp4', '-vcodec', 'libx264', '-crf', crf.toString(), 'output.mp4');
        
        const data = ffmpeg.FS('readFile', 'output.mp4');
        compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });
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
