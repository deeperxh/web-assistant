const API_URL = "https://translate.googleapis.com/translate_a/single";
const MAX_CHARS = 4500;

/**
 * Translate text using Google Translate free endpoint.
 * No API key needed — works directly from Chrome extensions.
 */
export async function googleTranslate(
  text: string,
  from: string,
  to: string,
): Promise<string> {
  if (!text.trim()) return "";

  // Map common lang codes
  const sl = from === "auto" ? "auto" : mapLang(from);
  const tl = mapLang(to);

  // Split long text into chunks
  if (text.length > MAX_CHARS) {
    return translateLongText(text, sl, tl);
  }

  return translateChunk(text, sl, tl);
}

/**
 * Translate an array of texts in parallel (batched).
 * Returns translations in the same order.
 */
export async function googleTranslateBatch(
  texts: string[],
  from: string,
  to: string,
  concurrency = 5,
): Promise<string[]> {
  const sl = from === "auto" ? "auto" : mapLang(from);
  const tl = mapLang(to);
  const results: string[] = new Array(texts.length).fill("");

  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const promises = batch.map((t) => (t.trim() ? translateChunk(t, sl, tl) : Promise.resolve("")));
    const translated = await Promise.all(promises);
    for (let j = 0; j < translated.length; j++) {
      results[i + j] = translated[j];
    }
  }

  return results;
}

async function translateChunk(text: string, sl: string, tl: string): Promise<string> {
  const urlParams = new URLSearchParams({ client: "gtx", sl, tl, dt: "t" });

  const resp = await fetch(`${API_URL}?${urlParams}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ q: text }),
  });
  if (!resp.ok) {
    throw new Error(`Google Translate HTTP ${resp.status}`);
  }

  const data = await resp.json();
  // Response format: [[["translated text","original text",...], ...], ...]
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Unexpected response format");
  }

  return data[0]
    .filter((seg: unknown) => Array.isArray(seg) && typeof seg[0] === "string")
    .map((seg: string[]) => seg[0])
    .join("");
}

async function translateLongText(text: string, sl: string, tl: string): Promise<string> {
  // Split on sentence boundaries
  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    if (current.length + line.length + 1 > MAX_CHARS) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }
  if (current) chunks.push(current);

  const results = await Promise.all(chunks.map((c) => translateChunk(c, sl, tl)));
  return results.join("\n");
}

function mapLang(code: string): string {
  const map: Record<string, string> = {
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
    "en": "en",
    "ja": "ja",
    "ko": "ko",
    "fr": "fr",
    "de": "de",
    "es": "es",
  };
  return map[code] || code;
}
