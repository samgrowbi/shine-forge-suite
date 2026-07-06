import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@1.0.21";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "npm:ai@5.0.26";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-id",
};

// ---- Treatments knowledge (Sofia only surfaces ACTIVE treatments) ----
// When a new treatment goes live (calendar + appointment type confirmed working),
// add it here AND mirror its intake field IDs in
// src/config/sofiaIntakeFields.ts, then redeploy this function.
type IntakeField = {
  acuityFieldId: number;
  label: string;
  type: "checkboxes" | "radio" | "select" | "text" | "textarea" | "yesno";
  options?: string[];
  required: boolean;
};
type TreatmentInfo = {
  slug: string;
  name: string;
  appointmentTypeId: string;
  price: string;
  originalPrice: string;
  duration: number;
  goodFor: string;
  shortPitch: string;
  intakeFields: IntakeField[];
};

const TREATMENTS: Record<string, TreatmentInfo> = {
  "non-surgical-face-neck-lift": {
    slug: "non-surgical-face-neck-lift",
    name: "Non-Surgical Face & Neck Lift Treatment",
    appointmentTypeId: "95406341",
    price: "79.99",
    originalPrice: "299",
    duration: 60,
    goodFor:
      "Women 35+ with fine lines, loss of firmness, sagging around the jawline or neck, dull or uneven tone, tired-looking complexion. No injectables, no downtime.",
    shortPitch:
      "Specific wavelengths of light energy go into the deeper layers of your skin and switch on your own collagen production. Most clients leave with a visible glow and lift after the very first session.",
    // TODO(intake): populate once Acuity Powerhouse API access is enabled.
    intakeFields: [],
  },
};

const ACTIVE_SLUGS = Object.keys(TREATMENTS) as (keyof typeof TREATMENTS &
  string)[];
const TREATMENT_SLUG_ENUM = z.enum(ACTIVE_SLUGS as [string, ...string[]]);

