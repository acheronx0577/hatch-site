"use client";

import * as React from "react";
import type { AiEmployeeTemplate } from "@/lib/api/ai-employees";

// Keep persona visuals local to the web app so we don't rely on the broker UI package paths.
export type PersonaId =
  | "hatch_assistant"
  | "agent_copilot"
  | "lead_nurse"
  | "listing_concierge"
  | "market_analyst"
  | "transaction_coordinator";

const PERSONA_COLORS: Record<PersonaId, { color: string; accent: string }> = {
  hatch_assistant: { color: "#2563EB", accent: "#DBEAFE" },
  agent_copilot: { color: "#EAB308", accent: "#FEF3C7" },
  lead_nurse: { color: "#00B894", accent: "#D3F7EC" },
  listing_concierge: { color: "#9B5BFF", accent: "#E4D7FF" },
  market_analyst: { color: "#FF9F43", accent: "#FFE3C4" },
  transaction_coordinator: { color: "#F368E0", accent: "#FFD5F6" }
};

type PersonaFaceProps = {
  personaId: PersonaId;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  active?: boolean;
  className?: string;
};

export function PersonaFace({
  personaId,
  size = "md",
  animated = true,
  active = false,
  className
}: PersonaFaceProps) {
  const baseSize = size === "sm" ? 28 : size === "lg" ? 56 : 40;
  const { color, accent } = PERSONA_COLORS[personaId];

  const [blinkDelay] = React.useState(() => `${Math.random() * 5}s`);
  const [wanderDelay] = React.useState(() => `${Math.random() * 30}s`);

  const renderFace = () => {
    switch (personaId) {
      case "hatch_assistant":
        return (
          <>
            <circle cx="32" cy="32" r="30" stroke={color} strokeWidth="3" />
            <g className="ai-eyes">
              <circle className="ai-eye" cx="24" cy="28" r="3.2" fill="#000" />
              <circle className="ai-eye" cx="40" cy="28" r="3.2" fill="#000" />
            </g>
            <path d="M24 40 Q32 44 40 40" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <path d="M18 18 Q32 12 46 18" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <circle cx="20" cy="18" r="3" fill={accent} stroke={color} strokeWidth="1.5" />
            <circle cx="48" cy="34" r="2.2" fill={color} />
          </>
        );
      case "agent_copilot":
        return (
          <>
            <circle cx="32" cy="32" r="30" stroke={color} strokeWidth="3" />
            <g className="ai-eyes">
              <circle className="ai-eye" cx="24" cy="28" r="3" fill="#000" />
              <circle className="ai-eye" cx="40" cy="28" r="3" fill="#000" />
            </g>
            <path d="M22 40 Q32 46 42 40" stroke="#000" strokeWidth="3" strokeLinecap="round" />
            <circle cx="46" cy="20" r="4" fill={color} fillOpacity="0.7" />
          </>
        );
      case "lead_nurse":
        return (
          <>
            <circle cx="32" cy="32" r="30" stroke={color} strokeWidth="3" />
            <g className="ai-eyes">
              <circle className="ai-eye" cx="24" cy="28" r="3" fill="#000" />
              <circle className="ai-eye" cx="40" cy="28" r="3" fill="#000" />
            </g>
            <path d="M22 38 Q32 48 42 38" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <path d="M14 20 L17 22 L14 24 Z" fill={color} />
            <path d="M50 20 L53 22 L50 24 Z" fill={color} />
          </>
        );
      case "listing_concierge":
        return (
          <>
            <circle cx="32" cy="32" r="30" stroke={color} strokeWidth="3" />
            <g className="ai-eyes">
              <circle className="ai-eye" cx="24" cy="28" r="3" fill="#000" />
              <circle className="ai-eye" cx="40" cy="28" r="3" fill="#000" />
            </g>
            <circle cx="32" cy="40" r="4" fill={color} fillOpacity="0.8" />
            <path d="M20 14 L32 8 L44 14" stroke={color} strokeWidth="3" strokeLinecap="round" />
          </>
        );
      case "market_analyst":
        return (
          <>
            <circle cx="32" cy="32" r="30" stroke={color} strokeWidth="3" />
            <g className="ai-eyes">
              <circle className="ai-eye" cx="24" cy="28" r="3" fill="#000" />
              <circle className="ai-eye" cx="40" cy="28" r="3" fill="#000" />
            </g>
            <path d="M24 40 H40" stroke="#000" strokeWidth="3" strokeLinecap="round" />
            <rect x="48" y="20" width="3" height="8" fill={color} />
            <rect x="53" y="17" width="3" height="11" fill={color} />
          </>
        );
      case "transaction_coordinator":
        return (
          <>
            <circle cx="32" cy="32" r="30" stroke={color} strokeWidth="3" />
            <g className="ai-eyes">
              <circle className="ai-eye" cx="24" cy="28" r="3" fill="#000" />
              <circle className="ai-eye" cx="40" cy="28" r="3" fill="#000" />
            </g>
            <path d="M24 40 Q32 44 40 40" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <rect x="46" y="16" width="12" height="12" stroke={color} strokeWidth="2" fill="none" />
            <line x1="46" y1="22" x2="58" y2="22" stroke={color} strokeWidth="2" />
          </>
        );
    }
  };

  const animationClass = animated
    ? active
      ? "animate-[bounce-subtle_2.5s_ease-in-out_infinite]"
      : "animate-[float-subtle_4s_ease-in-out_infinite]"
    : "";

  const svgClass = animated ? "ai-blink ai-wander" : "";

  return (
    <div
      className={["relative inline-flex items-center justify-center rounded-full", animationClass, className]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: baseSize,
        height: baseSize,
        background: active ? `radial-gradient(circle at 30% 20%, ${accent}, #ffffff)` : "#ffffff",
        boxShadow: active
          ? `0 0 0 2px ${color}33, 0 8px 16px rgba(15,23,42,0.18)`
          : "0 4px 8px rgba(15,23,42,0.12)"
      }}
    >
      <svg
        width={baseSize - 6}
        height={baseSize - 6}
        viewBox="0 0 64 64"
        fill="none"
        className={svgClass}
        style={{ ["--blink-delay" as any]: blinkDelay, ["--wander-delay" as any]: wanderDelay }}
      >
        {renderFace()}
      </svg>
      <style>{`
        @keyframes float-subtle {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-2px); }
          100% { transform: translateY(0px); }
        }
        @keyframes bounce-subtle {
          0% { transform: translateY(0px) scale(1); }
          30% { transform: translateY(-3px) scale(1.02); }
          60% { transform: translateY(1px) scale(0.99); }
          100% { transform: translateY(0px) scale(1); }
        }
        @keyframes blink-smooth {
          0%, 100% { transform: scaleY(1); opacity: 1; }
          15% { transform: scaleY(1); opacity: 1; }
          15.6% { transform: scaleY(0.5); opacity: 0.94; }
          16% { transform: scaleY(0.15); opacity: 0.9; }
          16.4% { transform: scaleY(0.15); opacity: 0.9; }
          17% { transform: scaleY(0.7); opacity: 0.96; }
          17.4% { transform: scaleY(1); opacity: 1; }
        }
        svg.ai-blink .ai-eye {
          transform-origin: center;
          animation: blink-smooth 6s infinite ease-in-out;
          animation-delay: var(--blink-delay);
        }
        svg.ai-wander .ai-eyes {
          animation: wander 14s infinite ease-in-out;
          animation-delay: var(--wander-delay);
        }
        @keyframes wander {
          0% { transform: translate(0px, 0px); }
          25% { transform: translate(0.5px, 0.5px); }
          50% { transform: translate(-0.5px, 0.5px); }
          75% { transform: translate(0.5px, -0.5px); }
          100% { transform: translate(0px, 0px); }
        }
      `}</style>
    </div>
  );
}

const PERSONA_KEY_MAP: Record<string, PersonaId> = {
  hatchassistant: "hatch_assistant",
  hatch: "hatch_assistant",
  aibroker: "hatch_assistant",
  switchboard: "hatch_assistant",
  echo: "agent_copilot",
  agentcopilot: "agent_copilot",
  leadnurse: "lead_nurse",
  lumen: "lead_nurse",
  haven: "listing_concierge",
  listingconcierge: "listing_concierge",
  atlas: "market_analyst",
  marketanalyst: "market_analyst",
  nova: "transaction_coordinator",
  transactioncoordinator: "transaction_coordinator"
};

const normalize = (value?: string) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function templateToPersonaId(template?: AiEmployeeTemplate): PersonaId | null {
  if (!template) return null;
  const candidates = [template.key, template.displayName].map(normalize).filter(Boolean);
  for (const candidate of candidates) {
    if (PERSONA_KEY_MAP[candidate]) return PERSONA_KEY_MAP[candidate];
    // Looser contains match to handle e.g. "Hatch Orchestrator" or "Echo AI"
    const match = Object.keys(PERSONA_KEY_MAP).find((key) => candidate.includes(key));
    if (match) return PERSONA_KEY_MAP[match];
  }
  return null;
}
