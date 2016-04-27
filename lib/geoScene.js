const random = require('random-float');
const geoPieceRing = require('geo-piecering');
const geoArc = require('geo-arc');
const geoChevron = require('geo-chevron');
const createComplex = require('./createComplex');
const { createPBRMaterial, createTexture } = require('./utils');
const PI = Math.PI;
const tweenr = require('tweenr')();
const glslify = require('glslify');

const RESET_Y = [ -20, -10 ]
const INITIAL_Y = [ -30, -1 ]

const ADDITIONAL_PARTS = 2;
const TOTAL_PARTS = 150;
const INITIAL_PARTS = 20;

const COLOR_INTERVAL = 5000;
const MESH_INTERVAL = 2000;

module.exports = function ({ renderer, camera, scene, palettes, envMap, loop }) {
  const wireMat = new THREE.MeshBasicMaterial({
    wireframe: true,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide
  });

  const plainMat = new THREE.MeshBasicMaterial({
    opacity: 1,
    // map: createTexture('assets/textures/roughness_map.jpg', [ 1, 10 ]),
    side: THREE.DoubleSide
  });

  const shaderMat = new THREE.RawShaderMaterial({
    opacity: 1,
    transparent: true,
    uniforms: {
      iGlobalTime: { type: 'f', value: 0 },
      aspect: { type: 'v2', value: 1 },
      color: { type: 'c', value: new THREE.Color() },
      dance: { type: 'f', value: 0 }
    },
    vertexShader: glslify('./shader/shape.vert'),
    fragmentShader: glslify('./shader/shape.frag'),
    side: THREE.DoubleSide
  });

  const shaderMatWire = shaderMat.clone();
  shaderMatWire.wireframe = true;

  let globalSpeed = 1;

  const materials = [
    wireMat,
    plainMat,
    shaderMat,
    shaderMatWire
  ];

  let paletteIndex = 0;
  let colors = palettes[paletteIndex].slice();
  
  // 
  const meshes = [];
  // renderer.setClearColor(new THREE.Color('#283f48'), 1);
  renderer.setClearColor(colors.shift(), 1);
  
  let currentColors = colors.slice();
  // const colorInterval = setInterval(nextColor, 5000);
  // nextColor();
  // const meshInterval = setInterval(emitGeometry, MESH_INTERVAL)
  
  for (let i = 0; i < TOTAL_PARTS; i++) {
    const mesh = addCore({ active: i < INITIAL_PARTS, type: Math.random() > 0.5 ? 0 : 1 });
    if (mesh && i < INITIAL_PARTS) {
      resetMesh(mesh);
    }
  }
  
  let time = 0;
  const tmpVec = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  tmpVec.copy(camera.position);
  camera.localToWorld(tmpVec);

  loop.on('tick', (dt) => {
    time += dt / 1000;
    meshes.forEach((m) => {
      if (m.material.uniforms) {
        m.material.uniforms.aspect.value = window.innerWidth / window.innerHeight;
        m.material.uniforms.iGlobalTime.value = time;
      }
      m.rotation.y += (dt / 1000) * m.rotationFactor;
      m.position.y += (dt / 1000) * m.speed * globalSpeed;
      if (m.isGroup) {
        m.children.forEach(child => {
          child.rotation.x += (dt / 1000);
        });
      }
      const meshHeight = m.boundingRegion.max.y - m.boundingRegion.min.y;
      if (m.active && m.position.y > (meshHeight * 2 + tmpVec.y)) {
        m.active = false;
        m.visible = false;
      }
    });
  });

  return {
    nextGeometry,
    nextColor,
    nextPalette,
    getFullPalette,
    setPalette,
    randomizeMaterials
  };
  
  function randomizeMaterials () {
    meshes.forEach(m => {
      tmpColor.copy(getColor(m));
      m.material = materials[Math.floor(Math.random() * materials.length)].clone();
      setColor(m, tmpColor);
    });
  }

  function getFullPalette () {
    return palettes[paletteIndex % palettes.length];
  }

  function setPalette (palette) {
    colors.length = 0;
    currentColors.length = 0;

    colors = palette.slice();
    renderer.setClearColor(colors.shift(), 1);
    currentColors = colors.slice();
    console.log("New colors", currentColors);

    meshes.forEach(m => {
      setRandColor(m);
    });
  }
  
  function nextPalette () {
    setPalette(palettes[paletteIndex++ % palettes.length]);
  }

  function nextGeometry (opt = {}) {
    for (let i = 0, count = 0; i < meshes.length && count < ADDITIONAL_PARTS; i++) {
      const m = meshes[i];
      
      if (!m.active && (opt.type === m.type || typeof opt.type === 'undefined')) {
        resetMesh(m);
        count++;
      }
    }
  }

  function resetMesh (mesh) {
    mesh.position.y = random(RESET_Y[0], RESET_Y[1]);
    mesh.active = true;
    mesh.visible = true;
    if (mesh.material.uniforms) {
      mesh.material.uniforms.dance.value = Math.random() > 0.5 ? random(0, 1) : 0;
    }
    setRandColor(mesh);
    const minScale = 1e-10;
    const tween = { value: 0 }
    mesh.scale.set(minScale, minScale, minScale);
    tweenr.to(tween, { duration: 0.5, value: 1, ease: 'expoOut' })
      .on('update', () => {
        const value = tween.value;
        mesh.scale.set(value, value, value);
      });
    
  }

  function nextColor () {
    if (colors.length === 0) {
      return;
    }
    currentColors.push(colors.shift());
  }

  function addCore (opt = {}) {
    let mesh;
    if (opt.type === 0) {
      const numPieces = Math.floor(random(5, 40));
      const pieceSize = random(0.25, 0.75);
      mesh = addGeom(geoPieceRing({
        y: 0,
        height: random(0.01, 1.0),
        radius: random(0.1, 1.5),
        numPieces: numPieces,
        quadsPerPiece: 1,
        pieceSize: (PI * 2) * 1 / numPieces * pieceSize
      }), opt);
    } else if (opt.type === 1) {
      const radius = random(0, 2);
      mesh = addGeom(geoArc({
        y: 0,
        startRadian: random(-PI, PI),
        endRadian: random(-PI, PI),
        innerRadius: radius,
        outerRadius: radius + random(0.005, 0.15),
        numBands: 2,
        numSlices: 90,
      }), opt);
    }

    if (mesh && !opt.active) {
      mesh.active = false;
      mesh.visible = false;
    }
    if (mesh) mesh.type = opt.type;
    return mesh;
  }

  function addGeom (complex, opt = {}) {
    if (complex.cells.length === 0) return null;
    const geom = createComplex(complex, opt);
    if (!geom) return;
    let mat = materials[Math.floor(Math.random() * materials.length)].clone();
    const mesh = addMesh(geom, mat, opt);
    setRandColor(mesh);
    return mesh;
  }

  function addMesh (geom, mat, opt) {
    let mesh = new THREE.Mesh(geom, mat);
    
    if (opt.mirror) {
      const offset = opt.offset || 0;
      const group = new THREE.Object3D();
      const mirrorCount = 4;
      for (var i = 0; i < mirrorCount; i++) {
        const a = PI * 2 * (i / mirrorCount);
        const m2 = mesh.clone();
        // m2.rotation.y = -a;
        // m2.rotation.z = -Math.PI;
        m2.position.x = Math.cos(a) * offset;
        m2.position.z = Math.sin(a) * offset;
        group.add(m2);
      }
      meshes.push(group);
      mesh = group;
      mesh.isGroup = true;
    } else {
      meshes.push(mesh);
    }
    mesh.boundingRegion = new THREE.Box3().setFromObject(mesh);
    mesh.rotationFactor = random(-0.5, 0.5);
    mesh.speed = random(0.8, 1);
    mesh.active = true;
    mesh.position.y = random(RESET_Y[0], RESET_Y[1]);
    scene.add(mesh);
    return mesh;
  }

  function randColor () {
    return currentColors[Math.floor(Math.random() * currentColors.length)];
  }

  function setRandColor (mesh) {
    var mat = mesh.material;
    if (mat.color) mat.color.setStyle(randColor());
    else mat.uniforms.color.value.setStyle(randColor());
  }

  function setColor (mesh, color) {
    var mat = mesh.material;
    if (mat.color) mat.color.copy(color);
    else mat.uniforms.color.value.copy(color);
  }

  function getColor (mesh) {
    var mat = mesh.material;
    if (mat.color) return mat.color;
    else return mat.uniforms.color.value;
  }
};