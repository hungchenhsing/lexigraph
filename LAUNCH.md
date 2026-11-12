# Lexigraph — local launch

These steps run a built copy on Windows. Development commands (`npm run dev`, tests, typecheck) are in the README. The reader UI is in Traditional Chinese.

## First time

1. Install [Node.js 20+](https://nodejs.org/).
2. Double-click `setup.bat` in this folder.

`setup.bat` installs dependencies and writes the site to `dist/`.

## Open the app

Double-click `Lexigraph.bat`.

It starts a preview server at `http://127.0.0.1:5173` and opens a Chrome window. Closing that window leaves the server running. Stop it by closing the minimized "Lexigraph Server" command window.

`Lexigraph.vbs` does the same thing without a command window. If it fails with no message, run `Lexigraph-debug.bat` or `Lexigraph.bat` from a command prompt.

## Desktop shortcut

1. Right-click `Lexigraph.bat` → **Send to** → **Desktop (create shortcut)**.
2. Optional: shortcut → **Properties** → **Change Icon**, and pick `public/icon.svg` or any `.ico` file.

## Chrome app window

With the preview server running, use the install icon in the address bar, or the Chrome menu → **Install Lexigraph**. The installed window still needs `Lexigraph.bat` (or `Lexigraph.vbs`) to start the server.

## Dictionary

The glossary is `public/dict/ecdict-core.json.gz`. The browser downloads it once, after the first screen, and then keeps it locally.

## After you update the code

Run `setup.bat` again, then `Lexigraph.bat`.

## Port already in use

The preview uses port 5173. If that port is taken, change both `5173` entries in `Lexigraph.bat` (the preview `--port` and the Chrome URL) to a free port such as `5174`. Do the same in `Lexigraph.vbs` if you use that launcher.

## If the window does not open

- `dist/index.html` is missing until `setup.bat` finishes.
- `npx` missing means Node.js is not installed or not on `PATH`.
- Without Chrome, the script opens the default browser instead.
