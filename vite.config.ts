import { defineConfig } from "vite";
import { dreamlandPlugin } from "vite-plugin-dreamland";
import { browserslistToTargets } from "lightningcss";
import os from "node:os";

export default defineConfig({
	plugins: [dreamlandPlugin()],
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
	optimizeDeps: {
		exclude: ["./emsdk"],
	},
});
