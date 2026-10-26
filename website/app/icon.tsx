import { ImageResponse } from "next/og";
import { BG_COLOR, ICON_PATH } from "../lib/brand";

// 256x256 renders crisp on retina; browsers downscale without blur.
export const size = { width: 256, height: 256 };
export const contentType = "image/png";

export default function Icon() {
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: BG_COLOR,
			}}
		>
			<svg
				fill="white"
				height="176"
				role="img"
				viewBox="0 0 24 24"
				width="176"
				xmlns="http://www.w3.org/2000/svg"
			>
				<title>SpeechSDK</title>
				<path d={ICON_PATH} />
			</svg>
		</div>,
		size,
	);
}
