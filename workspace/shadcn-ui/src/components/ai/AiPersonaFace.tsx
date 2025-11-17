"use client";

import * as React from "react";
import type { PersonaId } from "@/lib/ai/aiPersonas";
import { PERSONA_COLORS, getPersonaConfig } from "@/lib/ai/aiPersonas";

type AiPersonaFaceProps = {
  personaId: PersonaId;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  active?: boolean;
  className?: string;
};

export const AiPersonaFace: React.FC<AiPersonaFaceProps> = ({
  personaId,
  size = "md",
  animated = true,
  active = false,
  className,
}) => {
  const baseSize = size === "sm" ? 28 : size === "lg" ? 56 : 40;
  const { color, accent } = PERSONA_COLORS[personaId];

  // Useful if we later show tooltips/names; not strictly required now.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const persona = getPersonaConfig(personaId);

  // Randomize blink and wander offsets per instance so faces don't sync
  const [blinkDelay] = React.useState(() => `${Math.random() * 5}s`);
  const [wanderDelay] = React.useState(() => `${Math.random() * 30}s`);

  const renderFace = () => {
    switch (personaId) {
      case "agent_copilot": // Echo – thinker
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
      case "lead_nurse": // Lumen – nurturer
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
      case "listing_concierge": // Haven – creative
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
      case "market_analyst": // Atlas – analyst
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
      case "transaction_coordinator": // Nova – organizer
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
      default:
        return (
          <>
            <circle cx="32" cy="32" r="30" stroke="#000" strokeWidth="3" />
            <circle cx="24" cy="28" r="3" fill="#000" />
            <circle cx="40" cy="28" r="3" fill="#000" />
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
          : "0 4px 8px rgba(15,23,42,0.12)",
      }}
    >
      <svg
        width={baseSize - 6}
        height={baseSize - 6}
        viewBox="0 0 64 64"
        fill="none"
        className={svgClass}
        style={{ ['--blink-delay' as any]: blinkDelay, ['--wander-delay' as any]: wanderDelay }}
      >
        {renderFace()}
      </svg>
      {/* Inject lightweight keyframes for subtle motion + blink + eye wander */}
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
        /* Blink: quickly close/open near the end of the cycle */
        @keyframes blink { 
          0%, 90%, 100% { transform: scaleY(1); }
          93% { transform: scaleY(0.1); }
          96% { transform: scaleY(1); }
        }
        svg.ai-blink .ai-eye { 
          transform-origin: center; 
          animation: blink 6s ease-in-out infinite var(--blink-delay, 0s);
        }
        /* Eye wander: sit still most of the time, then glance around briefly */
        /* More noticeable eye wander: multiple glances before returning */
        @keyframes eye-wander {
          0%, 90%, 100% { transform: translate(0px, 0px); }
          92% { transform: translate(4px, -2px); }  /* up-right */
          93% { transform: translate(4px, 3px); }   /* down-right */
          94% { transform: translate(-4px, 3px); }  /* down-left */
          95% { transform: translate(-4px, -3px); } /* up-left */
          97% { transform: translate(0px, 0px); }   /* center */
        }
        svg.ai-wander .ai-eyes {
          transform-origin: center;
          animation: eye-wander 80s ease-in-out infinite var(--wander-delay, 0s);
        }
      `}</style>
    </div>
  );
};
