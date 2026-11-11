import { gcm } from "@noble/ciphers/aes";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToUtf8, utf8ToBytes } from "@noble/hashes/utils";
import { gzipSync, gunzipSync } from "fflate";
import * as Crypto from "expo-crypto";
import { exportData, importData } from "./db";

const DRIVE_FILE_NAME = "muscle-up-backup-v1.enc";
const MAGIC = new Uint8Array([77, 85, 49]);

async function encryptSnapshot(passphrase: string) {
  const salt = await Crypto.getRandomBytesAsync(16);
  const nonce = await Crypto.getRandomBytesAsync(12);
  const key = pbkdf2(sha256, utf8ToBytes(passphrase), salt, { c: 310_000, dkLen: 32 });
  const compressed = gzipSync(utf8ToBytes(JSON.stringify(await exportData())));
  const ciphertext = gcm(key, nonce).encrypt(compressed);
  const payload = new Uint8Array(MAGIC.length + salt.length + nonce.length + ciphertext.length);
  payload.set(MAGIC, 0);
  payload.set(salt, MAGIC.length);
  payload.set(nonce, MAGIC.length + salt.length);
  payload.set(ciphertext, MAGIC.length + salt.length + nonce.length);
  return payload;
}

async function decryptSnapshot(payload: Uint8Array, passphrase: string) {
  const headerLength = MAGIC.length + 16 + 12;
  if (payload.length <= headerLength || MAGIC.some((value, index) => payload[index] !== value)) {
    throw new Error("The Drive file is not a valid Muscle Up backup.");
  }
  const salt = payload.slice(MAGIC.length, MAGIC.length + 16);
  const nonce = payload.slice(MAGIC.length + 16, headerLength);
  const key = pbkdf2(sha256, utf8ToBytes(passphrase), salt, { c: 310_000, dkLen: 32 });
  let plaintext: Uint8Array;
  try {
    plaintext = gcm(key, nonce).decrypt(payload.slice(headerLength));
  } catch {
    throw new Error("Could not decrypt this backup. Check the backup passphrase and file.");
  }
  const json = bytesToUtf8(gunzipSync(plaintext));
  await importData(JSON.parse(json));
}

async function driveRequest(accessToken: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Drive request failed (${response.status}): ${details.slice(0, 300)}`);
  }
  return response;
}

export async function uploadEncryptedBackup(accessToken: string, passphrase: string) {
  if (passphrase.length < 8) throw new Error("Use a backup passphrase of at least 8 characters.");
  const search = await driveRequest(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`)}&spaces=appDataFolder&fields=files(id)`,
  );
  const result = await search.json() as { files?: { id: string }[] };
  const fileId = result.files?.[0]?.id;
  let url: string;
  let method: string;
  if (fileId) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    method = "PATCH";
  } else {
    const created = await driveRequest(
      accessToken,
      "https://www.googleapis.com/drive/v3/files?fields=id",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: "application/octet-stream", parents: ["appDataFolder"] }),
      },
    );
    const metadata = await created.json() as { id: string };
    url = `https://www.googleapis.com/upload/drive/v3/files/${metadata.id}?uploadType=media`;
    method = "PATCH";
  }
  const payload = await encryptSnapshot(passphrase);
  await driveRequest(accessToken, url, {
    method,
    headers: { "Content-Type": "application/octet-stream" },
    body: new Blob([payload], { type: "application/octet-stream" }),
  });
}

export async function restoreEncryptedBackup(accessToken: string, passphrase: string) {
  const search = await driveRequest(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`)}&spaces=appDataFolder&fields=files(id)`,
  );
  const result = await search.json() as { files?: { id: string }[] };
  const fileId = result.files?.[0]?.id;
  if (!fileId) throw new Error("No Muscle Up backup was found in this Google Drive account.");
  const response = await driveRequest(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
  );
  const payload = new Uint8Array(await response.arrayBuffer());
  await decryptSnapshot(payload, passphrase);
}
