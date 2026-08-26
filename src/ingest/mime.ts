// Minimal RFC822 reader. The IMAP source stores the full message source, but
// the dashboard (and the classifier prompt) want the prose, so this pulls the
// readable text/plain part out of it. Deliberately small: no attachments, no
// nested-multipart edge cases beyond what real mail actually sends.

export interface ParsedMessage {
  headers: Record<string, string>;
  text: string;
}

/** Cheap check for "did we store a raw message or already-clean text?". */
export function looksLikeRfc822(raw: string): boolean {
  const head = raw.slice(0, 2000);
  return /^(?:[A-Za-z-]+:[^\n]*\n(?:[ \t][^\n]*\n)*)+\r?\n/.test(head);
}

function splitHeaders(raw: string): {
  headers: Record<string, string>;
  body: string;
} {
  const match = raw.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) return { headers: {}, body: raw };

  const headerBlock = raw.slice(0, match.index);
  const body = raw.slice(match.index + match[0].length);
  const headers: Record<string, string> = {};

  // Unfold continuation lines before splitting on the first colon.
  for (const line of headerBlock.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    if (!(name in headers)) headers[name] = line.slice(colon + 1).trim();
  }
  return { headers, body };
}

function paramOf(headerValue: string, name: string): string | undefined {
  const match = headerValue.match(
    new RegExp(`${name}\\s*=\\s*("([^"]*)"|[^;\\s]+)`, "i"),
  );
  return match ? (match[2] ?? match[1]) : undefined;
}

function decodeBytes(body: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase();
  let bytes: Buffer;

  if (enc === "base64") {
    bytes = Buffer.from(body.replace(/\s+/g, ""), "base64");
  } else if (enc === "quoted-printable") {
    const unfolded = body.replace(/=\r?\n/g, "");
    const out: number[] = [];
    for (let i = 0; i < unfolded.length; i++) {
      if (
        unfolded[i] === "=" &&
        /^[0-9a-f]{2}$/i.test(unfolded.slice(i + 1, i + 3))
      ) {
        out.push(parseInt(unfolded.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        out.push(unfolded.charCodeAt(i) & 0xff);
      }
    }
    bytes = Buffer.from(out);
  } else {
    return body;
  }

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function tidy(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Returns the best readable text for one MIME entity (recurses into parts). */
function partText(raw: string, depth = 0): string {
  const { headers, body } = splitHeaders(raw);
  const contentType = headers["content-type"] ?? "text/plain";
  const encoding = headers["content-transfer-encoding"] ?? "7bit";
  const charset = paramOf(contentType, "charset") ?? "utf-8";

  if (/^multipart\//i.test(contentType) && depth < 4) {
    const boundary = paramOf(contentType, "boundary");
    if (!boundary) return "";
    const parts = body.split(
      new RegExp(
        `\r?\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?\r?\n?`,
      ),
    );
    let html = "";
    for (const part of parts) {
      if (!part.trim()) continue;
      const text = partText(part, depth + 1);
      if (!text) continue;
      // text/plain wins outright; keep an html rendering as the fallback.
      if (
        /content-type:\s*text\/plain/i.test(part) ||
        !/content-type:/i.test(part)
      )
        return text;
      if (!html) html = text;
    }
    return html;
  }

  const decoded = decodeBytes(body, encoding, charset);
  if (/^text\/html/i.test(contentType)) return tidy(htmlToText(decoded));
  return tidy(decoded);
}

export function parseMessage(raw: string): ParsedMessage {
  if (!looksLikeRfc822(raw)) return { headers: {}, text: tidy(raw) };
  const { headers } = splitHeaders(raw);
  return { headers, text: partText(raw) };
}

/** Raw message source (or already-plain text) in, readable prose out. */
export function extractPlainText(raw: string): string {
  if (!raw) return "";
  if (!looksLikeRfc822(raw)) return tidy(raw);
  const text = parseMessage(raw).text;
  return text || tidy(raw);
}

/** `"Stream" <stream@stream.place>` -> `stream@stream.place`. */
export function addressOf(headerValue: string | undefined): string {
  if (!headerValue) return "";
  const angled = headerValue.match(/<([^>]+)>/);
  const first = (angled ? angled[1] : headerValue.split(",")[0]).trim();
  return first.replace(/^["']|["']$/g, "");
}
