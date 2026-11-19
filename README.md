# STEP Drawing Creator (SDC)

Open your own STEP file, view it in 3D, and (in a later step) create a simple A3 orthographic drawing with key dimensions.

This step loads a `.step` or `.stp` file and shows it. The file is read in the browser with [occt-import-js](https://github.com/kovacsv/occt-import-js) (Open CASCADE, WebAssembly). Nothing is uploaded.

## Use it

Serve the folder over HTTP. Opening `index.html` as a file will not work, because the page uses ES modules and a worker.

```bash
python3 -m http.server 8080
```

Then open <http://127.0.0.1:8080>. Choose a STEP file, or drop one onto the page. Orbit with one finger or the left mouse button, pan with two fingers or the right button, and zoom with a pinch or the wheel. Fit, Front, Top, Right, and Iso frame the part. Sizes are millimetres, Z up.

Files of about 50 MB and above show a warning before they are read. They are still processed on the device.

**Create drawing** is present and switched off. Drawing sheets are the next step.

The layout is meant for a phone as well as a desktop, including Chrome on Android. Use the theme button, or leave it to follow the system.

## Tests

```bash
npm install
npm test
```

The test loads every file in `test/fixtures` with occt-import-js and checks that each one parses to at least one mesh and a sensible bounding box, in millimetres. It prints size and load time per file.

## Static hosting

The site is plain HTML, CSS, and JavaScript, plus the vendored reader and three.js. It can be published with GitHub Pages from the repository root. This change does not turn Pages on.

A commit can be previewed without Pages, for example:

`https://raw.githack.com/YJerv/sdc/<commit>/index.html`

## Android later

The web app is a PWA (manifest, icons, and a service worker) so it can later be wrapped as a Trusted Web Activity. The intended application id is `uk.co.yjerv.sdc`.

## Libraries

- [three.js](https://github.com/mrdoob/three.js) 0.170.0, MIT. Copies are in `vendor/three`.
- occt-import-js 0.0.23, GNU LGPL-2.1 (this is the licence the package publishes; it binds Open CASCADE). Copies and the licence texts are in `vendor/occt-import-js`. The JavaScript file has one added line, `export default occtimportjs;`, so the browser can load it as a module. The WebAssembly file is unchanged. See `vendor/occt-import-js/NOTICE.txt`.
