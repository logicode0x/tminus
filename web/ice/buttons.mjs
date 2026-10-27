// The primary buttons' smoky glass, the hero meteorite's material: one small WebGL canvas behind each button's label, graphite with frosted
// depth and a soft band of light that sweeps across and follows the pointer, with no edge line. Plain WebGL, no three.js: a button is a quad and a fragment
// shader. Pauses off screen and in hidden tabs; holds still for anyone who asks the system for less motion. Until it loads (or without
// WebGL) a primary button is the plain ink it always was.

const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

// Shared noise: 2D simplex (after Ashima Arts / Stefan Gustavson) and a few octaves of it.
const NOISE = `
precision mediump float;
uniform vec2 u_res; uniform float u_time; uniform float u_hover; uniform vec2 u_mouse; uniform float u_gain;
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0); m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * snoise(p); p *= 2.03; a *= 0.5; } return s; }
// uv: 0..1 across the button, with x scaled to the button's aspect so the field isn't stretched; glow: the light under the pointer.
vec2 uvs() { return gl_FragCoord.xy / u_res; }
float glow(vec2 uv) { vec2 d = (uv - u_mouse) * vec2(u_res.x / u_res.y, 1.0); return exp(-dot(d, d) * 2.2) * u_hover; }
`;

const GLASS = `
  void main() {
    vec2 uv = uvs(); vec2 q = vec2(uv.x * u_res.x / u_res.y, uv.y);
    float t = u_time * 0.25;
    float frost = fbm(q * 3.0 + vec2(t * 0.2, 0.0)) * 0.5 + 0.5;
    float sweep = exp(-pow((uv.x - fract(t * 0.35) * 1.6 + 0.3 - uv.y * 0.35) * 5.0, 2.0));
    vec3 col = mix(vec3(0.05), vec3(0.17), frost * 0.7 + (1.0 - uv.y) * 0.15);
    col += (vec3(0.55) * sweep * 0.32 + vec3(0.8) * glow(uv) * 0.30) * u_gain;
    gl_FragColor = vec4(col, 1.0);
  }`;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Puts the glass behind `button`'s label. Returns a stop function, or null without WebGL. Options for a larger panel: `gain` dims the
 *  sweeping light and the pointer's glow, `maxDpr` caps the canvas resolution (the smoke is soft, so a panel needs no more), and `track`
 *  is the element whose pointer moves light it when `button` is a backdrop under other content. */
export function shadeButton(button, { gain = 1, maxDpr = 2, track = button } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'btn-shader';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, alpha: false });
  if (!gl) return null;
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, NOISE + GLASS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = name => gl.getUniformLocation(prog, name);
  const uRes = u('u_res'), uTime = u('u_time'), uHover = u('u_hover'), uMouse = u('u_mouse'), uGain = u('u_gain');
  button.prepend(canvas);
  button.classList.add('has-shader');

  let hover = 0, target = 0, mouse = [0.5, 0.5], visible = true, raf = 0;
  const start = performance.now() - Math.random() * 20_000; // each button at its own moment in the loop
  const size = () => {
    const dpr = Math.min(maxDpr, devicePixelRatio || 1), w = Math.max(1, Math.round(button.clientWidth * dpr)), h = Math.max(1, Math.round(button.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };
  const draw = now => {
    size();
    hover += (target - hover) * 0.08;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, reduced() ? 7 : (now - start) / 1000);
    gl.uniform1f(uHover, hover);
    gl.uniform2f(uMouse, mouse[0], mouse[1]);
    gl.uniform1f(uGain, gain);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const loop = now => { draw(now); raf = visible && !document.hidden && !reduced() ? requestAnimationFrame(loop) : 0; };
  const wake = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const onMove = e => { const r = button.getBoundingClientRect(); mouse = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; target = 1; wake(); };
  const onLeave = () => { target = 0; wake(); };
  track.addEventListener('pointermove', onMove);
  track.addEventListener('pointerleave', onLeave);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); });
  io.observe(button);
  document.addEventListener('visibilitychange', wake);
  draw(performance.now());
  wake();
  return () => {
    cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', wake);
    track.removeEventListener('pointermove', onMove); track.removeEventListener('pointerleave', onLeave);
    button.classList.remove('has-shader'); canvas.remove(); gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

/** Shades every primary button on the page, including ones that appear later, and again when React rewrites a button's label (which
 *  replaces its children, the canvas among them). Returns a stop function. */
export function shadeAllButtons() {
  const stops = new Map();
  let noGl = false;
  const scan = () => {
    for (const [b, stop] of stops) if (!b.isConnected || !b.querySelector(':scope > .btn-shader')) { stop(); stops.delete(b); }
    if (noGl) return;
    for (const b of document.querySelectorAll('.button.primary')) {
      if (stops.has(b)) continue;
      const stop = shadeButton(b);
      if (!stop) { noGl = true; return; }
      stops.set(b, stop);
    }
  };
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(document.body, { childList: true, subtree: true });
  return () => { mo.disconnect(); for (const stop of stops.values()) stop(); stops.clear(); };
}
