import { Link } from '@inertiajs/react';
import CreativeSevenLogo from '@/components/creative-seven-logo';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

export default function AuthSplitLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    return (
        <div className="relative grid min-h-svh flex-col items-center justify-center px-4 sm:px-0 lg:max-w-none lg:grid-cols-2 lg:px-0 bg-black text-white select-none">
            {/* Left Panel: Graphic Wallpaper */}
            <div className="relative hidden h-full flex-col p-10 text-white lg:flex border-r border-neutral-800/80 overflow-hidden">
                <div
                    className="absolute inset-0 bg-[url('/images/login-bg.png')] bg-cover bg-center bg-no-repeat opacity-80"
                    aria-hidden="true"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/60" aria-hidden="true" />

                <Link
                    href={home()}
                    className="relative z-20 flex items-center text-lg font-medium"
                >
                    <CreativeSevenLogo variant="image" size="md" className="w-48 h-auto" />
                </Link>

                <div className="relative z-20 mt-auto">
                    <p className="text-xs uppercase tracking-widest text-neutral-400 font-mono">
                        LESS THAN MEDIOCRITY, GREATER THAN VISION
                    </p>
                </div>
            </div>

            {/* Right Panel: Form Container */}
            <div className="w-full lg:p-8 flex items-center justify-center min-h-svh lg:min-h-0 bg-black/90 lg:bg-transparent">
                <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[380px] p-6 sm:p-8 bg-neutral-950/80 backdrop-blur-xl lg:bg-transparent lg:p-0 border border-neutral-800/80 lg:border-none rounded-2xl">
                    <Link
                        href={home()}
                        className="relative z-20 flex items-center justify-center lg:hidden mb-2"
                    >
                        <CreativeSevenLogo variant="image" size="lg" className="w-52 h-auto" />
                    </Link>
                    <div className="flex flex-col items-center text-center gap-1.5">
                        <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
                        {description && (
                            <p className="text-sm text-balance text-neutral-400">
                                {description}
                            </p>
                        )}
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}

