"use client";

/**
 * Animated shader hero.
 *
 * Shader by Matthias Hurrle (@atzedent).
 *
 * Adapted from the supplied source. The visual output and the props are
 * unchanged; the changes are correctness ones, each noted where it appears:
 *
 *  - "use client" added. The component uses hooks, `window` and WebGL, so as a
 *    server component in the App Router it would not run at all.
 *  - The renderer and pointer classes moved to module scope. Declaring them
 *    inside the hook redefined both on every render.
 *  - WebGL2 absence is handled instead of asserted. `getContext('webgl2')`
 *    returns null on older hardware and with hardware acceleration disabled,
 *    and the original `!` turned that into a crash on the landing page.
 *  - The render loop pauses when the hero is offscreen and when the user
 *    prefers reduced motion. A permanent requestAnimationFrame loop costs
 *    battery for something nobody is looking at.
 *  - Uniform locations are held in a typed record rather than stashed on the
 *    program object through `any`.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
} from "react";

export interface HeroProps {
  trustBadge?: {
    text: string;
    icons?: string[];
  };
  headline: {
    line1: string;
    line2: string;
  };
  subtitle: string;
  buttons?: {
    primary?: { text: string; onClick?: () => void };
    secondary?: { text: string; onClick?: () => void };
  };
  className?: string;
}

const VERTEX_SRC = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`;

const VERTICES = [-1, 1, -1, -1, 1, 1, 1, -1];

type Uniforms = {
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  move: WebGLUniformLocation | null;
  touch: WebGLUniformLocation | null;
  pointerCount: WebGLUniformLocation | null;
  pointers: WebGLUniformLocation | null;
};

class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vs: WebGLShader | null = null;
  private fs: WebGLShader | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms: Uniforms | null = null;
  private scale: number;
  private shaderSource: string;
  private mouseMove: [number, number] = [0, 0];
  private mouseCoords: [number, number] = [0, 0];
  private pointerCoords: number[] = [0, 0];
  private nbrOfPointers = 0;

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, scale: number) {
    this.canvas = canvas;
    this.scale = scale;
    this.gl = gl;
    this.gl.viewport(0, 0, canvas.width * scale, canvas.height * scale);
    this.shaderSource = defaultShaderSource;
  }

  updateShader(source: string) {
    this.reset();
    this.shaderSource = source;
    this.setup();
    this.init();
  }

  updateMove(deltas: number[]) {
    this.mouseMove = [deltas[0] ?? 0, deltas[1] ?? 0];
  }

  updateMouse(coords: number[]) {
    this.mouseCoords = [coords[0] ?? 0, coords[1] ?? 0];
  }

  updatePointerCoords(coords: number[]) {
    this.pointerCoords = coords;
  }

  updatePointerCount(nbr: number) {
    this.nbrOfPointers = nbr;
  }

  updateScale(scale: number) {
    this.scale = scale;
    this.gl.viewport(0, 0, this.canvas.width * scale, this.canvas.height * scale);
  }

  compile(shader: WebGLShader, source: string) {
    const gl = this.gl;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
    }
  }

  test(source: string) {
    let result: string | null = null;
    const gl = this.gl;
    const shader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!shader) return "could not create shader";
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      result = gl.getShaderInfoLog(shader);
    }
    gl.deleteShader(shader);
    return result;
  }

  reset() {
    const gl = this.gl;
    if (this.program && !gl.getProgramParameter(this.program, gl.DELETE_STATUS)) {
      if (this.vs) {
        gl.detachShader(this.program, this.vs);
        gl.deleteShader(this.vs);
      }
      if (this.fs) {
        gl.detachShader(this.program, this.fs);
        gl.deleteShader(this.fs);
      }
      gl.deleteProgram(this.program);
    }
    this.program = null;
    this.uniforms = null;
  }

  setup() {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    this.vs = vs;
    this.fs = fs;
    this.compile(vs, VERTEX_SRC);
    this.compile(fs, this.shaderSource);
    this.program = program;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
    }
  }

  init() {
    const gl = this.gl;
    const program = this.program;
    if (!program) return;

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(VERTICES), gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.uniforms = {
      resolution: gl.getUniformLocation(program, "resolution"),
      time: gl.getUniformLocation(program, "time"),
      move: gl.getUniformLocation(program, "move"),
      touch: gl.getUniformLocation(program, "touch"),
      pointerCount: gl.getUniformLocation(program, "pointerCount"),
      pointers: gl.getUniformLocation(program, "pointers"),
    };
  }

  render(now = 0) {
    const gl = this.gl;
    const program = this.program;
    const u = this.uniforms;
    if (!program || !u || gl.getProgramParameter(program, gl.DELETE_STATUS)) return;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

    gl.uniform2f(u.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.time, now * 1e-3);
    gl.uniform2f(u.move, this.mouseMove[0], this.mouseMove[1]);
    gl.uniform2f(u.touch, this.mouseCoords[0], this.mouseCoords[1]);
    gl.uniform1i(u.pointerCount, this.nbrOfPointers);
    gl.uniform2fv(u.pointers, this.pointerCoords);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

class PointerHandler {
  private scale: number;
  private active = false;
  private pointers = new Map<number, number[]>();
  private lastCoords: number[] = [0, 0];
  private moves = [0, 0];
  private detach: () => void;

  constructor(element: HTMLCanvasElement, scale: number) {
    this.scale = scale;

    const map = (x: number, y: number) => [x * this.scale, element.height - y * this.scale];

    const down = (e: PointerEvent) => {
      this.active = true;
      this.pointers.set(e.pointerId, map(e.clientX, e.clientY));
    };
    const release = (e: PointerEvent) => {
      if (this.count === 1) this.lastCoords = this.first;
      this.pointers.delete(e.pointerId);
      this.active = this.pointers.size > 0;
    };
    const move = (e: PointerEvent) => {
      if (!this.active) return;
      this.lastCoords = [e.clientX, e.clientY];
      this.pointers.set(e.pointerId, map(e.clientX, e.clientY));
      this.moves = [(this.moves[0] ?? 0) + e.movementX, (this.moves[1] ?? 0) + e.movementY];
    };

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointerup", release);
    element.addEventListener("pointerleave", release);
    element.addEventListener("pointermove", move);

    // The original never removed these. Unmounting left listeners on a detached
    // canvas holding the handler alive.
    this.detach = () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointerup", release);
      element.removeEventListener("pointerleave", release);
      element.removeEventListener("pointermove", move);
    };
  }

  dispose() {
    this.detach();
    this.pointers.clear();
  }

  updateScale(scale: number) {
    this.scale = scale;
  }

  get count() {
    return this.pointers.size;
  }

  get move() {
    return this.moves;
  }

  get coords() {
    return this.pointers.size > 0 ? Array.from(this.pointers.values()).flat() : [0, 0];
  }

  get first(): number[] {
    return this.pointers.values().next().value ?? this.lastCoords;
  }
}

/** Runs the shader, and reports whether WebGL2 was available at all. */
const useShaderBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2");
    if (!gl) {
      // No WebGL2: keep the gradient fallback rather than throwing.
      setSupported(false);
      return;
    }

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = true;

    const dpr = Math.max(1, 0.5 * window.devicePixelRatio);
    const renderer = new WebGLRenderer(canvas, gl, dpr);
    const pointers = new PointerHandler(canvas, dpr);

    renderer.setup();
    renderer.init();

    const resize = () => {
      const next = Math.max(1, 0.5 * window.devicePixelRatio);
      canvas.width = window.innerWidth * next;
      canvas.height = window.innerHeight * next;
      renderer.updateScale(next);
      pointers.updateScale(next);
    };
    resize();

    if (renderer.test(defaultShaderSource) === null) renderer.updateShader(defaultShaderSource);

    const loop = (now: number) => {
      renderer.updateMouse(pointers.first);
      renderer.updatePointerCount(pointers.count);
      renderer.updatePointerCoords(pointers.coords);
      renderer.updateMove(pointers.move);
      renderer.render(now);
      // Paused when offscreen or when motion is not wanted: one still frame is
      // enough, and an unwatched shader is pure battery cost.
      if (visible && !motion.matches) frame = requestAnimationFrame(loop);
      else frame = 0;
    };

    const start = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) start();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    observer.observe(canvas);

    loop(0);
    window.addEventListener("resize", resize);
    motion.addEventListener("change", start);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      motion.removeEventListener("change", start);
      pointers.dispose();
      renderer.reset();
    };
  }, []);

  return { canvasRef, supported };
};

