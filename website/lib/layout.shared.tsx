import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			enabled: false,
		},
		themeSwitch: {
			enabled: false,
		},
	};
}
