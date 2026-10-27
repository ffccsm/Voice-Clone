/**
 * Safe API client for VoxClone AI backend endpoints.
 * Prevents "Unexpected token '<', '<!doctype '... is not valid JSON" errors
 * when upstream proxies or warmup pages return HTML responses.
 */

function isHtmlPayload(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<head") ||
    trimmed.startsWith("<body")
  );
}

function unwrapErrorMessage(rawError: unknown, fallback: string): string {
  if (!rawError) return fallback;
  const msg = typeof rawError === "string" ? rawError : (rawError as any)?.message || fallback;
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) return parsed.error.message;
    if (parsed?.message) return parsed.message;
  } catch {
    // Plain text message
  }
  return msg;
}

export async function apiPost<T = any>(
  endpoint: string,
  payload: Record<string, unknown>,
  maxRetries = 2
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();

      // If proxy/gateway returned an HTML warmup or error page instead of JSON
      if (isHtmlPayload(rawText)) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
          continue;
        }
        throw new Error(
          `Server returned an unexpected HTML response (HTTP ${response.status}). Please refresh the page and try again.`
        );
      }

      if (!rawText.trim()) {
        throw new Error(`Empty response from server (HTTP ${response.status}).`);
      }

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(
          `Invalid response format from server (HTTP ${response.status}). Please try again.`
        );
      }

      if (!response.ok) {
        throw new Error(
          unwrapErrorMessage(data?.error, `Request failed with status ${response.status}`)
        );
      }

      return data as T;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Only retry on network errors, not explicit 4xx/5xx JSON API errors
      const isApiError =
        lastError.message &&
        !lastError.message.includes("Failed to fetch") &&
        !lastError.message.includes("NetworkError");
      if (isApiError || attempt >= maxRetries) {
        throw lastError;
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw lastError || new Error("Request failed");
}