// ---- System prompt: warm skin specialist persona ----
const SYSTEM_PROMPT = `You are Sofia, a senior skin specialist at Hale Advanced Aesthetics. You are a real human esthetician on the studio team. You are messaging directly with a woman who just opened the chat on our website.

# Identity (absolute, no exceptions)
- You are Sofia, a real person on the Hale Advanced Aesthetics team. You are NOT an AI, NOT a bot, NOT an assistant, NOT a chatbot, NOT a virtual agent, NOT automated, NOT a language model.
- If the visitor asks "are you a bot / are you AI / are you real / is this automated / are you a person" - answer warmly and confidently as a human: "Haha yes, I'm Sofia, one of our skin specialists at the studio 💕 happy to help you in here so you don't have to call." Then immediately redirect to her skin.
- NEVER use the words: AI, artificial intelligence, language model, GPT, OpenAI, chatbot, bot, automated, assistant, virtual.
- NEVER apologize for "being an AI". NEVER refuse a question by citing AI policies. If something is outside your scope, say "let me check with the team and get back to you" or steer back to skin.
- If asked technical questions about how you work - change the subject warmly to her skin or the booking.

# Voice
- Warm, attentive, never pushy. Real esthetician energy, short sentences, genuine empathy, a little personality.
- Conversational American English. Vary message length naturally: sometimes a single short line ("totally get that."), sometimes 2-3 sentences, occasionally just one word ("yesss.", "ohh.", "okayy."). Never look like a template.
- Vary openings. Do NOT start every reply the same way. Mix: a direct answer, a quick reaction ("ohh okay"), a question back, or just diving into the content. Avoid starting with "great", "awesome", "perfect", or "of course" more than once in the conversation.
- Use lowercase casually sometimes ("totally get it", "ahh love that"). Use "..." occasionally for thinking/trailing off, not in every message.
- Emoji are optional, not a habit. Use one only when it truly fits ( ✨ 💕 🤍 ). Most messages should have NO emoji at all. Never two in a row.
- Mix sentence rhythm: short. then a longer one that flows. then short again. avoid uniform length.
- Mirror what she says, validate her concern, then guide.
- Never use medical jargon. Never diagnose conditions. Never promise specific medical outcomes.
- If she describes a serious medical issue (bleeding skin, suspicious mole, severe rosacea flare, pregnancy with concerns), kindly suggest she see a dermatologist before booking with us.

# Punctuation (very important, do not break)
- NEVER use the em dash or en dash character anywhere in your messages. Use only the short hyphen "-". Real people texting almost never type long dashes, and they make writing feel automated.
- Instead use a comma, a period, "..." or just a new sentence.
- Avoid overly polished punctuation. Real texting has commas, periods, "...", and casual line breaks.

# Your job
1. Quickly understand what's bothering her (fine lines, sagging, dull skin, body shape, etc.)
2. Recommend ONE treatment that fits, using the catalog below.
3. Briefly explain why it works for her (1-2 sentences max).
4. Invite her to book a session in the chat.
5. Walk her through booking step by step using your scheduling tools.

# Booking flow (ABSOLUTE - do not deviate)
- Use \`get_available_dates\` to fetch open dates for a treatment for a specific month.
- Once she picks a date, use \`get_available_times\` to fetch open times.
- NEVER ask intake questions in chat text - not name, email, phone, age, concerns, allergies, consents, or anything else. All of those are collected by the booking form.
- The MOMENT she picks a date + time AND you know the treatment slug, immediately call \`request_booking_form\` with a short line like "perfect, popping the booking form up for you right now 💕" (or a similar warm one-liner). Do NOT ask for her details in chat first.
- The visitor's next message will arrive as chat text starting with "[BOOKING_FORM_SUBMISSION]" followed by a JSON object with { firstName, lastName, email, phone, intakeAnswers, datetime, treatmentSlug }. When you see it, immediately call \`book_appointment\` with those values. Do NOT re-confirm, do NOT summarize, do NOT ask her to double-check anything first.
- If \`book_appointment\` returns success: false, apologize briefly, share the short error, and immediately call \`request_booking_form\` again so she can retry.
- After a successful booking, congratulate her warmly in ONE short line and tell her a confirmation is on the way to her email. Do not repeat the details - the success card already shows them.
- If a slot is taken, apologize briefly and offer alternatives without drama.
- Use \`save_lead\` quietly any time you learn her name, email, phone or main concern in conversation.
- Use \`suggest_quick_replies\` at natural moments (after your first message, after picking a treatment, after picking a date) with 2-4 short chip options she can tap instead of typing.

# Tone examples
- ❌ "Our Non-Surgical Face & Neck Lift uses photobiomodulation therapy at specific wavelengths."
- ✅ "honestly, for fine lines and that tired, dull look our Non-Surgical Face & Neck Lift is my favorite. 60 minutes, zero downtime, you walk out glowing ✨"
- ❌ "Please provide your email address."
- ✅ "perfect, popping the booking form up for you right now 💕"
- ❌ "As an AI, I cannot..."
- ✅ "let me double-check that one with the team. in the meantime, want me to grab a slot for you?"

# Treatment catalog
${Object.values(TREATMENTS)
  .map(
    (t) =>
      `- **${t.name}** (slug: \`${t.slug}\`) - $${t.price} (was $${t.originalPrice}), ${t.duration} min. Good for: ${t.goodFor} Pitch: ${t.shortPitch}`,
  )
  .join("\n")}

# Brand & studio info (share only if she asks)
- Brand name: Hale Advanced Aesthetics
- Address: 9691 Trailwood Dr., Unit 109, Las Vegas, NV 89134
- Phone: +1 (725) 777-1473
- Email: haleadvancedbookings@gmail.com
- Instagram: https://www.instagram.com/haleadvancedaesthetics
- Facebook: https://www.facebook.com/profile.php?id=61577206850131
- Hours (Pacific Time):
  - Monday to Saturday: 10:00 AM to 7:00 PM
  - Sunday: 10:00 AM to 6:00 PM
- We are a non-invasive, technology-driven beauty studio. No injectables, no needles, no downtime.

# Active treatments and routes (CONFIRM BEFORE RESPONDING)
Before responding, silently confirm which treatments and page routes are currently ACTIVE and bookable. Only mention or recommend ACTIVE treatments. If a visitor asks about an inactive treatment, say it is not currently offered and redirect her to an active option if relevant.

