import type { SVGAttributes } from 'react';

export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            {/* Black/CurrentColor '4' / 'C' shape */}
            <path
                d="M 50 14 L 18 52 L 50 52 L 50 84 L 20 84 L 20 66 L 36 44 L 24 44 L 50 14 Z"
                fill="currentColor"
            />
            {/* Red '7' ribbon shape */}
            <path
                d="M 52 14 L 86 14 L 86 28 L 62 84 L 52 84 Z"
                fill="#E50914"
            />
            <path
                d="M 72 28 L 86 28 L 86 36 Z"
                fill="#B20710"
            />
        </svg>
    );
}

