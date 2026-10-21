import { defineConfig, Plugin } from "vite";
import { dreamlandPlugin } from "vite-plugin-dreamland";
import { browserslistToTargets } from "lightningcss";
import { readFile } from "node:fs/promises";
import os from "node:os";

let analytics_tag;
try {
	analytics_tag = await readFile(
		import.meta.dirname + "/analytics_tag",
		"utf8"
	);
} catch {
	analytics_tag = process.env.ANALYTICS_TAG || "";
}
analytics_tag = analytics_tag
	.replace("></", ` data-before-send="processEvent"></`)
	.replace(/ defer/g, "");
process.env.VITE_ANALYTICS_TAG = analytics_tag;

let analyticsTagPlugin = () =>
	({
		name: "analytics-tag",
		transformIndexHtml(html) {
			return html.replace("%__ANALYTICS_TAG__%", analytics_tag);
		},
	}) satisfies Plugin;

export default defineConfig({
	plugins: [dreamlandPlugin(), analyticsTagPlugin()],
	root: "./frontend",
	base: "./",
	server: {
		headers: {
			"Cross-Origin-Embedder-Policy": "require-corp",
			"Cross-Origin-Opener-Policy": "same-origin",
		},
		strictPort: true,
		// macOS reserves port 5000 for AirPlay Receiver (???)
		port: os.type() === "Darwin" ? 4999 : 5000,
	},
	preview: {
		allowedHosts: ["celeste.refract.online"],
	},
	build: {
		target: "es2022",
		cssMinify: "lightningcss",
		minify: "terser",
		terserOptions: {
			ecma: 2020,
			module: true,
			compress: {
				passes: 3,
				ecma: 2020,
				unsafe_arrows: true,
				unsafe: true,
			},
			mangle: true,
			toplevel: true,
		},
	},
	css: {
		transformer: "lightningcss",
		lightningcss: {
			targets: browserslistToTargets([
				"> 1%",
				"last 2 versions",
				"not dead",
				"Safari 18",
				"last 10 Chrome versions",
			]),
			drafts: {
				customMedia: false,
			},
			nonStandard: {
				deepSelectorCombinator: false,
			},
			errorRecovery: true,
		},
	},
	resolve: {
		alias: {
			fs: "rollup-plugin-node-polyfills/polyfills/empty",
		},
	},
	optimizeDeps: {
		exclude: ["./emsdk"],
	},
});
