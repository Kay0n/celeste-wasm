{
  lib,
  stdenvNoCC,
  fetchurl,
  fetchPnpmDeps,
  pnpmConfigHook,
  pnpm,
  nodejs,
  zstd,
}:
let
  root = ../.;
  fs = lib.fileset;
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "celeste-wasm";
  version = "0-unstable";

  src = fs.toSource {
    inherit root;
    fileset = fs.difference (fs.unions [
      ../package.json
      ../pnpm-lock.yaml
      ../pnpm-workspace.yaml
      ../vite.config.ts
      ../frontend/index.html
      ../frontend/tsconfig.json
      ../frontend/src
      ../frontend/public
    ]) (fs.maybeMissing ../frontend/public/_framework);
  };

  # The .NET runtime and game loader. Building it needs the patched emsdk and
  # wasm workload (see the Makefile), so it's built outside Nix and published
  # as a release asset. To update: rebuild, pack frontend/public/_framework
  # into framework.tar.zst, upload it under a new tag and change url and hash.
  framework = fetchurl {
    url = "https://github.com/Kay0n/celeste-wasm/releases/download/framework-f77ef07/framework.tar.zst";
    hash = "sha256-zOWYd/vmR2im/p6cJa7/PLBpmhHUPlysAJMLjyu9VFs=";
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    fetcherVersion = 4;
    # update after changing pnpm-lock.yaml: set to "" and copy the hash from the error
    hash = "sha256-CEeu2o5TW7TKOQ3s7nuEo+eKek3MPMqgW9lTXuNrTNQ=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
    zstd
  ];

  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    cp -r frontend/dist $out
    tar --zstd -xf $framework -C $out
    # served precompressed, so the 100MB wasm isn't compressed on every request
    find $out/_framework $out/assets -type f -size +1k | while read -r f; do
      zstd -q -19 -T$NIX_BUILD_CORES "$f" -o "$f.zst"
      gzip -9 -k "$f"
    done
    runHook postInstall
  '';
})
