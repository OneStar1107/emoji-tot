/**
 * The live character runtime.
 *
 * Node-safe rendering stays a pure SVG function. This module is the browser
 * layer around it: polygon eyes, spring-driven pose, gaze, blinking, state
 * transitions and short physical reactions. It deliberately owns no protocol
 * arbitration; a host still decides which state should be on screen.
 */
import { colorHex } from './palette.js';
import { faceFor, type EyeStyle } from './face.js';
import { getBody } from './body.js';
import { castMember } from './cast.js';
import {
  faceLayout,
  inkFor,
  renderCharacter,
  renderFaceDetails,
  type RenderStyle,
} from './render.js';
import {
  EYE_POLYGONS,
  createCharacterStateMachine,
  createSpring,
  morphPolygon,
  motionProfile,
  polygonPath,
  stepSpring,
  type EyePolygon,
  type MotionProfile,
  type PolygonPoint,
  type SpringState,
} from './motion/index.js';

export type CharacterMotionAction = 'spin' | 'bounce' | 'burst' | 'tilt' | 'wobble' | 'pulse' | 'float';

export interface CharacterRuntimeSnapshot {
  state: string;
  previous: string;
  eye: string;
  energy: number;
  rotation: number;
  lift: number;
  scaleY: number;
  paused: boolean;
  reducedMotion: boolean;
  transitionReason: string;
}

export interface CharacterRuntimeOptions {
  cast?: string;
  body?: string;
  shape?: string;
  color?: string;
  traits?: string[];
  state?: string;
  size?: number;
  style?: RenderStyle;
  followPointer?: boolean;
  paused?: boolean;
  reducedMotion?: boolean;
  onTelemetry?: (snapshot: CharacterRuntimeSnapshot) => void;
}

export interface CharacterRuntime {
  readonly root: HTMLElement;
  setState(state: string, reason?: string): void;
  setPaused(paused: boolean): void;
  setFollowPointer(follow: boolean): void;
  setPointer(x: number, y: number): void;
  pulse(action: CharacterMotionAction): void;
  snapshot(): CharacterRuntimeSnapshot;
  destroy(): void;
}

interface Particle {
  el: SVGPathElement;
  angle: number;
  speed: number;
  size: number;
  born: number;
}

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const SPARK_PATH =
  'M0 -1L.18 -.18L1 0L.18 .18L0 1L-.18 .18L-1 0L-.18 -.18Z';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function setSpringTarget(spring: SpringState, target: number): void {
  spring.target = target;
}

function hopHeight(elapsed: number): number {
  if (elapsed <= 0 || elapsed >= 0.92) return 0;
  const first = 0.54;
  const second = 0.92;
  if (elapsed < first) {
    const t = elapsed / first;
    return -15 * 4 * t * (1 - t);
  }
  const t = (elapsed - first) / (second - first);
  return -6 * 4 * t * (1 - t);
}

function eyeFill(style: string, ink: string): string {
  return style === 'heart' ? '#F0526E' : ink;
}

/**
 * Mount a live Tot into an existing host element.
 *
 * The returned object owns one RAF, a small collection of SVG nodes and one
 * pointer listener. `destroy()` is mandatory when a route or card unmounts.
 */
