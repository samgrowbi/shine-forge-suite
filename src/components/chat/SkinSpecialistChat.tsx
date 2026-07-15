import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import specialistAvatar from "@/assets/specialist-avatar.jpg";
import {
  getSofiaIntakeFields,
  type IntakeField,
} from "@/config/sofiaIntakeFields";

const SESSION_KEY = "sofia_chat_session_id";
const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/skin-specialist-chat`;
const CHAT_TZ = "America/Los_Angeles";

const INITIAL_QUICK_REPLIES = [
  "Non-Surgical Face & Neck Lift",
  "I have a question",
];

const WELCOME_MESSAGE: UIMessage = {
  id: "welcome",
  role: "assistant",
  parts: [
    {
      type: "text",
      text:
        "hi, i'm Sofia one of the skin specialists at Hale Advanced Aesthetics. i'm here to help you find the right treatment for your skin and book your spot, right inside this chat.\n\nwhat's bothering you most about your skin lately?",
    },
  ],
};

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

type DbMessage = {
  id: string;
  role: string;
  parts: unknown;
  created_at: string;
};

export default function SkinSpecialistChat() {
  const [open, setOpen] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([
    WELCOME_MESSAGE,
  ]);
  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  // Load conversation history from DB on first mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("chat-history", {
          headers: { "x-session-id": sessionId },
          body: { sessionId },
        });
        if (cancelled) return;
        if (error) {
          setBootstrapped(true);
          return;
        }
        const msgs = (data?.messages ?? []) as DbMessage[];
        if (msgs.length > 0) {
          const ui: UIMessage[] = (msgs as DbMessage[]).map((m) => ({
            id: m.id,
            role: m.role as UIMessage["role"],
            parts: Array.isArray(m.parts)
              ? (m.parts as UIMessage["parts"])
              : ([{ type: "text", text: String(m.parts ?? "") }] as UIMessage["parts"]),
          }));
          setInitialMessages([WELCOME_MESSAGE, ...ui]);
        }
        setBootstrapped(true);
      } catch {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!bootstrapped) {
    return <FloatingBubble onClick={() => setOpen(true)} hidden />;
  }

  return (
    <>
      {!open && <FloatingBubble onClick={() => setOpen(true)} />}
      {open && (
        <ChatWindow
          key={sessionId}
          sessionId={sessionId}
          initialMessages={initialMessages}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function FloatingBubble({
  onClick,
  hidden,
}: {
  onClick: () => void;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      onClick={onClick}
      aria-label="Chat with Sofia, our skin specialist"
      className="fixed z-[60] bottom-24 right-5 md:bottom-6 md:right-6 group flex items-center gap-3 rounded-full bg-white border border-pink-200 shadow-2xl transition-all hover:scale-105 hover:shadow-pink-200/60 pl-1.5 pr-4 py-1.5 md:py-2"
    >
      <span className="relative h-12 w-12 md:h-14 md:w-14 shrink-0">
        <img
          src={specialistAvatar}
          alt="Sofia, skin specialist"
          width={112}
          height={112}
          loading="lazy"
          className="h-full w-full rounded-full object-cover ring-2 ring-pink-100"
        />
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
      </span>
      <span className="hidden md:flex flex-col items-start text-left leading-tight">
        <span className="text-[13px] font-semibold text-gray-900">Chat with Sofia</span>
        <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online now
        </span>
      </span>
    </button>
  );
}

function ChatWindow({
  sessionId,
  initialMessages,
  onClose,
}: {
  sessionId: string;
  initialMessages: UIMessage[];
  onClose: () => void;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: ENDPOINT,
        headers: {
          "x-session-id": sessionId,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }),
    [sessionId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: sessionId,
    messages: initialMessages,
    transport,
  });

  const [input, setInput] = useState("");
  const [suppressChips, setSuppressChips] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [status]);

  const onSubmit = async (text: string) => {
    const value = text.trim();
    if (!value || isLoading) return;
    setInput("");
    setSuppressChips(true);
    await sendMessage({ text: value });
  };

  // Reset chip suppression once a new assistant message finishes streaming.
  useEffect(() => {
    if (status === "ready") setSuppressChips(false);
  }, [status, messages.length]);

  // Latest assistant message drives dynamic chips + booking-form card.
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  // Dynamic chips from suggest_quick_replies tool on the latest assistant message.
  const dynamicChips: string[] = (() => {
    if (!lastAssistant || suppressChips) return [];
    const chipPart = lastAssistant.parts.find(
      (p) =>
        p.type === "tool-suggest_quick_replies" &&
        (p as { state?: string }).state === "output-available",
    ) as { output?: { replies?: string[] } } | undefined;
    return chipPart?.output?.replies ?? [];
  })();

  const showInitialChips =
    messages.length <= 1 && !isLoading && dynamicChips.length === 0;
  const chipsToShow = dynamicChips.length > 0 ? dynamicChips : showInitialChips ? INITIAL_QUICK_REPLIES : [];

  // Latest open booking-form request (unanswered).
  const openBookingForm = (() => {
    if (!lastAssistant) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const req = m.parts.find(
        (p) =>
          p.type === "tool-request_booking_form" &&
          (p as { state?: string }).state === "output-available",
      ) as
        | {
            output?: {
              ready?: boolean;
              treatmentSlug?: string;
              treatmentName?: string;
              datetime?: string;
            };
          }
        | undefined;
      if (!req?.output?.ready) return null;
      // Suppress if a later user message is a submission.
      const submittedAfter = messages
        .slice(i + 1)
        .some(
          (mm) =>
            mm.role === "user" &&
            mm.parts.some(
              (pp) =>
                pp.type === "text" &&
                pp.text.startsWith("[BOOKING_FORM_SUBMISSION]"),
            ),
        );
      if (submittedAfter) return null;
      return req.output;
    }
    return null;
  })();

  const handleBookingSubmit = async (payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    intakeAnswers: Record<string, string | string[]>;
  }) => {
    if (!openBookingForm) return;
    const submission = {
      ...payload,
      datetime: openBookingForm.datetime,
      treatmentSlug: openBookingForm.treatmentSlug,
    };
    setSuppressChips(true);
    await sendMessage({
      text: `[BOOKING_FORM_SUBMISSION] ${JSON.stringify(submission)}`,
    });
  };

  return (
    <div className="fixed inset-0 md:inset-auto md:bottom-6 md:right-6 z-[70] md:w-[400px] md:h-[640px] md:max-h-[85vh] flex flex-col bg-white md:rounded-3xl shadow-2xl overflow-hidden border border-pink-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-br from-pink-500 to-pink-600 text-white">
        <div className="relative h-11 w-11 shrink-0">
          <img
            src={specialistAvatar}
            alt="Sofia"
            width={88}
            height={88}
            className="h-11 w-11 rounded-full object-cover ring-2 ring-white/30"
          />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-pink-500" />
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="font-medium text-[15px]">Sofia · Skin Specialist</div>
          <div className="text-[11px] opacity-90 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online now · Hale Advanced Aesthetics
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="p-2 rounded-full hover:bg-white/15 transition"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-pink-50/40"
      >
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onBookingSubmit={handleBookingSubmit}
            openBookingFormDatetime={openBookingForm?.datetime}
          />
        ))}
        {isLoading && <TypingIndicator />}
        {error && (
          <div className="text-xs text-red-600 px-3 py-2 bg-red-50 rounded-lg">
            Sorry, something went wrong. Please try again in a moment.
          </div>
        )}
      </div>

      {/* Quick reply chips (above composer) */}
      {chipsToShow.length > 0 && !openBookingForm && (
        <div className="px-3 pt-3 pb-1 flex flex-wrap gap-2 bg-white border-t border-pink-100">
          {chipsToShow.map((q) => (
            <button
              key={q}
              onClick={() => onSubmit(q)}
              className="text-xs px-3 py-1.5 rounded-full bg-pink-50 border border-pink-200 text-pink-700 hover:bg-pink-100 transition"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(input);
        }}
        className="border-t border-pink-100 bg-white p-3 flex items-end gap-2"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(input);
            }
          }}
          rows={1}
          placeholder="Type your message..."
          disabled={isLoading}
          className="flex-1 resize-none max-h-32 rounded-2xl border border-pink-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="h-10 w-10 shrink-0 rounded-full bg-pink-500 hover:bg-pink-600 text-white flex items-center justify-center transition disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  onBookingSubmit,
  openBookingFormDatetime,
}: {
  message: UIMessage;
  onBookingSubmit: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    intakeAnswers: Record<string, string | string[]>;
  }) => void;
  openBookingFormDatetime?: string;
}) {
  const isUser = message.role === "user";
  // Hide the [BOOKING_FORM_SUBMISSION] payload from the visible chat log.
  const rawText = message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
  const text =
    isUser && rawText.startsWith("[BOOKING_FORM_SUBMISSION]")
      ? "sending your details..."
      : rawText;
  const toolParts = message.parts.filter((p) => p.type?.startsWith("tool-"));

  if (!text && toolParts.length === 0) return null;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] text-sm leading-relaxed",
          isUser
            ? "bg-pink-500 text-white px-4 py-2.5 rounded-2xl rounded-br-md"
            : "text-gray-800",
        )}
      >
        {!isUser && text && (
          <div className="px-1">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="mb-2 last:mb-0">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-pink-700">
                    {children}
                  </strong>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>
                ),
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-pink-600 underline"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
        )}
        {isUser && <span className="whitespace-pre-wrap">{text}</span>}

        {toolParts.map((p, idx) => (
          <ToolPartRender
            key={idx}
            part={p}
            onBookingSubmit={onBookingSubmit}
            openBookingFormDatetime={openBookingFormDatetime}
          />
        ))}
      </div>
    </div>
  );
}

function ToolPartRender({
  part,
  onBookingSubmit,
  openBookingFormDatetime,
}: {
  part: UIMessage["parts"][number];
  onBookingSubmit: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    intakeAnswers: Record<string, string | string[]>;
  }) => void;
  openBookingFormDatetime?: string;
}) {
  const type = part.type ?? "";

  // Dynamic booking form.
  if (type === "tool-request_booking_form") {
    const state = (part as { state?: string }).state;
    const output = (part as {
      output?: {
        ready?: boolean;
        treatmentSlug?: string;
        treatmentName?: string;
        datetime?: string;
      };
    }).output;
    if (state === "output-available" && output?.ready) {
      const isOpen = output.datetime === openBookingFormDatetime;
      return (
        <BookingFormCard
          treatmentSlug={output.treatmentSlug ?? ""}
          treatmentName={output.treatmentName ?? ""}
          datetime={output.datetime ?? ""}
          onSubmit={onBookingSubmit}
          disabled={!isOpen}
        />
      );
    }
  }

  // Booking success card
  if (type === "tool-book_appointment") {
    const state = (part as { state?: string }).state;
    const output = (part as {
      output?: {
        success?: boolean;
        treatmentName?: string;
        datetime?: string;
        appointmentId?: string | number;
        price?: string | number;
        treatmentSlug?: string;
      };
    }).output;
    if (state === "output-available" && output?.success) {
      return <BookingSuccessCard output={output} />;
    }
  }

  return null;
}

function BookingSuccessCard({
  output,
}: {
  output: {
    success?: boolean;
    treatmentName?: string;
    datetime?: string;
    appointmentId?: string | number;
    price?: string | number;
    treatmentSlug?: string;
  };
}) {
  const dt = output.datetime ? new Date(output.datetime) : null;

  // Meta Pixel: fire Schedule once per appointmentId.
  useEffect(() => {
    if (!output.appointmentId) return;
    const key = `pixel_schedule_sent_${output.appointmentId}`;
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(key)) return;
      const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
      if (typeof fbq === "function") {
        const value =
          typeof output.price === "number"
            ? output.price
            : parseFloat(String(output.price ?? "0")) || 0;
        fbq(
          "track",
          "Schedule",
          {
            content_name: output.treatmentName ?? "",
            content_category: "Booking",
            appointment_id: String(output.appointmentId),
            source: "sofia_chatbot",
            content_ids: output.treatmentSlug
              ? [output.treatmentSlug]
              : undefined,
            content_type: "product",
            value,
            currency: "USD",
            predicted_ltv: value,
          },
          { eventID: `schedule_${output.appointmentId}` },
        );
      }
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
  }, [output.appointmentId, output.treatmentName, output.price, output.treatmentSlug]);

  return (
    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
            <span className="h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
              ✓
            </span>
            You're booked
          </div>
          <div className="mt-2 text-sm text-gray-700">
            <div className="font-medium">{output.treatmentName}</div>
            {dt && (
              <div className="text-xs text-gray-600 mt-0.5">
                {dt.toLocaleString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
              timeZone: CHAT_TZ,
                })}{" "}
                PT
              </div>
            )}
            <div className="text-[11px] text-gray-500 mt-2">
              A confirmation is on its way to your email.
            </div>
          </div>
        </div>
  );
}

// ------------------------------ BookingFormCard ------------------------------

function BookingFormCard({
  treatmentSlug,
  treatmentName,
  datetime,
  onSubmit,
  disabled,
}: {
  treatmentSlug: string;
  treatmentName: string;
  datetime: string;
  onSubmit: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    intakeAnswers: Record<string, string | string[]>;
  }) => void;
  disabled: boolean;
}) {
  const fields: IntakeField[] = useMemo(
    () => getSofiaIntakeFields(treatmentSlug),
    [treatmentSlug],
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const dt = datetime ? new Date(datetime) : null;

  const setAns = (id: number, v: string | string[]) =>
    setAnswers((prev) => ({ ...prev, [String(id)]: v }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "Required";
    if (!lastName.trim()) e.lastName = "Required";
    if (!email.trim()) e.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      e.email = "Invalid email";
    const digits = phone.replace(/\D/g, "");
    if (!phone.trim()) e.phone = "Required";
    else if (digits.length < 7) e.phone = "Invalid phone";

    for (const f of fields) {
      if (!f.required) continue;
      const v = answers[String(f.acuityFieldId)];
      const filled = Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
      if (!filled) e[`f_${f.acuityFieldId}`] = "Required";
    }
    return e;
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (disabled || submitted) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSubmitted(true);
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      intakeAnswers: answers,
    });
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        "mt-3 rounded-2xl border border-pink-200 bg-white p-4 space-y-3",
        (disabled || submitted) && "opacity-60 pointer-events-none",
      )}
    >
      <div>
        <div className="text-sm font-semibold text-gray-900">
          Book: {treatmentName}
        </div>
        {dt && (
          <div className="text-[11px] text-gray-500">
            {dt.toLocaleString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: CHAT_TZ,
            })}{" "}
            PT
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FormText
          label="First name"
          value={firstName}
          onChange={setFirstName}
          error={errors.firstName}
          required
        />
        <FormText
          label="Last name"
          value={lastName}
          onChange={setLastName}
          error={errors.lastName}
          required
        />
      </div>
      <FormText
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        error={errors.email}
        required
      />
      <FormText
        label="Phone"
        type="tel"
        value={phone}
        onChange={setPhone}
        error={errors.phone}
        required
      />

      {fields.map((f) => (
        <DynamicField
          key={f.acuityFieldId}
          field={f}
          value={answers[String(f.acuityFieldId)]}
          onChange={(v) => setAns(f.acuityFieldId, v)}
          error={errors[`f_${f.acuityFieldId}`]}
        />
      ))}

      <button
        type="submit"
        disabled={disabled || submitted}
        className="w-full mt-2 rounded-full bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium py-2.5 transition disabled:opacity-50"
      >
        {submitted ? "Sending..." : "Confirm booking"}
      </button>
    </form>
  );
}

function FormText({
  label,
  value,
  onChange,
  type = "text",
  error,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-[11px] text-gray-600">
      {label}
      {required && <span className="text-pink-600"> *</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300",
          error ? "border-red-400" : "border-pink-200",
        )}
      />
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </label>
  );
}

function DynamicField({
  field,
  value,
  onChange,
  error,
}: {
  field: IntakeField;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  error?: string;
}) {
  const labelEl = (
    <div className="text-[11px] text-gray-600">
      {field.label}
      {field.required && <span className="text-pink-600"> *</span>}
      {field.helpText && (
        <div className="text-[10px] text-gray-400">{field.helpText}</div>
      )}
    </div>
  );

  const errEl = error ? (
    <div className="text-[10px] text-red-600 mt-1">{error}</div>
  ) : null;

  if (field.type === "checkboxes") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div>
        {labelEl}
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(field.options ?? []).map((opt) => {
            const on = arr.includes(opt);
            return (
              <button
                type="button"
                key={opt}
                onClick={() =>
                  onChange(on ? arr.filter((x) => x !== opt) : [...arr, opt])
                }
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition",
                  on
                    ? "bg-pink-500 text-white border-pink-500"
                    : "bg-white text-pink-700 border-pink-200 hover:bg-pink-50",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {errEl}
      </div>
    );
  }

  if (field.type === "radio" || field.type === "yesno") {
    const options =
      field.type === "yesno" ? ["Yes", "No"] : field.options ?? [];
    const v = typeof value === "string" ? value : "";
    return (
      <div>
        {labelEl}
        <div className="mt-1 inline-flex rounded-full bg-pink-50 p-0.5 border border-pink-200">
          {options.map((opt) => (
            <button
              type="button"
              key={opt}
              onClick={() => onChange(opt)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full transition",
                v === opt
                  ? "bg-pink-500 text-white"
                  : "text-pink-700 hover:bg-pink-100",
              )}
            >
              {opt}
            </button>
          ))}
        </div>
        {errEl}
      </div>
    );
  }

  if (field.type === "select") {
    const v = typeof value === "string" ? value : "";
    return (
      <label className="block">
        {labelEl}
        <select
          value={v}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-pink-300",
            error ? "border-red-400" : "border-pink-200",
          )}
        >
          <option value="">Choose...</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {errEl}
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="block">
        {labelEl}
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={cn(
            "mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-300",
            error ? "border-red-400" : "border-pink-200",
          )}
        />
        {errEl}
      </label>
    );
  }

  // text
  return (
    <FormText
      label={field.label + (field.required ? " *" : "")}
      value={typeof value === "string" ? value : ""}
      onChange={(v) => onChange(v)}
      error={error}
    />
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Dot delay="0s" />
          <Dot delay="0.15s" />
          <Dot delay="0.3s" />
        </div>
        <span className="text-[12px] text-pink-600/80">Sofia is typing…</span>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-2 w-2 rounded-full bg-pink-400 animate-bounce"
      style={{ animationDelay: delay }}
    />
  );
}
