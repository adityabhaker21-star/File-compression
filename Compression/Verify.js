/**
 * verify.js
 * Decompression verification and quality metrics module.
 * Handles SHA-256 hash checks for lossless files and PSNR computation for lossy files.
 * Does NOT perform compression or decompression — only verifies outputs.
 */
 
/**
 * Reads a File or Blob and returns its contents as an ArrayBuffer.
 * @param {File|Blob} fileOrBlob
 * @returns {Promise<ArrayBuffer>}
 */
async function readAsArrayBuffer(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file as ArrayBuffer."));
    reader.readAsArrayBuffer(fileOrBlob);
  });
}
 
/**
 * Converts an ArrayBuffer to a lowercase hex string.
 * @param {ArrayBuffer} buffer
 * @returns {string} - Hex-encoded string.
 */
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
 
/**
 * Computes the SHA-256 hash of a File or Blob using the built-in SubtleCrypto API.
 * No external library needed — SubtleCrypto is built into Chrome.
 * @param {File|Blob} fileOrBlob
 * @returns {Promise<string>} - Hex-encoded SHA-256 hash string.
 */
async function computeHash(fileOrBlob) {
  const buffer = await readAsArrayBuffer(fileOrBlob);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer);
  return bufferToHex(hashBuffer);
}
 
/**
 * Compares the hash of two files and returns a verification result.
 * Use this for lossless rebuild checks.
 * @param {File|Blob} original
 * @param {File|Blob} rebuilt
 * @returns {Promise<VerifyResult>}
 *
 * VerifyResult = {
 *   isMatch: boolean,
 *   originalHash: string,   // hex SHA-256
 *   rebuiltHash: string,    // hex SHA-256
 *   label: string           // "Perfect match ✓" or "Hash mismatch ✗"
 * }
 */
async function verifyLossless(original, rebuilt) {
  const [originalHash, rebuiltHash] = await Promise.all([
    computeHash(original),
    computeHash(rebuilt),
  ]);
 
  const isMatch = originalHash === rebuiltHash;
 
  return {
    isMatch,
    originalHash,
    rebuiltHash,
    label: isMatch ? "Perfect match ✓" : "Hash mismatch ✗",
  };
}
 
// ---------------------------------------------------------------------------
// PSNR helpers
// ---------------------------------------------------------------------------
 
/**
 * Decodes an image File/Blob to a flat Uint8ClampedArray of RGBA pixel values
 * using an off-screen canvas. Works for any format the browser can render
 * (JPEG, PNG, WebP, etc.).
 * @param {File|Blob} imageBlob
 * @returns {Promise<{ data: Uint8ClampedArray, width: number, height: number }>}
 */
async function decodeImageToPixels(imageBlob) {
  const url = URL.createObjectURL(imageBlob);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to decode image for PSNR."));
      image.src = url;
    });
 
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
 
    return { data: imageData.data, width: img.width, height: img.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
 
/**
 * Decodes an audio File/Blob to a flat Float32Array of PCM samples
 * using the Web Audio API's AudioContext.
 * @param {File|Blob} audioBlob
 * @returns {Promise<Float32Array>}
 */
async function decodeAudioToSamples(audioBlob) {
  const buffer = await readAsArrayBuffer(audioBlob);
  const audioCtx = new OfflineAudioContext(1, 1, 44100);
  const audioBuffer = await audioCtx.decodeAudioData(buffer);
 
  // Mix all channels down to mono for a single comparable array
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mixed = new Float32Array(length);
 
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mixed[i] += channelData[i] / numChannels;
    }
  }
 
  return mixed;
}
 
