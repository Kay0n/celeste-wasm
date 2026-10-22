import { Logo } from "./main";
import { Switch } from "./ui/Switch";
import { Button, Icon } from "./ui/Button";
import { extractTar, hasContent, rootFolder } from "./fs";
import { gameState, PatchCeleste } from "./game/dotnet";
import { LogView } from "./game";

import iconManufacturing from "@ktibow/iconset-material-symbols/manufacturing";
import iconDownload from "@ktibow/iconset-material-symbols/download";

// The game is downloaded from one of these paths on first visit: a tar of
// Content/ and Celeste.exe, or one downloaded from settings, optionally gzipped.
const SERVER_ARCHIVE_CANDIDATES: string[] = import.meta.env.VITE_SERVER_ARCHIVE
	? [import.meta.env.VITE_SERVER_ARCHIVE]
	: ["./celeste.tar.gz", "./celeste.tar"];
const SERVER_EXTRACT_MARKER = ".ServerExtractInProgress";

const fileExists = async (name: string) => {
	try {
		await rootFolder.getFileHandle(name, { create: false });
		return true;
	} catch {
		return false;
	}
};

// an interrupted extraction can leave Content/ partially written
const serverExtractInterrupted = await fileExists(SERVER_EXTRACT_MARKER);
const initialHasContent = !serverExtractInterrupted && (await hasContent());
const initialIsPatched = await fileExists("CustomCeleste.dll");

let SERVER_ARCHIVE = "";
if (!initialHasContent) {
	for (const candidate of SERVER_ARCHIVE_CANDIDATES) {
		try {
			const res = await fetch(candidate, { method: "HEAD" });
			// dev servers answer unknown paths with index.html
			if (res.ok && !res.headers.get("content-type")?.includes("text/html")) {
				SERVER_ARCHIVE = candidate;
				break;
			}
		} catch {}
	}
}
const serverArchiveAvailable = SERVER_ARCHIVE !== "";

const Progress: Component<{ percent: number }, {}> = function () {
	this.css = `
		background: color-mix(in srgb, var(--surface1) 70%, transparent);
		border-radius: 1rem;
		height: 0.6rem;

		.bar {
			background: var(--accent);
			border-radius: 1rem;
			height: 0.6rem;
			transition: width 100ms ease;
		}
	`;

	return (
		<div>
			<div class="bar" style={use`width:${this.percent}%`} />
		</div>
	);
};

const ServerExtract: Component<
	{
		"on:done": (patched: boolean) => void;
	},
	{
		status: string;
		progress: string;
		percent: number;
	}
> = function () {
	this.percent = 0;
	this.progress = "Starting download...";

	const mb = (x: number) => (x / 1024 / 1024).toFixed(0);
	const STORAGE_HINT =
		"Private, Incognito and Guest windows only get a small amount of storage, so open this site in a normal window. Otherwise, free up some disk space and reload.";

	// Size of the archive once unpacked, or 0 if the server can't tell us. A
	// gzip file ends with its uncompressed size (mod 4 GiB), so only those 4
	// bytes are fetched.
	const unpackedSize = async () => {
		try {
			const head = await fetch(SERVER_ARCHIVE, { method: "HEAD" });
			if (head.headers.get("content-encoding")) return 0;
			const length = +(head.headers.get("content-length") || 0);
			if (!SERVER_ARCHIVE.endsWith(".gz") || length < 4) return length;

			// an explicit start, since vite preview mishandles "bytes=-4"
			const abort = new AbortController();
			const res = await fetch(SERVER_ARCHIVE, {
				headers: { Range: `bytes=${length - 4}-${length - 1}` },
				signal: abort.signal,
			});
			if (res.status !== 206) {
				// the server ignored the range and is sending the whole file
				abort.abort();
				return 0;
			}
			const tail = new DataView(await res.arrayBuffer());
			return tail.byteLength === 4 ? tail.getUint32(0, true) : 0;
		} catch {
			return 0;
		}
	};

	const run = async () => {
		// fail before downloading anything if the game can't fit
		const needed = await unpackedSize();
		const { quota } = await navigator.storage.estimate();
		if (needed && quota !== undefined && quota < needed) {
			this.status = `The game needs about ${mb(needed)} MB of browser storage, but this browser only allows ${mb(quota)} MB. ${STORAGE_HINT}`;
			return;
		}

		await rootFolder.getFileHandle(SERVER_EXTRACT_MARKER, { create: true });

		const res = await fetch(SERVER_ARCHIVE);
		if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
		// with Content-Encoding the body is already inflated, so Content-Length
		// (the compressed size) can't be compared against bytes read
		const total = res.headers.get("content-encoding")
			? 0
			: +(res.headers.get("content-length") || 0);

		let loaded = 0;
		let stream: ReadableStream<Uint8Array> = res.body.pipeThrough(
			new TransformStream({
				transform: (chunk, controller) => {
					loaded += chunk.byteLength;
					if (total) this.percent = Math.min((loaded / total) * 100, 100);
					this.progress = total
						? `${mb(loaded)} / ${mb(total)} MB`
						: `${mb(loaded)} MB`;
					controller.enqueue(chunk);
				},
			})
		);
		// if the server sent it with Content-Encoding the browser already inflated it
		if (
			SERVER_ARCHIVE.endsWith(".gz") &&
			!res.headers.get("content-encoding")?.includes("gzip")
		)
			stream = stream.pipeThrough(new DecompressionStream("gzip"));

		await extractTar(stream, rootFolder, (type, name) =>
			console.debug(`untarred ${type} ${name}`)
		);

		await rootFolder.removeEntry(SERVER_EXTRACT_MARKER);

		this["on:done"](await fileExists("CustomCeleste.dll"));
	};
	run().catch((err) => {
		console.error(err);
		// the quota check above can't see other sites' usage or a nearly full disk
		this.status = String(err).includes("QuotaExceededError")
			? `Ran out of browser storage while unpacking the game. ${STORAGE_HINT}`
			: `Failed to download game archive: ${err}. Reload to retry.`;
	});

	return (
		<div class="step">
			<p>
				Downloading and extracting game files from this server. This only
				happens once per browser.
			</p>
			<Progress percent={use(this.percent)} />
			<p>{use(this.progress)}</p>
			{$if(use(this.status), <div class="error">{use(this.status)}</div>)}
		</div>
	);
};

