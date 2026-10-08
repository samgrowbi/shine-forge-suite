import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2, Lock } from "lucide-react";

// Square Web Payments SDK card form for the appointment deposit.
// Card details go straight from the browser to Square; we only receive a one-time token.

export interface DepositCardHandle {
  /** Returns a single-use Square card token, or throws with a client-facing message */
  tokenize: () => Promise<{ token: string; verificationToken?: string }>;
}

interface DepositCardFormProps {
  amount: string;
  disabled?: boolean;
  billing?: { firstName?: string; lastName?: string; email?: string; phone?: string };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    Square?: any;
  }
}

type SquareConfig = { applicationId: string; locationId: string; environment: "production" | "sandbox" };

let configPromise: Promise<SquareConfig> | null = null;
const getSquareConfig = () => {
  if (!configPromise) {
    configPromise = fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/square-config`, {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    }).then(async (r) => {
      if (!r.ok) throw new Error("Square config unavailable");
      return r.json();
    });
    configPromise.catch(() => {
      configPromise = null;
    });
  }
  return configPromise;
};

const loadSquareScript = (environment: SquareConfig["environment"]) =>
  new Promise<void>((resolve, reject) => {
    if (window.Square) return resolve();
    const src =
      environment === "sandbox"
        ? "https://sandbox.web.squarecdn.com/v1/square.js"
        : "https://web.squarecdn.com/v1/square.js";
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Square")));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Square"));
    document.head.appendChild(script);
  });

export const DepositCardForm = forwardRef<DepositCardHandle, DepositCardFormProps>(
  ({ amount, disabled, billing }, ref) => {
    const [containerId] = useState(() => `sq-card-${Math.random().toString(36).slice(2)}`);
    const cardRef = useRef<any>(null);
    const paymentsRef = useRef<any>(null);
    const billingRef = useRef(billing);
    billingRef.current = billing;
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const config = await getSquareConfig();
          await loadSquareScript(config.environment);
          if (cancelled) return;
          const payments = window.Square.payments(config.applicationId, config.locationId);
          const card = await payments.card();
          if (cancelled) {
            card.destroy?.();
            return;
          }
          await card.attach(`#${containerId}`);
          paymentsRef.current = payments;
          cardRef.current = card;
          setStatus("ready");
        } catch (err) {
          console.error("Square card init failed", err);
          if (!cancelled) setStatus("error");
        }
      })();
      return () => {
        cancelled = true;
        cardRef.current?.destroy?.();
        cardRef.current = null;
      };
    }, [containerId]);

    useImperativeHandle(ref, () => ({
      tokenize: async () => {
        if (!cardRef.current) {
          throw new Error("The payment form is still loading. Please try again in a moment.");
        }
        const result = await cardRef.current.tokenize();
        if (result.status !== "OK") {
          throw new Error(result.errors?.[0]?.message || "Please check your card details.");
        }
        // Strong Customer Authentication (3-D Secure) when the card issuer requires it
        let verificationToken: string | undefined;
        try {
          const b = billingRef.current || {};
          const verification = await paymentsRef.current?.verifyBuyer?.(result.token, {
            amount,
            currencyCode: "USD",
            intent: "CHARGE",
            billingContact: {
              givenName: b.firstName,
              familyName: b.lastName,
              email: b.email,
              phone: b.phone,
            },
          });
          verificationToken = verification?.token;
        } catch (err) {
          console.warn("Buyer verification skipped", err);
        }
        return { token: result.token, verificationToken };
      },
    }));

    return (
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm text-foreground">Pay ${amount} deposit</h4>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Lock className="h-3 w-3" /> Secured by Square
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Your ${amount} deposit confirms your appointment.
        </p>
        {status === "loading" && (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-pink-500 mr-2" /> Loading secure payment form...
          </div>
        )}
        {status === "error" && (
          <p className="text-sm text-red-600">
            The payment form couldn't load. Please refresh the page or call us to book.
          </p>
        )}
        <div
          id={containerId}
          className={disabled ? "pointer-events-none opacity-60" : undefined}
          style={{ minHeight: status === "ready" ? undefined : 0 }}
        />
      </div>
    );
  }
);

DepositCardForm.displayName = "DepositCardForm";
