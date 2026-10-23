import { DotnetHostBuilder, MonoConfig } from "./dotnetdefs";
import { calculateXXH64, recursiveGetDirectory, rootFolder } from "../fs";
import { SteamJS } from "../achievements";
import { JsSplash } from "./loading";
import { epoxyFetch, EpxTcpWs, EpxWs, getWispUrl } from "../epoxy";
import { store } from "../store";

export type Log = { color: string; log: string };
export const gameState: Stateful<{
	ready: boolean;
	initting: boolean;
	playing: boolean;
	memory: number;
}> = $state({
	ready: false,
	initting: false,
	playing: false,
	memory: -1,
});
(globalThis as any).gameState = gameState;
export const loglisteners: ((log: Log) => void)[] = [];

let logs: string[] = [];
(globalThis as any).logs = logs;

function proxyConsole(name: string, color: string) {
	// @ts-expect-error ts sucks
	const old = console[name].bind(console);
	// @ts-expect-error ts sucks
	console[name] = (...args) => {
		let str;
		try {
			str = args.join(" ");
		} catch {
			str = "<failed to render>";
		}
		old(...args);
		for (const logger of loglisteners) {
			logger({ color, log: str });
		}
		logs.push(str);
	};
	return old;
}
export const bypassError = proxyConsole("error", "var(--error)");
export const bypassWarn = proxyConsole("warn", "var(--warning)");
export const bypassLog = proxyConsole("log", "var(--fg)");
export const bypassInfo = proxyConsole("info", "var(--info)");
export const bypassDebug = proxyConsole("debug", "var(--fg4)");
(globalThis as any).bypassLog = bypassLog;

function hookfmod() {
	let contexts: AudioContext[] = [];

	(AudioContext as any) = new Proxy(AudioContext, {
		construct(target, argArray) {
			let ctx = new target(...argArray);
			contexts.push(ctx);
			return ctx;
		},
	});

	window.addEventListener("visibilitychange", async () => {
		if (document.visibilityState === "visible") {
			for (let context of contexts) {
				try {
					await context.resume();
				} catch {}
			}
		} else {
			for (let context of contexts) {
				try {
					await context.suspend();
				} catch {}
			}
		}
	});
}
hookfmod();

useChange([gameState.playing, gameState.initting], () => {
	try {
		if (gameState.playing && !gameState.initting) {
			// @ts-expect-error
			navigator.keyboard.lock();
		} else {
			// @ts-expect-error
			navigator.keyboard.unlock();
		}
	} catch (err) {}
});

// The game is patched to always run windowed, and SDL exits fullscreen every
// time it applies that (on startup and when the canvas resizes), so it would
// undo the fullscreen button. Nothing on the page needs to exit fullscreen
// itself; the user still can with Esc.
document.exitFullscreen = () => Promise.resolve();

// Ctrl is a common game binding, so stop Ctrl+key from triggering browser
// shortcuts (save page, bookmark, ...) while playing. Tab would move focus off
// the game the same way. The game still gets the event; only the browser's
// default action is cancelled.
window.addEventListener(
	"keydown",
	(e) => {
		if (!gameState.playing || !(e.ctrlKey || e.metaKey || e.key === "Tab"))
			return;
		const target = e.target as HTMLElement | null;
		if (target?.closest("input, textarea, [contenteditable]")) return;
		e.preventDefault();
	},
	{ capture: true }
);
// Some shortcuts (Ctrl+W/T/N in Firefox, or outside fullscreen in Chrome) are
// reserved and can't be cancelled, so at least confirm before closing the tab.
let stopping = false;
window.addEventListener("beforeunload", (e) => {
	if (!gameState.playing || stopping) return;
	e.preventDefault();
	// older browsers only prompt when returnValue is set
	e.returnValue = "";
	// the prompt kicks the page out of fullscreen
	interruptedFullscreen = document.fullscreenElement;
});
// Pages can't re-enter fullscreen without a user gesture, so do it on the
// first input after "Stay on page".
let interruptedFullscreen: Element | null = null;
const restoreFullscreen = () => {
	const el = interruptedFullscreen;
	interruptedFullscreen = null;
	if (el && !document.fullscreenElement && gameState.playing)
		el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
};
window.addEventListener("keydown", (e) => {
	// Escape doesn't count as a user gesture for fullscreen
	if (e.key !== "Escape") restoreFullscreen();
});
window.addEventListener("pointerdown", restoreFullscreen);

let nativefetch = window.fetch;
let wasm: any;
let dotnet: DotnetHostBuilder;
let exports: any;

export function getDlls(): (readonly [string, string])[] {
	const config: MonoConfig = wasm.dotnet.instance.config;
	const resources = [
		...(config.resources?.coreAssembly || []),
		...(config.resources?.assembly || []),
	];
	return resources.map((x) => [x.name, x.virtualPath] as const);
}

