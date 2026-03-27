/**
 * Parse SSE (Server-Sent Events) stream lines.
 * Yields parsed JSON objects from "data: ..." lines.
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<string>,
): AsyncGenerator<unknown> {
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (!trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6).trim();
      if (data === "[DONE]") return;

      try {
        yield JSON.parse(data);
      } catch {
        // skip malformed JSON
      }
    }
  }
}
