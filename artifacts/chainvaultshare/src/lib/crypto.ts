/**
 * Client-side Zero-Knowledge Encryption using Web Crypto API (AES-GCM 256-bit).
 * The encryption key NEVER leaves the browser — it is embedded in the URL fragment
 * which browsers never send to the server.
 *
 * Encrypted format: [12 bytes IV][ciphertext...]
 */

const ALGORITHM = "AES-GCM";
const KEY_BITS = 256;
const IV_BYTES = 12;

/** Generate a fresh AES-GCM 256-bit key */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_BITS }, true, ["encrypt", "decrypt"]);
}

/** Export a CryptoKey to base64url string for embedding in URL fragment */
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Import a base64url key string back to CryptoKey */
export async function importKeyFromBase64(b64: string): Promise<CryptoKey> {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const raw = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, { name: ALGORITHM, length: KEY_BITS }, false, ["decrypt"]);
}

/**
 * Encrypt a File or Blob.
 * Returns a new Blob with prepended 12-byte IV: [IV][ciphertext]
 */
export async function encryptFile(file: File, key: CryptoKey): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext);
  // Prepend IV to ciphertext
  const result = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), IV_BYTES);
  return new Blob([result], { type: "application/octet-stream" });
}

/**
 * Decrypt an encrypted Blob received from the server.
 * Expects format: [12 bytes IV][ciphertext...]
 */
export async function decryptBlob(
  encryptedBlob: Blob,
  key: CryptoKey,
  originalFileName: string,
  originalMimeType?: string
): Promise<File> {
  const buffer = await encryptedBlob.arrayBuffer();
  const iv = buffer.slice(0, IV_BYTES);
  const ciphertext = buffer.slice(IV_BYTES);
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv: new Uint8Array(iv) }, key, ciphertext);
  return new File([plaintext], originalFileName, { type: originalMimeType ?? "application/octet-stream" });
}

/**
 * Extract the encryption key from the URL fragment.
 * Share link format: https://chainvaultshare.app/t/uuid#key=base64url
 */
export function getKeyFromFragment(): string | null {
  const hash = window.location.hash; // e.g. "#key=abc123"
  const match = hash.match(/[#&]key=([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Append the encryption key to a share link URL fragment.
 * The fragment is NEVER sent to the server — it is browser-only.
 */
export function appendKeyToLink(shareLink: string, keyBase64: string): string {
  return `${shareLink}#key=${keyBase64}`;
}

/**
 * Download and decrypt an E2E-encrypted file in the browser.
 * Shows a progress indication via the onProgress callback.
 */
export async function downloadAndDecrypt(
  downloadUrl: string,
  fileName: string,
  keyBase64: string,
  headers?: Record<string, string>,
  onProgress?: (stage: "downloading" | "decrypting" | "done") => void
): Promise<void> {
  onProgress?.("downloading");
  const response = await fetch(downloadUrl, { headers });
  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      if (errJson.error) errorDetail = errJson.error;
    } catch { /* ignore */ }
    const err: any = new Error(errorDetail);
    err.status = response.status;
    throw err;
  }
  const encryptedBlob = await response.blob();

  onProgress?.("decrypting");
  const key = await importKeyFromBase64(keyBase64);
  const decryptedFile = await decryptBlob(encryptedBlob, key, fileName);

  // Trigger browser save dialog
  const url = URL.createObjectURL(decryptedFile);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);

  onProgress?.("done");
}
