// Unpacks a tar into OPFS off the main thread (see extractTar in fs.tsx).
//
// The main thread posts { folder } once, then { chunk } for each piece of the
// archive and { end } when the stream is done. Every chunk is acked once it
// has been consumed so the sender can bound how much is buffered here.
//
// File data is written with sync access handles, which skip the swap file
// createWritable() goes through and are much faster for many small files.

type Writer = {
	write(data: Uint8Array): void | Promise<void>;
	close(): void | Promise<void>;
};

const queue: Uint8Array[] = [];
let ended = false;
let notify: (() => void) | null = null;

let current: Uint8Array | null = null;
let pos = 0;

// next slice of the archive, at most `max` bytes, or null at end of stream
async function nextBytes(max: number): Promise<Uint8Array | null> {
	while (!current || pos >= current.byteLength) {
		if (current) {
			self.postMessage({ ack: current.byteLength });
			current = null;
		}
		if (queue.length) {
			current = queue.shift()!;
			pos = 0;
			continue;
		}
		if (ended) return null;
		await new Promise<void>((r) => (notify = r));
	}
	const n = Math.min(max, current.byteLength - pos);
	const out = current.subarray(pos, pos + n);
	pos += n;
	return out;
}

async function readExact(n: number): Promise<Uint8Array | null> {
	const out = new Uint8Array(n);
	let got = 0;
	while (got < n) {
		const bytes = await nextBytes(n - got);
		if (!bytes) {
			if (got === 0) return null;
			throw new Error("tar archive is truncated");
		}
		out.set(bytes, got);
		got += bytes.byteLength;
	}
	return out;
}

async function copy(n: number, writer: Writer | null) {
	while (n > 0) {
		const bytes = await nextBytes(n);
		if (!bytes) throw new Error("tar archive is truncated");
		if (writer) await writer.write(bytes);
		n -= bytes.byteLength;
	}
}

const decoder = new TextDecoder();
const str = (b: Uint8Array, start: number, len: number) => {
	let end = b.indexOf(0, start);
	if (end < 0 || end > start + len) end = start + len;
	return decoder.decode(b.subarray(start, end));
};
const num = (b: Uint8Array, start: number, len: number) => {
	// GNU base-256 encoding for sizes that don't fit in octal
	if (b[start] & 0x80) {
		let v = 0;
		for (let i = start + 1; i < start + len; i++) v = v * 256 + b[i];
		return v;
	}
	return parseInt(str(b, start, len).trim() || "0", 8);
};

// PAX records look like "<len> <key>=<value>\n"
function paxPath(data: Uint8Array): string | null {
	let path: string | null = null;
	let i = 0;
	while (i < data.byteLength) {
		const space = data.indexOf(0x20, i);
		if (space < 0) break;
		const len = parseInt(decoder.decode(data.subarray(i, space)));
		if (!len) break;
		const record = decoder.decode(data.subarray(space + 1, i + len - 1));
		const eq = record.indexOf("=");
		if (record.slice(0, eq) === "path") path = record.slice(eq + 1);
		i += len;
	}
	return path;
}

async function openWriter(file: FileSystemFileHandle): Promise<Writer> {
	try {
		const handle = await file.createSyncAccessHandle();
		handle.truncate(0);
		let at = 0;
		return {
			write(data) {
				let off = 0;
				while (off < data.byteLength)
					off += handle.write(data.subarray(off), { at: at + off });
				at += data.byteLength;
			},
			close() {
				handle.flush();
				handle.close();
			},
		};
	} catch {
		// browsers without sync access handles
		const writable = await file.createWritable();
		return {
			write: (data) => writable.write(data),
			close: () => writable.close(),
		};
	}
}

async function extract(folder: FileSystemDirectoryHandle) {
	const dirs = new Map<string, Promise<FileSystemDirectoryHandle>>();
	const getDir = (parts: string[]): Promise<FileSystemDirectoryHandle> => {
		if (parts.length === 0) return Promise.resolve(folder);
		const key = parts.join("/");
		let dir = dirs.get(key);
		if (!dir) {
			dir = getDir(parts.slice(0, -1)).then((parent) =>
				parent.getDirectoryHandle(parts.at(-1)!, { create: true })
			);
			dirs.set(key, dir);
		}
		return dir;
	};

	let longName: string | null = null;
	while (true) {
		const header = await readExact(512);
		if (!header || header.every((x) => x === 0)) break;

		const size = num(header, 124, 12);
		const padding = (512 - (size % 512)) % 512;
		const type = String.fromCharCode(header[156] || 0x30);
		let name = str(header, 0, 100);
		if (str(header, 257, 5) === "ustar") {
			const prefix = str(header, 345, 155);
			if (prefix) name = prefix + "/" + name;
		}

		// GNU long name / PAX header: applies to the next entry
		if (type === "L" || type === "x") {
			const data = (await readExact(size))!;
			await copy(padding, null);
			longName = type === "L" ? str(data, 0, size) : (paxPath(data) ?? longName);
			continue;
		}
		if (longName !== null) {
			name = longName;
			longName = null;
		}

		const parts = name.split("/").filter((x) => x && x !== ".");
		if (parts[0] === folder.name) parts.shift();
		const isDir = type === "5" || (type === "0" && name.endsWith("/"));
		const isFile = !isDir && (type === "0" || type === "7");

		if (parts.length === 0 || !(isDir || isFile)) {
			await copy(size + padding, null);
		} else if (isDir) {
			await getDir(parts);
			await copy(size + padding, null);
			self.postMessage({ entry: { type: "directory", name: parts.at(-1) } });
		} else {
			const dir = await getDir(parts.slice(0, -1));
			const file = await dir.getFileHandle(parts.at(-1)!, { create: true });
			const writer = await openWriter(file);
			await copy(size, writer);
			await writer.close();
			await copy(padding, null);
			self.postMessage({ entry: { type: "file", name: parts.at(-1) } });
		}
	}

	// drain trailing zero blocks so the sender sees every chunk acked
	while (await nextBytes(Infinity));
}

self.onmessage = ({ data }) => {
	if (data.folder) {
		extract(data.folder).then(
			() => self.postMessage({ done: true }),
			(err) => self.postMessage({ error: String(err?.stack ?? err) })
		);
	} else if (data.chunk) {
		queue.push(data.chunk);
	} else if (data.end) {
		ended = true;
	}
	notify?.();
	notify = null;
};
