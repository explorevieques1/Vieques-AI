import { useEffect, useRef } from 'react'

// ---------------------------------------------------------------------------
//  InkField — Vieques engravings that condense out of flowing ink behind the
//  page content and morph into each other as the reader scrolls.
//
//  How it looks: each scene grows outward from a seed point (the ceiba's
//  trunk, the lighthouse, the kettles). At the growth front the ink is a soft
//  blurred cloud (the image's own low mip level) carried along a curl-noise
//  flow field, with a darker "wet" edge; behind the front it sharpens into the
//  crisp engraving and the flow dies to zero, so a settled scene is still and
//  high definition. Between sections the outgoing scene retracts and swirls
//  away while the next one condenses — the two overlap mid-morph.
//
//  Assets: public/ink/<scene>-{lg,sm}.webp — single-channel INK DENSITY maps
//  (white = ink) made from the orange engravings (blue channel inverted, edges
//  feathered). Loaded only when the section is near the viewport.
//
//  Cost: WebGL2, one full-screen quad, ~10 noise evals/pixel, capped at
//  ~2.2M pixels. Renders only while the ink is moving; idles otherwise.
//  Reduced motion: no flow, no growth front — scenes simply cross-fade.
//  No WebGL2: renders nothing (it is decoration; content is unaffected).
// ---------------------------------------------------------------------------

const SCENES = [
  //            seed in image uv   fit: [zoom (× width-fit), centre y (× viewport)]
  { key: 'roots',      seed: [0.50, 0.30], fit: { lg: [1.00, 0.54], sm: [2.10, 0.56] } },
  { key: 'lighthouse', seed: [0.58, 0.45], fit: { lg: [1.45, 0.56], sm: [3.20, 0.56] } },
  { key: 'mill',       seed: [0.62, 0.70], fit: { lg: [1.35, 0.56], sm: [2.80, 0.56] } },
]

const INK_RGB = [0.96, 0.47, 0.15]   // a touch softer than --flush (#FF6D04)
const OPACITY = { lg: 0.17, sm: 0.2 }
const MAX_PIXELS = 2.2e6

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2 uRes;
uniform float uTime, uOpacity, uCalm;
uniform vec3 uColor;
uniform sampler2D uTexA, uTexB;
uniform vec2 uSizeA, uSizeB, uFitA, uFitB, uSeedA, uSeedB;
uniform float uFormA, uFormB;

// Ashima 2D simplex noise (MIT)
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * snoise(p); p = p * 2.07 + 13.7; a *= 0.5; }
  return s;
}

// Divergence-free flow: the curl of a noise field, two octaves.
vec2 curl(vec2 p) {
  const float e = 0.004;
  vec2 c = vec2(0.0);
  float amp = 1.0;
  for (int i = 0; i < 2; i++) {
    float n1 = snoise(p + vec2(0.0, e)), n2 = snoise(p - vec2(0.0, e));
    float n3 = snoise(p + vec2(e, 0.0)), n4 = snoise(p - vec2(e, 0.0));
    c += amp * vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
    p = p * 2.3 + 7.1; amp *= 0.45;
  }
  return c;
}

