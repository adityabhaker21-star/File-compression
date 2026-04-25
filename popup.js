// popup.js — Integration lead (Person 5)
// Wires Person 4's UI to Persons 1, 2, and 3's compression/verification logic.
// Loaded as type="module" in popup.html.

import { compressLossless, decompressLossless } from './Compression/lossless.js';
import { compressLossy, decompressLossy } from './Compression/lossy.js';
import { verifyLossless, verifyLossy } from './Compression/Verify.js';

// ─── File type classification ──────────────────────────────────────────

const LOSSLESS_TYPES = [
    'text/plain',
    'text/csv',
    'application/csv',
    'image/png',
    'image/gif',
    'application/zip',
    'application/x-zip-compressed',
    'application/pdf',
];

const LOSSY_TYPES = [
    'image/jpeg',
    'image/webp',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/aac',
    'audio/x-m4a',
    'audio/flac',
    'video/mp4',
];

// Extension-based fallback for types the browser may not report correctly
const EXT_TO_TYPE = {
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.zip': 'application/zip',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.pdf': 'application/pdf',
};

function resolveFileType(file) {
    if (file.type && file.type !== 'application/octet-stream') return file.type;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return EXT_TO_TYPE[ext] || file.type || '';
}

function isLossless(type) {
    return LOSSLESS_TYPES.includes(type);
}

function isLossy(type) {
    return LOSSY_TYPES.includes(type);
}

/**
 * Routes the uploaded file to the correct compress function based on type.
 */
function routeCompression(file) {
    const type = resolveFileType(file);
    // Ensure file has the resolved type (override browser's guess)
    const resolvedFile = new File([file], file.name, { type: type });
    if (isLossless(type)) return compressLossless(resolvedFile);
    if (isLossy(type)) return compressLossy(resolvedFile);
    throw new Error(`Unsupported file type: ${type || 'Unknown'}. Supported: txt, csv, png, jpg, jpeg, gif, webp, mp3, wav, mp4, zip, flac, aac, pdf`);
}

// ─── State ──────────────────────────────────────────────────────────────

let currentOriginalFile = null;
let currentCompressedBlob = null;
let currentCompressionResult = null;
let currentDecompressedBlob = null;

// ─── UI Wiring ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const compressBtn = document.getElementById('compress-btn');
    const decompressBtn = document.getElementById('decompress-btn');
    const errorMsg = document.getElementById('error-msg');
    const resultsSection = document.getElementById('results-section');

    const originalSizeDisplay = document.getElementById('original-size');
    const compressedSizeDisplay = document.getElementById('compressed-size');
    const ratioDisplay = document.getElementById('compression-ratio');
    const savingsDisplay = document.getElementById('space-savings');
    const verifyResultDisplay = document.getElementById('verify-result');

    const downloadCompressedBtn = document.getElementById('download-compressed-btn');
    const downloadDecompressedBtn = document.getElementById('download-decompressed-btn');
    const fileLabelText = document.getElementById('file-label-text');

    // ── Show selected filename ──
    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
            fileLabelText.textContent = fileInput.files[0].name;
        } else {
            fileLabelText.textContent = 'Choose a file…';
        }
    });

    // ── Helpers ──

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
    }

    function clearError() {
        errorMsg.textContent = '';
        errorMsg.style.display = '';
    }

    function setLoading(btn, loading) {
        if (loading) {
            btn.dataset.origText = btn.textContent;
            btn.textContent = 'Processing…';
            btn.disabled = true;
        } else {
            btn.textContent = btn.dataset.origText || btn.textContent;
            btn.disabled = false;
        }
    }

    // ── Compress ──

    compressBtn.addEventListener('click', async () => {
        clearError();
        resultsSection.style.display = 'none';
        verifyResultDisplay.textContent = '-';
        currentDecompressedBlob = null;

        if (!fileInput.files || fileInput.files.length === 0) {
            showError('Please select a file to compress.');
            return;
        }

        const file = fileInput.files[0];
        currentOriginalFile = file;

        setLoading(compressBtn, true);

        try {
            currentCompressionResult = await routeCompression(file);
            currentCompressedBlob = currentCompressionResult.compressedBlob;

            // Populate stats
            originalSizeDisplay.textContent = formatBytes(currentCompressionResult.originalSize);
            compressedSizeDisplay.textContent = formatBytes(currentCompressionResult.compressedSize);
            ratioDisplay.textContent = currentCompressionResult.ratio;
            savingsDisplay.textContent = currentCompressionResult.spaceSavings;

            // Show results section
            resultsSection.style.display = 'block';

        } catch (error) {
            console.error('Compression error:', error);
            showError(error.message || 'Compression failed.');
        } finally {
            setLoading(compressBtn, false);
        }
    });

    // ── Decompress + Verify ──

    decompressBtn.addEventListener('click', async () => {
        clearError();

        if (!currentCompressedBlob || !currentOriginalFile) {
            showError('Please compress a file first.');
            return;
        }

        setLoading(decompressBtn, true);

        try {
            const originalType = resolveFileType(currentOriginalFile);
            let decompressedBlob;

            if (currentCompressionResult.isLossless) {
                decompressedBlob = await decompressLossless(
                    currentCompressedBlob, originalType
                );
                const verify = await verifyLossless(currentOriginalFile, decompressedBlob);
                verifyResultDisplay.textContent = verify.label;
                verifyResultDisplay.style.color = verify.isMatch ? '#28a745' : '#dc3545';
            } else {
                decompressedBlob = await decompressLossy(
                    currentCompressedBlob, originalType
                );
                try {
                    const verify = await verifyLossy(
                        currentOriginalFile, decompressedBlob, originalType
                    );
                    verifyResultDisplay.textContent = verify.label;
                    verifyResultDisplay.style.color = verify.isAcceptable ? '#28a745' : '#dc3545';
                } catch (verifyErr) {
                    verifyResultDisplay.textContent = 'Verification not available for this format';
                    verifyResultDisplay.style.color = '#6c757d';
                }
            }

            currentDecompressedBlob = decompressedBlob;

        } catch (error) {
            console.error('Decompression error:', error);
            showError(error.message || 'Decompression/verification failed.');
        } finally {
            setLoading(decompressBtn, false);
        }
    });

    // ── Download Compressed ──

    downloadCompressedBtn.addEventListener('click', () => {
        if (!currentCompressedBlob || !currentCompressionResult) {
            showError('No compressed file available. Compress a file first.');
            return;
        }
        clearError();
        triggerDownload(currentCompressedBlob, currentCompressionResult.outputFileName);
    });

    // ── Download Decompressed ──

    downloadDecompressedBtn.addEventListener('click', () => {
        if (!currentDecompressedBlob) {
            showError('No decompressed file available. Click "Decompress File" first.');
            return;
        }
        clearError();
        triggerDownload(currentDecompressedBlob, 'decompressed_' + currentOriginalFile.name);
    });

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
});
