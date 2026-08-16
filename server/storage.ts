// Preconfigured storage helpers for Manus WebDev templates
// Uses the Biz-provided storage proxy (Authorization: Bearer <token>)

import { ENV } from "./_core/env";
import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

type StorageConfig = { baseUrl: string; apiKey: string };

const LOCAL_STORAGE_ROOT = resolve(process.cwd(), ".local-storage");

function hasRemoteStorageConfig() {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}

function hasVercelBlobConfig() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

async function buildVercelBlobReadUrl(key: string): Promise<string> {
  const validUntil = Date.now() + 10 * 60 * 1000;
  const signedToken = await issueSignedToken({
    pathname: key,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    access: "private",
    operation: "get",
    pathname: key,
    validUntil,
  });
  return presignedUrl;
}

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage URL lookup failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = key.split("/");
  if (
    !key ||
    segments.some(
      segment => segment === "" || segment === "." || segment === ".."
    )
  ) {
    throw new Error("Invalid storage key");
  }
  return key;
}

function localPathForKey(relKey: string): string {
  const filePath = resolve(LOCAL_STORAGE_ROOT, normalizeKey(relKey));
  if (
    filePath !== LOCAL_STORAGE_ROOT &&
    !filePath.startsWith(`${LOCAL_STORAGE_ROOT}${sep}`)
  ) {
    throw new Error("Invalid local storage path");
  }
  return filePath;
}

function inferContentType(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function toBuffer(data: Buffer | Uint8Array | string) {
  if (typeof data === "string") return Buffer.from(data);
  return Buffer.from(data);
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (hasVercelBlobConfig()) {
    await put(key, toBuffer(data), {
      access: "private",
      addRandomSuffix: false,
      contentType,
    });
    return { key, url: await buildVercelBlobReadUrl(key) };
  }

  if (!hasRemoteStorageConfig()) {
    if (ENV.isProduction) getStorageConfig();
    const filePath = localPathForKey(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, toBuffer(data));
    return {
      key,
      url: `data:${contentType};base64,${toBuffer(data).toString("base64")}`,
    };
  }

  const { baseUrl, apiKey } = getStorageConfig();
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (hasVercelBlobConfig()) {
    return { key, url: await buildVercelBlobReadUrl(key) };
  }

  if (!hasRemoteStorageConfig()) {
    if (ENV.isProduction) getStorageConfig();
    const data = await readFile(localPathForKey(key));
    return {
      key,
      url: `data:${inferContentType(key)};base64,${data.toString("base64")}`,
    };
  }

  const { baseUrl, apiKey } = getStorageConfig();
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}

export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  if (hasVercelBlobConfig()) {
    await del(key);
    return;
  }

  if (!hasRemoteStorageConfig()) {
    if (ENV.isProduction) getStorageConfig();
    try {
      await unlink(localPathForKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return;
  }

  const { baseUrl, apiKey } = getStorageConfig();
  const deleteUrl = new URL("v1/storage/delete", ensureTrailingSlash(baseUrl));
  deleteUrl.searchParams.set("path", key);
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: buildAuthHeaders(apiKey),
  });
  if (!response.ok && response.status !== 404) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage delete failed (${response.status} ${response.statusText}): ${message}`
    );
  }
}