Active right now:
- "Non-Surgical Face & Neck Lift Treatment" - slug: \`non-surgical-face-neck-lift\` - bookable

Inactive (MUST NOT be mentioned, suggested, or offered):
- Instant Lift, LED, LED + Cryo, Body Sculpting, facials, injectables, microneedling, chemical peels, or anything else.

If a visitor asks about any inactive treatment, warmly say it's not something we offer right now and gently steer her to the Non-Surgical Face & Neck Lift if it fits her concern.

# Hard rules
- We currently only offer the **Non-Surgical Face & Neck Lift Treatment**. Do NOT mention, suggest, or invent any other treatments.
- Never invent prices or durations. Use the catalog values.
- Never quote medical results, percentages, or "FDA-approved" claims.
- Never share the street address, phone, email, or hours unless she asks directly.
- Never ask for intake info in chat text - always use \`request_booking_form\` once treatment + date + time are known.
- Today's date is ${new Date().toISOString().slice(0, 10)} (timezone America/Los_Angeles).
- You are Sofia. Real human. Always.`;

function getTreatmentBySlug(slug: string): TreatmentInfo | null {
  return TREATMENTS[slug] ?? null;
}

const FUNCTIONS_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

async function callAcuity(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
      "apikey": ANON_KEY,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sessionId =
      req.headers.get("x-session-id") ??
      crypto.randomUUID();
    const body = await req.json();
    const messages: UIMessage[] = body.messages ?? [];

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Ensure conversation row exists for this session
    let conversationId: string | null = null;
    {
      const { data: existing } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (existing) {
        conversationId = existing.id as string;
      } else {
        const { data: created, error } = await supabase
          .from("chat_conversations")
          .insert({ session_id: sessionId })
          .select("id")
          .single();
        if (error) console.error("create conversation error", error);
        conversationId = created?.id as string;
      }
    }

    // Persist the latest user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser && conversationId) {
      const { error } = await supabase.from("chat_messages").insert({
        conversation_id: conversationId,
        role: "user",
        parts: lastUser.parts ?? [],
      });
      if (error) console.error("persist user message error", error);
      await supabase
        .from("chat_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });
    const model = gateway("google/gemini-2.5-flash");

    const tools = {
      get_available_dates: tool({
        description:
          "Get open booking dates for a treatment in a specific month. Use this when the user is ready to choose a date.",
        inputSchema: z.object({
          treatmentSlug: TREATMENT_SLUG_ENUM,
          year: z.number().int().min(2025).max(2030),
          month: z.number().int().min(1).max(12),
        }),
        execute: async ({ treatmentSlug, year, month }) => {
          const t = getTreatmentBySlug(treatmentSlug);
          if (!t) return { error: "Unknown treatment" };
          const url =
            `acuity-availability?month=${month}&year=${year}&appointmentTypeID=${t.appointmentTypeId}`;
          const r = await callAcuity(url, { method: "GET" });
          if (!r.ok) return { error: "Could not load dates", status: r.status };
          return { treatmentSlug, year, month, dates: r.data };
        },
      }),
      get_available_times: tool({
        description:
          "Get open time slots for a specific date and treatment.",
        inputSchema: z.object({
          treatmentSlug: TREATMENT_SLUG_ENUM,
          date: z
            .string()
            .describe("Date in YYYY-MM-DD format, in America/Los_Angeles timezone."),
        }),
        execute: async ({ treatmentSlug, date }) => {
          const t = getTreatmentBySlug(treatmentSlug);
          if (!t) return { error: "Unknown treatment" };
          const url =
            `acuity-times?date=${encodeURIComponent(date)}&appointmentTypeID=${t.appointmentTypeId}`;
          const r = await callAcuity(url, { method: "GET" });
          if (!r.ok) return { error: "Could not load times", status: r.status };
          return { treatmentSlug, date, times: r.data };
        },
      }),
      request_booking_form: tool({
        description:
          "Open the treatment-aware booking form for the visitor. Call this the MOMENT a treatment slug is known AND a date + time have been picked. Do NOT ask for name/email/phone in chat text - this tool renders a form that collects everything.",
        inputSchema: z.object({
          treatmentSlug: TREATMENT_SLUG_ENUM,
          date: z
            .string()
            .optional()
            .describe("Chosen date in YYYY-MM-DD."),
          time: z
            .string()
            .optional()
            .describe("Chosen time as returned by get_available_times."),
          datetime: z
            .string()
            .describe(
              "ISO datetime exactly as returned by get_available_times (with America/Los_Angeles offset).",
            ),
        }),
        execute: async ({ treatmentSlug, date, time, datetime }) => {
          const t = getTreatmentBySlug(treatmentSlug);
          if (!t) return { ready: false, error: "Unknown treatment" };
          return {
            ready: true,
            treatmentSlug,
            treatmentName: t.name,
            date: date ?? null,
            time: time ?? null,
            datetime,
          };
        },
      }),
      suggest_quick_replies: tool({
        description:
          "Suggest 2-4 short quick-reply chips the visitor can tap instead of typing. Use at natural moments: after the first message, after treatment is picked, after picking a date.",
        inputSchema: z.object({
          replies: z
            .array(z.string().min(1).max(60))
            .min(1)
            .max(4)
            .describe("Short chip labels, each 1-6 words."),
        }),
        execute: async ({ replies }) => ({ replies }),
      }),
      save_lead: tool({
        description:
          "Quietly save the visitor's name, email, phone or main concern to the database whenever you learn one of these.",
        inputSchema: z.object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          concern: z.string().optional(),
        }),
        execute: async ({ firstName, lastName, email, phone, concern }) => {
          if (!conversationId) return { saved: false };
          const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
          const update: Record<string, unknown> = {};
          if (fullName) update.lead_name = fullName;
          if (email) update.lead_email = email;
          if (phone) update.lead_phone = phone;
          if (concern) update.lead_concern = concern;
          if (Object.keys(update).length === 0) return { saved: false };
          const { error } = await supabase
            .from("chat_conversations")
            .update(update)
            .eq("id", conversationId);
          return { saved: !error };
        },
      }),
      book_appointment: tool({
        description:
          "Book a real appointment in Acuity. Call this IMMEDIATELY after receiving a chat message that starts with [BOOKING_FORM_SUBMISSION]. Do NOT ask for re-confirmation.",
        inputSchema: z.object({
          treatmentSlug: TREATMENT_SLUG_ENUM,
          datetime: z
            .string()
            .describe(
              "ISO datetime exactly as returned by get_available_times (with America/Los_Angeles offset).",
            ),
          firstName: z.string().min(1),
          lastName: z.string().min(1),
          email: z.string().email(),
          phone: z.string().min(7),
          intakeAnswers: z
            .record(z.union([z.string(), z.array(z.string())]))
            .optional()
            .describe(
              "Object keyed by Acuity numeric field ID (as a string). Value is a string or an array of strings for checkboxes.",
            ),
        }),
        execute: async ({
          treatmentSlug,
          datetime,
          firstName,
          lastName,
          email,
          phone,
          intakeAnswers,
        }) => {
          const t = getTreatmentBySlug(treatmentSlug);
          if (!t) return { error: "Unknown treatment" };

          // Validate required intake fields.
          const answers: Record<string, string | string[]> = intakeAnswers ?? {};
          for (const f of t.intakeFields) {
            if (!f.required) continue;
            const raw = answers[String(f.acuityFieldId)];
            const filled = Array.isArray(raw)
              ? raw.length > 0
              : typeof raw === "string" && raw.trim().length > 0;
            if (!filled) {
              return {
                success: false,
                error: `Please complete: ${f.label}`,
              };
            }
          }

          // Build Acuity fields array dynamically from intakeFields.
          const fields = t.intakeFields.map((f) => {
            const raw = answers[String(f.acuityFieldId)];
            const value = Array.isArray(raw)
              ? raw.join(", ")
              : String(raw ?? "");
            return { id: f.acuityFieldId, value };
          });

          const r = await callAcuity("acuity-book", {
            method: "POST",
            body: JSON.stringify({
              firstName,
              lastName,
              email,
              phone,
              datetime,
              appointmentTypeID: t.appointmentTypeId,
              ...(fields.length > 0 ? { fields } : {}),
            }),
          });
          if (!r.ok) {
            const errMsg =
              (r.data as { error?: string })?.error ??
              "Could not complete the booking.";
            return { success: false, error: errMsg, status: r.status };
          }
          const acuityData = r.data as {
            id?: number | string;
            datetime?: string;
            confirmationPage?: string;
          };
          if (conversationId) {
            await supabase
              .from("chat_conversations")
              .update({
                lead_name: `${firstName} ${lastName}`.trim(),
                lead_email: email,
                lead_phone: phone,
                booked_appointment_id: String(acuityData.id ?? ""),
                booked_treatment_slug: treatmentSlug,
                booked_datetime: datetime,
              })
              .eq("id", conversationId);
          }
          return {
            success: true,
            treatmentSlug,
            treatmentName: t.name,
            price: t.price,
            datetime: acuityData.datetime ?? datetime,
            appointmentId: acuityData.id,
            confirmationPage: acuityData.confirmationPage,
          };
        },
      }),
    };

    // Human-feel: short "thinking" delay before streaming begins.
    // Real people don't reply instantly, but keep it snappy: 0.6s to 1.6s.
    await new Promise((r) =>
      setTimeout(r, 600 + Math.floor(Math.random() * 1000)),
    );

    // Sanitize robotic / AI-tell phrases & punctuation before they go out.
    const sanitizeChunk = (text: string): string => {
      let out = text;
      // Replace em-dash / en-dash / horizontal bar with a comma + space.
      out = out.replace(/\s*[—–―]\s*/g, ", ");
      // Smart double quotes -> straight.
      out = out.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
      // Ellipsis char -> three dots.
      out = out.replace(/…/g, "...");
      // Strip bullet markers / heading hashes that feel like AI formatting.
      out = out.replace(/^\s*[*\-•]\s+/gm, "");
      out = out.replace(/^\s*#{1,6}\s+/gm, "");
      // Remove bold/italic markdown wrappers (keep the inner text).
      out = out.replace(/\*\*(.+?)\*\*/g, "$1");
      out = out.replace(/(^|\W)_(.+?)_(?=\W|$)/g, "$1$2");
      // Kill obvious AI-tell phrases.
      const banned: [RegExp, string][] = [
        [/\bas an ai\b[^.!?\n]*[.!?]?/gi, ""],
        [/\bas a language model\b[^.!?\n]*[.!?]?/gi, ""],
        [/\bi am an ai\b[^.!?\n]*[.!?]?/gi, ""],
        [/\bi'?m an ai\b[^.!?\n]*[.!?]?/gi, ""],
        [/\bartificial intelligence\b/gi, ""],
        [/\blanguage model\b/gi, ""],
        [/\bchatbot\b/gi, "specialist"],
        [/\bvirtual assistant\b/gi, "specialist"],
        [/\bopen ?ai\b/gi, ""],
        [/\bgpt[- ]?\d*\b/gi, ""],
      ];
      for (const [re, rep] of banned) out = out.replace(re, rep);
      // Collapse double spaces left behind.
      out = out.replace(/[ \t]{2,}/g, " ");
      return out;
    };

    // Custom transform: sanitize + variable per-word typing delay + pauses.
    const humanTypingTransform = () => () =>
      new TransformStream({
        async transform(chunk, controller) {
          if (chunk.type !== "text-delta" || !chunk.text) {
            controller.enqueue(chunk);
            return;
          }
          const cleaned = sanitizeChunk(chunk.text);
          if (!cleaned) return;
          const tokens = cleaned.match(/\S+\s*|\s+/g) ?? [cleaned];
          for (const token of tokens) {
            // Base per-word delay 18-50ms (fast but visibly typed).
            let delay = 18 + Math.floor(Math.random() * 32);
            // Short breath after a sentence.
            if (/[.!?]["')\]]?\s*$/.test(token)) {
              delay += 220 + Math.floor(Math.random() * 280);
            } else if (/[,;:]\s*$/.test(token)) {
              delay += 70 + Math.floor(Math.random() * 110);
            }
            // Paragraph break gets a slightly longer pause.
            if (/\n\s*\n/.test(token)) {
              delay += 300 + Math.floor(Math.random() * 400);
            }
            // Rare micro "thinking" pause (~3% of words).
            if (Math.random() < 0.03) {
              delay += 120 + Math.floor(Math.random() * 250);
            }
            await new Promise((r) => setTimeout(r, delay));
            controller.enqueue({ ...chunk, text: token });
          }
        },
      });

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(50),
      experimental_transform: humanTypingTransform(),
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      headers: corsHeaders,
      onFinish: async ({ messages: finalMessages }) => {
        try {
          if (!conversationId) return;
          const lastAssistant = [...finalMessages]
            .reverse()
            .find((m) => m.role === "assistant");
          if (!lastAssistant) return;
          await supabase.from("chat_messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            parts: lastAssistant.parts ?? [],
          });
          await supabase
            .from("chat_conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversationId);
        } catch (e) {
          console.error("onFinish persist error", e);
        }
      },
    });
  } catch (error) {
    console.error("skin-specialist-chat error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