export const Patch: Component<
	{
		"on:done": () => void;
	},
	{
		patching: boolean;
		everest: boolean;
		disabled: boolean;
	}
> = function () {
	this.patching = false;
	this.everest = false;
	// the runtime is still loading when this first shows
	useChange([this.patching, gameState.ready], () => {
		this.disabled = this.patching || !gameState.ready;
	});
	this.css = `
		display: flex;
		flex-direction: column;
		gap: 1rem;

		.component-log {
		  scrollbar-width: none;
		}

		.console {
			display: flex;
			font-size: initial;
			height: 10em;
		}
	`;
	const patch = async () => {
		this.patching = true;
		try {
			await PatchCeleste(this.everest);
			this.patching = false;
			this["on:done"]();
		} catch {
			console.debug("================================================");
			console.error("[!!!] There was an error patching Celeste!");
			console.log("Please try again or reload the page.");
			console.debug("================================================");
			this.patching = false;
		}
	};

	return (
		<div>
			<p>
				We're going to patch Celeste with MonoMod for neccesary WASM fixes. You
				can also optionally install the Everest Mod Loader, but it will take
				longer to install.
			</p>
			<Switch
				title={"Install Everest Mod Loader?"}
				bind:on={use(this.everest)}
				bind:disabled={use(this.patching)}
			/>

			<Button
				type="primary"
				icon="left"
				on:click={patch}
				disabled={use(this.disabled)}
			>
				<Icon icon={iconManufacturing} />
				{use(gameState.ready, (x) => (x ? "Patch Celeste" : "Loading..."))}
			</Button>

			<div class="console">
				<LogView scrolling={true} />
			</div>
		</div>
	);
};

export const Splash: Component<
	{
		"on:next": (animation: boolean) => void;
		start: () => Promise<void>;
	},
	{
		next: "intro" | "server" | "patch" | "missing";
	}
> = function () {
	this.css = `
		position: relative;

		width: 100%;
		height: 100%;

		--animation: cubic-bezier(0.25, 0, 0.25, 1);

		.splash, .blur, .main {
			position: absolute;
			width: 100%;
			height: 100%;
			top: 0;
			left: 0;
		}

		.splash {
			object-fit: cover;
			z-index: 101;
		}

		.blur {
			backdrop-filter: blur(1rem);
			background-color: color-mix(in srgb, var(--bg) 35%, transparent);
			z-index: 102;
			transition: backdrop-filter .65s var(--animation) 0.35s, background-color .65s var(--animation) 0.35s;

			@starting-style {
	      backdrop-filter: blur(2.5rem);
  			background-color: color-mix(in srgb, var(--bg) 80%, transparent);
			}
		}

		.main {
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 103;
		}

		.container {
			backdrop-filter: blur(0.5vw);
			background-color: color-mix(in srgb, var(--bg) 80%, transparent);
      box-shadow: 0px 0px 20px color-mix(in srgb, var(--surface0) 40%, transparent);
			width: min(40rem, 100%);
			margin: 0 1rem;
			padding: 1.3em;
			border-radius: 1.5rem;

			color: var(--fg);

			display: flex;
			flex-direction: column;
			gap: 0.5rem;

			opacity: 1;
			transform: translateY(0vh) rotate3d(1, 0, 0, 0);
			transition: opacity .65s var(--animation) 0.35s, transform .65s var(--animation) 0.35s;
			transform-origin: 50% 0%;
			perspective: 1250px;

			@starting-style {
			  opacity: 0;
				transform: translateY(5vh) rotate3d(1, 0, 0, 15deg);
			}
		}

		.logo {
			display: flex;
			justify-content: center;
		}

		.step {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
		}
	`;
	if (initialHasContent) {
		if (initialIsPatched) {
			queueMicrotask(() => this["on:next"](false));
		} else {
			this.start();
			this.next = "patch";
		}
	} else {
		this.next = serverArchiveAvailable ? "intro" : "missing";
	}

	return (
		<div>
			<img alt="Splash image" class="splash" src="./splash.webp" />
			<div class="blur" />
			<div class="main">
				<div class="container">
					<div class="logo">
						<Logo />
					</div>
					{use(this.next, (x) => {
						if (x === "intro") {
							return (
								<div class="step">
									<Button
										type="primary"
										icon="left"
										disabled={false}
										on:click={() => (this.next = "server")}
									>
										<Icon icon={iconDownload} />
										Initialize
									</Button>
								</div>
							);
						} else if (x === "server") {
							return (
								<ServerExtract
									on:done={(patched) => {
										if (patched) {
											this["on:next"](true);
										} else {
											this.start();
											this.next = "patch";
										}
									}}
								/>
							);
						} else if (x === "patch") {
							return <Patch on:done={() => this["on:next"](true)} />;
						} else if (x === "missing") {
							return (
								<div class="step">
									<div class="error">
										No game archive was found on this server. Looked for{" "}
										{SERVER_ARCHIVE_CANDIDATES.join(", ")}.
									</div>
								</div>
							);
						}
					})}
				</div>
			</div>
		</div>
	);
};
