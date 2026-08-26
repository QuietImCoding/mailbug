import OpenAI from "openai";
import { z } from "zod";
import type { MailSpec } from "../config/mail-spec.ts";
import type { ActionMap, Classification, RawEmail } from "./types.ts";

export function classificationSchema(cfg: MailSpec): z.ZodType<Classification> {
  return z.object({
    category: z.enum(cfg.categories as [string, ...string[]]),
    priority: z.number().refine((p) => cfg.priorities.includes(p)),
    topic: z.string().min(1),
    actions: z
      .array(z.object({}).catchall(z.string()))
      .refine((acts) =>
        acts.every(
          (a) =>
            Object.keys(a).length === 1 &&
            Object.keys(a)[0] in cfg.actions &&
            typeof Object.values(a)[0] === "string",
        ),
      ),
  });
}

function buildPrompt(email: RawEmail, cfg: MailSpec): string {
  return [
    "Classify this email.",
    `Categories: ${cfg.categories.join(", ")}`,
    `Priorities: ${cfg.priorities.join(", ")}`,
    `Available actions: ${Object.keys(cfg.actions).join(", ")}`,
    `Email subject: ${email.subject}`,
    `From: ${email.fromName} <${email.fromAddress}>`,
    `Received: ${email.receivedAt}`,
    `Body:\n${email.bodyText}`,
    "",
    'Return ONLY a JSON object with this exact shape:',
    '{"category":"<one of the categories>","priority":<one of the priorities>,"topic":"<short label>","actions":[{"<actionType>":"<short message>"}]}',
    "where actionType is one of the available actions and message is a short string.",
  ].join("\n");
}

// Deterministic fallback used when DEEPSEEK_API_KEY is not set. Picks a
// category by keyword match over subject + body, assigns priority 1 for
// marketing else 2, topic = first 3 subject words, and emits one action.
export function mockClassify(email: RawEmail, cfg: MailSpec): Classification {
  const text = `${email.subject} ${email.bodyText}`.toLowerCase();

  const rules: Array<[string, string[]]> = [
    ["marketing", ["promo", "sale", "discount", "% off", "offer", "deal"]],
    ["finance", ["invoice", "payment", "bill", "bank", "statement", "balance"]],
    ["updates", ["update", "release", "changelog", "newsletter", "announce"]],
    ["social", ["new message", "comment", "follow", "connection"]],
    ["work", ["meeting", "deadline", "project", "standup", "review", "sprint"]],
  ];

  let category = "personal";
  for (const [cat, kws] of rules) {
    if (kws.some((k) => text.includes(k))) {
      category = cat;
      break;
    }
  }
  if (!cfg.categories.includes(category)) category = "personal";

  const requestedPriority = category === "marketing" ? 1 : 2;
  const priority = cfg.priorities.includes(requestedPriority)
    ? requestedPriority
    : cfg.priorities[0];

  const topicWords = email.subject.trim().split(/\s+/).slice(0, 3).join(" ");
  const topic = topicWords.toLowerCase() || "untitled";

  const actionKey = cfg.actions.ntfy ? "ntfy" : Object.keys(cfg.actions)[0];
  const actions: ActionMap[] = [{ [actionKey]: `${category.toUpperCase()} EMAIL` }];

  return { category, priority, topic, actions };
}

export async function classifyEmail(
  email: RawEmail,
  cfg: MailSpec,
): Promise<Classification> {
  let parsed: unknown;

  if (process.env.DEEPSEEK_API_KEY) {
    const baseURL = process.env.DEEPSEEK_BASE_URL ?? cfg.llm.baseURL;
    const model = process.env.DEEPSEEK_MODEL ?? cfg.llm.model;
    // Reasoning models count reasoning tokens against max_tokens, so give enough
    // headroom for the reasoning pass *plus* the final JSON answer.
    const maxTokens = Number(process.env.DEEPSEEK_MAX_TOKENS ?? cfg.llm.maxTokens);
    const client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL,
    });
    const resp = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You classify email. Respond with only a JSON object." },
        { role: "user", content: buildPrompt(email, cfg) },
      ],
    });
    // The final answer lives in `message.content`. `reasoning_content` (some
    // DeepSeek/Qwen endpoints) holds the chain-of-thought and is NOT JSON —
    // the model must still emit the JSON in `content`.
    const raw = resp.choices[0]?.message?.content ?? "";
    if (!raw) {
      console.error("[classify] no content in LLM response", {
        model,
        email: email.messageId,
        finishReason: resp.choices[0]?.finish_reason,
        usage: resp.usage,
        reasonPreview: (resp.choices[0]?.message as { reasoning_content?: string })
          ?.reasoning_content
          ?.slice(0, 200),
      });
      throw new Error(
        `LLM returned no content for message ${email.messageId} (model=${model}). ` +
          `finish_reason=${resp.choices[0]?.finish_reason}, usage=${JSON.stringify(resp.usage)}. ` +
          `This is usually a max_tokens budget too small for a reasoning model — raise DEEPSEEK_MAX_TOKENS.`,
      );
    }
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  } else {
    parsed = mockClassify(email, cfg);
  }

  try {
    return classificationSchema(cfg).parse(parsed);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`classification failed for message ${email.messageId}: ${detail}`);
  }
}
