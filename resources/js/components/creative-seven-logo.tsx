import React from 'react';

interface CreativeSevenLogoProps {
    className?: string;
    variant?: 'vector' | 'image';
    glow?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'custom';
}

export default function CreativeSevenLogo({
    className = '',
    variant = 'image',
    glow = false,
    size = 'md',
}: CreativeSevenLogoProps) {
    const sizeClasses = {
        sm: 'h-8 text-lg',
        md: 'h-12 text-2xl',
        lg: 'h-20 text-4xl',
        xl: 'h-28 text-6xl',
        custom: '',
    };

    if (variant === 'image') {
        return (
            <div className={`relative inline-flex items-center justify-center ${className}`}>
                {glow && (
                    <div
                        className="absolute inset-0 rounded-full bg-red-600/20 blur-2xl transition-all duration-700 animate-pulse"
                        aria-hidden="true"
                    />
                )}
                <img
                    src="/images/logo.png"
                    alt="CREATIVE SEVEN Logo"
                    className={`relative z-10 max-w-full object-contain ${sizeClasses[size]} ${className}`}
                />
            </div>
        );
    }

    return (
        <div
            className={`relative inline-flex flex-col items-center justify-center select-none ${sizeClasses[size]} ${className}`}
            role="img"
            aria-label="CREATIVE SEVEN Logo"
        >
            {glow && (
                <div
                    className="absolute -top-1/2 left-1/2 -translate-x-1/2 w-3/4 h-full bg-red-600/20 blur-3xl rounded-full pointer-events-none transition-opacity duration-1000"
                    aria-hidden="true"
                />
            )}

            <svg
                viewBox="0 0 650 140"
                className="w-full h-auto overflow-visible"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <linearGradient id="c7RedGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FF1E27" />
                        <stop offset="50%" stopColor="#E50914" />
                        <stop offset="100%" stopColor="#B20710" />
                    </linearGradient>

                    {glow && (
                        <filter id="viiGlow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    )}
                </defs>

                {/* White text "CREATI" */}
                <g fill="#FFFFFF" fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Montserrat', 'Inter', sans-serif">
                    <text x="10" y="88" fontSize="90" fontWeight="900" letterSpacing="-3">
                        CREATI
                    </text>
                </g>

                {/* Red Roman Numeral VII (V + I + I) */}
                <g fill="url(#c7RedGradient)" filter={glow ? "url(#viiGlow)" : undefined}>
                    {/* V left stroke */}
                    <path d="M 385 18 L 412 18 L 434 88 L 410 88 Z" />
                    {/* V right stroke */}
                    <path d="M 434 88 L 456 18 L 483 18 L 448 88 Z" />
                    {/* First I bar */}
                    <rect x="488" y="18" width="20" height="70" />
                    {/* Second I bar */}
                    <rect x="512" y="18" width="12" height="70" />
                </g>

                {/* White E */}
                <g fill="#FFFFFF">
                    <rect x="532" y="18" width="65" height="15" />
                    <rect x="532" y="45.5" width="50" height="15" />
                    <rect x="532" y="73" width="65" height="15" />
                    <rect x="532" y="18" width="16" height="70" />
                </g>

                {/* Subtext CREATIVE SEVEN */}
                <text
                    x="325"
                    y="126"
                    fill="#CCCCCC"
                    fontSize="16"
                    fontFamily="system-ui, -apple-system, sans-serif"
                    fontWeight="600"
                    letterSpacing="8"
                    textAnchor="middle"
                    className="uppercase tracking-[0.45em]"
                >
                    CREATIVE SEVEN
                </text>
            </svg>
        </div>
    );
}

