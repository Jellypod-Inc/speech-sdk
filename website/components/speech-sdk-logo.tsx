import Image from "next/image";

export function SpeechSDKLogo({ className }: { className?: string }) {
	return (
		<Image
			alt="SpeechSDK"
			className={`dark:invert ${className ?? ""}`}
			height={36}
			src="/logo.svg"
			width={160}
		/>
	);
}