export async function downloadEverest() {
	const branch = "stable";
	const res = await epoxyFetch(
		"https://everestapi.github.io/everestupdater.txt"
	);
	const versionsUrl = await res.text();
	const versRes = await epoxyFetch(
		versionsUrl.trim() + "?supportsNativeBuilds=true"
	);
	const versions = await versRes.json();

	const build = versions.filter((v: any) => v.branch == branch)[0];

	console.log(
		`Installing Everest ${branch} ${build.commit} ${build.date} from ${build.mainDownload}`
	);
	const zipres = await epoxyFetch(build.mainDownload);
	const zipbin = await zipres.arrayBuffer();

	const file = await rootFolder.getFileHandle("everest.zip", { create: true });
	const writable = await file.createWritable();
	await writable.write(new Uint8Array(zipbin));
	await writable.close();

	console.log("Successfully downloaded Everest");
}

export async function preInit() {
	if (gameState.ready) return;

	let url = "../_framework/dotnet.js";
	if (import.meta.env.DEV) {
		url = "/_framework/dotnet.js";
	}

	wasm = await eval(`import("${url}")`);
	dotnet = wasm.dotnet;

	console.debug("initializing dotnet");
	const runtime = await dotnet
		.withConfig({
			// Firefox only starts a new worker once the main thread yields, so a
			// thread created after the pool runs out can deadlock against a main
			// thread that's spinning on a lock. Keep enough workers ready up front.
			pthreadPoolInitialSize: 32,
		})
		.withRuntimeOptions([
			// jit functions quickly and jit more functions
			`--jiterpreter-minimum-trace-hit-count=${500}`,

			// monitor jitted functions for less time
			`--jiterpreter-trace-monitoring-period=${100}`,

			// reject less funcs
			`--jiterpreter-trace-monitoring-max-average-penalty=${150}`,

			// increase jit function limits
			`--jiterpreter-wasm-bytes-limit=${64 * 1024 * 1024}`,
			`--jiterpreter-table-size=${32 * 1024}`,
		])
		.withResourceLoader((type, _name, defaultUri, _integrity, behavior) => {
			// for split wasm
			if (type === "dotnetwasm" && behavior === "dotnetwasm") {
				return (async () => {
					let idx = 0;

					let fetchNext = async () => {
						let res = await nativefetch(defaultUri + idx);
						idx++;
						if (!res.body) throw new Error("no body in fetch response");
						return res.status === 200 &&
							!(res.headers.get("content-type") || "").includes("text/html")
							? res.body.getReader()
							: null;
					};

					let chunk = await fetchNext();
					if (!chunk) throw new Error("failed to fetch first chunk");
					let currentStream: ReadableStreamDefaultReader<Uint8Array> = chunk;

					let stream = new ReadableStream({
						async pull(controller) {
							let { value, done } = await currentStream.read();
							if (done || !value) {
								chunk = await fetchNext();

								if (chunk) {
									currentStream = chunk;
									await this.pull!(controller);
								} else {
									controller.close();
								}
							} else {
								controller.enqueue(value);
							}
						},
					});

					let res = new Response(stream, {
						headers: new Headers({ "Content-Type": "application/wasm" }),
					});
					return res;
				})();
			}
		})
		.create();

	runtime.setModuleImports("SteamJS", SteamJS);
	runtime.setModuleImports("JsSplash", JsSplash);

	console.log("loading epoxy");

	window.WebSocket = new Proxy(WebSocket, {
		construct(t, a, n) {
			const url = new URL(a[0]);
			if (a[0] === getWispUrl() || url.host === location.host)
				return Reflect.construct(t, a, n);
			if (url.hostname.startsWith("__celestewasm_wisp_proxy_ws__"))
				return new EpxTcpWs(
					url.pathname.substring(1),
					url.hostname.replace("__celestewasm_wisp_proxy_ws__", "")
				);

			// @ts-expect-error
			return new EpxWs(...a);
		},
	});

	window.fetch = async (...args) => {
		try {
			return await nativefetch(...args);
		} catch (e) {
			bypassLog(
				"native fetch failed for",
				args,
				", fetching with epoxy instead"
			);
		}

		// @ts-expect-error
		return await epoxyFetch(...args);
	};

	const config = runtime.getConfig();
	exports = await runtime.getAssemblyExports(config.mainAssemblyName!);

	runtime.setModuleImports("interop.js", {
		XXHash64_Fast: async (path: string) => {
			if (!path.startsWith("/libsdl/"))
				throw new Error("can't hash things not in opfs");
			path = path.slice("/libsdl/".length);

			let start = performance.now();
			let hex = await calculateXXH64(path);
			let bytes = new Uint8Array(8);
			for (let i = 0; i < 8; i++) {
				bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
			}
			let end = performance.now();

			console.debug("xxh64_fast:", path, (end - start).toFixed(1));

			return { ret: bytes };
		},
	});

	(self as any).wasm = {
		Module: runtime.Module,
		// @ts-expect-error
		FS: runtime.Module.FS,
		dotnet,
		runtime,
		config,
		exports,
	};

	const dlls = getDlls();

	const loc = location.pathname;

	await runtime.runMain();
	await exports.CelesteBootstrap.MountFilesystems(
		loc.substring(0, loc.lastIndexOf("/")) + "/",
		dlls.map((x) => `${x[0]}|${x[1]}`)
	);
	await exports.CelesteLoader.PreInit();
	console.debug("dotnet initialized");

	gameState.ready = true;
}

