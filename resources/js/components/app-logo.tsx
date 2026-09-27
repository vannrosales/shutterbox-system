import AppLogoIcon from '@/components/app-logo-icon';

export default function AppLogo() {
    return (
        <div className="flex items-center gap-2.5 py-0.5 select-none">
            {/* White Rounded Square Box with Logo Mark */}
            <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-white text-black p-1.5 shadow-sm shrink-0 border border-neutral-200/80">
                <AppLogoIcon className="size-6 text-black" />
            </div>

            {/* Stacked 2-Line Text matching Waray-Flix style */}
            <div className="flex flex-col text-left justify-center leading-none">
                <span className="text-sm font-black tracking-wider text-white uppercase leading-none">
                    CREATIVE
                </span>
                <span className="text-xs font-black tracking-widest text-[#E50914] uppercase leading-none mt-1">
                    SEVEN
                </span>
            </div>
        </div>
    );
}
