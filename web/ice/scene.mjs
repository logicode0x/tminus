// The home hero's meteorite (T-minus's brand): a chunk of smoky glass drawn with a custom shader (it stands in front of the dot grid, lit
// from a soft studio gradient, pale where thin and graphite where thick, white fracture veins with depth, trapped bubbles, frost, a bright rim), a trail of graphite dust,
// and small shards that fall onto it and bounce off. It places itself just right of the headline
// ([data-hero-copy]) and keeps its share of the screen height. Pauses when off screen or in a hidden tab; `startIce` returns a stop function,
// or null without WebGL.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---- simplex noise 3D (after Stefan Gustavson) ------------------------------------------------------------
const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
const perm = new Uint8Array(512); { const p = new Uint8Array(256); let s = 11; for (let i = 0; i < 256; i++) p[i] = i; for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
function noise(x, y, z) {
  const F3 = 1 / 3, G3 = 1 / 6, s = (x + y + z) * F3, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s), t = (i + j + k) * G3;
  const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) { if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
  else { if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } }
  const c = (xx, yy, zz, g) => { let q = 0.6 - xx * xx - yy * yy - zz * zz; if (q < 0) return 0; q *= q; const gr = grad3[g % 12]; return q * q * (gr[0] * xx + gr[1] * yy + gr[2] * zz); };
  const ii = i & 255, jj = j & 255, kk = k & 255;
  return 32 * (c(x0, y0, z0, perm[ii + perm[jj + perm[kk]]])
    + c(x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]])
    + c(x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3, perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]])
    + c(x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]));
}
const fbm = (x, y, z, o = 4) => { let a = 0.5, f = 1, sum = 0; for (let n = 0; n < o; n++) { sum += a * noise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; } return sum; };


