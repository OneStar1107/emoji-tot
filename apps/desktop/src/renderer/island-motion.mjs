/**
 * Pure damped-spring and geometry math for the island morph.
 *
 * Time is always seconds from the start of the current target. Sampling by an
 * absolute clock keeps the physical trajectory independent of display refresh
 * rate, while retargeting rebuilds the analytic solution from the current
 * position and velocity so a reversal stays continuous.
 */

export const DEFAULT_SPRING = Object.freeze({
  mass: 1,
  stiffness: 520,
  damping: 32,
});

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function springMetrics({
  mass = DEFAULT_SPRING.mass,
  stiffness = DEFAULT_SPRING.stiffness,
  damping = DEFAULT_SPRING.damping,
} = {}) {
  const m = positive(mass, DEFAULT_SPRING.mass);
  const k = positive(stiffness, DEFAULT_SPRING.stiffness);
  const c = Math.max(0, Number(damping) || 0);
  const omega = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const damped = omega * Math.sqrt(Math.max(1e-9, 1 - zeta * zeta));
  const overshoot = zeta < 1
    ? Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta))
    : 0;
  const settle99 = -Math.log(0.01) / Math.max(1e-9, zeta * omega);
  const settle98 = -Math.log(0.02) / Math.max(1e-9, zeta * omega);
  return { mass: m, stiffness: k, damping: c, omega, zeta, damped, overshoot, settle99, settle98 };
}

/**
 * Apple's underdamped spring vocabulary.
 *
 * response = 2π / sqrt(k/m)
 * bounce   = 1 - dampingFraction for the underdamped case
 */
export function appleSpringParameters(spring) {
  const metrics = springMetrics(spring);
  const response = (2 * Math.PI) / metrics.omega;
  return {
    response,
    dampingFraction: metrics.zeta,
    duration: response,
    bounce: Math.max(0, Math.min(1, 1 - metrics.zeta)),
  };
}

export function createSpring({
  mass = DEFAULT_SPRING.mass,
  stiffness = DEFAULT_SPRING.stiffness,
  damping = DEFAULT_SPRING.damping,
  from = 0,
  target = 1,
  velocity = 0,
  startedAt = 0,
} = {}) {
  const metrics = springMetrics({ mass, stiffness, damping });
  let goal = Number(target);
  let position = Number(from);
  let currentVelocity = Number(velocity) || 0;
  let y0 = position - goal;
  let anchor = Number(startedAt) || 0;

  function sample(seconds) {
    const t = Math.max(0, Number(seconds) - anchor);
    const wd = metrics.damped;
    const zeta = metrics.zeta;
    const omega = metrics.omega;
    const decay = Math.exp(-zeta * omega * t);
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    const b = (currentVelocity + zeta * omega * y0) / wd;
    const value = goal + decay * (y0 * cos + b * sin);
    const speed = decay * (
      currentVelocity * cos
      - ((omega * omega * y0 + zeta * omega * currentVelocity) / wd) * sin
    );
    return { position: value, velocity: speed };
  }

  function retarget(nextTarget, seconds) {
    const at = Math.max(0, Number(seconds) || 0);
    const state = sample(at);
    position = state.position;
    currentVelocity = state.velocity;
    goal = Number(nextTarget);
    y0 = position - goal;
    anchor = at;
  }

  return {
    retarget,
    sample,
    get metrics() {
      return metrics;
    },
    get target() {
      return goal;
    },
  };
}

/** Interpolate the one shape shared by width, height and all four corners. */
export function geometryAt(compact, expanded, progress) {
  const p = Number(progress);
  const at = Number.isFinite(p) ? p : 0;
  const mix = (a, b) => Number(a) + (Number(b) - Number(a)) * at;
  return {
    width: mix(compact.width, expanded.width),
    height: mix(compact.height, expanded.height),
    radius: mix(compact.radius, expanded.radius),
  };
}

/**
 * Whether an open panel is larger than the native transparent stage.
 *
 * `prepareBox()` normally grows the Windows surface before the first morph
 * frame. If its IPC reply is delayed or lost, the panel can remain laid out at
 * its final size inside the compact window and every lower row is clipped. This
 * predicate lets the renderer detect that recoverable mismatch after the morph
 * has settled and report the box again.
 */
export function stageNeedsRecovery(viewport, panel, padX = 0, padY = 0, tolerance = 2) {
  const viewportWidth = Number(viewport?.width);
  const viewportHeight = Number(viewport?.height);
  const panelWidth = Number(panel?.width);
  const panelHeight = Number(panel?.height);
  if (![viewportWidth, viewportHeight, panelWidth, panelHeight].every(Number.isFinite)) return false;
  if (panelWidth <= 0 || panelHeight <= 0) return false;
  const pad = Math.max(0, Number(tolerance) || 0);
  const wantedWidth = panelWidth + Math.max(0, Number(padX) || 0);
  const wantedHeight = panelHeight + Math.max(0, Number(padY) || 0);
  return (
    viewportWidth + pad < wantedWidth ||
    viewportHeight + pad < wantedHeight
  );
}
