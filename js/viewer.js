import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { basisAlignedTo, basisForFront, basisFromUp, featureDirection, seatOnGrid } from './orient.js';
import { createTopArm } from './top-arm.js';

/**
 * Z-up, millimetres. Directions are from the part centre out to the camera.
 * Top sits a hair off the Z axis so lookAt stays stable; OrbitControls then
 * keeps the view on the pole.
 */
const VIEWS = {
  front: new THREE.Vector3(0, -1, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, -0.001, 1).normalize(),
  iso: new THREE.Vector3(1, -1, 1).normalize(),
};

const PALETTE = {
  light: { background: 0xe6e0d4, grid: 0xcfc6b6 },
  dark: { background: 0x14181d, grid: 0x323a44 },
};

const DEFAULT_COLOUR = [0.78, 0.75, 0.7];

export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
  camera.up.set(0, 0, 1);
  camera.position.set(80, -120, 70);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  scene.add(new THREE.HemisphereLight(0xf7f4ee, 0x8d8478, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(0.6, -1.1, 1.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd5deea, 0.4);
  fill.position.set(-1.4, 0.8, 0.3);
  scene.add(fill);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.85;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  controls.target.set(0, 0, 0);
  controls.update();

  const model = new THREE.Group();
  scene.add(model);

  let grid = null;
  let gridVisible = true;
  let theme = 'light';
  let needsRender = true;
  let disposed = false;
  let basis = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
  };
  const topArm = createTopArm();
  let onTopChosen = () => {};
  let alignArmed = false;
  let onAlignChosen = () => {};
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;

  function applyClear() {
    const colours = PALETTE[theme] || PALETTE.light;
    renderer.setClearColor(colours.background, 1);
    scene.background = new THREE.Color(colours.background);
    if (grid) tintGrid(grid, colours.grid);
    needsRender = true;
  }

  applyClear();

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 2 || height < 2) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    needsRender = true;
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);
  resize();

  function tick() {
    if (disposed) return;
    requestAnimationFrame(tick);
    const changed = controls.update();
    if (changed || needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  }
  tick();

  function disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      const materials = child.material
        ? (Array.isArray(child.material) ? child.material : [child.material])
        : [];
      for (const material of materials) material.dispose();
    });
  }

  function clearGroup() {
    while (model.children.length) {
      disposeObject(model.children.pop());
    }
    if (grid) {
      scene.remove(grid);
      disposeObject(grid);
      grid = null;
    }
  }

  function colourFrom(rgb, fallback) {
    const source = rgb && rgb.length >= 3 ? rgb : fallback;
    const colour = new THREE.Color();
    colour.setRGB(source[0], source[1], source[2], THREE.SRGBColorSpace);
    return colour;
  }

  function edgeColourFor(materials) {
    let luminance = 0;
    const list = materials.length ? materials : [];
    for (const material of list) {
      const { r, g, b } = material.color;
      luminance += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    luminance = list.length ? luminance / list.length : 0.5;
    return luminance < 0.28 ? 0xf4f0e6 : 0x1c2430;
  }

  function buildMesh(mesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(mesh.position), 3));
    if (mesh.normal && mesh.normal.length === mesh.position.length) {
      geometry.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(mesh.normal), 3));
    } else {
      geometry.computeVertexNormals();
    }
    const index = Uint32Array.from(mesh.index);
    geometry.setIndex(new THREE.BufferAttribute(index, 1));

    const fallback = mesh.color || DEFAULT_COLOUR;
    const materials = [
      new THREE.MeshPhongMaterial({
        color: colourFrom(fallback, DEFAULT_COLOUR),
        specular: new THREE.Color(0.12, 0.12, 0.12),
        shininess: 28,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    ];

    const edges = new THREE.Group();
    const faces = mesh.brep_faces || [];
    if (faces.length > 0) {
      for (const face of faces) {
        materials.push(new THREE.MeshPhongMaterial({
          color: colourFrom(face.color, fallback),
          specular: new THREE.Color(0.12, 0.12, 0.12),
          shininess: 28,
          side: THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        }));
      }
      const triangleCount = index.length / 3;
      let triangleIndex = 0;
      let faceIndex = 0;
      while (triangleIndex < triangleCount) {
        const firstIndex = triangleIndex;
        let lastIndex;
        let materialIndex;
        if (faceIndex >= faces.length) {
          lastIndex = triangleCount;
          materialIndex = 0;
        } else if (triangleIndex < faces[faceIndex].first) {
          lastIndex = faces[faceIndex].first;
          materialIndex = 0;
        } else {
          lastIndex = faces[faceIndex].last + 1;
          materialIndex = faceIndex + 1;
          faceIndex += 1;
        }
        if (lastIndex <= firstIndex) break;
        geometry.addGroup(firstIndex * 3, (lastIndex - firstIndex) * 3, materialIndex);
        const faceGeometry = new THREE.BufferGeometry();
        faceGeometry.setAttribute('position', geometry.getAttribute('position'));
        faceGeometry.setIndex(new THREE.BufferAttribute(index.slice(firstIndex * 3, lastIndex * 3), 1));
        // 180° keeps the outline of each B-rep face and drops the tessellation.
        const outline = new THREE.EdgesGeometry(faceGeometry, 180);
        edges.add(new THREE.LineSegments(outline, new THREE.LineBasicMaterial({ color: 0x1c2430 })));
        triangleIndex = lastIndex;
      }
    } else {
      const outline = new THREE.EdgesGeometry(geometry, 30);
      edges.add(new THREE.LineSegments(outline, new THREE.LineBasicMaterial({ color: 0x1c2430 })));
    }

    const surface = new THREE.Mesh(geometry, materials.length > 1 ? materials : materials[0]);
    surface.name = mesh.name || '';
    const ink = edgeColourFor(Array.isArray(surface.material) ? surface.material : [surface.material]);
    edges.traverse((object) => {
      if (object.material) object.material.color.setHex(ink);
    });
    edges.renderOrder = 2;

    let edgeCount = 0;
    edges.traverse((object) => {
      if (object.isLineSegments) {
        const position = object.geometry.getAttribute('position');
        edgeCount += position ? position.count / 2 : 0;
      }
    });

    const group = new THREE.Group();
    group.add(surface);
    group.add(edges);
    return { group, edgeCount };
  }

  function placeGrid(box) {
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.y, 1);
    const step = niceStep(span / 8);
    const extent = Math.max(step, Math.ceil((span * 1.4) / step) * step);
    const divisions = Math.max(2, Math.round(extent / step));
    const colours = PALETTE[theme] || PALETTE.light;
    grid = new THREE.GridHelper(extent, divisions, colours.grid, colours.grid);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(centre.x, centre.y, box.min.z);
    scene.add(grid);
  }

  function frame(direction) {
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.5);
    const aspect = Math.max(camera.aspect, 0.2);
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    const distance = (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.12;
    const offset = (direction || camera.position.clone().sub(controls.target)).clone();
    if (offset.lengthSq() < 1e-8) offset.copy(VIEWS.iso);
    offset.normalize();
    if (Math.abs(offset.dot(camera.up)) > 0.999) {
      offset.add(new THREE.Vector3(0, -0.001, 0)).normalize();
    }
    camera.position.copy(centre).addScaledVector(offset, distance);
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = distance * 40;
    camera.lookAt(centre);
    camera.updateProjectionMatrix();
    controls.target.copy(centre);
    controls.update();
    needsRender = true;
  }

  function localPoints() {
    const points = [];
    model.traverse((object) => {
      if (!object.isMesh) return;
      const position = object.geometry.getAttribute('position');
      if (!position) return;
      for (let i = 0; i < position.count; i += 1) {
        points.push([position.getX(i), position.getY(i), position.getZ(i)]);
      }
    });
    return points;
  }

  function rebuildGrid() {
    if (grid) {
      scene.remove(grid);
      grid.geometry.dispose();
      grid.material.dispose();
      grid = null;
    }
    if (!gridVisible) return;
    const box = new THREE.Box3().setFromObject(model);
    if (!box.isEmpty()) placeGrid(box);
  }

  function orientPart(next, viewName) {
    const points = localPoints();
    const translation = seatOnGrid(points, next);
    basis = next;
    const matrix = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...next.x),
      new THREE.Vector3(...next.y),
      new THREE.Vector3(...next.z),
    );
    matrix.invert();
    model.quaternion.setFromRotationMatrix(matrix);
    model.position.copy(new THREE.Vector3(...translation).applyQuaternion(model.quaternion));
    model.updateMatrixWorld(true);
    rebuildGrid();
    frame(VIEWS[viewName] || VIEWS.iso);
  }

  function setTopFromNormal(normal) {
    orientPart(basisFromUp([normal.x, normal.y, normal.z], localPoints()), 'top');
  }

  function setFrontFace(frontId, turns = 0) {
    orientPart(basisForFront(frontId, localPoints(), turns), 'front');
  }

  function setModel(result) {
    clearGroup();
    model.quaternion.identity();
    model.position.set(0, 0, 0);
    basis = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
    let edges = 0;
    for (const mesh of result.meshes || []) {
      if (!mesh.position?.length || !mesh.index?.length) continue;
      const built = buildMesh(mesh);
      model.add(built.group);
      edges += built.edgeCount;
    }
    if (localPoints().length) orientPart(basisForFront('negY', localPoints(), 0), 'iso');
    else frame(VIEWS.iso);
    return { edges };
  }

  function setTheme(next) {
    theme = next === 'dark' ? 'dark' : 'light';
    applyClear();
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
  });

  canvas.addEventListener('pointerdown', (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (moved > 8) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(model, true).find((item) => item.object.isMesh && item.face);
    if (!hit) return;
    if (alignArmed) {
      const samples = faceSamples(hit.object, hit.faceIndex);
      const direction = samples.normals.length
        ? featureDirection(samples.points, samples.normals)
        : [hit.face.normal.x, hit.face.normal.y, hit.face.normal.z];
      orientPart(basisAlignedTo(direction, localPoints()), 'iso');
      alignArmed = false;
      onAlignChosen();
      return;
    }
    if (!topArm.isArmed()) return;
    topArm.click();
    setTopFromNormal(hit.face.normal);
    onTopChosen();
  });

  return {
    setModel,
    setTheme,
    frame,
    getBasis: () => basis,
    setFrontFace,
    armTop() {
      topArm.arm();
    },
    cancelTop() {
      topArm.cancel();
    },
    isTopArmed() {
      return topArm.isArmed();
    },
    onTopChosen(listener) {
      onTopChosen = listener;
    },
    armAlign() {
      alignArmed = true;
      topArm.cancel();
    },
    cancelAlign() {
      alignArmed = false;
    },
    onAlignChosen(listener) {
      onAlignChosen = listener;
    },
    setGridVisible(visible) {
      gridVisible = Boolean(visible);
      if (!gridVisible && grid) {
        scene.remove(grid);
        grid.geometry.dispose();
        grid.material.dispose();
        grid = null;
      } else if (gridVisible) {
        rebuildGrid();
      }
      needsRender = true;
    },
    views: VIEWS,
    resize,
    dispose() {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      clearGroup();
      renderer.dispose();
    },
  };
}

