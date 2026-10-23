STATICS_RELEASE=5ca6e290-3dbe-49dd-b7f8-647e3af0a709
DOTNETFLAGS=--nodereuse:false -v n

statics:
	mkdir statics
	wget https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/FAudio.a -O statics/FAudio.a
	wget https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/FNA3D.a -O statics/FNA3D.a
	wget https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/libmojoshader.a -O statics/libmojoshader.a
	wget https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/SDL3.a -O statics/SDL3.a
	wget https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/liba.o -O statics/liba.o
	wget https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/hot_reload_detour.o -O statics/hot_reload_detour.o
	wget https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/dotnet.zip -O statics/dotnet.zip
	wget https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/emsdk.zip -O statics/emsdk.zip

FNA:
	git clone https://github.com/FNA-XNA/FNA --recursive -b 25.11

NLua:
	git clone https://github.com/EverestAPI/NLua --recursive
	cd NLua && git apply ../nlua.patch

MonoMod:
	git clone https://github.com/r58Playz/MonoMod --recursive
	cd MonoMod && git reset --hard 8e904f7979c9423982c1f786ba57fdb22a5556d2

dotnetclean:
	rm -rvf {loader,patcher,corefier,Steamworks}/{bin,obj} frontend/public/_framework || true
clean: dotnetclean
	rm -rvf statics MonoMod NLua FNA || true

deps: statics FNA MonoMod NLua

build: deps
	pnpm i
	rm -r frontend/public/_framework loader/bin/Release/net10.0/publish/wwwroot/_framework statics/{dotnet,emsdk} || true
	unzip -q -o statics/dotnet.zip -d statics/dotnet
	unzip -q -o statics/emsdk.zip -d statics/
	dotnet publish loader -c Release $(DOTNETFLAGS)
	cp -r loader/bin/Release/net10.0/publish/wwwroot/_framework frontend/public/
	# emscripten sucks
	sed -i 's/var offscreenCanvases \?= \?{};/var offscreenCanvases={};if(globalThis.window\&\&!window.TRANSFERRED_CANVAS){transferredCanvasNames=[".canvas"];window.TRANSFERRED_CANVAS=true;}/' frontend/public/_framework/dotnet.native.*.js
	# read OPFS files through sync access handles instead of Blobs (Firefox)
	sed -i -e '/^var wasmImports = {/,/^};/{/^};/r loader/opfs-sync-read.js' -e '}' frontend/public/_framework/dotnet.native.*.js
	# dotnet messed up
	sed -i 's/this.appendULeb(32768)/this.appendULeb(65535)/' frontend/public/_framework/dotnet.runtime.*.js
	# fmod messed up
	sed -i 's/return runEmAsmFunction(code, sigPtr, argbuf);/return runMainThreadEmAsm(code, sigPtr, argbuf, 1);/' frontend/public/_framework/dotnet.native.*.js
	# SDL's EM_JS gamepad helpers call navigator.getGamepads(), which workers don't have, so run them on the main thread
	sed -i -E 's/^function (SDL_GetEmscriptenJoystickVendor|SDL_GetEmscriptenJoystickProduct|SDL_IsEmscriptenJoystickXInput)\(device_index\) \{/&if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(proxiedFunctionTable.indexOf(\1),0,1,device_index);/; s/^(var proxiedFunctionTable = \[.*) \];$$/\1, SDL_GetEmscriptenJoystickVendor, SDL_GetEmscriptenJoystickProduct, SDL_IsEmscriptenJoystickXInput ];/' frontend/public/_framework/dotnet.native.*.js
	# the seds above change files whose names hash their old contents, and _framework
	# is served as immutable, so rename them to match what they contain now
	cd frontend/public/_framework && for f in dotnet.native.*.js dotnet.runtime.*.js; do \
		n=$$(echo $$f | cut -d. -f1-2).$$(sha256sum $$f | cut -c1-10).js; \
		mv $$f $$n && sed -i "s/\"$$f\"/\"$$n\"/" dotnet.js; \
	done
	cd frontend/public/_framework && split -b20M -d -a1 dotnet.native.*.wasm dotnet.native.*.wasm && rm dotnet.native.*.wasm

serve: build
	pnpm dev

publish: build
	pnpm build


.PHONY: clean build serve publish