export function createCharacterRuntime(
  root: HTMLElement,
  input: CharacterRuntimeOptions = {},
): CharacterRuntime {
  const member = input.cast ? castMember(input.cast) : undefined;
  const initial = {
    cast: input.cast,
    body: member?.body ?? input.body ?? input.shape ?? 'circle',
    color: member?.color ?? input.color ?? 'black',
    traits: [...(member?.traits ?? input.traits ?? [])],
    state: input.state ?? member?.face ?? 'idle',
    size: input.size ?? 360,
    style: input.style ?? 'sticker',
  };
  const reducedMotion =
    input.reducedMotion ??
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const machine = createCharacterStateMachine(initial.state);
  let profile = motionProfile(initial.state);
  let paused = Boolean(input.paused);
  let followPointer = Boolean(input.followPointer);
  let state = initial.state;
  let eyeStyle: EyeStyle = profile.eyes[0];
  let raf = 0;
  let last = performance.now();
  let started = last;
  let lastTelemetry = -Infinity;
  let destroyed = false;
  let nextEyeAt = last + profile.eyeHold;
  let nextBlinkAt =
    profile.blinkMin > 0
      ? last + profile.blinkMin + Math.random() * (profile.blinkMax - profile.blinkMin)
      : Infinity;
  let blinkAt = -Infinity;
  let blinkDuration = 320;
  let hopAt = -Infinity;
  let spinAt = -Infinity;
  let pointerX = 0;
  let pointerY = 0;

  root.dataset.etRuntime = '';
  root.dataset.state = state;
  root.dataset.paused = String(paused);
  root.dataset.reducedMotion = String(reducedMotion);

  const markup = renderCharacter({
    body: initial.body,
    color: initial.color,
    traits: initial.traits,
    state: initial.state,
    size: initial.size,
    style: initial.style,
  });
  root.innerHTML = markup;
  const svg = root.querySelector<SVGSVGElement>('svg');
  if (!svg) throw new Error('Character runtime could not find its SVG.');
  const character = svg.querySelector<SVGGElement>('.et-character');
  const face = svg.querySelector<SVGGElement>('.et-face');
  if (!character || !face) throw new Error('Character runtime SVG is missing its rig layers.');
  const characterNode = character;
  const faceNode = face;
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.overflow = 'visible';

  const body = getBody(initial.body);
  const ink = inkFor(colorHex(initial.color));
  const baseEyeScale = body.eyeScale ?? 1;

  const signalBack = el('g', { class: 'et-signal-back', 'aria-hidden': 'true' });
  const signalFront = el('g', { class: 'et-signal-front', 'aria-hidden': 'true' });
  characterNode.before(signalBack);
  characterNode.after(signalFront);

  const liveFace = el('g', { class: 'et-live-face', 'aria-hidden': 'true' });
  const chromeHost = el('g', { class: 'et-live-chrome' });
  const eyeGroup = el('g', { class: 'et-polygon-eyes' });
  const eyePaths = [0, 1].map(() => {
    const path = el('path', { 'data-eye': '', fill: ink });
    eyeGroup.append(path);
    return path;
  });
  liveFace.append(chromeHost, eyeGroup);
  faceNode.replaceWith(liveFace);

  const particleLayer = el('g', { class: 'et-particles', 'aria-hidden': 'true' });
  svg.append(particleLayer);

  const pose = {
    x: createSpring(0),
    y: createSpring(0),
    rotate: createSpring(0),
    scaleX: createSpring(1),
    scaleY: createSpring(1),
    gazeX: createSpring(0),
    gazeY: createSpring(0),
    lid: createSpring(1),
    eyeMorph: createSpring(1),
    eyeScale: createSpring(1),
    chrome: createSpring(1),
    spin: createSpring(0),
  };

  let eyeFrom: readonly [EyePolygon, EyePolygon] = pairFor(
    eyeStyle,
    faceFor(initial.state).eyeAsym ?? 1,
  );
  let eyeTo: readonly [EyePolygon, EyePolygon] = eyeFrom;
  let incomingChrome: SVGGElement | null = null;
  let outgoingChrome: SVGGElement | null = null;
  let particles: Particle[] = [];
  let lastTransition = 'start';

  function pairFor(style: EyeStyle, asym = 1): readonly [EyePolygon, EyePolygon] {
    const polygon = EYE_POLYGONS[style] ?? EYE_POLYGONS.dot;
    return asym === 1
      ? [polygon, polygon]
      : [polygon, polygon.map(([x, y]) => [x * asym, y * asym] as const)];
  }

  function currentPair(): readonly [EyePolygon, EyePolygon] {
    const amount = Math.min(1, Math.max(0, pose.eyeMorph.value));
    return [
      morphPolygon(eyeFrom[0], eyeTo[0], amount),
      morphPolygon(eyeFrom[1], eyeTo[1], amount),
    ];
  }

  function morphEyes(style: EyeStyle): void {
    const nowPair = currentPair();
    const target = pairFor(style, faceFor(state).eyeAsym ?? 1);
    eyeFrom = nowPair;
    eyeTo = target;
    pose.eyeMorph.value = 0;
    pose.eyeMorph.velocity = 0;
    pose.eyeMorph.target = 1;
    eyeStyle = style;
  }

  function installChrome(animate: boolean): void {
    const spec = faceFor(state);
    const next = el('g', { class: 'et-face-details' });
    next.innerHTML = renderFaceDetails(
      state,
      body.face,
      ink,
      baseEyeScale,
      initial.style === 'dots' ? 1.7 : initial.style === 'line' ? 1.15 : 1,
    );
    chromeHost.append(next);
    if (animate && incomingChrome) {
      outgoingChrome?.remove();
      outgoingChrome = incomingChrome;
      outgoingChrome.setAttribute('opacity', '1');
    } else {
      outgoingChrome?.remove();
      outgoingChrome = null;
    }
    incomingChrome = next;
    pose.chrome.value = animate ? 0 : 1;
    pose.chrome.velocity = 0;
    pose.chrome.target = 1;
    next.setAttribute('opacity', animate ? '0' : '1');
    // Read the face once so a runtime with reduced motion still lands complete.
    if (!spec) outgoingChrome?.remove();
  }

  function installSignal(): void {
    signalBack.replaceChildren();
    signalFront.replaceChildren();
    if (profile.signal === 'none') return;
    const stroke = 'var(--motion-signal, #9683ff)';
    if (profile.signal === 'orbit') {
      for (let i = 0; i < 2; i += 1) {
        signalBack.append(
          el('circle', {
            class: 'et-signal-dot',
            r: i === 0 ? 2.8 : 2,
            fill: stroke,
            'data-signal-index': i,
          }),
        );
      }
    } else if (profile.signal === 'scan') {
      for (let i = 0; i < 3; i += 1) {
        signalBack.append(
          el('circle', {
            class: 'et-signal-ring',
            cx: 50,
            cy: 50,
            r: 40 + i * 5,
            fill: 'none',
            stroke,
            'stroke-width': 1.5,
            'data-signal-index': i,
          }),
        );
      }
    } else if (profile.signal === 'progress') {
      signalBack.append(
        el('circle', {
          class: 'et-signal-progress',
          cx: 50,
          cy: 50,
          r: 47,
          fill: 'none',
          stroke,
          'stroke-width': 2.4,
          'stroke-linecap': 'round',
          transform: 'rotate(-90 50 50)',
        }),
      );
    } else if (profile.signal === 'spark') {
      for (let i = 0; i < 5; i += 1) {
        signalFront.append(
          el('path', {
            class: 'et-signal-spark',
            d: SPARK_PATH,
            fill: i % 2 ? '#FFD34D' : stroke,
            'data-signal-index': i,
          }),
        );
      }
    }
  }

  function paintSignals(now: number): void {
    if (profile.signal === 'none') return;
    const time = (now - started) / 1000;
    if (profile.signal === 'orbit') {
      signalBack.querySelectorAll<SVGCircleElement>('[data-signal-index]').forEach((node) => {
        const index = Number(node.dataset.signalIndex);
        const angle = time * (1.15 + profile.energy * 0.7) + index * Math.PI;
        const radius = 46 + index * 3;
        node.setAttribute('cx', (50 + Math.cos(angle) * radius).toFixed(2));
        node.setAttribute('cy', (50 - 9 + Math.sin(angle) * radius * 0.42).toFixed(2));
        node.setAttribute('opacity', (0.42 + 0.38 * Math.sin(angle) ** 2).toFixed(3));
      });
    } else if (profile.signal === 'scan') {
      signalBack.querySelectorAll<SVGCircleElement>('[data-signal-index]').forEach((node) => {
        const index = Number(node.dataset.signalIndex);
        const phase = (time * 0.42 + index / 3) % 1;
        node.setAttribute('r', (40 + phase * 18).toFixed(2));
        node.setAttribute('opacity', ((1 - phase) * 0.34).toFixed(3));
        node.setAttribute('stroke-width', (1.8 - phase * 0.8).toFixed(2));
      });
    } else if (profile.signal === 'progress') {
      const node = signalBack.querySelector<SVGCircleElement>('.et-signal-progress');
      if (node) {
        const circumference = TAU * 47;
        node.setAttribute('stroke-dasharray', circumference.toFixed(2));
        node.setAttribute(
          'stroke-dashoffset',
          (circumference * (0.35 + 0.3 * Math.sin(time * 1.2))).toFixed(2),
        );
      }
    } else if (profile.signal === 'spark') {
      const nodes = signalFront.querySelectorAll<SVGPathElement>('.et-signal-spark');
      nodes.forEach((node, index) => {
        const angle = time * 1.3 + (index / nodes.length) * TAU;
        const radius = 47 + 2.5 * Math.sin(time * 2 + index);
        const size = 1.7 + 0.65 * Math.sin(time * 3 + index);
        node.setAttribute(
          'transform',
          `translate(${(50 + Math.cos(angle) * radius).toFixed(2)} ${(50 + Math.sin(angle) * radius * 0.76).toFixed(2)}) scale(${size.toFixed(2)})`,
        );
        node.setAttribute('opacity', (0.3 + 0.55 * (0.5 + 0.5 * Math.sin(angle))).toFixed(3));
      });
    }
  }

  function paintParticles(now: number): void {
    particles = particles.filter((particle) => {
      const age = (now - particle.born) / 1000;
      if (age >= 0.9) {
        particle.el.remove();
        return false;
      }
      const distance = 38 + particle.speed * age;
      const x = 50 + Math.cos(particle.angle) * distance;
      const y = 50 + Math.sin(particle.angle) * distance * 0.8 - age * 8;
      const opacity = Math.max(0, 1 - age / 0.9);
      particle.el.setAttribute(
        'transform',
        `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(particle.size * (0.65 + opacity * 0.6)).toFixed(2)}) rotate(${(age * 180).toFixed(1)})`,
      );
      particle.el.setAttribute('opacity', opacity.toFixed(3));
      return true;
    });
  }

  function burst(now: number): void {
    if (reducedMotion) return;
    const count = Math.round(10 + profile.energy * 10);
    for (let i = 0; i < count; i += 1) {
      const spark = el('path', {
        d: SPARK_PATH,
        fill: i % 3 === 0 ? '#FFD34D' : i % 2 ? 'var(--motion-signal, #9683ff)' : '#FF7C96',
      });
      particleLayer.append(spark);
      particles.push({
        el: spark,
        angle: (i / count) * TAU + Math.random() * 0.3,
        speed: 38 + Math.random() * 34,
        size: 1.8 + Math.random() * 2.5,
        born: now,
      });
    }
  }

  function blinkTarget(now: number): number {
    if (profile.blinkMin <= 0 || !Number.isFinite(nextBlinkAt)) return 1;
    if (now >= nextBlinkAt && blinkAt < 0) {
      blinkAt = now;
      blinkDuration = 280 + Math.random() * 90;
      nextBlinkAt = now + profile.blinkMin + Math.random() * (profile.blinkMax - profile.blinkMin);
    }
    if (blinkAt < 0) return 1;
    const phase = (now - blinkAt) / blinkDuration;
    if (phase < 0.15) return 0.08;
    if (phase < 0.32) return 0.06;
    if (phase < 0.72) return 1.08;
    if (phase < 1) return 1;
    blinkAt = -Infinity;
    return 1;
  }

  function pointerTargets(now: number): readonly [number, number] {
    const time = (now - started) / 1000;
    if (profile.gaze === 'pointer') return [pointerX * 2.8, pointerY * 2.2];
    if (profile.gaze === 'up') return [Math.sin(time * 0.65) * 0.5, -1.5];
    if (profile.gaze === 'down') return [Math.sin(time * 0.45) * 0.55, 1.45];
    if (profile.gaze === 'scan') {
      return [Math.sin(time * (1.1 + profile.energy)) * 1.8, Math.sin(time * 1.9) * 0.55];
    }
    if (profile.gaze === 'center') return [0, 0];
    return [Math.sin(time * 0.52) * 0.85, Math.sin(time * 0.74) * 0.5];
  }

  function paint(now: number): void {
    const layout = faceLayout(state, body.face, baseEyeScale);
    const pair = currentPair();
    const fill = eyeFill(eyeStyle, ink);
    for (let i = 0; i < 2; i += 1) {
      const x = (i ? layout.rightX : layout.leftX) + pose.gazeX.value;
      const y = layout.eyeY + pose.gazeY.value + (i ? 0.3 : -0.3);
      const scale = 4.9 * layout.eyeScale * pose.eyeScale.value;
      const lid = Math.max(0.035, pose.lid.value);
      eyePaths[i].setAttribute('d', polygonPath(pair[i]));
      eyePaths[i].setAttribute(
        'transform',
        `translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(4)} ${(scale * lid).toFixed(4)})`,
      );
      eyePaths[i].setAttribute('fill', fill);
    }

    const currentChrome = pose.chrome.value;
    if (outgoingChrome && incomingChrome) {
      outgoingChrome.setAttribute('opacity', (1 - currentChrome).toFixed(3));
      incomingChrome.setAttribute('opacity', currentChrome.toFixed(3));
      if (currentChrome > 0.998) {
        outgoingChrome.remove();
        outgoingChrome = null;
      }
    } else if (incomingChrome) {
      incomingChrome.setAttribute('opacity', '1');
    }

    characterNode.setAttribute(
      'transform',
      `translate(${pose.x.value.toFixed(3)} ${pose.y.value.toFixed(3)}) rotate(${(pose.rotate.value + pose.spin.value).toFixed(3)} 50 50) translate(50 50) scale(${pose.scaleX.value.toFixed(4)} ${pose.scaleY.value.toFixed(4)}) translate(-50 -50)`,
    );
    paintSignals(now);
    paintParticles(now);
  }

  function snapshot(): CharacterRuntimeSnapshot {
    return {
      state,
      previous: machine.snapshot().previous,
      eye: eyeStyle,
      energy: profile.energy,
      rotation: pose.rotate.value + pose.spin.value,
      lift: -pose.y.value,
      scaleY: pose.scaleY.value,
      paused,
      reducedMotion,
      transitionReason: lastTransition,
    };
  }

  function emitTelemetry(now: number, force = false): void {
    if (!input.onTelemetry || (!force && now - lastTelemetry < 100)) return;
    lastTelemetry = now;
    input.onTelemetry(snapshot());
  }

  function schedule(): void {
    if (!destroyed && !paused && !reducedMotion) raf = requestAnimationFrame(tick);
  }

  function tick(now: number): void {
    if (destroyed || paused) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const time = (now - started) / 1000;
    const breathe = Math.sin(time * (1.3 + profile.energy * 0.9));
    const hop = hopHeight((now - hopAt) / 1000);
    const [gazeX, gazeY] = pointerTargets(now);

    setSpringTarget(pose.x, Math.sin(time * 0.72) * profile.sway * 0.35 + pointerX * profile.energy);
    setSpringTarget(
      pose.y,
      Math.sin(time * 0.91) * profile.lift * 0.25 + pointerY * profile.energy * 0.55 + hop,
    );
    setSpringTarget(
      pose.rotate,
      Math.sin(time * 0.82) * profile.tilt * 0.32 + pointerX * profile.tilt * 0.75,
    );
    setSpringTarget(pose.scaleX, 1 - breathe * profile.breath * 0.42);
    setSpringTarget(pose.scaleY, 1 + breathe * profile.breath);
    setSpringTarget(pose.gazeX, gazeX);
    setSpringTarget(pose.gazeY, gazeY);
    setSpringTarget(pose.lid, blinkTarget(now));
    setSpringTarget(pose.eyeScale, 1 + profile.energy * 0.018);

    if (now >= nextEyeAt && profile.eyes.length > 1) {
      const index = Math.max(0, profile.eyes.indexOf(eyeStyle));
      morphEyes(profile.eyes[(index + 1 + profile.eyes.length) % profile.eyes.length]);
      nextEyeAt = now + profile.eyeHold * (0.75 + Math.random() * 0.5);
    }

    if (spinAt > 0 && now - spinAt > 760 && Math.abs(pose.spin.value - pose.spin.target) < 0.02) {
      pose.spin.value = 0;
      pose.spin.velocity = 0;
      pose.spin.target = 0;
      spinAt = -Infinity;
    }

    stepSpring(pose.x, dt, 4.8, 0.9);
    stepSpring(pose.y, dt, 5.4, 0.88);
    stepSpring(pose.rotate, dt, 4.2, 0.82);
    stepSpring(pose.scaleX, dt, 10, 0.78);
    stepSpring(pose.scaleY, dt, 10, 0.78);
    stepSpring(pose.gazeX, dt, 13, 1);
    stepSpring(pose.gazeY, dt, 13, 1);
    stepSpring(pose.lid, dt, 28, 1);
    stepSpring(pose.eyeMorph, dt, 10, 0.92);
    stepSpring(pose.eyeScale, dt, 8, 0.9);
    stepSpring(pose.chrome, dt, 10, 1);
    stepSpring(pose.spin, dt, 5.2, 0.92);

    paint(now);
    emitTelemetry(now);
    schedule();
  }

  function staticPaint(): void {
    const time = performance.now();
    const hop = hopHeight((time - hopAt) / 1000);
    pose.x.value = 0;
    pose.y.value = hop;
    pose.rotate.value = 0;
    pose.scaleX.value = 1;
    pose.scaleY.value = 1;
    pose.gazeX.value = 0;
    pose.gazeY.value = 0;
    pose.lid.value = 1;
    pose.eyeMorph.value = 1;
    pose.eyeScale.value = 1;
    pose.chrome.value = 1;
    paint(time);
    emitTelemetry(time, true);
  }

  function setState(next: string, reason = 'host'): void {
    if (!next) return;
    if (!machine.transition(next, reason, performance.now())) return;
    lastTransition = reason;
    state = next;
    profile = motionProfile(next);
    root.dataset.state = state;
    nextEyeAt = performance.now() + profile.eyeHold;
    nextBlinkAt =
      profile.blinkMin > 0
        ? performance.now() + profile.blinkMin + Math.random() * (profile.blinkMax - profile.blinkMin)
        : Infinity;
    blinkAt = -Infinity;
    morphEyes(profile.eyes[0]);
    installChrome(!reducedMotion);
    installSignal();
    if (reducedMotion) staticPaint();
    else emitTelemetry(performance.now(), true);
  }

  function setPaused(next: boolean): void {
    paused = next;
    root.dataset.paused = String(paused);
    if (paused) {
      cancelAnimationFrame(raf);
      raf = 0;
      emitTelemetry(performance.now(), true);
    } else if (!reducedMotion) {
      last = performance.now();
      schedule();
    }
  }

  function setFollowPointer(next: boolean): void {
    followPointer = next;
  }

  function setPointer(x: number, y: number): void {
    pointerX = Math.max(-1, Math.min(1, x));
    pointerY = Math.max(-1, Math.min(1, y));
  }

  function pulse(action: CharacterMotionAction): void {
    if (reducedMotion) return;
    const now = performance.now();
    if (action === 'spin' || action === 'wobble') {
      pose.spin.value = 0;
      pose.spin.velocity = 0;
      pose.spin.target = TAU * (action === 'wobble' ? 0.45 : 1);
      spinAt = now;
    } else if (action === 'bounce' || action === 'float') {
      hopAt = now;
    } else if (action === 'burst') {
      burst(now);
    } else if (action === 'tilt') {
      pose.rotate.velocity += 48;
    } else {
      pose.scaleX.velocity += 7;
      pose.scaleY.velocity -= 7;
    }
    emitTelemetry(now, true);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!followPointer) return;
    const rect = root.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setPointer(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      ((event.clientY - rect.top) / rect.height) * 2 - 1,
    );
  }

  function onPointerLeave(): void {
    pointerX = 0;
    pointerY = 0;
  }

  function onVisibility(): void {
    if (!document.hidden) last = performance.now();
  }

  root.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('pointerleave', onPointerLeave);
  document.addEventListener('visibilitychange', onVisibility);

  installChrome(false);
  installSignal();
  staticPaint();
  if (!reducedMotion && !paused) schedule();

  return {
    root,
    setState,
    setPaused,
    setFollowPointer,
    setPointer,
    pulse,
    snapshot,
    destroy(): void {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      particles = [];
      delete root.dataset.etRuntime;
      root.replaceChildren();
    },
  };
}

/** A tiny path helper useful to hosts drawing their own eye legend. */
export function runtimeSparkPath(points: readonly PolygonPoint[]): string {
  return polygonPath(points);
}
