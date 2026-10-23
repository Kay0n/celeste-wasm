// Spliced into dotnet.native.js after wasmImports by the Makefile.
// WasmFS opens read-only OPFS files as Blobs. In Firefox, reading such a Blob
// from a worker (blob.slice().arrayBuffer()) can hang while the page's main
// thread is blocked, which deadlocks the tab during content loading. This
// serves those opens from a sync access handle instead, behind the same
// size/slice/arrayBuffer interface read_blob uses, and falls back to a real
// Blob when the handle can't be taken (e.g. the file is already open).
(() => {
	const openBlob = wasmImports["_wasmfs_opfs_open_blob"];
	const closeBlob = wasmImports["_wasmfs_opfs_close_blob"];
	if (!openBlob || !closeBlob) return;
	const handles = new Map();
	const tryOpen = async (fileHandle) => {
		try {
			return await fileHandle.createSyncAccessHandle({ mode: "read-only" });
		} catch {}
		try {
			return await fileHandle.createSyncAccessHandle();
		} catch {}
		return null;
	};
	wasmImports["_wasmfs_opfs_open_blob"] = async function (ctx, fileID, blobIDPtr) {
		const access = await tryOpen(wasmfsOPFSFileHandles.get(fileID));
		if (!access) return openBlob(ctx, fileID, blobIDPtr);
		const size = access.getSize();
		const blob = {
			size,
			slice: (start, end) => ({
				arrayBuffer: async () => {
					const buf = new Uint8Array(Math.max(0, Math.min(end, size) - start));
					const n = access.read(buf, { at: start });
					return buf.buffer.slice(0, n);
				},
			}),
		};
		const blobID = wasmfsOPFSBlobs.allocate(blob);
		handles.set(blobID, access);
		GROWABLE_HEAP_I32()[(blobIDPtr >>> 0) >>> 2] = blobID;
		wasmfsOPFSProxyFinish(ctx >>> 0);
	};
	wasmImports["_wasmfs_opfs_close_blob"] = function (blobID) {
		const access = handles.get(blobID);
		if (access) {
			handles.delete(blobID);
			try {
				access.close();
			} catch {}
		}
		return closeBlob(blobID);
	};
})();