float scene(sampler2D tex, vec2 size, vec2 fit, vec2 seed, float form, vec2 p, vec2 flow, float n, float ridge) {
  if (form <= 0.001) return 0.0;
  float s = uRes.x / size.x * fit.x;
  vec2 disp = size * s;
  vec2 org = vec2((uRes.x - disp.x) * 0.5, fit.y * uRes.y - disp.y * 0.5);
  float u = 1.0 - form;
  vec2 pp = p + flow * u * u * uRes.y * (1.0 - uCalm);
  vec2 uv = (pp - org) / disp;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  // Long, noise-wavered fade on every side — longest at the bottom, where the
  // engravings are densest — so an image never ends on a straight line.
  float wob = n * 0.06;
  float edge = smoothstep(0.0, 0.12, min(uv.x, 1.0 - uv.x) + wob * 0.5)
             * smoothstep(0.02, 0.30, uv.y + wob)
             * smoothstep(0.03, 0.45, 1.0 - uv.y + wob);
  if (edge <= 0.0) return 0.0;
  float sharp = texture(tex, uv).r * edge;
  if (uCalm > 0.5) return sharp * form;

  float cloud = textureLod(tex, uv, 4.0).r * edge;
  float aspect = disp.x / disp.y;
  float dist = length((uv - seed) * vec2(aspect, 1.0)) / (0.6 * length(vec2(aspect, 1.0)));
  float front = form * 1.85 - (dist * 0.55 + (n * 0.5 + 0.5) * 0.45);
  float vis = smoothstep(0.0, 0.1, front);
  float wet = smoothstep(-0.08, 0.03, front) * (1.0 - smoothstep(0.03, 0.26, front));
  float crisp = smoothstep(0.08, 0.34, front);
  // Ahead of the front the image exists only as a blurred cloud broken into
  // filaments (ridged noise) — ink threads in water — then sharpens.
  float threads = 0.3 + 0.7 * ridge;
  float ink = mix(cloud * 0.7 * threads, sharp, crisp) * vis;
  ink += cloud * wet * ridge * 0.6;  // threads blooming ahead of the front
  ink += sharp * wet * 0.45;         // pooled, darker wet edge
  return ink * smoothstep(0.0, 0.12, form);
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;   // pixels, y down
  vec2 q = p / uRes.y;
  float t = uTime * 0.06;
  float n = fbm(q * 2.4 + vec2(t, -t * 0.7));
  vec2 flow = uCalm > 0.5 ? vec2(0.0) : curl(q * 1.3 + vec2(0.0, t)) * 0.022;
  float ridge = 1.0 - abs(snoise(q * 7.0 + flow * 4.0 + vec2(t * 2.0, 0.0)));
  ridge = ridge * ridge * ridge;
  float ink = scene(uTexA, uSizeA, uFitA, uSeedA, uFormA, p, flow, n, ridge)
            + scene(uTexB, uSizeB, uFitB, uSeedB, uFormB, p, flow, n, ridge);
  float a = clamp(ink, 0.0, 1.0) * uOpacity;
  outColor = vec4(uColor * a, a);
}`

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a, b, v) => { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x) }
const formOf = (t, i) => smooth(0, 1, 1 - Math.abs(t - i) * 1.25)

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[InkField]', gl.getShaderInfoLog(sh))
    return null
  }
  return sh
}

export default function InkField({ children }) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let gl = null
    let prog = null
    let U = {}
    let tex = []            // per scene: { t: WebGLTexture, w, h } | undefined
    let anchors = []        // doc-y of each scene's section top
    let endY = 0            // doc-y where the last scene has fully dissolved
    let size = 'lg'
    let tCur = -1
    let time = 0
    let last = 0
    let lastInput = 0
    let raf = 0
    let dead = false

    // ---- scroll → scene timeline ------------------------------------------
    const measure = () => {
      const sy = window.scrollY
      anchors = SCENES.map(({ key }) => {
        const el = root.querySelector(`[data-ink-scene="${key}"]`)
        return el ? el.getBoundingClientRect().top + sy : NaN
      })
      endY = root.getBoundingClientRect().bottom + sy + window.innerHeight * 0.1
    }

    // t = i means scene i is fully formed; fractional = mid-morph.
    const target = () => {
      const vh = window.innerHeight
      const y = window.scrollY + vh * 0.5
      const a0 = anchors[0]
      if (!(a0 > 0)) return -1
      const start = a0 - vh * 0.85
      if (y <= start) return -1
      if (y <= a0) return -1 + smooth(0, 1, (y - start) / (a0 - start))
      const n = anchors.length
      for (let i = 0; i < n - 1; i++) {
        if (y < anchors[i + 1]) {
          const u = (y - anchors[i]) / (anchors[i + 1] - anchors[i])
          return i + smooth(0.35, 0.92, u)
        }
      }
      const tail = (y - anchors[n - 1]) / Math.max(1, endY - anchors[n - 1])
      return n - 1 + smooth(0.7, 1, tail)
    }

    // ---- GL setup ------------------------------------------------------------
    const resize = () => {
      if (!gl) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      let dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      if (w * h * dpr * dpr > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / (w * h))
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const loadScene = (i) => {
      const { key } = SCENES[i]
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => {
        if (dead || !gl) return
        const t = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, t)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, img)
        gl.generateMipmap(gl.TEXTURE_2D)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        tex[i] = { t, w: img.naturalWidth, h: img.naturalHeight }
        kick()
      }
      img.src = `/ink/${key}-${size}.webp`
    }

    const init = () => {
      gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' })
      if (!gl) return false
      const vs = compile(gl, gl.VERTEX_SHADER, VERT)
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
      if (!vs || !fs) { gl = null; return false }
      prog = gl.createProgram()
      gl.attachShader(prog, vs)
      gl.attachShader(prog, fs)
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return false }
      gl.useProgram(prog)
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(prog, 'aPos')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      for (const name of ['uRes', 'uTime', 'uOpacity', 'uCalm', 'uColor', 'uTexA', 'uTexB',
        'uSizeA', 'uSizeB', 'uFitA', 'uFitB', 'uSeedA', 'uSeedB', 'uFormA', 'uFormB']) {
        U[name] = gl.getUniformLocation(prog, name)
      }
      gl.uniform1i(U.uTexA, 0)
      gl.uniform1i(U.uTexB, 1)
      gl.uniform3fv(U.uColor, INK_RGB)
      gl.uniform1f(U.uCalm, reduce ? 1 : 0)
      gl.disable(gl.DEPTH_TEST)
      size = window.innerWidth < 760 ? 'sm' : 'lg'
      gl.uniform1f(U.uOpacity, OPACITY[size])
      resize()
      SCENES.forEach((_, i) => loadScene(i))
      return true
    }

    const bindSlot = (slot, i, form) => {
      const sfx = slot ? 'B' : 'A'
      const s = tex[i]
      gl.activeTexture(slot ? gl.TEXTURE1 : gl.TEXTURE0)
      if (!s || form <= 0) {
        gl.uniform1f(U['uForm' + sfx], 0)
        gl.bindTexture(gl.TEXTURE_2D, null)
        return
      }
      const sc = SCENES[i]
      gl.bindTexture(gl.TEXTURE_2D, s.t)
      gl.uniform2f(U['uSize' + sfx], s.w, s.h)
      gl.uniform2fv(U['uFit' + sfx], sc.fit[size])
      gl.uniform2fv(U['uSeed' + sfx], sc.seed)
      gl.uniform1f(U['uForm' + sfx], form)
    }

    const draw = () => {
      const k = Math.floor(tCur)
      gl.uniform2f(U.uRes, canvas.width, canvas.height)
      gl.uniform1f(U.uTime, time)
      bindSlot(0, k, k >= 0 && k < SCENES.length ? formOf(tCur, k) : 0)
      bindSlot(1, k + 1, k + 1 < SCENES.length ? formOf(tCur, k + 1) : 0)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const frame = (now) => {
      raf = 0
      if (dead || !gl) return
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016)
      last = now
      const tgt = target()
      tCur = reduce ? tgt : tCur + (tgt - tCur) * (1 - Math.exp(-dt * 2.6))
      if (!reduce) time += dt
      draw()
      const moving = Math.abs(tgt - tCur) > 0.0008
      const k = Math.floor(tCur)
      const morphing = !reduce && [k, k + 1].some((i) => { const f = formOf(tCur, i); return f > 0.01 && f < 0.99 })
      // Keep the ink alive while it is mid-morph, but go idle 2.5s after input.
      if (moving || (morphing && now - lastInput < 2500)) raf = requestAnimationFrame(frame)
      else last = 0
    }

    const kick = () => {
      lastInput = performance.now()
      if (!raf && gl) raf = requestAnimationFrame(frame)
    }

    // ---- lifecycle -------------------------------------------------------------
    let started = false
    const start = () => {
      if (started) return
      started = true
      if (!init()) return
      measure()
      tCur = target()
      canvas.classList.add('ready')
      window.addEventListener('scroll', kick, { passive: true })
      kick()
    }

    // Boot only when the field is within a screen of the viewport.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { start(); io.disconnect() }
    }, { rootMargin: '100% 0px' })
    io.observe(root)

    const onResize = () => { resize(); measure(); kick() }
    const ro = new ResizeObserver(onResize)
    ro.observe(root)
    window.addEventListener('resize', onResize, { passive: true })
    const onLost = (e) => { e.preventDefault(); gl = null; canvas.classList.remove('ready') }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      dead = true
      io.disconnect()
      ro.disconnect()
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('webglcontextlost', onLost)
      if (raf) cancelAnimationFrame(raf)
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return (
    <div className="ink-field" ref={rootRef}>
      <canvas className="ink-field-canvas" ref={canvasRef} aria-hidden="true" />
      {children}
    </div>
  )
}
