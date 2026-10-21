{ pkgs, config, ... }:

let
  # Prebuilt .NET/WASM runtime from upstream CI. It must match the frontend
  # source, so bump this together with the checked out commit.
  frameworkRelease = "https://github.com/MercuryWorkshop/celeste-wasm/releases/download/latest/webleste-loader.tar.zst";
in
{
  packages = with pkgs; [
    nodejs_22
    pnpm
    zstd
    curl
    gnutar
    gzip
  ];

  env = {
    # holds celeste.tar(.gz); kept out of frontend/dist, which vite wipes on build
    CELESTE_GAME_DIR = "${config.devenv.root}/game";
    CELESTE_PORT = "8947";
  };

  scripts = {
    fetch-framework.description = "Download the prebuilt _framework (dotnet runtime + game loader) from the upstream release";
    fetch-framework.exec = ''
      set -euo pipefail
      tmp=$(mktemp -d)
      trap 'rm -rf "$tmp"' EXIT
      curl -fL --progress-bar -o "$tmp/release.tar.zst" ${frameworkRelease}
      tar -C "$tmp" -xf "$tmp/release.tar.zst" ./_framework
      rm -rf "$DEVENV_ROOT/frontend/public/_framework"
      mv "$tmp/_framework" "$DEVENV_ROOT/frontend/public/_framework"
      echo "installed frontend/public/_framework"
    '';

    build-site.description = "Build the frontend into frontend/dist (fetches _framework if missing)";
    build-site.exec = ''
      set -euo pipefail
      cd "$DEVENV_ROOT"
      [ -f frontend/public/_framework/dotnet.js ] || fetch-framework
      pnpm install --frozen-lockfile
      pnpm build
      link-archives
      echo "built frontend/dist"
    '';

    link-archives.description = "Link game/celeste.tar(.gz) into frontend/dist, where the loader looks for them";
    link-archives.exec = ''
      set -euo pipefail
      cd "$DEVENV_ROOT"
      for f in celeste.tar.gz celeste.tar; do
        rm -f "frontend/dist/$f"
        if [ -f "$CELESTE_GAME_DIR/$f" ]; then
          ln -s "$CELESTE_GAME_DIR/$f" "frontend/dist/$f"
        fi
      done
      # the loader prefers the .gz, so a stale one would shadow a newer .tar
      if [ "$CELESTE_GAME_DIR/celeste.tar" -nt "$CELESTE_GAME_DIR/celeste.tar.gz" ] && [ -f "$CELESTE_GAME_DIR/celeste.tar.gz" ]; then
        echo "warning: game/celeste.tar is newer than game/celeste.tar.gz; run compress-archive" >&2
      fi
    '';

    compress-archive.description = "gzip game/celeste.tar into game/celeste.tar.gz (served in preference to the .tar)";
    compress-archive.exec = ''
      set -euo pipefail
      cd "$CELESTE_GAME_DIR"
      # write to a temp name so a half-written .gz is never served
      gzip -6 -c celeste.tar > celeste.tar.gz.tmp
      mv celeste.tar.gz.tmp celeste.tar.gz
      ls -lh celeste.tar celeste.tar.gz
    '';

    make-archive.description = "make-archive <celeste install dir>: pack Content/ and Celeste.exe into game/celeste.tar";
    make-archive.exec = ''
      set -euo pipefail
      src=''${1:?usage: make-archive <celeste install dir, e.g. ~/.steam/root/steamapps/common/Celeste>}
      mkdir -p "$CELESTE_GAME_DIR"
      # Everest installs keep the vanilla exe in orig/
      exe=Celeste.exe
      [ -f "$src/orig/Celeste.exe" ] && exe=orig/Celeste.exe
      tar -C "$src" -cf "$CELESTE_GAME_DIR/celeste.tar" Content \
        --transform 's|^orig/Celeste.exe$|Celeste.exe|' "$exe"
      compress-archive
    '';

    serve-site.description = "Serve frontend/dist on http://localhost:$CELESTE_PORT (with the COOP/COEP headers the game needs)";
    serve-site.exec = ''
      set -euo pipefail
      cd "$DEVENV_ROOT"
      link-archives
      exec pnpm exec vite preview --host --port "$CELESTE_PORT" --strictPort
    '';
  };

  # `devenv up` runs the local server
  processes.site.exec = "serve-site";

  enterShell = ''
    echo "celeste-wasm self-host shell"
    echo "  build-site        build frontend/dist"
    echo "  make-archive DIR  pack a Celeste install into game/celeste.tar(.gz)"
    echo "  compress-archive  gzip game/celeste.tar after replacing it"
    echo "  serve-site        serve on http://localhost:$CELESTE_PORT (or: devenv up)"
  '';
}
