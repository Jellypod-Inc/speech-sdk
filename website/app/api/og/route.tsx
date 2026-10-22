import { ImageResponse } from "next/og";
import { BG_COLOR } from "../../../lib/brand";

const FONT_WEIGHT = 600;
const FONT_URL_REGEX = /src: url\((.+)\) format\('(opentype|truetype)'\)/;

let fontCache: ArrayBuffer | null = null;

async function loadFont() {
	if (fontCache) {
		return fontCache;
	}
	const css = await (
		await fetch(
			`https://fonts.googleapis.com/css2?family=DM+Sans:wght@${FONT_WEIGHT}`,
		)
	).text();
	const url = css.match(FONT_URL_REGEX)?.[1];
	if (!url) {
		throw new Error("Failed to load font data");
	}
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error("Failed to fetch font binary");
	}
	fontCache = await response.arrayBuffer();
	return fontCache;
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const title = url.searchParams.get("title") ?? "Universal Text-to-Speech SDK";
	const description = url.searchParams.get("description") ?? "";

	return new ImageResponse(
		<div
			style={{
				background: BG_COLOR,
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "60px 80px",
			}}
		>
			<img
				alt="SpeechSDK"
				height={54}
				src={`${url.origin}/logo_white.svg`}
				width={240}
			/>

			<div style={{ display: "flex", flexDirection: "column" }}>
				<div
					style={{
						fontSize: "56px",
						fontFamily: "DM Sans",
						fontWeight: FONT_WEIGHT,
						color: "white",
						lineHeight: 1.2,
						maxWidth: "900px",
					}}
				>
					{title}
				</div>

				{description && (
					<div
						style={{
							fontSize: "24px",
							fontFamily: "DM Sans",
							color: "#a1a1aa",
							marginTop: "20px",
							maxWidth: "800px",
							lineHeight: 1.4,
							overflow: "hidden",
							textOverflow: "ellipsis",
							display: "-webkit-box",
							WebkitLineClamp: 2,
							WebkitBoxOrient: "vertical",
						}}
					>
						{description}
					</div>
				)}
			</div>
		</div>,
		{
			width: 1200,
			height: 630,
			fonts: [
				{
					name: "DM Sans",
					data: await loadFont(),
					style: "normal",
					weight: FONT_WEIGHT,
				},
			],
		},
	);
}