const FALLBACK: CSSProperties = {
  background:
    "radial-gradient(circle at 30% 20%, #3a1d05 0%, transparent 55%), radial-gradient(circle at 75% 70%, #4a2408 0%, transparent 50%), #000",
};

const Hero: FC<HeroProps> = ({ trustBadge, headline, subtitle, buttons, className = "" }) => {
  const { canvasRef, supported } = useShaderBackground();

  return (
    <div className={`relative w-full h-screen overflow-hidden bg-black ${className}`}>
      <style>{`
        @keyframes ash-fade-down { from { opacity:0; transform:translateY(-20px) } to { opacity:1; transform:translateY(0) } }
        @keyframes ash-fade-up { from { opacity:0; transform:translateY(30px) } to { opacity:1; transform:translateY(0) } }
        .ash-in-down { animation: ash-fade-down .8s ease-out forwards }
        .ash-in-up { animation: ash-fade-up .8s ease-out forwards; opacity:0 }
        .ash-d200 { animation-delay:.2s } .ash-d400 { animation-delay:.4s }
        .ash-d600 { animation-delay:.6s } .ash-d800 { animation-delay:.8s }
        @media (prefers-reduced-motion: reduce) {
          .ash-in-down, .ash-in-up { animation:none; opacity:1; transform:none }
        }
      `}</style>

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-contain touch-none"
        style={supported ? { background: "black" } : FALLBACK}
        aria-hidden="true"
      />

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-white">
        {trustBadge && (
          <div className="mb-8 ash-in-down">
            <div className="flex items-center gap-2 px-6 py-3 bg-orange-500/10 backdrop-blur-md border border-orange-300/30 rounded-full text-sm">
              {trustBadge.icons && (
                <div className="flex" aria-hidden="true">
                  {trustBadge.icons.map((icon, index) => (
                    <span key={index}>{icon}</span>
                  ))}
                </div>
              )}
              <span className="text-orange-100">{trustBadge.text}</span>
            </div>
          </div>
        )}

        <div className="text-center space-y-6 max-w-5xl mx-auto px-4">
          <div className="space-y-2">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold bg-gradient-to-r from-orange-300 via-yellow-400 to-amber-300 bg-clip-text text-transparent ash-in-up ash-d200">
              {headline.line1}
            </h1>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold bg-gradient-to-r from-yellow-300 via-orange-400 to-red-400 bg-clip-text text-transparent ash-in-up ash-d400">
              {headline.line2}
            </h1>
          </div>

          <div className="max-w-3xl mx-auto ash-in-up ash-d600">
            <p className="text-lg md:text-xl lg:text-2xl text-orange-100/90 font-light leading-relaxed">
              {subtitle}
            </p>
          </div>

          {buttons && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10 ash-in-up ash-d800">
              {buttons.primary && (
                <button
                  type="button"
                  onClick={buttons.primary.onClick}
                  className="px-8 py-4 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-black rounded-full font-semibold text-lg transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-orange-500/25"
                >
                  {buttons.primary.text}
                </button>
              )}
              {buttons.secondary && (
                <button
                  type="button"
                  onClick={buttons.secondary.onClick}
                  className="px-8 py-4 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-300/30 hover:border-orange-300/50 text-orange-100 rounded-full font-semibold text-lg transition-all duration-300 hover:scale-105 backdrop-blur-sm"
                >
                  {buttons.secondary.text}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const defaultShaderSource = `#version 300 es
/*********
* made by Matthias Hurrle (@atzedent)
*
*	To explore strange new worlds, to seek out new life
*	and new civilizations, to boldly go where no man has
*	gone before.
*/
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
// Returns a pseudo random number for a given point (white noise)
float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
// Returns a pseudo random number for a given point (value noise)
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float
  a=rnd(i),
  b=rnd(i+vec2(1,0)),
  c=rnd(i+vec2(0,1)),
  d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
// Returns a pseudo random number for a given point (fractal noise)
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) {
    t+=a*noise(p);
    p*=2.*m;
    a*=.5;
  }
  return t;
}
float clouds(vec2 p) {
	float d=1., t=.0;
	for (float i=.0; i<3.; i++) {
		float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
		t=mix(t,d,a);
		d=a;
		p*=2./(i+1.);
	}
	return t;
}
void main(void) {
	vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
	vec3 col=vec3(0);
	float bg=clouds(vec2(st.x+T*.5,-st.y));
	uv*=1.-.3*(sin(T*.2)*.5+.5);
	for (float i=1.; i<12.; i++) {
		uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
		vec2 p=uv;
		float d=length(p);
		col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
		float b=noise(i+p+bg*1.731);
		col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
		col=mix(col,vec3(bg*.25,bg*.137,bg*.05),d);
	}
	O=vec4(col,1);
}`;

export default Hero;