export function startIce(canvas, host, { onReady } = {}) {
  const phone = matchMedia('(max-width: 760px)').matches || navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NoToneMapping;                                 // the page is near-white: whites have to stay white
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  camera.position.set(0, 0, 9);

  // Environment for reflections, and a backdrop the ice can refract: a nebula painted on canvas, plus stars.
  const pmrem = new THREE.PMREMGenerator(renderer);
  {
    // A photo studio for the glass to reflect: a dark floor, a white sweep above, a few softboxes.
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = vP.y * .5 + .5; vec3 c = mix(vec3(.05), vec3(.55), smoothstep(.2,.75,h)); c = mix(c, vec3(1.0), smoothstep(.8,1.,h)); gl_FragColor = vec4(c,1.); }' })));
    const panel = (w, h, col, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
    panel(8, 4, new THREE.Color('#FFFFFF').multiplyScalar(3), -6, 8, 6); panel(3, 9, new THREE.Color('#FFFFFF').multiplyScalar(2), 12, 2, -4);
    panel(6, 2, new THREE.Color('#D9D9D9').multiplyScalar(1.2), 2, -9, 4); panel(2, 2, new THREE.Color('#FFFFFF').multiplyScalar(5), -9, 3, -6);
    scene.environment = pmrem.fromScene(env, 0.02).texture;
  }
  let back, backTex;
  {
    // The backdrop plane only just covers a hero about 2.6 times as wide as it is tall, so the canvas maps about one to one onto the
    // screen; layout() widens it on wider screens.
    const c = document.createElement('canvas'); c.width = 2560; c.height = 1066; const g = c.getContext('2d');
    // A near-white sweep with a fine dot grid: the glass bends the grid, which is how you see that it is glass.
    const bg = g.createRadialGradient(1800, 500, 40, 1600, 540, 1500); bg.addColorStop(0, '#FFFFFF'); bg.addColorStop(.45, '#F7F7F7'); bg.addColorStop(1, '#EDEDED');
    g.fillStyle = bg; g.fillRect(0, 0, 2560, 1066);
    for (let y = 9; y < 1066; y += 22) for (let x = 9; x < 2560; x += 22) {
      const d = Math.hypot(x - 1750, (y - 520) * 1.5), a = Math.max(0, 0.34 - d / 2600);
      if (a > 0.02) { g.fillStyle = `rgba(17,17,17,${a.toFixed(3)})`; g.beginPath(); g.arc(x, y, 1.15, 0, 6.283); g.fill(); }
    }
    const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 2560, 1066); };
    blob(1450, 860, 620, 'rgba(17,17,17,.045)'); blob(2250, 230, 480, 'rgba(17,17,17,.03)');
    backTex = new THREE.CanvasTexture(c); backTex.colorSpace = THREE.SRGBColorSpace; backTex.anisotropy = 4;
    back = new THREE.Mesh(new THREE.PlaneGeometry(48, 20), new THREE.MeshBasicMaterial({ map: backTex, depthWrite: false }));
    back.position.z = -18; scene.add(back);
  }

  // ---- the meteorite: a custom shader (refraction of what's behind, graphite absorption, white fracture veins with depth, trapped
  // bubbles, frosted patches, wet highlights, a bright rim) on a lump of glass with flat fracture planes cut into it -----------------------
  function iceChunk(detail, scale, seed, cuts) {
    let geo = new THREE.IcosahedronGeometry(1, detail);
    geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    const pos = geo.attributes.position, v = new THREE.Vector3();
    const rnd = (() => { let q = seed * 9301 + 49297; return () => ((q = (q * 9301 + 49297) % 233280) / 233280); })();
    const planes = Array.from({ length: cuts }, () => ({ n: new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(), d: 0.72 + rnd() * 0.2 }));
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      let d = 1 + 0.26 * fbm(v.x * 1.1 + seed, v.y * 1.1, v.z * 1.1, 4) + 0.035 * fbm(v.x * 6, v.y * 6 + seed, v.z * 6, 2);
      v.multiplyScalar(d);
      for (const p of planes) { const h = v.dot(p.n); if (h > p.d) v.addScaledVector(p.n, -(h - p.d)); }
      v.multiplyScalar(scale); v.x *= 1.34; v.y *= 0.9;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const NOISE_GLSL = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;} vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){ const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx); vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0)); vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }`;
  const bgTarget = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
  const iceUniforms = { uBg: { value: bgTarget.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uCamObj: { value: new THREE.Vector3() },
    uLight: { value: new THREE.Vector3(-0.5, 0.65, 0.6).normalize() }, uSeed: { value: 0 } };
  const iceMaterial = (seed = 0) => new THREE.ShaderMaterial({
    uniforms: { ...iceUniforms, uSeed: { value: seed } },
    vertexShader: `varying vec3 vN; varying vec3 vWorld; varying vec3 vObj; varying vec3 vObjN;
      void main(){ vObj = position; vObjN = normal; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: NOISE_GLSL + `
      uniform sampler2D uBg; uniform vec2 uRes; uniform float uTime; uniform vec3 uCamObj; uniform vec3 uLight; uniform float uSeed;
      varying vec3 vN; varying vec3 vWorld; varying vec3 vObj; varying vec3 vObjN;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vWorld);
        float ndv = clamp(dot(N, V), 0.0, 1.0), fres = pow(1.0 - ndv, 2.6);
        // what's behind, bent by the ice
        vec3 Rf = refract(-V, N, 1.0 / 1.31);
        // The rock sits in front of the dot grid, so it lights itself from a soft studio gradient instead of showing the grid through it.
        vec3 behind = vec3(mix(0.74, 0.99, smoothstep(-0.6, 0.8, Rf.y + Rf.x * 0.3)));
        // absorption: clear where thin, smoky graphite where thick
        float thick = smoothstep(0.0, 0.85, ndv);
        vec3 tint = mix(vec3(0.96), vec3(0.24, 0.245, 0.255), thick);
        vec3 col = behind * tint;
        // fracture veins inside, seen with depth (parallax through the volume)
        vec3 Vo = normalize(uCamObj - vObj);
        float veins = 0.0;
        for (int k = 0; k < 6; k++) {
          vec3 p = (vObj - Vo * float(k) * 0.13) * 1.15 + uSeed;
          float n = snoise(p) + 0.3 * snoise(p * 2.3);
          float plane = snoise(p * 0.6 + 7.0);
          veins += smoothstep(0.035, 0.0, abs(n)) * smoothstep(0.0, 0.35, plane) * (1.0 - float(k) / 6.0);
        }
        col += vec3(1.0) * veins * (0.22 + 0.6 * thick);
        // a faint light in the core
        col += vec3(0.85) * pow(ndv, 4.0) * 0.1;
        // bubbles trapped in the ice
        float bub = smoothstep(0.9, 0.95, snoise((vObj - Vo * 0.25) * 18.0 + uSeed));
        col += vec3(1.0) * bub * 0.45 * thick;
        // frost: matte white patches on the surface
        float fr = snoise(vObj * 1.7 + 3.0 + uSeed) * 0.6 + snoise(vObj * 5.0) * 0.25 + snoise(vObj * 15.0) * 0.15;
        float frost = smoothstep(0.28, 0.7, fr);
        col = mix(col, vec3(0.9) * (0.55 + 0.4 * max(dot(N, uLight), 0.0)), frost * 0.06);
        // wet highlight, softer on frost
        vec3 H = normalize(uLight + V);
        col += vec3(1.0) * pow(max(dot(N, H), 0.0), mix(220.0, 26.0, frost)) * mix(2.2, 0.35, frost);
        // the cold sky in the rim, and a thin iridescence
        vec3 r = reflect(-V, N);
        vec3 sky = mix(vec3(0.1), vec3(0.8), smoothstep(-0.2, 0.9, r.y));
        col = mix(col, sky, fres * 0.22);
        col += vec3(0.9) * fres * 0.1;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const meteor = new THREE.Group();
  scene.add(meteor);
  const shell = new THREE.Mesh(iceChunk(phone ? 24 : 40, 1.0, 1.7, 7), iceMaterial(0.0));
  meteor.add(shell);
  // The rock's real outline, as a radius for every direction (in the rock's own frame), so shards hit its surface, not a sphere.
  const RADIUS = (() => {
    const nT = 48, nP = 24, map = new Float32Array(nT * nP), pos = shell.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); const r = v.length();
      const t = Math.floor(((Math.atan2(v.z, v.x) / (2 * Math.PI)) + 1) % 1 * nT), p = Math.min(nP - 1, Math.floor(Math.acos(v.y / r) / Math.PI * nP));
      map[p * nT + t] = Math.max(map[p * nT + t], r);
    }
    for (let k = 0; k < map.length; k++) if (!map[k]) map[k] = 1;
    return d => { const t = Math.floor(((Math.atan2(d.z, d.x) / (2 * Math.PI)) + 1) % 1 * nT), p = Math.min(nP - 1, Math.floor(Math.acos(Math.max(-1, Math.min(1, d.y))) / Math.PI * nP)); return map[p * nT + t]; };
  })();
  const shards = [];
  for (let n = 0; n < 6; n++) {
    const size = 0.035 + Math.random() * 0.045;
    const m = new THREE.Mesh(iceChunk(2, size, n * 3.3 + 2, 7), iceMaterial(n * 1.7));
    // start outside the rock, moving round it
    const a = (n / 6) * Math.PI * 2 + Math.random() * .5, r = 1.75 + Math.random() * 0.5;
    m.position.set(Math.cos(a) * r * 1.1, (Math.random() - .5) * 0.9, Math.sin(a) * r * .8);
    const tangent = new THREE.Vector3(-Math.sin(a), (Math.random() - .5) * .25, Math.cos(a)).normalize();
    const inward = m.position.clone().normalize().multiplyScalar(-0.35);
    m.userData = { v: tangent.multiplyScalar(0.18 + Math.random() * 0.12).add(inward), r: size * 1.7, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.4) };
    meteor.add(m); shards.push(m);
  }
  let bounces = 0;
  const SPIN = new THREE.Vector3(0, 0.09, 0); // the rock's turn, for the kick it gives a shard that hits it
  const tmp = { q: new THREE.Quaternion(), d: new THREE.Vector3(), n: new THREE.Vector3(), surf: new THREE.Vector3(), rel: new THREE.Vector3(), ab: new THREE.Vector3() };
  function stepShards(dt) {
    tmp.q.copy(shell.quaternion).invert();
    for (const s of shards) {
      const u = s.userData, p = s.position, v = u.v;
      // a steady pull towards the rock: every hop falls back onto the ice
      const dist = p.length();
      v.addScaledVector(p, -1.5 / dist * dt);
      if (dist > 2.7) v.addScaledVector(p, -(dist - 2.7) * 1.5 * dt / dist);
      if (p.x < -0.7) v.x += (-0.7 - p.x) * 9 * dt;
      p.addScaledVector(v, dt);
      v.multiplyScalar(1 - 0.05 * dt);
      u.spin.multiplyScalar(1 - 0.4 * dt);
      // hit the rock: its surface in this direction, in the rock's turning frame
      tmp.d.copy(p).applyQuaternion(tmp.q);
      const len = tmp.d.length(); tmp.d.divideScalar(len);
      const surface = RADIUS(tmp.d) + u.r;
      if (len < surface) {
        tmp.n.copy(p).normalize();
        p.copy(tmp.n).multiplyScalar(surface);                                // back out onto the surface
        tmp.surf.crossVectors(SPIN, p);                                      // how fast the surface there is moving
        tmp.rel.subVectors(v, tmp.surf);
        const vn = tmp.rel.dot(tmp.n);
        if (vn < 0) {
          bounces++;
          tmp.rel.addScaledVector(tmp.n, -(1 + 0.8) * vn); v.addVectors(tmp.rel, tmp.surf);
          const out = v.dot(tmp.n);
          if (out < 0.8) v.addScaledVector(tmp.n, 0.8 + Math.random() * 0.45 - out);          // a hop off the ice, at least
          v.x += (Math.random() - .5) * .25; v.y += (Math.random() - .5) * .25; v.z += (Math.random() - .5) * .25;
          u.spin.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(5);
        }
      }
    }
    // shards bounce off each other
    for (let i = 0; i < shards.length; i++) for (let j = i + 1; j < shards.length; j++) {
      const a = shards[i], b = shards[j], min = a.userData.r + b.userData.r;
      tmp.ab.subVectors(b.position, a.position); const d = tmp.ab.length();
      if (d > 0 && d < min) {
        tmp.ab.divideScalar(d);
        a.position.addScaledVector(tmp.ab, -(min - d) / 2); b.position.addScaledVector(tmp.ab, (min - d) / 2);
        const rel = tmp.n.subVectors(b.userData.v, a.userData.v).dot(tmp.ab);
        if (rel < 0) { a.userData.v.addScaledVector(tmp.ab, rel * 0.9); b.userData.v.addScaledVector(tmp.ab, -rel * 0.9); }
      }
    }
    for (const s of shards) { s.rotation.x += s.userData.spin.x * dt; s.rotation.y += s.userData.spin.y * dt; s.rotation.z += s.userData.spin.z * dt; }
  }
  const core = { rotation: new THREE.Euler() }, inner = { intensity: 0 };

  // ---- the vapor trail: particles streaming away from the ice ------------------------------------------------
  const trailDir = new THREE.Vector3(1, 0.62, -0.35).normalize();
  const N = phone ? 900 : 2600, P = new Float32Array(N * 3), V = new Float32Array(N * 3), L = new Float32Array(N), S = new Float32Array(N), R = new Float32Array(N);
  const spawn = i => {
    const u = new THREE.Vector3().randomDirection(); if (u.dot(trailDir) < -0.1) u.addScaledVector(trailDir, 1.2).normalize();
    u.multiplyScalar((1.05 + Math.random() * .25) * meteor.scale.x); u.x *= 1.3;
    P[i * 3] = u.x + meteor.position.x; P[i * 3 + 1] = u.y + meteor.position.y; P[i * 3 + 2] = u.z + meteor.position.z;
    const sp = (1.6 + Math.random() * 2.8) * meteor.scale.x;
    V[i * 3] = trailDir.x * sp + (Math.random() - .5) * .35; V[i * 3 + 1] = trailDir.y * sp + (Math.random() - .5) * .35; V[i * 3 + 2] = trailDir.z * sp + (Math.random() - .5) * .35;
    L[i] = 0; R[i] = 0.35 + Math.random() * 0.55; const k = Math.random(); S[i] = k < 0.025 ? 46 + Math.random() * 40 : k < 0.09 ? 11 + Math.random() * 7 : 2.2 + Math.random() * 4.5;
  };
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(P, 3)); pgeo.setAttribute('aLife', new THREE.BufferAttribute(L, 1)); pgeo.setAttribute('aSize', new THREE.BufferAttribute(S, 1));
  const pmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    uniforms: { uPix: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float aLife; attribute float aSize; varying float vLife; varying float vSize; uniform float uPix;
      void main() { vLife = aLife; vSize = aSize; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPix * (1.0 - aLife * 0.5) * (9.0 / -mv.z); }`,
    fragmentShader: `varying float vLife; varying float vSize;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
        vec3 c = mix(vec3(0.07), vec3(0.42), smoothstep(0.0, 1.0, vLife));
        float big = smoothstep(20.0, 40.0, vSize);
        gl_FragColor = vec4(c, a * (1.0 - vLife) * mix(0.5, 0.045, big)); }`,
  });
  const points = new THREE.Points(pgeo, pmat); points.frustumCulled = false; scene.add(points);
  for (let i = 0; i < N; i++) { spawn(i); L[i] = Math.random(); for (let k = 0; k < 3; k++) P[i * 3 + k] += V[i * 3 + k] * L[i] * R[i] * 2.2; }

  // ---- post ------------------------------------------------------------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // No bloom: on a white page a glow only greys the paper.
  composer.addPass(new OutputPass());

  function layout() {
    const w = host.clientWidth, h = host.clientHeight;
    // At most about 3.6 million pixels, however large or dense the screen.
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2, Math.sqrt(3.6e6 / (w * h))));
    pmat.uniforms.uPix.value = renderer.getPixelRatio();
    renderer.setSize(w, h, false); composer.setSize(w, h);
    const db = renderer.getDrawingBufferSize(new THREE.Vector2()); bgTarget.setSize(db.x, db.y); iceUniforms.uRes.value.copy(db);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // The visible world at the meteorite's depth, so it sits at a share of the screen and keeps its share of the height.
    const H = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z, W = H * camera.aspect;
    const narrow = w <= 860;                                                    // the copy moves under the meteorite (see style.css)
    const frame = Math.max(Math.min(w * 0.04, 64), (w - 1760) / 2);           // the content frame's margin, in px
    const copyEl = host.querySelector('[data-hero-copy]'), copyW = copyEl ? copyEl.getBoundingClientRect().width : Math.min(980, Math.max(520, w * 0.42));
    const textRight = (frame + copyW) / w;                                     // where the headline ends, as a share of the width
    // The meteorite sits just right of the text, as large as the room allows (it may bleed a little past the frame).
    let scale = (narrow ? 0.2 : 0.44) * H / 1.8, half = 1.8 * scale / W;      // its half-width, as a share of the width
    const room = 1 - textRight - 0.03;
    if (!narrow && 1.75 * half > room) { half = room / 1.75; scale = half * W / 1.8; }
    // On narrow screens it sits under the top bar at a fixed size in px, however tall the hero grows with its copy.
    const px = H / h, size = Math.min(Math.max(w * 0.42, 150), 260);
    if (narrow) scale = size * px * 0.6;
    const fx = narrow ? 0.5 : textRight + 0.03 + half;
    meteor.position.set((fx - 0.5) * W, narrow ? H / 2 - (136 + size * 0.55) * px : H * 0.03, 0);
    meteor.scale.setScalar(scale);
    look.set((fx - 0.5) * W * 0.25, 0, 0);
    // On a wide, short hero the backdrop would end before the screen does. Widen the plane to what the camera sees at its depth (27 away,
    // three times the meteorite's 9), with room for the aim and the parallax, and keep the canvas its own size in the middle: past its
    // sides each row's edge colour carries on (the left edge is the sweep's flat grey, the right edge a gentle gradient, no dots on either).
    const k = Math.max(1, 1.05 * 2 * (1.5 * W + 3 * Math.abs(look.x) + 0.6) / 48);
    back.scale.x = k; backTex.repeat.x = k; backTex.offset.x = (1 - k) / 2;
  }
  const look = new THREE.Vector3();
  layout(); addEventListener('resize', layout);
  const ro = new ResizeObserver(layout); ro.observe(host);

  const mouse = { x: 0, y: 0 };
  const onMove = e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; };
  addEventListener('pointermove', onMove);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    shell.rotation.y += dt * 0.09; shell.rotation.x = Math.sin(t * 0.21) * 0.18; shell.rotation.z = 0.35 + Math.sin(t * 0.13) * 0.06;
    core.rotation.copy(shell.rotation);
    inner.intensity = 20 + Math.sin(t * 1.7) * 3;
    for (let k = 0; k < 3; k++) stepShards(dt / 3);
    if (!reduced) {
      for (let i = 0; i < N; i++) {
        L[i] += dt * R[i];
        if (L[i] >= 1) { spawn(i); continue; }
        P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      }
      pgeo.attributes.position.needsUpdate = true; pgeo.attributes.aLife.needsUpdate = true;
    }
    camera.position.x += (mouse.x * 0.6 - camera.position.x) * 0.04; camera.position.y += (-mouse.y * 0.4 - camera.position.y) * 0.04;
    camera.lookAt(look);
    iceUniforms.uTime.value = t;
    shell.updateMatrixWorld(); iceUniforms.uCamObj.value.copy(shell.worldToLocal(camera.position.clone()));
    composer.render();
    raf = running ? requestAnimationFrame(frame) : 0;
  }
  let raf = 0, running = true, visible = true;
  const setRunning = () => { const should = visible && !document.hidden; if (should && !running) { running = true; clock.getDelta(); raf = requestAnimationFrame(frame); } else if (!should) running = false; };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; setRunning(); });
  io.observe(host);
  document.addEventListener('visibilitychange', setRunning);
  frame();
  onReady?.();
  return () => {
    running = false; cancelAnimationFrame(raf);
    io.disconnect(); ro.disconnect(); removeEventListener('resize', layout); removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', setRunning);
    scene.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map?.dispose?.(); x.dispose?.(); }); });
    bgTarget.dispose(); composer.dispose?.(); pmrem.dispose(); renderer.dispose();
  };

}
