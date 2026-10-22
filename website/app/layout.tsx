import { PostHogPageView, PostHogProvider } from "@posthog/next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { RootProvider } from "fumadocs-ui/provider/next";
import localFont from "next/font/local";
import Script from "next/script";

import "@/shared/ui/styles/globals.css";
import "@/styles/fumadocs.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/shared/ui/components/sonner";
import { cn } from "@/shared/ui/lib/utils";

const dmSans = localFont({
	src: "../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
	display: "swap",
	variable: "--font-sans",
	weight: "100 1000",
});

const fontMono = localFont({
	src: "../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
	display: "swap",
	weight: "100 900",
	variable: "--font-mono",
});

export const metadata = {
	metadataBase: new URL("https://speechsdk.dev"),
	title: "SpeechSDK | Universal Text-to-Speech SDK",
	description:
		"Free, open-source toolkit for building better AI audio applications with multiple voice providers.",
	openGraph: {
		type: "website",
		siteName: "SpeechSDK",
		images: [
			"/api/og?description=Free%2C+open-source+toolkit+for+building+better+AI+audio+applications+with+multiple+voice+providers.",
		],
	},
	twitter: {
		card: "summary_large_image",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			className={cn(
				"antialiased",
				fontMono.variable,
				"font-sans",
				dmSans.variable,
			)}
			lang="en"
			suppressHydrationWarning
		>
			<head>
				{process.env.NODE_ENV === "development" && (
					<Script
						crossOrigin="anonymous"
						src="//unpkg.com/react-grab/dist/index.global.js"
						strategy="beforeInteractive"
					/>
				)}
			</head>
			<body className="flex min-h-screen flex-col">
				{process.env.NEXT_PUBLIC_POSTHOG_KEY ? (
					<PostHogProvider
						clientOptions={{
							api_host:
								process.env.NEXT_PUBLIC_POSTHOG_HOST ??
								"https://us.i.posthog.com",
							capture_exceptions: true,
						}}
					>
						<PostHogPageView />
						<ThemeProvider>
							<RootProvider theme={{ enabled: false }}>{children}</RootProvider>
							<Toaster />
						</ThemeProvider>
					</PostHogProvider>
				) : (
					<ThemeProvider>
						<RootProvider theme={{ enabled: false }}>{children}</RootProvider>
						<Toaster />
					</ThemeProvider>
				)}
				<Analytics />
				<SpeedInsights />
			</body>
		</html>
	);
}
