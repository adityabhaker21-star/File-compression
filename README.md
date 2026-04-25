# **File Compression Chrome Extension**

TEAM: MACS National Congress  
STATUS : Submitted(MACS JC Project 2\)

**Introduction**

This project is a browser-based file compression extension that supports both lossless and lossy compression techniques. It allows users to upload files, compress them, decompress them, and verify the results directly within a browser popup interface.

The extension is built using JavaScript, leveraging client-side libraries for efficient compression and verification.

# **Team Members**

| Name | Role |
| ----- | ----- |
| Kornika Hajra | Lossless Compression Engineer |
| Aditya bhaker | Lossy Compression Engineer |
| Aryan Gupta | Decompression & Verification Engineer |
| Aditya | UI Engineer |
| Akansha | Popup Logic \+ Integration Lead |
| Aditya and Akansha and vansh | Documentation, Testing & Integration |

| NAME | CONTRIBUTION(%) |
| :---- | :---- |
| Kornika | 15% |
| Aryan | 15% |
| Aditya | 40% |
| Akansha | 25% |
| Vansh Khare | 5% |

## **Features**

*  Upload files directly from your system  
*  Lossless Compression (Text, CSV, PNG)  
*  Lossy Compression (JPEG, Audio, Video)  
*  Decompression support  
*  Verification:  
  * Lossless → Exact match (hash comparison)  
  * Lossy → Quality evaluation  
*  Displays:  
  * Original size  
  * Compressed size  
  * Compression ratio  
  * Space savings (%)  
*  Error handling for invalid inputs

## **Installation & Usage**

1. Open browser (Chrome / Edge)  
2. Go to : chrome://extensions/   or  edge://extensions  
3. Enable Developer Mode  
4. Click Load Unpacked  
5. Select the project folder

      TO USE IT:

* Click extension icon  
* Upload file  
* Click Compress  
* View results  
* Click Decompress to verify

## **How It Works**

1. User uploads a file through the popup interface  
2. File type is detected  
3. Based on type:  
   * Lossless → `compressLossless()`  
   * Lossy → `compressLossy()`  
4. Results are displayed (size, ratio, savings)  
5. On decompression:  
   * File is reconstructed  
   * Verification is performed

**Compression Results** 

| FILE TYPE | FILE NAME | ORIGINAL SIZE(KB) | COMPRESSED SIZE(KB) | RATIO | SPACE SAVING(%) |
| :---- | :---- | :---- | :---- | :---- | :---- |
| pdf | MACS ki JAI | 16.81 | 11.1 | 1.51:1 | 34 |
| JPEG  | MACS ki jai  | 1018.16 | 280.19 | 3.63:1 | 72.5 |
| wav | MACS ki Jai  | 5.04 MB | 712.78  | 7.25:1 | 86.2 |
| txt | Macs ki Jai | 111.43 | 493 bytes | 231.44:1 | 99.6 |
| mp4 | MACS ki jai  | 17.01 MB | 723.54 | 24.08:1 | 95.8 |

## **Project Structure**

File-compression/  
│  
├── compression/  
│   ├── lossless.js        \# Lossless compression logic  
│   ├── lossy.js           \# Lossy compression logic  
│   ├── Verify.js          \# Verification functions  
│  
├── lib/  
│   ├── pako.js            \# GZIP compression  
│   ├── fflate.js          \# ZIP compression  
│   ├── UPNG.js            \# PNG compression  
│  
├── popup.html             \# UI layout  
├── popup.css              \# Styling  
├── popup.js               \# Main integration logic  
├── manifest.json          \# Extension configuration

## **Tools Used**

* JavaScript (ES Modules)  
* Browser Extension API (Manifest V3)  
* Compression Libraries:  
  * pako.js (GZIP)  
  * fflate.js (ZIP)  
  * UPNG.js (PNG compression)

## **Verification Logic**

Kindly validate the decompressed file on your end by comparing it against the original file

## **Metrics Calculated**

* Compression Ratio  
  \= Original Size / Compressed Size  
* Space Savings (%)  
  \= ((Original \- Compressed) / Original) × 100

## **Limitations**

* Large video files may take time (browser limitations)  
* Lossy compression may reduce quality  
* Depends on browser memory and performance  
* Limited file format support  
* We Don’t do decompression

**References**

* pako.js documentation  
* fflate.js documentation  
* UPNG.js library  
* Browser Extension (Manifest V3) documentation

