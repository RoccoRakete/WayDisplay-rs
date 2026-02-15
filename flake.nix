{
  description = "Tauri development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
    utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      rust-overlay,
      utils,
    }:
    utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        nativeBuildInputs =
          with pkgs;
          [
            pkg-config
            copyDesktopItems
            xdg-utils
          ]
          ++ [
            (pkgs.rust-bin.stable.latest.default.override {
              extensions = [
                "rust-src"
                "rust-analyzer"
              ];
            })
          ];

        runtimeLibs = with pkgs; [
          webkitgtk_4_1
          gtk3
          cairo
          gdk-pixbuf
          glib
          dbus
          openssl
          librsvg
          libxml2
          cargo-tauri
          xdg-utils
        ];

        buildInputs =
          with pkgs;
          [
            bun
            webkitgtk_4_1
            librsvg
            rustc
            cargo-tauri
            nodejs_22
            libsoup_3
            xdg-utils
          ]
          ++ runtimeLibs;

        # Standard development shell for normal 'dev' commands
        standardShell = pkgs.mkShell {
          inherit nativeBuildInputs buildInputs;
          shellHook = ''
            # We use a more robust way to set the library path
            export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath runtimeLibs}:$LD_LIBRARY_PATH
            export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig:$PKG_CONFIG_PATH"
            export XDG_DATA_DIRS=${pkgs.gsettings-desktop-schemas}/share/gsettings-data-convert:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS

            # NEU: Installiere tauri-cli falls nicht vorhanden
            if ! command -v tauri &> /dev/null; then
              echo "Installing tauri-cli..."
              cargo install tauri-cli --locked
            fi

            echo "Standard environment ready. Try running 'bun run tauri dev' now."
          '';
        };

        # FHS environment specifically for faking standard Linux paths during AppImage bundling
        fhsShell = pkgs.buildFHSUserEnv {
          name = "tauri-fhs-env";
          targetPkgs = pkgs: nativeBuildInputs ++ buildInputs;
          profile = ''
            export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath runtimeLibs}:$LD_LIBRARY_PATH
            export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig:$PKG_CONFIG_PATH"
            export XDG_DATA_DIRS=${pkgs.gsettings-desktop-schemas}/share/gsettings-data-convert:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS

            # NEU: Installiere tauri-cli falls nicht vorhanden
            if ! command -v tauri &> /dev/null; then
              echo "Installing tauri-cli..."
              cargo install tauri-cli --locked
            fi

            echo "FHS Environment ready. /usr/bin/xdg-open now exists! Run 'bun run tauri build' to generate the AppImage."
          '';
          runScript = "bash";
        };
      in
      {
        devShells = {
          default = standardShell;
          fhs = fhsShell.env;
        };
      }
    );
}
