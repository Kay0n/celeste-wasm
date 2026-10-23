self:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.celeste-wasm;
  site = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
  # A private Caddy instance, separate from services.caddy. Reverse proxying
  # and TLS are left to whatever sits in front of it.
  caddyfile = pkgs.writeText "Caddyfile" ''
    {
      admin off
      auto_https off
      persist_config off
    }

    # any host name, since the proxy in front decides which requests get here
    http://:${toString cfg.port} {
      bind 127.0.0.1

      header {
        # the game uses threads, which browsers only allow with these
        Cross-Origin-Opener-Policy same-origin
        Cross-Origin-Embedder-Policy require-corp
        ?Cache-Control no-cache
      }

      # file names change with their contents, except dotnet.js
      @immutable {
        path /assets/* /_framework/*
        not path /_framework/dotnet.js
      }
      header @immutable Cache-Control "public, max-age=31536000, immutable"

      # the game archive isn't in the store
      @archive path /celeste.tar.gz /celeste.tar
      handle @archive {
        root * "${cfg.archiveDir}"
        file_server
      }

      handle {
        root * ${site}
        file_server {
          precompressed zstd gzip
        }
      }
    }
  '';
in
{
  options.services.celeste-wasm = {
    enable = lib.mkEnableOption "the Celeste web port";

    archiveDir = lib.mkOption {
      type = lib.types.str;
      example = "/var/lib/celeste-wasm";
      description = ''
        Directory holding the game archive, `celeste.tar.gz` and/or
        `celeste.tar` (see `make-archive` in devenv.nix). It must be readable
        by the service, which runs as a dynamic user.
      '';
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8947;
      description = "Port to serve the site on, on 127.0.0.1.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.celeste-wasm = {
      description = "Celeste web port";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      serviceConfig = {
        ExecStart = "${lib.getExe pkgs.caddy} run --adapter caddyfile --config ${caddyfile}";
        DynamicUser = true;
        # caddy keeps some state even with nothing to persist
        RuntimeDirectory = "celeste-wasm";
        Environment = [
          "XDG_DATA_HOME=/run/celeste-wasm"
          "XDG_CONFIG_HOME=/run/celeste-wasm"
        ];
        Restart = "on-failure";

        CapabilityBoundingSet = "";
        LockPersonality = true;
        MemoryDenyWriteExecute = true;
        NoNewPrivileges = true;
        PrivateDevices = true;
        ProtectClock = true;
        ProtectControlGroups = true;
        ProtectHostname = true;
        ProtectKernelLogs = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectProc = "invisible";
        RestrictAddressFamilies = [
          "AF_INET"
          "AF_INET6"
        ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        SystemCallArchitectures = "native";
      };
    };
  };
}
