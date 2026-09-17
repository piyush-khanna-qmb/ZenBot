// The ZenBot core: a real-time raymarched glass orb rendered with a single
// WebGL fragment shader — no model files, no three.js. A translucent sphere with
// volumetric plasma swirling inside it, a fresnel rim, a moving specular
// highlight and procedural reflections give it genuine depth and a glassy read.
// Its energy, hue and glow react to the break's phase via setMode().

const VERT = `
attribute vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uHue;     // 0..1 (0.5 == cyan)
uniform float uEnergy;  // overall brightness / liveliness
uniform float uGlow;    // outer atmosphere strength
uniform float uAmp;     // interior plasma intensity
uniform float uAppear;  // 0..1 materialize

// --- Ashima simplex noise (3D) ---
vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p){
  float f = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ f += a*snoise(p); p *= 2.03; a *= 0.5; }
  return f*0.5 + 0.5;
}

vec3 hue2rgb(float h){
  h = fract(h);
  return clamp(vec3(abs(h*6.0-3.0)-1.0, 2.0-abs(h*6.0-2.0), 2.0-abs(h*6.0-4.0)), 0.0, 1.0);
}
vec3 hsl(float h, float s, float l){
  vec3 rgb = hue2rgb(h);
  float c = (1.0 - abs(2.0*l - 1.0)) * s;
  return (rgb - 0.5) * c + l;
}

mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }

void main(){
  // screen coords, aspect-correct, orb centered a little above the middle
  vec2 p = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  p.y -= 0.10;
  float dist = length(p);

  const float R = 1.0;
  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(p, -1.05));   // focal → orb size

  // ray / sphere intersection
  float b = dot(ro, rd);
  float c = dot(ro, ro) - R*R;
  float disc = b*b - c;

  vec3 color = vec3(0.0);
  float alpha = 0.0;

  // --- outer atmosphere + soft pulsing ripples (hazy, not hard rings) ---
  float halo = exp(-max(dist - 0.30, 0.0) * 6.5);
  float ripple = 0.0;
  for (int i = 0; i < 2; i++){
    float ph = fract(uTime*0.32 + float(i)*0.5);
    float rr = 0.30 + ph*0.62;
    ripple += smoothstep(0.07, 0.0, abs(dist - rr)) * (1.0 - ph) * 0.5;
  }
  vec3 atmoCol = hsl(uHue, 1.0, 0.6);
  float atmo = halo*0.55*uGlow + ripple*uGlow*0.5;
  color = atmoCol * atmo;
  alpha = clamp(atmo, 0.0, 1.0);

  if (disc > 0.0){
    float t = -b - sqrt(disc);
    if (t > 0.0){
      vec3 pe = ro + rd*t;            // entry point on the glass
      vec3 N  = normalize(pe);
      float ndv = max(dot(N, -rd), 0.0);
      float fres = pow(1.0 - ndv, 3.0);

      // refract inward and march the interior, gathering volumetric plasma
      vec3 rdir = refract(rd, N, 1.0/1.45);
      mat3 rot = rotY(uTime*0.18);
      vec3 pp = pe;
      vec3 inner = vec3(0.0);
      for (int i = 0; i < 18; i++){
        pp += rdir * 0.10;
        float depth = float(i) / 18.0;
        float d = fbm(rot * (pp*2.1) + vec3(0.0, 0.0, uTime*0.25));
        d = smoothstep(0.42, 0.95, d);
        vec3 cc = hsl(uHue + 0.03*sin(depth*7.0 + uTime), 1.0, 0.45 + 0.32*d);
        inner += cc * d * (1.0 - depth) * 0.16 * uAmp;
      }
      // bright kernel deep in the core
      inner += hsl(uHue - 0.02, 1.0, 0.9) * pow(ndv, 3.0) * 0.5 * uEnergy;

      // glassy surface: procedural env reflection + moving specular highlight
      vec3 Rv = reflect(rd, N);
      float up = Rv.y*0.5 + 0.5;
      vec3 env = mix(vec3(0.02,0.05,0.11), vec3(0.28,0.66,1.0), pow(up, 2.0));
      env += vec3(0.55,0.85,1.0) * pow(max(up-0.58, 0.0), 3.0) * 3.0;
      vec3 L = normalize(vec3(0.55, 0.75, 0.6));
      vec3 H = normalize(L - rd);
      float spec = pow(max(dot(N, H), 0.0), 70.0);
      vec3 rim = hsl(uHue, 1.0, 0.8) * fres * 1.1;

      vec3 surf = inner * (0.85 + 0.4*fres)      // plasma seen through the glass
                + env * fres * 0.7               // sky/studio reflection at grazing angles
                + rim                            // luminous fresnel edge
                + vec3(1.0) * spec;              // hard glass highlight
      surf *= (0.72 + 0.55*uEnergy);

      color = surf;
      alpha = 1.0;
    }
  }

  color *= uAppear;
  alpha *= uAppear;
  // premultiplied output so the glow composites cleanly over the page behind
  gl_FragColor = vec4(color * alpha, alpha);
}`;

// Per-mode uniform targets, lerped every frame so transitions feel alive.
// hue is a 0..1 fraction (0.5 == cyan / 180°).
export const MODES = {
  enter:    { energy: 0.45, hue: 0.528, glow: 0.6, amp: 0.75 },
  idle:     { energy: 0.75, hue: 0.531, glow: 0.95, amp: 1.0 },
  ask:      { energy: 1.05, hue: 0.520, glow: 1.1, amp: 1.1 },
  exercise: { energy: 1.05, hue: 0.492, glow: 1.0, amp: 1.05 },
  happy:    { energy: 1.35, hue: 0.470, glow: 1.3, amp: 1.2 },
  sad:      { energy: 0.35, hue: 0.585, glow: 0.7, amp: 0.7 },
  leave:    { energy: 0.10, hue: 0.560, glow: 0.3, amp: 0.5 },
};

export class Orb {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
    this.gl = gl;
    this.appear = 0;
    this.t = 0;
    this.cur = { ...MODES.enter };
    this.tgt = { ...MODES.enter };

    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('orb shader error:', gl.getShaderInfoLog(sh));
      }
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of ['uRes', 'uTime', 'uHue', 'uEnergy', 'uGlow', 'uAmp', 'uAppear']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();

    this.last = performance.now();
    this._raf = requestAnimationFrame((n) => this._frame(n));
  }

  setMode(mode) {
    if (MODES[mode]) this.tgt = { ...MODES[mode] };
  }

  // Sets an arbitrary {energy,hue,glow,amp} target directly — used to blend
  // continuously between two modes (e.g. "fill up" as the journal fills in)
  // rather than jumping straight to a named preset.
  setTarget(target) {
    this.tgt = { ...target };
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  _frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.appear = Math.min(1, this.appear + dt * 0.9);

    const k = Math.min(1, dt * 3.0);
    for (const key of Object.keys(this.cur)) {
      this.cur[key] += (this.tgt[key] - this.cur[key]) * k;
    }

    const gl = this.gl;
    const c = this.cur;
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uTime, this.t);
    gl.uniform1f(this.u.uHue, c.hue);
    gl.uniform1f(this.u.uEnergy, c.energy);
    gl.uniform1f(this.u.uGlow, c.glow);
    gl.uniform1f(this.u.uAmp, c.amp);
    gl.uniform1f(this.u.uAppear, this.appear);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this._raf = requestAnimationFrame((n) => this._frame(n));
  }
}

export function createOrb(canvas) {
  return new Orb(canvas);
}
