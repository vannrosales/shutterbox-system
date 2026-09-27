import { Link } from '@inertiajs/react';
import CreativeSevenLogo from '@/components/creative-seven-logo';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

export default function AuthSimpleLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    return (
        <div className="relative min-h-svh w-full overflow-hidden bg-black text-white flex flex-col items-center justify-center p-4 sm:p-6 md:p-10 select-none">
            {/* Background Graphic Image */}
            <div
                className="absolute inset-0 bg-[url('/images/login-bg.png')] bg-cover bg-center bg-no-repeat opacity-60"
                aria-hidden="true"
            />

            {/* Dark Vignette Overlay for Readability */}
            <div
                className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/85 backdrop-blur-[2px]"
                aria-hidden="true"
            />

            {/* Content Box */}
            <div className="relative z-10 w-full max-w-md">
                <div className="flex flex-col gap-6 bg-black/85 backdrop-blur-xl border border-neutral-800/90 p-6 sm:p-8 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.9)]">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <Link
                            href={home()}
                            className="inline-flex items-center justify-center transition-transform hover:scale-105"
                        >
                            <CreativeSevenLogo variant="image" size="lg" className="w-56 sm:w-64 h-auto" />
                            <span className="sr-only">Home</span>
                        </Link>

                        <div className="space-y-1.5 mt-1">
                            <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
                            {description && (
                                <p className="text-sm text-neutral-400 text-balance">
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>

                    {children}
                </div>
            </div>
        </div>
    );
}

