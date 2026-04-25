// compression/lossless.js
import * as fflate from '../lib/fflate.js';

/**
 * Compresses Text (.txt, .csv) and PNG files.
 * Returns a result object matching the Shared Interface Contract.
 */
export async function compressLossless(file) {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let compressedData;
    let outputFileName = file.name;

    if (file.type === 'image/png') {
        // Lossless PNG re-encoding using UPNG
        const img = UPNG.decode(arrayBuffer);
        compressedData = UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 0);
    } else {
        // GZIP compression for everything else routed to lossless (text, csv, pdf, zip, gif)
        compressedData = fflate.gzipSync(uint8Array);
        outputFileName += '.gz';
    }
    const originalSize = file.size;
    let compressedSize = compressedData.byteLength; // Check size before creating Blob

    // --- NEW UPDATE START: Negative Compression Check ---
    if (compressedSize > originalSize) {
        return {
            compressedBlob: new Blob([uint8Array], { type: file.type }),
            originalSize,
            compressedSize: originalSize,
            ratio: '1.00:1',
            spaceSavings: '0.0%',
            outputFileName: file.name,
            isLossless: true
        };
    }
    // --- NEW UPDATE END ---

    const compressedBlob = new Blob([compressedData]);
    const ratio = (originalSize / compressedSize).toFixed(2) + ':1';
    const spaceSavings = (((originalSize - compressedSize) / originalSize) * 100).toFixed(1) + '%';

    return {
        compressedBlob,
        originalSize,
        compressedSize,
        ratio,
        spaceSavings,
        outputFileName,
        isLossless: true
    };
}

export async function decompressLossless(file, originalType) {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let decompressedData;

    if (originalType === 'image/png') {
        const img = UPNG.decode(arrayBuffer);
        decompressedData = UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 0);
    } else {
        decompressedData = fflate.gunzipSync(uint8Array);
    }
    return new Blob([decompressedData], { type: originalType });
}