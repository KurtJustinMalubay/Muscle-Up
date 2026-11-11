import * as SecureStore from "expo-secure-store";
import { getAppSetting, saveAppSetting } from "./db";

export const GEMINI_KEY_STORAGE = "muscle-up-gemini-api-key";
export const API_URL_SETTING = "api_base_url";
const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "";
const REQUEST_TIMEOUT_MS = 90000;

export async function savedGeminiKey() {
  return SecureStore.getItemAsync(GEMINI_KEY_STORAGE);
}

function normalizeBaseUrl(value: string) {
  const baseUrl = value.trim().replace(/\/+$/, "");
  if (!baseUrl) return "";
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Enter a complete server address, such as https://your-service.onrender.com.");
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("Use an HTTPS address for your deployed API. HTTP is allowed only for a local development server.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The API address cannot contain credentials, query parameters, or a fragment.");
  }
  if (/\/api\/v1$/i.test(url.pathname)) {
    throw new Error("Enter the server's base address only, without /api/v1.");
  }
  return baseUrl;
}

export async function getApiBaseUrl() {
  const saved = await getAppSetting(API_URL_SETTING);
  return normalizeBaseUrl(saved ?? DEFAULT_BASE_URL);
}

export async function setApiBaseUrl(value: string) {
  const baseUrl = normalizeBaseUrl(value);
  await saveAppSetting(API_URL_SETTING, baseUrl);
  return baseUrl;
}

export async function requestApi<T>(path: string, body?: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  if (!baseUrl) {
    throw new Error("Add your deployed Muscle Up API address in Settings before using Coach or AI meal plans.");
  }
  if (!/^[a-z0-9-]+$/i.test(path)) throw new Error("Invalid API endpoint.");

  const key = await savedGeminiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/v1/${path}`, {
      method,
      headers: {
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "X-Gemini-Key": key } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const details = payload && typeof payload === "object" && "detail" in payload
        ? String(payload.detail)
        : responseText;
      throw new Error(`API request failed (${response.status}): ${(details || "The server returned an empty error.").slice(0, 400)}`);
    }
    if (payload === null) throw new Error("The API returned an unreadable response. Check that the backend is up to date.");
    return payload as T;
  } catch (reason) {
    if (reason instanceof Error && reason.name === "AbortError") {
      throw new Error("The API took too long to respond. Render may be starting up; please try again.");
    }
    if (reason instanceof TypeError) {
      throw new Error("Could not reach the API. Check the server address and your internet connection.");
    }
    throw reason;
  } finally {
    clearTimeout(timeout);
  }
}