export async function PatchCeleste(installEverest: boolean) {
	if (installEverest) {
		try {
			await (
				await recursiveGetDirectory(rootFolder, ["Celeste", "Everest"])
			).getFileHandle("Celeste.Mod.mm.dll", { create: false });
		} catch {
			try {
				await rootFolder.getFileHandle("everest.zip", { create: false });
			} catch {
				await downloadEverest();
			}

			if (!(await exports.Patcher.ExtractEverest())) {
				throw "failed to extract everest";
			}
		}
	}

	if (!(await exports.Patcher.PatchCeleste(installEverest))) {
		throw "failed to patch celeste";
	}
}

const SEAMLESSCOUNT = 5;
const CLEANUP_TIMEOUT = 3000;

function monitorMem(): () => void {
	let stop = false;
	exports.CelesteLoader.WatchMemoryUsage((mem: number) => {
		gameState.memory = mem;
		return stop;
	});
	return () => (stop = true);
}

// CelesteNet never connects by itself when the game starts, so the site's
// setting is applied once the mod has loaded. After that, toggling it in the
// mod menu is copied back to the site setting. Without CelesteNet installed
// (or with a framework built before these exports) this does nothing.
let celestenetApplied = false;
// the game applies a toggle on its next frame, so a read right after it can
// still see the old value
let celestenetToggledAt = 0;
function syncCelesteNet(): () => void {
	const loader = exports.CelesteLoader;
	if (!loader.SetCelesteNet || !loader.GetCelesteNet) return () => {};

	const timer = setInterval(async () => {
		try {
			if (!celestenetApplied) {
				celestenetApplied = await loader.SetCelesteNet(store.celestenet);
				return;
			}
			const wants = await loader.GetCelesteNet();
			if (wants !== -1 && Date.now() - celestenetToggledAt > 3000)
				store.celestenet = wants === 1;
		} catch (e) {
			console.error("CelesteNet sync failed:", e);
		}
	}, 2000);
	return () => clearInterval(timer);
}

// called when the site setting is switched
export async function setCelesteNet(connect: boolean) {
	store.celestenet = connect;
	celestenetToggledAt = Date.now();
	const loader = exports?.CelesteLoader;
	if (!gameState.playing || !celestenetApplied || !loader?.SetCelesteNet)
		return;
	try {
		await loader.SetCelesteNet(connect);
	} catch (e) {
		console.error("Failed to toggle CelesteNet:", e);
	}
}

// The runtime can't shut the game down and start it again, so stopping is a
// reload. Progress since the game last saved is lost, as when closing the tab.
export function stop() {
	stopping = true;
	location.reload();
}

export async function play() {
	gameState.playing = true;
	gameState.initting = true;

	let stopMonitoring = monitorMem();
	let stopCelesteNet = () => {};

	console.debug("Init...");
	const before = performance.now();

	await exports.CelesteLoader.Init(false);

	// run some frames for seamless transition
	for (let i = 0; i < SEAMLESSCOUNT; i++) {
		console.debug(`SeamlessInit${i}...`);
		if (!(await exports.CelesteLoader.RunOneFrame()))
			throw new Error("CelesteLoader.RunOneFrame() Failed!");
	}

	const after = performance.now();
	console.debug(`Init : ${(after - before).toFixed(2)}ms`);
	gameState.initting = false;
	stopCelesteNet = syncCelesteNet();

	const mainLoop = exports.CelesteLoader.MainLoop();
	// MainLoop doesn't return when the game exits (see WaitForExit). Frameworks
	// built before WaitForExit was added just stay on a black screen.
	if (exports.CelesteLoader.WaitForExit) {
		mainLoop.catch((e: any) => console.error("MainLoop failed:", e));
		await exports.CelesteLoader.WaitForExit();
	} else {
		await mainLoop;
	}

	stopMonitoring();
	stopCelesteNet();

	console.debug("Cleanup...");
	try {
		// Cleanup waits for the game's threads and can hang there. The page is
		// reloaded anyway, so give it a moment to finish any saves and move on.
		await Promise.race([
			exports.CelesteLoader.Cleanup(),
			new Promise((r) => setTimeout(r, CLEANUP_TIMEOUT)),
		]);
	} finally {
		gameState.ready = false;
		gameState.playing = false;
		// the game can't be started again without a fresh runtime
		location.reload();
	}
}