/**
 * Computes PSNR (Peak Signal-to-Noise Ratio) given two sample arrays and a
 * maximum possible signal value.
 *
 * Formula: PSNR = 20 * log10(MAX) - 10 * log10(MSE)
 * Returns Infinity if MSE is 0 (files are identical — perfect quality).
 *
 * @param {Uint8ClampedArray|Float32Array} original - Original sample array.
 * @param {Uint8ClampedArray|Float32Array} rebuilt  - Rebuilt sample array.
 * @param {number} maxValue - Maximum signal value (255 for 8-bit images, 1.0 for normalised audio).
 * @returns {number} - PSNR in dB.
 */
function computePSNR(original, rebuilt, maxValue) {
  const length = Math.min(original.length, rebuilt.length);
  let sumSquaredError = 0;
 
  for (let i = 0; i < length; i++) {
    const diff = original[i] - rebuilt[i];
    sumSquaredError += diff * diff;
  }
 
  const mse = sumSquaredError / length;
 
  if (mse === 0) return Infinity;
 
  return 20 * Math.log10(maxValue) - 10 * Math.log10(mse);
}
 
/**
 * Converts a numeric PSNR value into a human-readable label.
 * Thresholds:
 *   >= 40 dB  → Excellent
 *   >= 28 dB  → Acceptable
 *   <  28 dB  → Degraded
 * @param {number} psnr
 * @returns {string}
 */
function psnrLabel(psnr) {
  if (!isFinite(psnr)) return "Lossless (identical files)";
  if (psnr >= 40) return `Excellent (${psnr.toFixed(1)} dB)`;
  if (psnr >= 28) return `Acceptable (${psnr.toFixed(1)} dB)`;
  return `Degraded (${psnr.toFixed(1)} dB)`;
}
 
/**
 * Computes PSNR between the original and rebuilt image/audio as a quality metric.
 * Use this for lossy rebuild checks.
 * @param {File|Blob} original
 * @param {File|Blob} rebuilt
 * @param {string} fileType - MIME type, e.g. "image/jpeg" or "audio/mp3"
 * @returns {Promise<QualityResult>}
 *
 * QualityResult = {
 *   psnr: number,          // in dB — above 40 is excellent, below 25 is poor
 *   label: string,         // e.g. "Excellent (43.2 dB)" / "Acceptable (33.1 dB)" / "Degraded (21.4 dB)"
 *   isAcceptable: boolean  // true if psnr >= 28
 * }
 */
async function verifyLossy(original, rebuilt, fileType) {
  let psnr;
 
  if (fileType.startsWith("image/")) {
    // --- Image PSNR ---
    // Decode both images to raw RGBA pixel arrays and compare
    const [origPixels, rebPixels] = await Promise.all([
      decodeImageToPixels(original),
      decodeImageToPixels(rebuilt),
    ]);
 
    // Use only the RGB channels (skip alpha at index 3, 7, 11, ...)
    // to avoid alpha channel noise skewing the metric
    const origRGB = origPixels.data.filter((_, i) => (i + 1) % 4 !== 0);
    const rebRGB  = rebPixels.data.filter((_, i) => (i + 1) % 4 !== 0);
 
    psnr = computePSNR(origRGB, rebRGB, 255);
 
  } else if (fileType.startsWith("audio/")) {
    // --- Audio PSNR ---
    // Decode both audio files to normalised PCM float samples [-1.0, 1.0]
    const [origSamples, rebSamples] = await Promise.all([
      decodeAudioToSamples(original),
      decodeAudioToSamples(rebuilt),
    ]);
 
    psnr = computePSNR(origSamples, rebSamples, 1.0);
 
  } else {
    throw new Error(
      `verifyLossy: unsupported fileType "${fileType}". Expected "image/*" or "audio/*".`
    );
  }
 
  const roundedPsnr = isFinite(psnr) ? parseFloat(psnr.toFixed(2)) : Infinity;
 
  return {
    psnr: roundedPsnr,
    label: psnrLabel(roundedPsnr),
    isAcceptable: !isFinite(roundedPsnr) || roundedPsnr >= 28,
  };
}
 
export { computeHash, verifyLossless, verifyLossy };