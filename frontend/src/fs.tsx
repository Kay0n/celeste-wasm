import tar, { Headers as TarHeaders, Pack } from "tar-stream";
import {
	toWeb as streamToWeb,
	/* @ts-expect-error */
} from "streamx-webstream";
import XXH64Worker from "./xxh64.worker?worker";
import ExtractWorker from "./extract.worker?worker";

export const rootFolder = await navigator.storage.getDirectory();

// Archives are built here and downloaded through a blob URL. It can't be
// deleted until the download has finished reading it, so clean it up on the
// next page load instead.
const ARCHIVE_TEMP = ".archive-download.tar";
await rootFolder.removeEntry(ARCHIVE_TEMP).catch(() => {});

export async function calculateXXH64(path: string): Promise<string> {
	let split = path.split("/");
	let dir = await recursiveGetDirectory(rootFolder, split.slice(0, -1));
	let file = await dir.getFileHandle(split.at(-1)!);
	let buf = await file.getFile().then((r) => r.arrayBuffer());

	let worker = new XXH64Worker({ name: `xxh64-${path}` });
	let promise = new Promise<string>((res, rej) => {
		worker.onmessage = ({ data }) => res(data.digest);
		worker.onerror = (x) => rej(new Error(`failed to hash: ${x}`));
	});
	worker.postMessage({ buf }, [buf]);
	let res = await promise;
	worker.terminate();

	return res;
}
export async function calculateCelesteHash(): Promise<string> {
	return await calculateXXH64("CustomCeleste.dll");
}

export async function replaceHashes(hash: string) {
	const cacheDir = await recursiveGetDirectory(rootFolder, [
		"Celeste",
		"Mods",
		"Cache",
	]);
	for await (const [name, file] of cacheDir) {
		if (!name.endsWith(".sum") || file.kind !== "file") continue;

		const contents = await file.getFile().then((r) => r.text());
		const split = contents.split("\n");

		const old = split[0];
		split[0] = hash;

		const writable = await file.createWritable();
		await writable.write(split.join("\n"));
		await writable.close();
		console.debug(`replaced "${name}": "${old}" -> "${split[0]}"`);
	}
}
(self as any).calculateCelesteHash = calculateCelesteHash;
(self as any).replaceHashes = replaceHashes;

export async function hasContent(): Promise<boolean> {
	try {
		const directory = await rootFolder.getDirectoryHandle("Content", {
			create: false,
		});
		for (const child of [
			"Dialog",
			"Effects",
			"FMOD",
			"Graphics",
			"Maps",
			"Monocle",
			"Overworld",
			"Tutorials",
		]) {
			try {
				await directory.getDirectoryHandle(child, { create: false });
			} catch {
				return false;
			}
		}
		return true;
	} catch {
		return false;
	}
}

async function createEntry(
	pack: Pack,
	header: TarHeaders,
	file?: ReadableStream<Uint8Array>
) {
	let resolve: () => void = null!;
	let reject: (err: any) => void = null!;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	const entry = pack.entry(header, (err) => {
		if (err) reject(err);
		else resolve();
	});

	if (file) {
		const reader = file.getReader();
		while (true) {
			const { value, done } = await reader.read();
			if (done || !value) break;

			entry.write(value);
		}

		entry.end();
	} else {
		entry.end();
	}

	await promise;
}

function createTar(
	folder: FileSystemDirectoryHandle,
	callback?: (type: "directory" | "file", name: string) => void
): ReadableStream {
	const archive = tar.pack();

	async function pack(pathPrefix: string, folder: FileSystemDirectoryHandle) {
		for await (const [name, entry] of folder) {
			if (name === ARCHIVE_TEMP) continue;
			if (callback) callback(entry.kind, name);

			if (entry.kind == "file") {
				const file = await entry.getFile();
				const stream = file.stream();

				await createEntry(
					archive,
					{
						name: pathPrefix + name,
						type: entry.kind,
						size: file.size,
					},
					stream
				);
			} else {
				await createEntry(archive, {
					name: pathPrefix + name,
					type: entry.kind,
				});

				await pack(pathPrefix + name + "/", entry);
			}
		}
	}
	pack("", folder).then(() => archive.finalize());

	return streamToWeb(archive);
}

// Bytes of the archive allowed to sit unwritten in the extract worker. Lets
// the download run ahead of disk writes without buffering the whole thing.
const EXTRACT_MAX_IN_FLIGHT = 32 * 1024 * 1024;

export async function extractTar(
	stream: ReadableStream<Uint8Array>,
	folder: FileSystemDirectoryHandle,
	callback?: (type: "directory" | "file", name: string) => void
) {
	const worker = new ExtractWorker({ name: "extract-tar" });
	const reader = stream.getReader();
	let inFlight = 0;
	let wake: (() => void) | null = null;

	try {
		await new Promise<void>((res, rej) => {
			worker.onmessage = ({ data }) => {
				if (data.ack) {
					inFlight -= data.ack;
					wake?.();
					wake = null;
				} else if (data.entry) {
					callback?.(data.entry.type, data.entry.name);
				} else if (data.done) {
					res();
				} else if (data.error) {
					rej(new Error(`failed to extract archive: ${data.error}`));
				}
			};
			worker.onerror = (e) =>
				rej(new Error(`extract worker failed: ${e.message}`));

			worker.postMessage({ folder });
			(async () => {
				while (true) {
					while (inFlight > EXTRACT_MAX_IN_FLIGHT)
						await new Promise<void>((r) => (wake = r));
					const { done, value } = await reader.read();
					if (done) break;
					// a view into a bigger buffer can't be transferred without
					// detaching the rest of it
					const chunk =
						value.byteOffset === 0 &&
						value.byteLength === value.buffer.byteLength
							? value
							: value.slice();
					inFlight += chunk.byteLength;
					worker.postMessage({ chunk }, [chunk.buffer]);
				}
				worker.postMessage({ end: true });
			})().catch(rej);
		});
	} catch (err) {
		reader.cancel(err).catch(() => {});
		throw err;
	} finally {
		worker.terminate();
	}
}

export async function recursiveGetDirectory(
	dir: FileSystemDirectoryHandle,
	path: string[]
): Promise<FileSystemDirectoryHandle> {
	if (path.length === 0) return dir;
	return recursiveGetDirectory(
		await dir.getDirectoryHandle(path[0]),
		path.slice(1)
	);
}

// Downloads the whole of browser storage as a .tar.gz, which can also be served
// as the game archive that gets extracted on first visit.
export async function downloadArchive() {
	const file = await rootFolder.getFileHandle(ARCHIVE_TEMP, { create: true });
	await createTar(rootFolder, (type, name) =>
		console.debug(`tarring ${type} ${name}`)
	)
		.pipeThrough(new CompressionStream("gzip"))
		.pipeTo(await file.createWritable());

	const url = URL.createObjectURL(await file.getFile());
	const a = document.createElement("a");
	a.href = url;
	a.download = "celeste.tar.gz";
	a.click();
}
