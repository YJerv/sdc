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

**Create drawing** makes an A3 landscape sheet in third-angle projection: front, top above the front, right side to the right, and an isometric view. Choose which face is the front, and rotate it by 90° before generating. The preview zooms and pans. Export PNG and Export PDF run on this device and are free for now; `js/export-policy.js` is the hook for a later one-off unlock.

The layout is meant for a phone as well as a desktop, including Chrome on Android. Use the theme button, or leave it to follow the system.

## Tests

```bash
npm install
npm test
```

The tests load every file in `test/fixtures`. One checks that occt-import-js returns meshes and a sensible bounding box. The other builds an A3 drawing and checks the four views, the scale, the overall dimensions and that dimension text does not overlap.

## Static hosting

The site is plain HTML, CSS, and JavaScript, plus the vendored reader and three.js. It can be published with GitHub Pages from the repository root. This change does not turn Pages on.

A commit can be previewed without Pages, for example:

`https://raw.githack.com/YJerv/sdc/<commit>/index.html`

## Android later

The web app is a PWA (manifest, icons, and a service worker) so it can later be wrapped as a Trusted Web Activity. The intended application id is `uk.co.yjerv.sdc`.

## Libraries

- [three.js](https://github.com/mrdoob/three.js) 0.170.0, MIT. Copies are in `vendor/three`.
- occt-import-js 0.0.23, GNU LGPL-2.1 (this is the licence the package publishes; it binds Open CASCADE). Copies and the licence texts are in `vendor/occt-import-js`. The JavaScript file has one added line, `export default occtimportjs;`, so the browser can load it as a module. The WebAssembly file is unchanged. See `vendor/occt-import-js/NOTICE.txt`.

Diameters and radii are recognised by fitting each face of that mesh (plane, cylinder, cone, circle) and snapping a length when it is already within 0.15 mm of a sensible value. A full Open CASCADE WASM build that could read the analytic surfaces directly is about 49 MB (about 9 MB compressed) and was not added.
