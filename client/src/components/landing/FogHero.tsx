"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { readTheme, setTheme } from "@/components/site/theme";

const IMG = (file: string, w: number, q: number) =>
  `https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2F${file}&w=${w}&q=${q}`;

const SKY_M = IMG("hf_20261102_040343_a73684b4-3f71-4613-a843-c8be80fb1211.png", 1600, 80);
const SKY_N = IMG("hf_20261102_040308_f31964ab-ed8e-4ea4-90eb-3226c0859936.png", 1600, 80);
const GROUND_M = IMG("hf_20261102_040259_1be34093-835e-4de4-b3a8-f875e6a74591.png", 2560, 85);
const CUT_M = IMG("hf_20261102_040416_e3b05fa4-cc80-4a43-afde-8a0a053933e9.png", 2560, 85);
const GROUND_N = IMG("hf_20261102_040211_c8fd4865-285e-4c1f-8a37-4bfe0771357b.png", 2560, 85);
const CUT_N = IMG("hf_20261102_040415_2ab95096-8c39-449f-b36c-17c2813815a4.png", 2560, 85);

const VS = `#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;

const FS = `#version 300 es
precision highp float;
uniform vec2 R;uniform float T,S,K;out vec4 O;
float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;mat2 m=mat2(1.6,1.2,-1.2,1.6);p=mat2(.8,.6,-.6,.8)*p+5.3;for(int i=0;i<5;i++){s+=a*n(p);p=m*p;a*=.5;}return s;}
void main(){
  vec2 uv=gl_FragCoord.xy/R;uv.y=1.-uv.y;
  float asp=R.x/R.y;vec2 p=vec2(uv.x*asp,uv.y);
  float t=T*.05;
  vec2 w=vec2(fbm(p*1.3+vec2(t,-t*.6)),fbm(p*1.3+vec2(-t*.8,t)+7.));
  float d=fbm(p*1.9+w*1.7+vec2(t*1.6,-t*1.1+S*.5));
  float e=fbm(p*.9-w+vec2(-t,t*.5)+3.);
  float low=smoothstep(.70,1.04,uv.y+(d-.5)*.34);
  float side=smoothstep(.2,.0,uv.x+(e-.5)*.28)+smoothstep(.8,1.,uv.x+(e-.5)*.28);
  side*=smoothstep(.25,.6,uv.y)*.2;
  float wisps=smoothstep(.5,.78,d)*smoothstep(.22,.5,uv.y)*smoothstep(.86,.6,uv.y)*.18;
  float rest=clamp(low+side+wisps,0.,1.);
  float front=1.02-S*.68;
  float rise=smoothstep(front-.02,front+.26,uv.y+(d-.5)*.5);
  float haze=S*(.3+.46*d);
  float a=clamp(max(rest,max(rise*.97,haze)),0.,1.);
  vec3 dayA=vec3(.97,.93,.84),dayB=vec3(.79,.78,.71);
  vec3 nitA=vec3(.36,.45,.41),nitB=vec3(.10,.17,.14);
  vec3 c=mix(mix(dayB,dayA,d*1.15),mix(nitB,nitA,d*1.1),K);
  float porch=exp(-dot((uv-vec2(.72,.74))*vec2(1.7,2.6),(uv-vec2(.72,.74))*vec2(1.7,2.6))*3.2);
  c=mix(c,vec3(.86,.55,.27),K*porch*.42*(1.-S));
  O=vec4(c*a,a);
}`;

const SINK = 240;
const RISE = 820;
const DEPTH = 0.27;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  x = clamp((x - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/**
 * Morning / Night landing hero. The house sinks into a WebGL fog, the time of
 * day swaps while it is hidden, and it floats back up in the new light. The
 * choice also sets the site-wide light/dark theme.
 */
export function FogHero({ count, districts }: { count: number; districts: number }) {
  const router = useRouter();
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setMRef = useRef<HTMLDivElement>(null);
  const setNRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<(n: 0 | 1) => void>(() => {});
  const [pressed, setPressed] = useState<0 | 1>(1);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const hero = heroRef.current;
    const cv = canvasRef.current;
    if (!hero || !cv) return;
    const style = hero.style;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const startNight: 0 | 1 = readTheme() === "light" ? 0 : 1;
    let target: number = startNight;
    let from: number = startNight;
    let k: number = startNight;
    let start = -1e9;
    let queued: number | null = null;
    let swapped = true;
    let animating = false;
    let clock = 0;
    let raf = 0;
    let visible = true;

    const show = (n: number) => {
      setMRef.current?.classList.toggle("is-on", !n);
      setNRef.current?.classList.toggle("is-on", !!n);
    };
    show(startNight);
    setPressed(startNight);

    const gl = cv.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    const U: Record<string, WebGLUniformLocation | null> = {};
    if (gl) {
      const sh = (type: number, src: string) => {
        const o = gl.createShader(type)!;
        gl.shaderSource(o, src);
        gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o));
        return o;
      };
      const pr = gl.createProgram()!;
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr);
      gl.useProgram(pr);
      for (const u of ["R", "T", "S", "K"]) U[u] = gl.getUniformLocation(pr, u);
    }

    const size = () => {
      if (!gl) return;
      const rect = hero.getBoundingClientRect();
      const w = Math.round(Math.min(rect.width, 960));
      const h = Math.round((w * rect.height) / rect.width);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    size();
    window.addEventListener("resize", size);

    const begin = (n: number, now: number) => {
      target = n;
      from = k;
      start = now;
      swapped = false;
      animating = true;
    };

    pickRef.current = (n) => {
      if (n === target && queued === null) return;
      setPressed(n);
      if (calm) {
        target = k = n;
        show(n);
        setTheme(n ? "dark" : "light");
        return;
      }
      if (animating) queued = n;
      else begin(n, clock);
    };

    const frame = (now: number) => {
      clock = now;
      const d = now - start;
      let y = 0;
      let s = 0;
      let dip = 0;
      let k2 = k;
      if (animating) {
        if (d < SINK) {
          const x = d / SINK;
          y = x * x * (3 - 2 * x) * DEPTH;
        } else {
          if (!swapped) {
            swapped = true;
            show(target);
            setTheme(target ? "dark" : "light");
          }
          const x = clamp((d - SINK) / RISE);
          y = Math.pow(1 - x, 3.4) * DEPTH;
        }
        s = smooth(0, SINK * 0.92, d) * (1 - smooth(SINK + 70, SINK + RISE * 0.92, d));
        dip = smooth(30, 190, d) * (1 - smooth(330, 720, d));
        k = from + (target - from) * smooth(120, 520, d);
        k2 = from + (target - from) * smooth(340, 760, d);
        if (d >= SINK + RISE) {
          animating = false;
          k = k2 = target;
          y = s = dip = 0;
          if (queued !== null && queued !== target) {
            const q = queued;
            queued = null;
            begin(q, now);
          } else queued = null;
        }
      }
      style.setProperty("--sink", `${(y * hero.clientHeight).toFixed(1)}px`);
      style.setProperty("--k", k.toFixed(3));
      style.setProperty("--k2", k2.toFixed(3));
      style.setProperty("--dip", dip.toFixed(3));
      if (gl) {
        gl.uniform2f(U.R, cv.width, cv.height);
        gl.uniform1f(U.T, now / 1000);
        gl.uniform1f(U.S, s);
        gl.uniform1f(U.K, k);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
    const loop = (t: number) => {
      frame(t);
      if (visible || animating) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Stop rendering the fog once the hero is scrolled away.
    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(hero);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", size);
    };
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore");
  };

  return (
    <main ref={heroRef} className="fog-hero">
      <div className="layer sky">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={SKY_M} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="skyN" alt="" src={SKY_N} />
      </div>
      <div className="layer home">
        <div className="set" ref={setMRef}>
          <div className="layer ground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={GROUND_M} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cut" alt="A family home in soft morning light" src={CUT_M} />
        </div>
        <div className="set is-on" ref={setNRef}>
          <div className="layer ground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={GROUND_N} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cut" alt="The same home at dusk with warm amber windows" src={CUT_N} />
        </div>
      </div>
      <div className="tilt" />
      <canvas ref={canvasRef} className="fog" aria-hidden="true" />

      <div className="ui">
        <header className="bar">
          <Link className="logo" href="/" aria-label="Hamptons AI Lettings home">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <path
                d="M20 5 4 18.5h4.2V35h9.3v-9.6h5V35h9.3V18.5H36Z"
                style={{ fill: "color-mix(in srgb,#6d8f2a calc((1 - var(--k))*100%),#d8ee8e)" }}
              />
            </svg>
            <span>
              Hamptons <small>AI lettings</small>
            </span>
          </Link>
          <ul className="links">
            <li><Link href="/explore">Homes</Link></li>
            <li><Link href="/haven">Haven</Link></li>
            <li><Link href="/explore?view=map">Map</Link></li>
            <li><Link href="/market">Market</Link></li>
            <li><Link href="/facts">Fact checks</Link></li>
            <li><Link href="/explore?saved=1">Shortlist</Link></li>
            <li><a href="#how">How it works</a></li>
          </ul>
          <div className="side">
            <Link href="/haven?try=viewing">Viewings</Link>
            <Link className="cta" href="/explore">Find your home</Link>
          </div>
        </header>

        <h1>
          <span className="l1">Homes that feel right</span>
          <span>
            <i>from first light</i> <span className="y">to late night</span>
          </span>
        </h1>

        <form className="search" onSubmit={submit} role="search">
          <Search size={18} aria-hidden style={{ opacity: 0.6, flex: "none" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Street, postcode or feature — e.g. E14, concierge, balcony"
            aria-label="Search homes"
          />
          <button type="submit">Search homes</button>
        </form>

        <div className="dock">
          <div className="toggle" role="group" aria-label="See homes by time of day">
            <button type="button" className="bm" aria-pressed={pressed === 0} onClick={() => pickRef.current(0)}>
              <b>Morning</b>
              <small>Daylight viewings</small>
            </button>
            <button type="button" className="bn" aria-pressed={pressed === 1} onClick={() => pickRef.current(1)}>
              <b>Night</b>
              <small>Evening viewings</small>
            </button>
          </div>
          <p className="cap">
            {count} homes to let across {districts} East London postcodes. Compare them, ask Haven, our AI agent,
            <br />
            about floor plans, commutes and the neighbourhood, then book a viewing by voice.
          </p>
        </div>
      </div>
      <a href="#discover" className="scrollcue" aria-label="Scroll to discover">
        Discover <span />
      </a>
    </main>
  );
}