function faceSamples(mesh, triangleIndex) {
  const geometry = mesh.geometry;
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  if (!index || !position || !Number.isFinite(triangleIndex)) return { points: [], normals: [] };
  const group = geometry.groups.find((item) => {
    const start = item.start / 3;
    return triangleIndex >= start && triangleIndex < start + item.count / 3;
  });
  const first = group ? group.start / 3 : triangleIndex;
  const count = group ? group.count / 3 : 1;
  const step = Math.max(1, Math.floor(count / 36));
  const points = [];
  const normals = [];
  for (let triangle = first; triangle < first + count; triangle += step) {
    const ids = [0, 1, 2].map((corner) => index.getX(triangle * 3 + corner));
    const verts = ids.map((id) => [position.getX(id), position.getY(id), position.getZ(id)]);
    points.push(...verts);
    const edgeA = [verts[1][0] - verts[0][0], verts[1][1] - verts[0][1], verts[1][2] - verts[0][2]];
    const edgeB = [verts[2][0] - verts[0][0], verts[2][1] - verts[0][1], verts[2][2] - verts[0][2]];
    normals.push([
      edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
      edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
      edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0],
    ]);
  }
  return { points, normals };
}

function tintGrid(helper, hex) {
  const colour = new THREE.Color(hex);
  const attribute = helper.geometry.getAttribute('color');
  if (!attribute) return;
  for (let i = 0; i < attribute.count; i += 1) {
    attribute.setXYZ(i, colour.r, colour.g, colour.b);
  }
  attribute.needsUpdate = true;
}

function niceStep(raw) {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / power;
  const nice = scaled < 1.5 ? 1 : scaled < 3.5 ? 2 : scaled < 7.5 ? 5 : 10;
  return nice * power;
}
