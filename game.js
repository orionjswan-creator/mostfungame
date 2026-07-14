/* =========================================================================
   CANNONBALL COVE — a pirate artillery / physics-destruction game
   Pure JS + canvas. No dependencies, no external assets.
   Physics: small impulse-based rigid body engine (circles + oriented boxes),
   in the style of Randy Gaul's "Impulse Engine".
   ========================================================================= */
'use strict';

/* ============================== 1. MATH ================================ */
function v2(x, y){ return { x, y }; }
function add(a, b){ return v2(a.x + b.x, a.y + b.y); }
function sub(a, b){ return v2(a.x - b.x, a.y - b.y); }
function mul(a, s){ return v2(a.x * s, a.y * s); }
function neg(a){ return v2(-a.x, -a.y); }
function dot(a, b){ return a.x * b.x + a.y * b.y; }
function crossVV(a, b){ return a.x * b.y - a.y * b.x; }
function crossSV(s, a){ return v2(-s * a.y, s * a.x); }
function len2(a){ return a.x * a.x + a.y * a.y; }
function len(a){ return Math.sqrt(len2(a)); }
function dist2(a, b){ return len2(sub(a, b)); }
function normz(a){ const l = len(a); return l < 1e-9 ? v2(1, 0) : mul(a, 1 / l); }
function clone(a){ return v2(a.x, a.y); }
function clamp(x, lo, hi){ return x < lo ? lo : x > hi ? hi : x; }
function lerp(a, b, t){ return a + (b - a) * t; }
function rand(lo, hi){ return lo + Math.random() * (hi - lo); }
function randi(lo, hi){ return Math.floor(rand(lo, hi + 1)); }
function mat2(angle){ return { c: Math.cos(angle), s: Math.sin(angle) }; }
function mulM(m, p){ return v2(m.c * p.x - m.s * p.y, m.s * p.x + m.c * p.y); }
function mulT(m, p){ return v2(m.c * p.x + m.s * p.y, -m.s * p.x + m.c * p.y); }

/* ============================== 2. AUDIO =============================== */
const Sound = {
  ctx: null, muted: false, master: null,
  init(){
    if(this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    } catch(e){ /* no audio available */ }
  },
  noise(dur){
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  },
  env(gainNode, t0, peak, dur){
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + 0.012);
    g.exponentialRampToValueAtTime(0.0001, t0 + dur);
  },
  play(kind){
    if(this.muted || !this.ctx) return;
    if(this.ctx.state === 'suspended') this.ctx.resume();
    const c = this.ctx, t = c.currentTime;
    const out = this.master;
    const mk = (node, peak, dur) => {
      const g = c.createGain();
      this.env(g, t, peak, dur);
      node.connect(g); g.connect(out);
      return g;
    };
    switch(kind){
      case 'boom': {
        const n = this.noise(0.5), f = c.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.setValueAtTime(600, t);
        f.frequency.exponentialRampToValueAtTime(80, t + 0.4);
        n.connect(f); mk(f, 0.9, 0.5); n.start(t);
        const o = c.createOscillator();
        o.type = 'sine'; o.frequency.setValueAtTime(90, t);
        o.frequency.exponentialRampToValueAtTime(34, t + 0.4);
        mk(o, 0.8, 0.45); o.start(t); o.stop(t + 0.5);
        break;
      }
      case 'explode': {
        const n = this.noise(0.8), f = c.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.setValueAtTime(2500, t);
        f.frequency.exponentialRampToValueAtTime(60, t + 0.7);
        n.connect(f); mk(f, 1.0, 0.8); n.start(t);
        const o = c.createOscillator();
        o.type = 'triangle'; o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
        mk(o, 0.9, 0.6); o.start(t); o.stop(t + 0.7);
        break;
      }
      case 'crack': {
        const n = this.noise(0.12), f = c.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 900;
        n.connect(f); mk(f, 0.5, 0.12); n.start(t);
        break;
      }
      case 'thud': {
        const o = c.createOscillator();
        o.type = 'sine'; o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
        mk(o, 0.4, 0.12); o.start(t); o.stop(t + 0.15);
        break;
      }
      case 'splash': {
        const n = this.noise(0.45), f = c.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(300, t + 0.35);
        f.Q.value = 0.8;
        n.connect(f); mk(f, 0.5, 0.45); n.start(t);
        break;
      }
      case 'pop': {
        const o = c.createOscillator();
        o.type = 'square'; o.frequency.setValueAtTime(440, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
        mk(o, 0.3, 0.14); o.start(t); o.stop(t + 0.16);
        break;
      }
      case 'pickup': {
        [660, 880, 1320].forEach((fr, i) => {
          const o = c.createOscillator();
          o.type = 'sine'; o.frequency.value = fr;
          const g = c.createGain();
          this.env(g, t + i * 0.07, 0.3, 0.18);
          o.connect(g); g.connect(out);
          o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.2);
        });
        break;
      }
      case 'win': {
        [523, 659, 784, 1046].forEach((fr, i) => {
          const o = c.createOscillator();
          o.type = 'triangle'; o.frequency.value = fr;
          const g = c.createGain();
          this.env(g, t + i * 0.13, 0.35, 0.4);
          o.connect(g); g.connect(out);
          o.start(t + i * 0.13); o.stop(t + i * 0.13 + 0.45);
        });
        break;
      }
      case 'lose': {
        [392, 330, 262, 196].forEach((fr, i) => {
          const o = c.createOscillator();
          o.type = 'sawtooth'; o.frequency.value = fr;
          const g = c.createGain();
          this.env(g, t + i * 0.18, 0.18, 0.35);
          o.connect(g); g.connect(out);
          o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.4);
        });
        break;
      }
      case 'click': {
        const o = c.createOscillator();
        o.type = 'sine'; o.frequency.value = 700;
        mk(o, 0.15, 0.06); o.start(t); o.stop(t + 0.08);
        break;
      }
      case 'fuse': {
        const n = this.noise(0.2), f = c.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 3000;
        n.connect(f); mk(f, 0.12, 0.2); n.start(t);
        break;
      }
      case 'whistle': {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(1300, t);
        o.frequency.exponentialRampToValueAtTime(350, t + 1.1);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.15);
        break;
      }
    }
  }
};

/* ========================== 3. PHYSICS ENGINE ========================== */
const GRAVITY = v2(0, 1350);
const PHYS_DT = 1 / 120;
const SOLVER_ITER = 8;
const PEN_PERCENT = 0.35, PEN_SLOP = 0.06;

let BODY_ID = 1;

class Body {
  constructor(shape, x, y, o = {}){
    this.id = BODY_ID++;
    this.shape = shape;                    // {type:'circle', r} | {type:'box', w, h, verts, norms}
    this.pos = v2(x, y);
    this.vel = v2(0, 0);
    this.angle = o.angle || 0;
    this.angVel = 0;
    this.force = v2(0, 0);
    this.torque = 0;
    this.restitution = o.restitution ?? 0.15;
    this.sf = o.sf ?? 0.55;                // static friction
    this.df = o.df ?? 0.4;                 // dynamic friction
    this.density = o.density ?? 1;
    // game-side
    this.kind = o.kind || 'block';         // block | pirate | ball | barrel | static
    this.material = o.material || 'wood';  // wood | stone | barrel | deck | bulwark | metal
    this.hp = o.hp ?? Infinity;
    this.maxHp = this.hp;
    this.ballType = o.ballType || null;
    this.big = o.big || false;
    this.seed = Math.random();
    this.dead = false;
    this.flash = 0;
    this.wasAboveWater = true;
    this.restT = 0;                        // for cannonball "spent" detection
    this.lifeT = 0;
    this.abilityUsed = false;
    this.fuseT = 0;
    this.computeMass();
    if(o.isStatic) this.setStatic();
  }
  computeMass(){
    if(this.shape.type === 'circle'){
      const r = this.shape.r;
      this.mass = this.density * Math.PI * r * r / 1000;
      this.I = 0.5 * this.mass * r * r;
    } else {
      const { w, h } = this.shape;
      this.mass = this.density * w * h / 1000;
      this.I = this.mass * (w * w + h * h) / 12;
    }
    this.im = this.mass > 0 ? 1 / this.mass : 0;
    this.iI = this.I > 0 ? 1 / this.I : 0;
  }
  setStatic(){
    this.mass = 0; this.im = 0; this.I = 0; this.iI = 0;
  }
  applyImpulse(imp, contactVec){
    this.vel = add(this.vel, mul(imp, this.im));
    this.angVel += this.iI * crossVV(contactVec, imp);
  }
}

function circleShape(r){ return { type: 'circle', r }; }
function boxShape(w, h){
  const hw = w / 2, hh = h / 2;
  // vertices ordered so each face i = verts[i] -> verts[i+1] with outward normal
  const verts = [v2(-hw, -hh), v2(hw, -hh), v2(hw, hh), v2(-hw, hh)];
  const norms = [v2(0, -1), v2(1, 0), v2(0, 1), v2(-1, 0)];
  return { type: 'box', w, h, verts, norms };
}
function supportPoint(shape, dir){
  let best = -Infinity, bv = shape.verts[0];
  for(const vv of shape.verts){
    const p = dot(vv, dir);
    if(p > best){ best = p; bv = vv; }
  }
  return bv;
}

class Manifold {
  constructor(a, b){
    this.a = a; this.b = b;
    this.normal = v2(0, 0);
    this.penetration = 0;
    this.contacts = [];
    this.e = 0; this.sf = 0; this.df = 0;
    this.impact = 0; // max approach speed along normal (for damage)
  }
  initialize(){
    const a = this.a, b = this.b;
    this.e = Math.min(a.restitution, b.restitution);
    this.sf = Math.sqrt(a.sf * b.sf);
    this.df = Math.sqrt(a.df * b.df);
    for(const c of this.contacts){
      const ra = sub(c, a.pos), rb = sub(c, b.pos);
      const rv = sub(add(b.vel, crossSV(b.angVel, rb)), add(a.vel, crossSV(a.angVel, ra)));
      const vn = dot(rv, this.normal);
      if(-vn > this.impact) this.impact = -vn;
      // resting contact: kill restitution so stacks settle
      if(len2(rv) < len2(mul(GRAVITY, PHYS_DT)) * 1.2 + 1e-4) this.e = 0;
    }
  }
  applyImpulse(){
    const a = this.a, b = this.b;
    if(a.im + b.im < 1e-9) return;
    const cc = this.contacts.length;
    for(const c of this.contacts){
      const ra = sub(c, a.pos), rb = sub(c, b.pos);
      let rv = sub(add(b.vel, crossSV(b.angVel, rb)), add(a.vel, crossSV(a.angVel, ra)));
      const contactVel = dot(rv, this.normal);
      if(contactVel > 0) continue;
      const raCn = crossVV(ra, this.normal), rbCn = crossVV(rb, this.normal);
      const invMassSum = a.im + b.im + raCn * raCn * a.iI + rbCn * rbCn * b.iI;
      const j = -(1 + this.e) * contactVel / invMassSum / cc;
      const imp = mul(this.normal, j);
      a.applyImpulse(neg(imp), ra);
      b.applyImpulse(imp, rb);
      // friction
      rv = sub(add(b.vel, crossSV(b.angVel, rb)), add(a.vel, crossSV(a.angVel, ra)));
      let t = sub(rv, mul(this.normal, dot(rv, this.normal)));
      const tl = len(t);
      if(tl < 1e-6) continue;
      t = mul(t, 1 / tl);
      let jt = -dot(rv, t) / invMassSum / cc;
      if(Math.abs(jt) < 1e-6) continue;
      let tImp;
      if(Math.abs(jt) < j * this.sf) tImp = mul(t, jt);
      else tImp = mul(t, -j * this.df);
      a.applyImpulse(neg(tImp), ra);
      b.applyImpulse(tImp, rb);
    }
  }
  positionalCorrection(){
    const a = this.a, b = this.b;
    const s = a.im + b.im;
    if(s < 1e-9) return;
    const corr = mul(this.normal, Math.max(this.penetration - PEN_SLOP, 0) / s * PEN_PERCENT);
    a.pos = sub(a.pos, mul(corr, a.im));
    b.pos = add(b.pos, mul(corr, b.im));
  }
}

/* --- narrowphase --- */
function collide(m){
  const a = m.a, b = m.b;
  const ac = a.shape.type === 'circle', bc = b.shape.type === 'circle';
  if(ac && bc) circleCircle(m);
  else if(ac && !bc) circleToPoly(m, a, b, false);
  else if(!ac && bc) circleToPoly(m, b, a, true);
  else polyToPoly(m);
}

function circleCircle(m){
  const a = m.a, b = m.b;
  const n = sub(b.pos, a.pos);
  const r = a.shape.r + b.shape.r;
  const d2 = len2(n);
  if(d2 >= r * r) return;
  const d = Math.sqrt(d2);
  if(d < 1e-8){
    m.penetration = a.shape.r;
    m.normal = v2(1, 0);
    m.contacts.push(clone(a.pos));
  } else {
    m.penetration = r - d;
    m.normal = mul(n, 1 / d);
    m.contacts.push(add(mul(m.normal, a.shape.r), a.pos));
  }
}

// circle cb vs polygon pb; if flip, the manifold is (poly, circle) so negate normal
function circleToPoly(m, cb, pb, flip){
  const S = pb.shape;
  const u = mat2(pb.angle);
  const r = cb.shape.r;
  const center = mulT(u, sub(cb.pos, pb.pos));
  let separation = -Infinity, faceNormal = 0;
  const n = S.verts.length;
  for(let i = 0; i < n; i++){
    const s = dot(S.norms[i], sub(center, S.verts[i]));
    if(s > r) return;
    if(s > separation){ separation = s; faceNormal = i; }
  }
  const v1 = S.verts[faceNormal], vB = S.verts[(faceNormal + 1) % n];
  let normal, contact;
  if(separation < 1e-6){
    normal = neg(mulM(u, S.norms[faceNormal]));
    contact = add(mul(normal, r), cb.pos);
    m.penetration = r;
  } else {
    m.penetration = r - separation;
    const d1 = dot(sub(center, v1), sub(vB, v1));
    const d2v = dot(sub(center, vB), sub(v1, vB));
    if(d1 <= 0){
      if(dist2(center, v1) > r * r) return;
      normal = normz(mulM(u, sub(v1, center)));
      contact = add(mulM(u, v1), pb.pos);
    } else if(d2v <= 0){
      if(dist2(center, vB) > r * r) return;
      normal = normz(mulM(u, sub(vB, center)));
      contact = add(mulM(u, vB), pb.pos);
    } else {
      const fn = S.norms[faceNormal];
      if(dot(sub(center, v1), fn) > r) return;
      normal = neg(mulM(u, fn));
      contact = add(mul(normal, r), cb.pos);
    }
  }
  m.normal = flip ? neg(normal) : normal;
  m.contacts.push(contact);
}

function findAxisLeastPenetration(A, B){
  let bestD = -Infinity, bestI = 0;
  const sa = A.shape, sb = B.shape;
  const ua = mat2(A.angle), ub = mat2(B.angle);
  for(let i = 0; i < sa.verts.length; i++){
    const nw = mulM(ua, sa.norms[i]);
    const n = mulT(ub, nw);
    const s = supportPoint(sb, neg(n));
    let vtx = add(mulM(ua, sa.verts[i]), A.pos);
    vtx = mulT(ub, sub(vtx, B.pos));
    const d = dot(n, sub(s, vtx));
    if(d > bestD){ bestD = d; bestI = i; }
  }
  return [bestD, bestI];
}

function findIncidentFace(refBody, incBody, refIndex){
  const uR = mat2(refBody.angle), uI = mat2(incBody.angle);
  let refNormal = mulM(uR, refBody.shape.norms[refIndex]);
  refNormal = mulT(uI, refNormal);
  const s = incBody.shape;
  let incidentFace = 0, minDot = Infinity;
  for(let i = 0; i < s.verts.length; i++){
    const d = dot(refNormal, s.norms[i]);
    if(d < minDot){ minDot = d; incidentFace = i; }
  }
  return [
    add(mulM(uI, s.verts[incidentFace]), incBody.pos),
    add(mulM(uI, s.verts[(incidentFace + 1) % s.verts.length]), incBody.pos)
  ];
}

function clipFace(n, c, face){
  let sp = 0;
  const out = [face[0], face[1]];
  const d1 = dot(n, face[0]) - c;
  const d2 = dot(n, face[1]) - c;
  if(d1 <= 0) out[sp++] = face[0];
  if(d2 <= 0) out[sp++] = face[1];
  if(d1 * d2 < 0){
    const alpha = d1 / (d1 - d2);
    out[sp++] = add(face[0], mul(sub(face[1], face[0]), alpha));
  }
  face[0] = out[0]; face[1] = out[1];
  return sp;
}

function biasGreaterThan(a, b){ return a >= b * 0.95 + a * 0.01; }

function polyToPoly(m){
  const A = m.a, B = m.b;
  const [penA, faceA] = findAxisLeastPenetration(A, B);
  if(penA >= 0) return;
  const [penB, faceB] = findAxisLeastPenetration(B, A);
  if(penB >= 0) return;
  let ref, inc, refIndex, flip;
  if(biasGreaterThan(penA, penB)){ ref = A; inc = B; refIndex = faceA; flip = false; }
  else { ref = B; inc = A; refIndex = faceB; flip = true; }
  const incFace = findIncidentFace(ref, inc, refIndex);
  const uR = mat2(ref.angle);
  const rs = ref.shape;
  const rv1 = add(mulM(uR, rs.verts[refIndex]), ref.pos);
  const rv2 = add(mulM(uR, rs.verts[(refIndex + 1) % rs.verts.length]), ref.pos);
  const sidePlaneNormal = normz(sub(rv2, rv1));
  const refFaceNormal = v2(sidePlaneNormal.y, -sidePlaneNormal.x);
  const refC = dot(refFaceNormal, rv1);
  const negSide = -dot(sidePlaneNormal, rv1);
  const posSide = dot(sidePlaneNormal, rv2);
  if(clipFace(neg(sidePlaneNormal), negSide, incFace) < 2) return;
  if(clipFace(sidePlaneNormal, posSide, incFace) < 2) return;
  m.normal = flip ? neg(refFaceNormal) : refFaceNormal;
  let cp = 0, pen = 0;
  for(let i = 0; i < 2; i++){
    const sep = dot(refFaceNormal, incFace[i]) - refC;
    if(sep <= 0){ m.contacts.push(incFace[i]); pen += -sep; cp++; }
  }
  if(cp > 0) m.penetration = pen / cp;
}

class World {
  constructor(){
    this.bodies = [];
    this.manifolds = [];
  }
  add(b){ this.bodies.push(b); return b; }
  step(dt){
    const bodies = this.bodies;
    this.manifolds = [];
    // broadphase (n is small) + narrowphase
    for(let i = 0; i < bodies.length; i++){
      const a = bodies[i];
      if(a.dead) continue;
      for(let j = i + 1; j < bodies.length; j++){
        const b = bodies[j];
        if(b.dead) continue;
        if(a.im === 0 && b.im === 0) continue;
        const m = new Manifold(a, b);
        collide(m);
        if(m.contacts.length) this.manifolds.push(m);
      }
    }
    // integrate forces
    for(const b of bodies){
      if(b.im === 0 || b.dead) continue;
      b.vel = add(b.vel, mul(add(GRAVITY, mul(b.force, b.im)), dt));
      b.angVel += b.torque * b.iI * dt;
      // damping (heavier on pirates so they don't roll forever)
      const ad = b.kind === 'pirate' ? 0.90 : 0.997;
      b.angVel *= ad;
      // crude sleep: strong damping when almost at rest
      if(len2(b.vel) < 64 && Math.abs(b.angVel) < 0.08){
        b.vel = mul(b.vel, 0.8);
        b.angVel *= 0.8;
      }
      // clamp
      const sp2 = len2(b.vel);
      if(sp2 > 3000 * 3000) b.vel = mul(b.vel, 3000 / Math.sqrt(sp2));
      b.angVel = clamp(b.angVel, -25, 25);
    }
    for(const m of this.manifolds) m.initialize();
    for(let it = 0; it < SOLVER_ITER; it++)
      for(const m of this.manifolds) m.applyImpulse();
    // integrate velocities
    for(const b of bodies){
      if(b.im === 0 || b.dead) continue;
      b.pos = add(b.pos, mul(b.vel, dt));
      b.angle += b.angVel * dt;
    }
    for(const m of this.manifolds) m.positionalCorrection();
    for(const b of bodies){ b.force = v2(0, 0); b.torque = 0; }
  }
  removeDead(){
    this.bodies = this.bodies.filter(b => !b.dead);
  }
  maxDynamicSpeed(){
    let mx = 0;
    for(const b of this.bodies){
      if(b.im === 0 || b.dead) continue;
      const s = len(b.vel);
      if(s > mx) mx = s;
    }
    return mx;
  }
}

/* ====================== 4. GAME CONSTANTS & STATE ======================= */
const W = 1280, H = 720;
const WATER_Y = 640;
const CANNON = v2(185, 474);
const DMG_T = 70, DMG_K = 0.055;

const AMMO_INFO = {
  ball:  { label: 'Cannonball', tip: null },
  split: { label: 'Grapeshot',  tip: 'Tap mid-flight to split into 3!' },
  bomb:  { label: 'Bombshell',  tip: 'Tap mid-flight to detonate!' },
  heavy: { label: 'Kraken Ball', tip: 'Heavy — smashes through stone!' }
};

const game = {
  state: 'menu',            // menu | levels | play | result
  levelIdx: 0,
  world: new World(),
  particles: [],
  popups: [],
  explosions: [],           // scheduled {t,x,y,r,dmg,power}
  liveBalls: [],
  primaryBall: null,        // most recent fired ball (for tap ability)
  ammo: [],
  ammoIndex: 0,
  canFire: false,
  reloadT: 0,
  score: 0,
  piratesTotal: 0,
  hulls: [],
  platforms: [],
  chests: [],
  aiming: false,
  aimStart: v2(0, 0),
  aimNow: v2(0, 0),
  cannonAngle: -0.5,
  recoil: 0,
  shake: 0,
  time: 0,
  hintT: 0,
  hintText: '',
  endTimer: -1,
  endKind: null,
  settleT: 0,
  lastActionT: 0,
  won: false,
  muzzleFlash: 0,
  hull: 100,
  hullMax: 100,
  hullFlash: 0,
  sunk: false,
  enemyGuns: [],
  smolders: []
};

/* progress persistence */
const SAVE_KEY = 'ccove_save_v1';
function loadSave(){
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { stars: [], best: [] }; }
  catch(e){ return { stars: [], best: [] }; }
}
function storeSave(s){
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch(e){}
}
let save = loadSave();

/* ========================= 5. ENTITY FACTORIES ========================== */
function addStaticBox(x, y, w, h, material){
  return game.world.add(new Body(boxShape(w, h), x, y, {
    isStatic: true, kind: 'static', material,
    restitution: 0.08, sf: 0.7, df: 0.55
  }));
}

const H_ = {   // level-building helpers; placed "on groundTop", return new top
  DECK: 500,
  enemyShip(cx, w){
    this.DECK = 500;
    addStaticBox(cx, this.DECK + 14, w, 28, 'deck');
    addStaticBox(cx - w / 2 + 7, this.DECK - 15, 12, 30, 'bulwark');
    addStaticBox(cx + w / 2 - 7, this.DECK - 15, 12, 30, 'bulwark');
    game.hulls.push({ cx, w, topY: this.DECK, enemy: true });
  },
  platform(cx, topY, w){
    addStaticBox(cx, topY + 8, w, 16, 'deck');
    game.platforms.push({ cx, w, topY, baseY: this.DECK });
  },
  plank(x, groundTop, w = 110){
    const h = 14;
    game.world.add(new Body(boxShape(w, h), x, groundTop - h / 2 - 0.25, {
      kind: 'block', material: 'wood', hp: 60, density: 1.0, restitution: 0.08, sf: 0.6, df: 0.45
    }));
    return groundTop - h;
  },
  post(x, groundTop, h = 74){
    const w = 14;
    game.world.add(new Body(boxShape(w, h), x, groundTop - h / 2 - 0.25, {
      kind: 'block', material: 'wood', hp: 55, density: 1.0, restitution: 0.08, sf: 0.6, df: 0.45
    }));
    return groundTop - h;
  },
  crate(x, groundTop, s = 42){
    game.world.add(new Body(boxShape(s, s), x, groundTop - s / 2 - 0.25, {
      kind: 'block', material: 'wood', hp: 55, density: 1.0, restitution: 0.08, sf: 0.62, df: 0.5
    }));
    return groundTop - s;
  },
  stone(x, groundTop, w, h){
    game.world.add(new Body(boxShape(w, h), x, groundTop - h / 2 - 0.25, {
      kind: 'block', material: 'stone', hp: 240, density: 2.6, restitution: 0.04, sf: 0.7, df: 0.55
    }));
    return groundTop - h;
  },
  barrel(x, groundTop){
    const w = 34, h = 46;
    game.world.add(new Body(boxShape(w, h), x, groundTop - h / 2 - 0.25, {
      kind: 'barrel', material: 'barrel', hp: 22, density: 0.9, restitution: 0.1, sf: 0.55, df: 0.45
    }));
    return groundTop - h;
  },
  pirate(x, groundTop, big = false){
    const r = big ? 22 : 17;
    const b = game.world.add(new Body(circleShape(r), x, groundTop - r - 0.25, {
      kind: 'pirate', hp: big ? 110 : 38, density: 0.95,
      restitution: 0.05, sf: 0.9, df: 0.8, big
    }));
    game.piratesTotal++;
    return b;
  },
  chest(x){
    game.chests.push({ x, y0: WATER_Y - 8, t: rand(0, 6), taken: false });
  }
};

/* ============================== 6. LEVELS =============================== */
const LEVELS = [
  {
    name: 'First Blood',
    ammo: ['ball', 'ball', 'ball', 'ball'],
    stars: [3400, 4700],
    fire: { interval: 10, variance: 90, delay: 5.5, guns: 1 },
    hint: 'Drag anywhere, pull back, release — FIRE!',
    build(h){
      h.enemyShip(950, 400);
      h.pirate(810, h.DECK);
      const t1 = h.post(890, h.DECK);
      h.post(970, h.DECK);
      const t2 = h.plank(930, t1, 130);
      h.pirate(930, t2);
      const t3 = h.crate(1080, h.DECK);
      h.pirate(1080, t3);
    }
  },
  {
    name: 'Powder Keg',
    ammo: ['ball', 'ball', 'ball', 'ball'],
    stars: [4300, 5600],
    fire: { interval: 8.5, variance: 75, delay: 4.5, guns: 1 },
    hint: 'Red barrels go BOOM. Aim for them — and mind yer hull!',
    build(h){
      h.enemyShip(950, 420);
      const t1 = h.crate(790, h.DECK);
      h.pirate(790, t1);
      h.pirate(840, h.DECK);
      h.barrel(880, h.DECK);
      const t2 = h.post(940, h.DECK);
      h.post(1020, h.DECK);
      const t3 = h.plank(980, t2, 128);
      h.pirate(980, t3);
      h.barrel(1080, h.DECK);
      const t4 = h.crate(1124, h.DECK);
      h.pirate(1124, t4);
    }
  },
  {
    name: 'Grapeshot Alley',
    ammo: ['ball', 'split', 'split', 'ball'],
    stars: [4800, 6400],
    fire: { interval: 7.5, variance: 65, delay: 4.5, guns: 1 },
    hint: 'Grapeshot: tap while flying to split into 3!',
    build(h){
      h.enemyShip(920, 360);
      h.platform(1000, 402, 170);
      const t1 = h.crate(795, h.DECK);
      h.pirate(795, t1);
      h.pirate(965, h.DECK);        // hides under the platform
      h.pirate(955, 402);
      h.barrel(1000, 402);
      h.pirate(1055, 402);
      h.chest(540);
    }
  },
  {
    name: 'Iron Sides',
    ammo: ['bomb', 'bomb', 'ball', 'bomb'],
    stars: [4000, 5500],
    fire: { interval: 7, variance: 55, delay: 4, guns: 1 },
    hint: 'Bombshells: tap mid-air to detonate over the wall!',
    build(h){
      h.enemyShip(960, 420);
      const p1 = h.stone(810, h.DECK, 26, 105);
      h.stone(900, h.DECK, 26, 105);
      const t1 = h.stone(855, p1, 140, 20);
      h.pirate(855, t1);
      h.pirate(970, h.DECK);
      h.pirate(1050, h.DECK);
      h.barrel(1110, h.DECK);
    }
  },
  {
    name: 'The Flagship',
    ammo: ['ball', 'heavy', 'split', 'bomb', 'ball'],
    stars: [5200, 7000],
    fire: { interval: 6.5, variance: 45, delay: 4, guns: 2 },
    hint: 'Two bow chasers! The Kraken Ball smashes anything!',
    build(h){
      h.enemyShip(950, 460);
      h.pirate(762, h.DECK);
      const t1 = h.post(790, h.DECK);
      h.post(866, h.DECK);
      const t2 = h.plank(828, t1, 130);
      h.pirate(828, t2);
      const p1 = h.stone(950, h.DECK, 26, 92);
      h.stone(1030, h.DECK, 26, 92);
      const t3 = h.stone(990, p1, 134, 18);
      h.pirate(990, t3);
      h.barrel(990, h.DECK);
      const c1 = h.crate(1120, h.DECK);
      const c2 = h.crate(1120, c1);
      h.pirate(1120, c2);
      h.chest(500);
    }
  },
  {
    name: "Davy Jones' Door",
    ammo: ['split', 'heavy', 'bomb', 'ball', 'bomb'],
    stars: [5800, 7800],
    fire: { interval: 6, variance: 40, delay: 3.5, guns: 2 },
    hint: 'The Captain waits atop the aft deck. Send him swimming!',
    build(h){
      h.enemyShip(940, 460);
      h.platform(1060, 388, 190);
      const p1 = h.stone(770, h.DECK, 26, 100);
      h.stone(850, h.DECK, 26, 100);
      const t1 = h.stone(810, p1, 124, 18);
      h.pirate(810, t1);
      h.barrel(810, h.DECK);
      h.pirate(915, h.DECK);
      h.pirate(1000, h.DECK);       // under the platform
      h.barrel(1105, h.DECK);
      h.pirate(1030, 388, true);    // the Captain
      h.crate(1120, 388);
      h.chest(520);
    }
  },
  {
    name: 'Ironclad Reef',
    ammo: ['bomb', 'ball', 'bomb', 'split', 'bomb'],
    stars: [5200, 6900],
    fire: { interval: 5.5, variance: 40, delay: 3.5, guns: 2 },
    hint: 'Stone casemates! Blast through — or blast NEAR them.',
    build(h){
      h.enemyShip(950, 460);
      const p1 = h.stone(770, h.DECK, 26, 100);
      h.stone(850, h.DECK, 26, 100);
      const t1 = h.stone(810, p1, 124, 18);
      h.pirate(810, t1);
      h.barrel(810, h.DECK);
      h.pirate(920, h.DECK);
      const p2 = h.stone(1000, h.DECK, 26, 100);
      h.stone(1080, h.DECK, 26, 100);
      const t2 = h.stone(1040, p2, 124, 18);
      h.pirate(1040, h.DECK);       // sheltered inside the casemate
      h.pirate(1040, t2);
      h.barrel(1130, h.DECK);
      h.chest(560);
    }
  },
  {
    name: 'Twin Terrors',
    ammo: ['split', 'bomb', 'heavy', 'ball', 'bomb'],
    stars: [5500, 7000],
    fire: { interval: 6.5, variance: 45, delay: 4, guns: 1 },
    hint: 'TWO ships, two guns! Sink the raider, then the flagship.',
    build(h){
      // forward raider
      h.enemyShip(690, 220);
      const t1 = h.crate(630, h.DECK);
      h.pirate(630, t1);
      h.pirate(690, h.DECK);
      h.barrel(745, h.DECK);
      // main ship behind
      h.enemyShip(1070, 280);
      const t2 = h.post(985, h.DECK);
      h.post(1060, h.DECK);
      const t3 = h.plank(1022, t2, 120);
      h.pirate(1022, t3, true);     // the First Mate
      h.pirate(1022, h.DECK);
      const c1 = h.crate(1140, h.DECK);
      const c2 = h.crate(1140, c1);
      h.pirate(1140, c2);
      h.chest(865);                 // floats in the gap between the ships
    }
  },
  {
    name: "The Kraken's Court",
    ammo: ['bomb', 'heavy', 'split', 'bomb', 'ball', 'bomb'],
    stars: [6400, 8300],
    fire: { interval: 5, variance: 32, delay: 3, guns: 2 },
    hint: 'The final gauntlet. Chain the barrels or be sent below!',
    build(h){
      h.enemyShip(940, 500);
      h.platform(1080, 380, 200);
      const p1 = h.stone(740, h.DECK, 26, 110);
      h.stone(820, h.DECK, 26, 110);
      const t1 = h.stone(780, p1, 120, 18);
      h.pirate(780, t1);
      h.barrel(780, h.DECK);
      h.pirate(880, h.DECK);
      h.barrel(935, h.DECK);
      h.pirate(1040, h.DECK);       // hides under the platform
      h.barrel(1110, h.DECK);
      h.pirate(1030, 380, true);    // the Kraken Captain
      const c1 = h.crate(1110, 380);
      h.pirate(1110, c1);
      h.chest(500);
    }
  },
  {
    name: 'Blood Moon Armada',
    ammo: ['ball', 'split', 'heavy', 'bomb', 'ball'],
    stars: [5000, 6800],
    fire: { interval: 5.2, variance: 34, delay: 3, guns: 1 },
    hint: 'Two hulls, two guns — pick a target and commit!',
    build(h){
      h.enemyShip(660, 230);
      const t1 = h.crate(610, h.DECK);
      h.pirate(610, t1);
      h.pirate(680, h.DECK);
      h.barrel(730, h.DECK);

      h.enemyShip(1050, 300);
      const p1 = h.stone(970, h.DECK, 24, 95);
      h.stone(1040, h.DECK, 24, 95);
      const t2 = h.stone(1005, p1, 108, 16);
      h.pirate(1005, t2);
      h.pirate(1005, h.DECK);
      const c1 = h.crate(1120, h.DECK);
      h.pirate(1120, c1);
      h.chest(860);
    }
  },
  {
    name: 'The Widowmaker',
    ammo: ['heavy', 'bomb', 'bomb', 'split', 'ball'],
    stars: [4700, 6300],
    fire: { interval: 4.6, variance: 24, delay: 3, guns: 2 },
    hint: 'Fast twin guns, thick stone — hit hard, hit fast!',
    build(h){
      h.enemyShip(960, 460);
      const p1 = h.stone(770, h.DECK, 26, 105);
      h.stone(850, h.DECK, 26, 105);
      const t1 = h.stone(810, p1, 130, 18);
      h.pirate(810, t1);
      h.barrel(810, h.DECK);

      h.pirate(900, h.DECK);

      const p2 = h.stone(985, h.DECK, 26, 105);
      h.stone(1065, h.DECK, 26, 105);
      const t2 = h.stone(1025, p2, 130, 18);
      h.pirate(1025, t2, true);     // the Widowmaker's Captain
      h.pirate(1025, h.DECK);

      h.barrel(1140, h.DECK);
      h.chest(560);
    }
  },
  {
    name: 'Storm Armada',
    ammo: ['bomb', 'heavy', 'split', 'bomb', 'ball', 'bomb'],
    stars: [5000, 6600],
    fire: { interval: 4.5, variance: 20, delay: 3, guns: 2 },
    hint: 'Four guns blazing! Silence them fast or go to Davy Jones.',
    build(h){
      h.enemyShip(700, 230);
      const t1 = h.crate(650, h.DECK);
      h.pirate(650, t1);
      h.pirate(715, h.DECK);
      h.barrel(760, h.DECK);

      h.enemyShip(1075, 300);
      const p1 = h.stone(995, h.DECK, 24, 95);
      h.stone(1060, h.DECK, 24, 95);
      const t2 = h.stone(1028, p1, 100, 16);
      h.pirate(1028, t2, true);     // the Storm Captain
      h.pirate(1028, h.DECK);
      h.barrel(1150, h.DECK);
      h.chest(880);
    }
  }
];

/* ====================== 7. PARTICLES & EFFECTS ========================== */
function spawnParticles(x, y, opts){
  const { n = 10, kind = 'smoke', color = '#888', speed = 200, size = 5, life = 0.7, gravity = 1 } = opts;
  for(let i = 0; i < n; i++){
    const a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
    game.particles.push({
      x, y,
      vx: Math.cos(a) * s + (opts.vx || 0),
      vy: Math.sin(a) * s + (opts.vy || 0),
      life: rand(life * 0.5, life), maxLife: life,
      kind, color, size: rand(size * 0.6, size * 1.4),
      rot: rand(0, 6.3), vr: rand(-6, 6), grav: gravity
    });
  }
}
function addPopup(x, y, text, color = '#ffd23e'){
  game.popups.push({ x, y, text, color, life: 1.3, maxLife: 1.3 });
}
function shake(mag){ game.shake = Math.max(game.shake, mag); }

function scheduleExplosion(x, y, r, dmg, power, delay = 0){
  game.explosions.push({ t: delay, x, y, r, dmg, power });
}

function detonate(x, y, r, dmg, power){
  Sound.play('explode');
  shake(1);
  if(y < WATER_Y - 10) game.smolders.push({ x, y: Math.min(y, WATER_Y - 30), t: rand(3, 4.5) });
  spawnParticles(x, y, { n: 26, kind: 'fire', color: '#ff9d2e', speed: 350, size: 12, life: 0.55, gravity: 0.2 });
  spawnParticles(x, y, { n: 18, kind: 'smoke', color: '#5a5a5a', speed: 160, size: 16, life: 1.1, gravity: -0.15 });
  spawnParticles(x, y, { n: 12, kind: 'spark', color: '#ffe27a', speed: 520, size: 3, life: 0.4, gravity: 0.6 });
  game.lastActionT = game.time;
  for(const b of game.world.bodies){
    if(b.dead || b.im === 0) continue;
    const d = Math.sqrt(dist2(b.pos, v2(x, y)));
    if(d > r) continue;
    const falloff = 1 - d / r;
    const dir = d < 1 ? v2(0, -1) : mul(sub(b.pos, v2(x, y)), 1 / d);
    const factor = clamp(0.3 + 2.4 * b.im, 0.35, 2.0);
    b.vel = add(b.vel, mul(dir, power * falloff * factor));
    b.angVel += rand(-4, 4) * falloff;
    if(b.hp !== Infinity){
      b.hp -= dmg * falloff;
      b.flash = 1;
      if(b.hp <= 0) destroyBody(b);
    }
  }
}

/* ======================= 8. DAMAGE & DESTRUCTION ======================== */
function hurt(body, other, impact){
  if(body.dead || body.hp === Infinity) return;
  const mf = other.im === 0 ? 1.3 : clamp(other.mass, 0.5, 5.5);
  let mult = 1;
  if(other.kind === 'ball') mult = other.ballType === 'heavy' ? 2.3 : 1.6;
  if(body.kind === 'pirate') mult *= 1.6;   // pirates are squishy — tumbles & debris hurt
  const dmg = (impact - DMG_T) * DMG_K * mf * mult;
  if(dmg < 2) return;
  body.hp -= dmg;
  body.flash = 1;
  game.lastActionT = game.time;
  if(body.hp <= 0) destroyBody(body);
}

function destroyBody(b){
  if(b.dead) return;
  b.dead = true;
  const { x, y } = b.pos;
  switch(b.kind){
    case 'pirate': {
      const pts = b.big ? 2000 : 1000;
      game.score += pts;
      addPopup(x, y - 24, '+' + pts);
      spawnParticles(x, y, { n: 14, kind: 'poof', color: '#dfe8ee', speed: 140, size: 10, life: 0.6, gravity: -0.2 });
      spawnParticles(x, y, { n: 6, kind: 'spark', color: '#ff5b45', speed: 220, size: 4, life: 0.5 });
      Sound.play('pop');
      break;
    }
    case 'barrel': {
      game.score += 150;
      addPopup(x, y - 20, '+150');
      Sound.play('fuse');
      scheduleExplosion(x, y, 135, 105, 520, 0.12);
      spawnParticles(x, y, { n: 10, kind: 'shard', color: '#7c3f1d', speed: 260, size: 6, life: 0.7 });
      break;
    }
    case 'block': {
      const pts = b.material === 'stone' ? 200 : 100;
      game.score += pts;
      addPopup(x, y - 16, '+' + pts, '#ffe9b0');
      const col = b.material === 'stone' ? '#8f979e' : '#a5713d';
      spawnParticles(x, y, { n: 12, kind: 'shard', color: col, speed: 240, size: 6, life: 0.8 });
      Sound.play(b.material === 'stone' ? 'thud' : 'crack');
      break;
    }
    case 'ball':
      break;
  }
  game.lastActionT = game.time;
}

function killInWater(b){
  const { x } = b.pos;
  spawnParticles(x, WATER_Y, { n: 12, kind: 'drop', color: '#bfe6f7', speed: 260, size: 5, life: 0.7, vy: -220 });
  Sound.play('splash');
  if(b.kind === 'pirate' && !b.dead){
    const pts = b.big ? 2000 : 1000;
    game.score += pts;
    addPopup(x, WATER_Y - 30, '+' + pts);
    game.lastActionT = game.time;
  }
  b.dead = true;
}

/* ========================== 9. SHOOTING LOGIC =========================== */
function ballSpec(type){
  switch(type){
    case 'bomb':  return { r: 12, density: 6.5 };
    case 'heavy': return { r: 18, density: 13 };
    case 'split': return { r: 11, density: 7.8 };
    default:      return { r: 11, density: 7.8 };
  }
}

function spawnBall(type, x, y, vel, sub = false){
  const spec = sub ? { r: 7, density: 7.8 } : ballSpec(type);
  const b = game.world.add(new Body(circleShape(spec.r), x, y, {
    kind: 'ball', ballType: type, density: spec.density,
    restitution: 0.28, sf: 0.4, df: 0.3
  }));
  b.vel = clone(vel);
  b.isSub = sub;
  game.liveBalls.push(b);
  return b;
}

function fireCannon(dir, power){
  const type = game.ammo[game.ammoIndex];
  game.ammoIndex++;
  game.canFire = false;
  const speed = 320 + power * 1120;
  const muzzle = add(CANNON, mul(dir, 52));
  const b = spawnBall(type, muzzle.x, muzzle.y, mul(dir, speed));
  game.primaryBall = b;
  game.recoil = 1;
  game.muzzleFlash = 1;
  game.cannonAngle = Math.atan2(dir.y, dir.x);
  shake(0.25);
  Sound.play('boom');
  spawnParticles(muzzle.x, muzzle.y, { n: 10, kind: 'smoke', color: '#888', speed: 120, size: 10, life: 0.8, gravity: -0.2 });
  spawnParticles(muzzle.x, muzzle.y, { n: 8, kind: 'spark', color: '#ffce54', speed: 300, size: 3, life: 0.3 });
  const tip = AMMO_INFO[type].tip;
  if(tip){ game.hintText = tip; game.hintT = 3.2; }
  game.lastActionT = game.time;
}

function useAbility(){
  const b = game.primaryBall;
  if(!b || b.dead || b.abilityUsed) return;
  if(b.ballType === 'bomb'){
    b.abilityUsed = true;
    b.dead = true;
    detonate(b.pos.x, b.pos.y, 150, 130, 620);
  } else if(b.ballType === 'split'){
    b.abilityUsed = true;
    b.dead = true;
    Sound.play('crack');
    const sp = len(b.vel) * 0.96;
    const baseA = Math.atan2(b.vel.y, b.vel.x);
    for(const da of [-0.20, 0, 0.20]){
      spawnBall('ball', b.pos.x, b.pos.y, v2(Math.cos(baseA + da) * sp, Math.sin(baseA + da) * sp), true);
    }
    spawnParticles(b.pos.x, b.pos.y, { n: 8, kind: 'smoke', color: '#777', speed: 90, size: 7, life: 0.5 });
  }
}

/* ------- enemy return fire ------- */
function fireEnemyGun(gun){
  // ballistic solve: lob at the player ship with per-level scatter
  const tx = rand(120, 300) + rand(-gun.variance, gun.variance);
  const T = rand(1.35, 1.7);
  const sx = gun.x - 14, sy = gun.y - 8;
  const vx = (tx - sx) / T;
  const vy = (505 - sy) / T - 0.5 * GRAVITY.y * T;
  const b = game.world.add(new Body(circleShape(10), sx, sy, {
    kind: 'ball', ballType: 'ball', density: 7.8,
    restitution: 0.28, sf: 0.4, df: 0.3
  }));
  b.vel = v2(vx, vy);
  b.isEnemy = true;
  gun.flash = 1;
  Sound.play('boom');
  Sound.play('whistle');
  spawnParticles(sx, sy, { n: 8, kind: 'smoke', color: '#888', speed: 100, size: 8, life: 0.7, gravity: -0.2 });
  spawnParticles(sx, sy, { n: 6, kind: 'spark', color: '#ffce54', speed: 240, size: 3, life: 0.25 });
}

function damageHull(amount, x){
  if(game.sunk || game.state !== 'play') return;
  game.hull = Math.max(0, game.hull - amount);
  game.hullFlash = 1;
  addPopup(x, 468, '-' + Math.round(amount), '#ff6b57');
  shake(0.5);
  Sound.play('crack');
  Sound.play('thud');
  spawnParticles(x, 505, { n: 10, kind: 'shard', color: '#7c4a24', speed: 220, size: 5, life: 0.7 });
  game.lastActionT = game.time;
  if(game.hull <= 0){
    game.sunk = true;
    game.canFire = false;
    game.aiming = false;
    detonate(180, 490, 150, 0, 300);   // dramatic blast on our deck
    if(game.endKind !== 'win'){
      game.endKind = 'lose';
      game.endTimer = 1.3;
    }
  }
}

/* ============================ 10. LEVEL FLOW ============================ */
function loadLevel(idx){
  game.levelIdx = idx;
  game.world = new World();
  game.particles = [];
  game.popups = [];
  game.explosions = [];
  game.liveBalls = [];
  game.primaryBall = null;
  game.score = 0;
  game.piratesTotal = 0;
  game.hulls = [];
  game.platforms = [];
  game.chests = [];
  game.ammoIndex = 0;
  game.aiming = false;
  game.recoil = 0;
  game.shake = 0;
  game.endTimer = -1;
  game.endKind = null;
  game.reloadT = 0;
  game.won = false;
  game.settleT = 0;
  game.lastActionT = 0;
  game.time = 0;
  game.cannonAngle = -0.5;

  game.hull = game.hullMax = 100;
  game.hullFlash = 0;
  game.sunk = false;
  game.enemyGuns = [];
  game.smolders = [];

  // player ship deck (static)
  const pd = addStaticBox(180, 512, 310, 14, 'deck');
  pd.playerShip = true;
  game.hulls.push({ cx: 180, w: 310, topY: 505, enemy: false });

  const L = LEVELS[idx];
  game.ammo = L.ammo.slice();
  L.build(H_);

  // enemy return fire: bow-chaser mortars on every enemy hull
  if(L.fire){
    let gi = 0;
    for(const eh of game.hulls){
      if(!eh.enemy) continue;
      const gx = eh.cx - eh.w / 2 - 30, gy = eh.topY + 40;
      for(let g = 0; g < (L.fire.guns || 1); g++, gi++){
        game.enemyGuns.push({
          x: gx + g * 26, y: gy,
          t: L.fire.delay + gi * L.fire.interval * 0.5,
          interval: L.fire.interval, variance: L.fire.variance, flash: 0
        });
      }
    }
  }

  game.canFire = true;
  game.state = 'play';
  game.hintText = L.hint || '';
  game.hintT = 5;
  showOverlay(null);
  document.getElementById('ui-buttons').classList.remove('hidden');
}

function piratesLeft(){
  let n = 0;
  for(const b of game.world.bodies)
    if(b.kind === 'pirate' && !b.dead) n++;
  return n;
}

function finishLevel(won){
  game.state = 'result';
  game.won = won;
  const idx = game.levelIdx;
  let bonus = 0, hullBonus = 0;
  if(won){
    bonus = (game.ammo.length - game.ammoIndex) * 750;
    hullBonus = Math.round(game.hull) * 4;
    game.score += bonus + hullBonus;
    Sound.play('win');
  } else {
    Sound.play('lose');
  }
  const L = LEVELS[idx];
  const stars = won ? (game.score >= L.stars[1] ? 3 : game.score >= L.stars[0] ? 2 : 1) : 0;
  if(won){
    save.stars[idx] = Math.max(save.stars[idx] || 0, stars);
    save.best[idx] = Math.max(save.best[idx] || 0, game.score);
    storeSave(save);
  }
  // fill overlay
  document.getElementById('result-title').textContent =
    won ? ['Victory!', 'Plundered!', 'Ship Shape!'][randi(0, 2)] : 'Sunk!';
  const starsEl = document.getElementById('result-stars');
  starsEl.innerHTML = '';
  for(let i = 0; i < 3; i++){
    const s = document.createElement('span');
    s.textContent = '★';
    if(!won || i >= stars) s.className = 'off';
    starsEl.appendChild(s);
  }
  const bonusBits = [];
  if(bonus) bonusBits.push(`+${bonus} ammo`);
  if(hullBonus) bonusBits.push(`+${hullBonus} hull`);
  document.getElementById('result-score').textContent =
    won ? `Score: ${game.score}` + (bonusBits.length ? `  (${bonusBits.join(', ')})` : '')
        : (game.sunk ? 'Yer hull was blasted to splinters!'
                     : 'The scallywags held their ship...');
  document.getElementById('result-best').textContent =
    won ? `Best: ${save.best[idx]}`
        : (game.sunk ? 'Silence their guns faster next time!'
                     : 'Try a different angle, Cap\'n!');
  document.getElementById('btn-next').style.display =
    (won && idx + 1 < LEVELS.length) ? '' : 'none';
  showOverlay('result');
}

/* game logic tick (fixed step) */
function updateGame(dt){
  game.time += dt;
  const w = game.world;
  w.step(dt);

  // enemy cannonballs striking our hull register on any contact
  for(const m of w.manifolds){
    for(const [b, other] of [[m.a, m.b], [m.b, m.a]]){
      if(b.isEnemy && !b.dead && other.playerShip){
        b.dead = true;
        damageHull(rand(14, 22), b.pos.x);
      }
    }
  }

  // enemy return fire — the surviving crew mans the guns
  if(game.state === 'play' && !game.sunk && game.enemyGuns.length){
    const alive = piratesLeft();
    if(alive > 0){
      for(const gun of game.enemyGuns){
        gun.t -= dt;
        if(gun.t <= 0){
          fireEnemyGun(gun);
          const crewFactor = 1 + 0.22 * (game.piratesTotal - alive);
          gun.t = gun.interval * crewFactor * rand(0.85, 1.15);
        }
      }
    }
  }

  // impact damage from contacts
  for(const m of w.manifolds){
    if(m.impact <= DMG_T) continue;
    hurt(m.a, m.b, m.impact);
    hurt(m.b, m.a, m.impact);
    // bombshells detonate on hard impact
    for(const b of [m.a, m.b]){
      if(b.kind === 'ball' && b.ballType === 'bomb' && !b.dead && m.impact > 260){
        b.dead = true;
        detonate(b.pos.x, b.pos.y, 150, 130, 620);
      }
    }
    if(m.impact > 200 && Math.random() < 0.3) Sound.play('thud');
  }

  // scheduled explosions (barrel chains)
  for(let i = game.explosions.length - 1; i >= 0; i--){
    const e = game.explosions[i];
    e.t -= dt;
    if(e.t <= 0){
      detonate(e.x, e.y, e.r, e.dmg, e.power);
      game.explosions.splice(i, 1);
    }
  }

  // water, bounds, ball lifetimes
  for(const b of w.bodies){
    if(b.dead || b.im === 0) continue;
    const r = b.shape.type === 'circle' ? b.shape.r : Math.max(b.shape.w, b.shape.h) / 2;
    // splash when crossing surface
    if(b.wasAboveWater && b.pos.y > WATER_Y){
      b.wasAboveWater = false;
      spawnParticles(b.pos.x, WATER_Y, { n: 8, kind: 'drop', color: '#bfe6f7', speed: 200, size: 4, life: 0.6, vy: -180 });
      if(len(b.vel) > 150) Sound.play('splash');
    }
    if(b.pos.y > WATER_Y){
      b.vel = mul(b.vel, 0.92);        // water drag
      b.angVel *= 0.92;
    }
    if(b.pos.y - r > WATER_Y + 30) killInWater(b);
    if(b.pos.x < -90 || b.pos.x > W + 90 || b.pos.y > H + 120){
      if(b.kind === 'pirate' && !b.dead){
        const pts = b.big ? 2000 : 1000;
        game.score += pts;
      }
      b.dead = true;
    }
    if(b.kind === 'ball'){
      b.lifeT += dt;
      if(len2(b.vel) < 25 * 25) b.restT += dt; else b.restT = 0;
      if(b.restT > 1.1 || b.lifeT > 9){
        // spent — stop tracking (leave as debris)
        const li = game.liveBalls.indexOf(b);
        if(li >= 0) game.liveBalls.splice(li, 1);
        if(game.primaryBall === b) game.primaryBall = null;
      }
      // bomb fuse
      if(b.ballType === 'bomb' && !b.dead){
        b.fuseT += dt;
        if(b.fuseT > 4.5){
          b.dead = true;
          detonate(b.pos.x, b.pos.y, 150, 130, 620);
        }
      }
    }
  }
  game.liveBalls = game.liveBalls.filter(b => !b.dead);
  if(game.primaryBall && game.primaryBall.dead) game.primaryBall = null;

  // chest pickups
  for(const ch of game.chests){
    if(ch.taken) continue;
    ch.t += dt;
    const cy = ch.y0 + Math.sin(ch.t * 1.8) * 5;
    for(const b of game.liveBalls){
      if(dist2(b.pos, v2(ch.x, cy)) < 40 * 40){
        ch.taken = true;
        game.score += 500;
        addPopup(ch.x, cy - 30, '+500', '#ffe24a');
        spawnParticles(ch.x, cy, { n: 14, kind: 'spark', color: '#ffd23e', speed: 240, size: 4, life: 0.7 });
        Sound.play('pickup');
        break;
      }
    }
  }

  w.removeDead();

  // reload / end-of-level logic
  if(game.state !== 'play') return;
  const pl = piratesLeft();

  // a win overrides any scheduled defeat (e.g. last pirate crushed by settling debris)
  if(pl === 0 && game.endKind !== 'win'){
    game.endTimer = 1.15;
    game.endKind = 'win';
  }
  if(game.endTimer < 0 && !game.canFire && game.liveBalls.length === 0){
    if(game.ammoIndex < game.ammo.length){
      game.reloadT += dt;
      if(game.reloadT > 0.5){
        game.canFire = true;
        game.reloadT = 0;
      }
    } else {
      // out of ammo: wait for the dust to settle, then defeat
      const quiet = w.maxDynamicSpeed() < 30 && game.time - game.lastActionT > 0.8;
      game.settleT += dt;
      if(quiet || game.settleT > 4.5){
        game.endTimer = 0.4;
        game.endKind = 'lose';
      }
    }
  }
  if(game.endTimer >= 0){
    game.endTimer -= dt;
    if(game.endTimer <= 0){
      finishLevel(game.endKind === 'win');
      game.endTimer = -999;
    }
  }
}

/* ============================== 11. INPUT =============================== */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function toGame(e){
  const rect = canvas.getBoundingClientRect();
  return v2((e.clientX - rect.left) / rect.width * W,
            (e.clientY - rect.top) / rect.height * H);
}

canvas.addEventListener('pointerdown', e => {
  Sound.init();
  if(game.state !== 'play') return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const p = toGame(e);
  if(game.canFire){
    game.aiming = true;
    game.aimStart = p;
    game.aimNow = p;
  } else {
    useAbility();
  }
});
canvas.addEventListener('pointermove', e => {
  if(!game.aiming) return;
  game.aimNow = toGame(e);
});
canvas.addEventListener('pointerup', e => {
  if(!game.aiming) return;
  game.aiming = false;
  const pull = sub(game.aimStart, game.aimNow);
  const d = len(pull);
  if(d < 18) return;                 // too small: cancel
  const dir = mul(pull, 1 / d);
  const power = clamp((d - 10) / 170, 0.06, 1);
  fireCannon(dir, power);
});
canvas.addEventListener('pointercancel', () => { game.aiming = false; });

window.addEventListener('keydown', e => {
  if(e.repeat) return;
  if(e.code === 'Space'){ if(game.state === 'play'){ useAbility(); e.preventDefault(); } }
  if(e.key === 'r' || e.key === 'R'){ if(game.state === 'play' || game.state === 'result') loadLevel(game.levelIdx); }
  if(e.key === 'm' || e.key === 'M') toggleMute();
});

/* ============================ 12. RENDERING ============================= */
const clouds = [];
for(let i = 0; i < 6; i++)
  clouds.push({ x: rand(0, W), y: rand(40, 210), s: rand(0.6, 1.5), v: rand(6, 16) });
const gulls = [
  { t: rand(0, 9), y: 130, sp: 0.35, amp: 26 },
  { t: rand(0, 9), y: 90, sp: 0.28, amp: 34 }
];

function drawBackground(t){
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, WATER_Y);
  sky.addColorStop(0, '#8ecbe8');
  sky.addColorStop(0.65, '#cfe9d8');
  sky.addColorStop(1, '#f7e1b0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, WATER_Y);
  // sun
  const sg = ctx.createRadialGradient(1120, 105, 8, 1120, 105, 90);
  sg.addColorStop(0, 'rgba(255,244,200,1)');
  sg.addColorStop(0.35, 'rgba(255,226,140,.8)');
  sg.addColorStop(1, 'rgba(255,226,140,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(1120, 105, 90, 0, 7); ctx.fill();
  // clouds
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for(const c of clouds){
    const x = ((c.x + t * c.v) % (W + 260)) - 130;
    ctx.beginPath();
    ctx.ellipse(x, c.y, 46 * c.s, 15 * c.s, 0, 0, 7);
    ctx.ellipse(x + 32 * c.s, c.y - 9 * c.s, 30 * c.s, 12 * c.s, 0, 0, 7);
    ctx.ellipse(x - 34 * c.s, c.y - 5 * c.s, 26 * c.s, 11 * c.s, 0, 0, 7);
    ctx.fill();
  }
  // distant island
  ctx.fillStyle = 'rgba(90,120,110,.5)';
  ctx.beginPath();
  ctx.moveTo(480, WATER_Y);
  ctx.quadraticCurveTo(560, WATER_Y - 70, 640, WATER_Y - 34);
  ctx.quadraticCurveTo(690, WATER_Y - 12, 720, WATER_Y);
  ctx.fill();
  // palm on island
  ctx.strokeStyle = 'rgba(60,90,75,.6)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(575, WATER_Y - 52); ctx.quadraticCurveTo(583, WATER_Y - 84, 596, WATER_Y - 96); ctx.stroke();
  ctx.fillStyle = 'rgba(60,100,70,.55)';
  for(let i = 0; i < 5; i++){
    const a = -0.5 - i * 0.5;
    ctx.beginPath();
    ctx.ellipse(596 + Math.cos(a) * 17, WATER_Y - 96 + Math.sin(a) * 9, 17, 5, a, 0, 7);
    ctx.fill();
  }
  // gulls
  ctx.strokeStyle = 'rgba(60,70,90,.7)'; ctx.lineWidth = 2;
  for(const g of gulls){
    g.t += 0.0035;
    const gx = ((g.t * g.sp * 900) % (W + 200)) - 100;
    const gy = g.y + Math.sin(g.t * 4) * g.amp;
    const flap = Math.sin(g.t * 40) * 5;
    ctx.beginPath();
    ctx.moveTo(gx - 9, gy - flap);
    ctx.quadraticCurveTo(gx - 3, gy + 3, gx, gy);
    ctx.quadraticCurveTo(gx + 3, gy + 3, gx + 9, gy - flap);
    ctx.stroke();
  }
  // sea (behind everything sinking)
  const sea = ctx.createLinearGradient(0, WATER_Y, 0, H);
  sea.addColorStop(0, '#2478a8');
  sea.addColorStop(1, '#0a2c44');
  ctx.fillStyle = sea;
  ctx.fillRect(0, WATER_Y, W, H - WATER_Y);
}

function drawHullShape(hl, t){
  const { cx, w, topY, enemy } = hl;
  const hw = w / 2;
  const bottom = WATER_Y + 26;
  ctx.fillStyle = enemy ? '#3d2413' : '#54331b';
  ctx.strokeStyle = '#241206'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - hw - 44, topY - 6);
  ctx.quadraticCurveTo(cx - hw - 30, bottom - 30, cx - hw + 26, bottom);
  ctx.lineTo(cx + hw - 26, bottom);
  ctx.quadraticCurveTo(cx + hw + 30, bottom - 30, cx + hw + 44, topY - 6);
  ctx.lineTo(cx + hw + 24, topY + 2);
  ctx.lineTo(cx - hw - 24, topY + 2);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // plank lines
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
  for(let i = 1; i <= 3; i++){
    const y = topY + (bottom - topY) * i / 4;
    const shrink = i * 9;
    ctx.beginPath();
    ctx.moveTo(cx - hw - 36 + shrink, y);
    ctx.lineTo(cx + hw + 36 - shrink, y);
    ctx.stroke();
  }
  // gunports
  if(enemy){
    ctx.fillStyle = '#1c0f06';
    const n = Math.max(2, Math.floor(w / 150));
    for(let i = 0; i < n; i++){
      const gx = cx - hw / 2 + (w / 2) * i / Math.max(1, n - 1) - 10 + w / 4 * 0;
      const px = cx - w * 0.3 + (w * 0.6) * (n === 1 ? 0.5 : i / (n - 1));
      ctx.fillRect(px - 11, topY + 34, 22, 18);
      ctx.strokeStyle = '#6d4a22'; ctx.lineWidth = 2;
      ctx.strokeRect(px - 11, topY + 34, 22, 18);
    }
  }
  // mast + sail
  const mx = cx + (enemy ? 10 : -85);
  const mastTop = topY - (enemy ? 265 : 180);
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(mx - 5, mastTop, 10, topY - mastTop);
  // yardarm
  const sailW = enemy ? Math.min(w * 0.62, 230) : 110;
  ctx.fillRect(mx - sailW / 2 - 12, mastTop + 22, sailW + 24, 7);
  // sail
  const sway = Math.sin(t * 0.9 + cx) * 6;
  ctx.beginPath();
  ctx.moveTo(mx - sailW / 2, mastTop + 30);
  ctx.quadraticCurveTo(mx - sailW / 2 - 16 - sway, mastTop + 100, mx - sailW / 2 + 6, mastTop + 168);
  ctx.lineTo(mx + sailW / 2 - 6, mastTop + 168);
  ctx.quadraticCurveTo(mx + sailW / 2 + 16 - sway, mastTop + 100, mx + sailW / 2, mastTop + 30);
  ctx.closePath();
  ctx.fillStyle = enemy ? '#23272d' : '#f2ead3';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 2; ctx.stroke();
  if(enemy){
    // skull emblem
    const sy = mastTop + 92;
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath(); ctx.arc(mx, sy, 17, 0, 7); ctx.fill();
    ctx.fillRect(mx - 10, sy + 11, 20, 6);
    ctx.fillStyle = '#23272d';
    ctx.beginPath(); ctx.arc(mx - 6, sy - 2, 4.4, 0, 7); ctx.arc(mx + 6, sy - 2, 4.4, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e8e4da'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mx - 20, sy + 24); ctx.lineTo(mx + 20, sy + 32);
    ctx.moveTo(mx + 20, sy + 24); ctx.lineTo(mx - 20, sy + 32);
    ctx.stroke();
  }
  // flag
  ctx.fillStyle = enemy ? '#a02020' : '#2b6cb0';
  ctx.beginPath();
  ctx.moveTo(mx, mastTop);
  ctx.quadraticCurveTo(mx + 28 + sway, mastTop + 7, mx + 46 + sway, mastTop + 3);
  ctx.lineTo(mx, mastTop + 14);
  ctx.closePath(); ctx.fill();
}

function drawEnemyGun(gun, dt){
  ctx.save();
  ctx.translate(gun.x, gun.y);
  // mounting bracket on the bow
  ctx.fillStyle = '#2a1a0c';
  ctx.fillRect(-4, 4, 24, 10);
  // mortar tube angled up toward the player
  ctx.rotate(-1.95);
  const g = ctx.createLinearGradient(0, -9, 0, 9);
  g.addColorStop(0, '#454e56');
  g.addColorStop(1, '#14181c');
  ctx.fillStyle = g;
  roundRectPath(-6, -9, 34, 18, 6);
  ctx.fill();
  ctx.strokeStyle = '#0d1114'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#0d1114';
  ctx.fillRect(22, -10, 5, 20);
  if(gun.flash > 0){
    ctx.globalAlpha = gun.flash;
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(28 + 26 * gun.flash, -9 * gun.flash);
    ctx.lineTo(36 + 16 * gun.flash, 0);
    ctx.lineTo(28 + 26 * gun.flash, 9 * gun.flash);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    gun.flash = Math.max(0, gun.flash - dt * 5);
  }
  ctx.restore();
}

function drawPlatformShape(p){
  ctx.fillStyle = '#4a2f16';
  for(const px of [p.cx - p.w / 2 + 16, p.cx + p.w / 2 - 16]){
    ctx.fillRect(px - 6, p.topY + 14, 12, p.baseY - p.topY - 14);
  }
}

function roundRectPath(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBody(b, t){
  ctx.save();
  ctx.translate(b.pos.x, b.pos.y);
  ctx.rotate(b.angle);
  const dmg = b.maxHp !== Infinity ? 1 - clamp(b.hp / b.maxHp, 0, 1) : 0;

  if(b.shape.type === 'box'){
    const { w, h } = b.shape;
    switch(b.material){
      case 'deck': {
        ctx.fillStyle = '#6d4a26';
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
        for(let x = -w / 2 + 26; x < w / 2; x += 26){
          ctx.beginPath(); ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); ctx.stroke();
        }
        ctx.strokeStyle = '#241206'; ctx.strokeRect(-w / 2, -h / 2, w, h);
        break;
      }
      case 'bulwark': {
        ctx.fillStyle = '#59371c';
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = '#241206'; ctx.lineWidth = 2;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        break;
      }
      case 'wood': {
        const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        g.addColorStop(0, '#c08b53');
        g.addColorStop(1, '#96683a');
        ctx.fillStyle = g;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = '#5b3a1c'; ctx.lineWidth = 2.5;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        // grain / crate braces
        ctx.strokeStyle = 'rgba(80,48,20,.5)'; ctx.lineWidth = 2;
        if(w > h * 1.6){          // plank: horizontal grain
          ctx.beginPath(); ctx.moveTo(-w / 2 + 6, 0); ctx.lineTo(w / 2 - 6, 0); ctx.stroke();
        } else if(h > w * 1.6){   // post: vertical grain
          ctx.beginPath(); ctx.moveTo(0, -h / 2 + 6); ctx.lineTo(0, h / 2 - 6); ctx.stroke();
        } else {                  // crate: X braces
          ctx.beginPath();
          ctx.moveTo(-w / 2 + 4, -h / 2 + 4); ctx.lineTo(w / 2 - 4, h / 2 - 4);
          ctx.moveTo(w / 2 - 4, -h / 2 + 4); ctx.lineTo(-w / 2 + 4, h / 2 - 4);
          ctx.stroke();
        }
        break;
      }
      case 'stone': {
        const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        g.addColorStop(0, '#aab2ba');
        g.addColorStop(1, '#7e868e');
        ctx.fillStyle = g;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = '#4a5158'; ctx.lineWidth = 2.5;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = 'rgba(60,66,72,.45)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
        break;
      }
      case 'barrel': {
        // TNT barrel
        const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        g.addColorStop(0, '#7c3018');
        g.addColorStop(0.5, '#a8492a');
        g.addColorStop(1, '#7c3018');
        ctx.fillStyle = g;
        roundRectPath(-w / 2, -h / 2, w, h, 6);
        ctx.fill();
        ctx.strokeStyle = '#3d1408'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = '#2b2b30';
        ctx.fillRect(-w / 2, -h / 2 + 7, w, 5);
        ctx.fillRect(-w / 2, h / 2 - 12, w, 5);
        // skull mark
        ctx.fillStyle = '#f3e9d8';
        ctx.beginPath(); ctx.arc(0, -1, 6.5, 0, 7); ctx.fill();
        ctx.fillRect(-4, 4, 8, 3);
        ctx.fillStyle = '#3d1408';
        ctx.beginPath(); ctx.arc(-2.5, -2, 1.8, 0, 7); ctx.arc(2.5, -2, 1.8, 0, 7); ctx.fill();
        break;
      }
    }
    // damage cracks
    if(dmg > 0.15){
      ctx.strokeStyle = `rgba(20,10,5,${0.25 + dmg * 0.55})`;
      ctx.lineWidth = 1.8;
      const s = b.seed * 10;
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, -h * 0.4);
      ctx.lineTo(-w * 0.1 + Math.sin(s) * 4, 0);
      ctx.lineTo(-w * 0.28, h * 0.42);
      if(dmg > 0.5){
        ctx.moveTo(w * 0.32, -h * 0.42);
        ctx.lineTo(w * 0.12 + Math.cos(s) * 4, h * 0.05);
        ctx.lineTo(w * 0.3, h * 0.4);
      }
      ctx.stroke();
    }
  } else {
    const r = b.shape.r;
    if(b.kind === 'pirate'){
      drawPirate(b, r);
    } else if(b.kind === 'ball'){
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.15, 0, 0, r);
      if(b.ballType === 'heavy'){
        g.addColorStop(0, '#5b6a72'); g.addColorStop(1, '#22303a');
      } else {
        g.addColorStop(0, '#555a60'); g.addColorStop(1, '#101418');
      }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      if(b.ballType === 'heavy'){
        ctx.fillStyle = '#101a20';
        for(let i = 0; i < 6; i++){
          const a = i * Math.PI / 3 + 0.4;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.13, 0, 7);
          ctx.fill();
        }
      }
      if(b.ballType === 'bomb' && !b.abilityUsed){
        // fuse
        ctx.strokeStyle = '#c9a04a'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(5, -r - 8, 10, -r - 6);
        ctx.stroke();
      }
      if(b.isEnemy){
        // hostile shot marker so incoming fire reads at a glance
        ctx.strokeStyle = 'rgba(255,92,60,.8)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, r + 2, 0, 7); ctx.stroke();
      }
    }
  }
  // hit flash
  if(b.flash > 0){
    ctx.globalAlpha = b.flash * 0.5;
    ctx.fillStyle = '#fff';
    if(b.shape.type === 'box') ctx.fillRect(-b.shape.w / 2, -b.shape.h / 2, b.shape.w, b.shape.h);
    else { ctx.beginPath(); ctx.arc(0, 0, b.shape.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // bomb fuse sparks (world space)
  if(b.kind === 'ball' && b.ballType === 'bomb' && !b.dead && Math.random() < 0.5){
    const m = mat2(b.angle);
    const fp = add(b.pos, mulM(m, v2(10, -b.shape.r - 6)));
    spawnParticles(fp.x, fp.y, { n: 1, kind: 'spark', color: '#ffd23e', speed: 40, size: 2, life: 0.25 });
  }
}

function drawPirate(b, r){
  const s = b.seed;
  const bandana = s < 0.4 ? '#c03028' : s < 0.7 ? '#2b6cb0' : '#3f7d3a';
  const patch = (s * 7) % 1 < 0.45;
  // head
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
  g.addColorStop(0, '#f0c092');
  g.addColorStop(1, '#cf9463');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.strokeStyle = '#7a4a28'; ctx.lineWidth = 2;
  ctx.stroke();
  // bandana
  ctx.fillStyle = bandana;
  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.fillRect(-r, -r * 0.25, r * 2, r * 0.25);
  // bandana knot
  ctx.beginPath();
  ctx.ellipse(-r * 0.95, -r * 0.15, r * 0.28, r * 0.16, 0.6, 0, 7);
  ctx.fill();
  // dots on bandana
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for(let i = -1; i <= 1; i++){
    ctx.beginPath(); ctx.arc(i * r * 0.4, -r * 0.55, r * 0.07, 0, 7); ctx.fill();
  }
  // eyes
  ctx.fillStyle = '#1c1108';
  ctx.beginPath(); ctx.arc(-r * 0.32, r * 0.05, r * 0.11, 0, 7); ctx.fill();
  if(patch){
    ctx.strokeStyle = '#14100c'; ctx.lineWidth = r * 0.14;
    ctx.beginPath(); ctx.moveTo(-r, -r * 0.15); ctx.lineTo(r * 0.9, r * 0.05); ctx.stroke();
    ctx.fillStyle = '#14100c';
    ctx.beginPath(); ctx.arc(r * 0.32, r * 0.05, r * 0.24, 0, 7); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(r * 0.32, r * 0.05, r * 0.11, 0, 7); ctx.fill();
  }
  // angry brows
  ctx.strokeStyle = '#3a2410'; ctx.lineWidth = r * 0.11;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.18); ctx.lineTo(-r * 0.15, -r * 0.05);
  if(!patch){ ctx.moveTo(r * 0.5, -r * 0.18); ctx.lineTo(r * 0.15, -r * 0.05); }
  ctx.stroke();
  // stubble + frown
  ctx.strokeStyle = '#5c3a20'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, r * 0.62, r * 0.28, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  // earring
  ctx.strokeStyle = '#e8b923'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(-r * 0.98, r * 0.28, r * 0.14, 0, 7); ctx.stroke();
  // captain hat
  if(b.big){
    ctx.fillStyle = '#181c22';
    ctx.beginPath();
    ctx.moveTo(-r * 1.25, -r * 0.55);
    ctx.quadraticCurveTo(0, -r * 1.8, r * 1.25, -r * 0.55);
    ctx.quadraticCurveTo(0, -r * 0.85, -r * 1.25, -r * 0.55);
    ctx.fill();
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath(); ctx.arc(0, -r * 0.95, r * 0.18, 0, 7); ctx.fill();
    ctx.strokeStyle = '#c8a028'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, -r * 0.58);
    ctx.quadraticCurveTo(0, -r * 1.4, r * 1.1, -r * 0.58);
    ctx.stroke();
  }
}

function drawChest(ch, t){
  if(ch.taken) return;
  const y = ch.y0 + Math.sin(ch.t * 1.8) * 5;
  const glow = 0.5 + Math.sin(t * 4) * 0.25;
  ctx.save();
  ctx.translate(ch.x, y);
  ctx.rotate(Math.sin(ch.t * 1.3) * 0.08);
  // glow
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 42);
  g.addColorStop(0, `rgba(255,214,80,${glow * 0.55})`);
  g.addColorStop(1, 'rgba(255,214,80,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 42, 0, 7); ctx.fill();
  // chest box
  ctx.fillStyle = '#7a4a22';
  ctx.fillRect(-19, -8, 38, 20);
  ctx.fillStyle = '#8f5a2c';
  ctx.beginPath();
  ctx.moveTo(-19, -8);
  ctx.quadraticCurveTo(0, -24, 19, -8);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3d2410'; ctx.lineWidth = 2;
  ctx.strokeRect(-19, -8, 38, 20);
  ctx.fillStyle = '#e8b923';
  ctx.fillRect(-3, -10, 6, 10);
  ctx.fillRect(-19, -9, 38, 3);
  ctx.restore();
}

function drawCannon(t){
  const a = game.aiming ? aimAngle() : game.cannonAngle;
  game.cannonAngle = a;
  const rec = game.recoil * 10;
  ctx.save();
  ctx.translate(CANNON.x, CANNON.y);
  // barrel
  ctx.save();
  ctx.rotate(a);
  ctx.translate(-rec, 0);
  const g = ctx.createLinearGradient(0, -12, 0, 12);
  g.addColorStop(0, '#4d565e');
  g.addColorStop(0.5, '#232a30');
  g.addColorStop(1, '#171c20');
  ctx.fillStyle = g;
  roundRectPath(-16, -11, 62, 22, 8);
  ctx.fill();
  ctx.strokeStyle = '#0d1114'; ctx.lineWidth = 2; ctx.stroke();
  // muzzle ring
  ctx.fillStyle = '#0d1114';
  ctx.fillRect(38, -12, 7, 24);
  ctx.fillRect(-4, -13, 6, 26);
  // muzzle flash
  if(game.muzzleFlash > 0){
    ctx.globalAlpha = game.muzzleFlash;
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.moveTo(46, 0);
    ctx.lineTo(46 + 34 * game.muzzleFlash, -12 * game.muzzleFlash);
    ctx.lineTo(58 + 20 * game.muzzleFlash, 0);
    ctx.lineTo(46 + 34 * game.muzzleFlash, 12 * game.muzzleFlash);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // carriage
  ctx.fillStyle = '#5b3a1e';
  ctx.beginPath();
  ctx.moveTo(-24, 8); ctx.lineTo(24, 8); ctx.lineTo(16, 30); ctx.lineTo(-16, 30);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2b1a0c'; ctx.lineWidth = 2; ctx.stroke();
  // wheel
  ctx.fillStyle = '#3d2712';
  ctx.beginPath(); ctx.arc(0, 28, 11, 0, 7); ctx.fill();
  ctx.strokeStyle = '#1d1206'; ctx.stroke();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2;
  for(let i = 0; i < 4; i++){
    const wa = i * Math.PI / 2 + t * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.lineTo(Math.cos(wa) * 9, 28 + Math.sin(wa) * 9);
    ctx.stroke();
  }
  ctx.restore();
}

function aimAngle(){
  const pull = sub(game.aimStart, game.aimNow);
  if(len2(pull) < 4) return game.cannonAngle;
  return Math.atan2(pull.y, pull.x);
}

function drawAimUI(){
  if(!game.aiming) return;
  const pull = sub(game.aimStart, game.aimNow);
  const d = len(pull);
  if(d < 6) return;
  const dir = mul(pull, 1 / d);
  const power = clamp((d - 10) / 170, 0.06, 1);
  const speed = 320 + power * 1120;
  const muzzle = add(CANNON, mul(dir, 52));
  // trajectory dots
  const vel = mul(dir, speed);
  for(let i = 1; i <= 22; i++){
    const tt = i * 0.055;
    const px = muzzle.x + vel.x * tt;
    const py = muzzle.y + vel.y * tt + 0.5 * GRAVITY.y * tt * tt;
    if(py > WATER_Y + 10) break;
    const alpha = 0.75 * (1 - i / 26);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath(); ctx.arc(px, py, 4.5 - i * 0.12, 0, 7); ctx.fill();
  }
  // power arc near cannon
  ctx.strokeStyle = `rgba(255,${Math.floor(220 - power * 160)},60,.9)`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(CANNON.x, CANNON.y, 40, game.cannonAngle - 0.5, game.cannonAngle - 0.5 + power * 1.0);
  ctx.stroke();
  // pull line
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(game.aimStart.x, game.aimStart.y);
  ctx.lineTo(game.aimNow.x, game.aimNow.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawWaterFront(t){
  ctx.fillStyle = 'rgba(20,90,130,.55)';
  ctx.fillRect(0, WATER_Y, W, H - WATER_Y);
  // animated crests
  for(let layer = 0; layer < 2; layer++){
    ctx.strokeStyle = layer === 0 ? 'rgba(210,240,255,.5)' : 'rgba(160,215,240,.35)';
    ctx.lineWidth = layer === 0 ? 3 : 2;
    ctx.beginPath();
    for(let x = 0; x <= W; x += 8){
      const y = WATER_Y + 2 + layer * 9 +
        Math.sin(x * 0.02 + t * (1.3 + layer * 0.4)) * 3.5 +
        Math.sin(x * 0.043 - t * 0.9) * 2;
      if(x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function updateAmbientSmoke(dt){
  // lingering smolder where explosions scorched the deck
  for(let i = game.smolders.length - 1; i >= 0; i--){
    const s = game.smolders[i];
    s.t -= dt;
    if(s.t <= 0){ game.smolders.splice(i, 1); continue; }
    if(Math.random() < dt * 13 * Math.min(1, s.t / 2)){
      game.particles.push({
        x: s.x + rand(-14, 14), y: s.y + rand(-8, 6),
        vx: rand(-14, 14), vy: rand(-52, -24),
        life: rand(0.8, 1.7), maxLife: 1.7,
        kind: 'smoke', color: Math.random() < 0.5 ? '#4a4a4a' : '#6d6d6d',
        size: rand(6, 13), rot: 0, vr: 0, grav: -0.14
      });
    }
  }
  // battle damage on our ship: smoke thickens as the hull fails, fire when critical
  if(game.state !== 'play' && game.state !== 'result') return;
  if(!game.enemyGuns.length) return;
  const frac = game.hull / game.hullMax;
  if(frac >= 0.7) return;
  const sev = 1 - frac / 0.7;                  // 0 at 70% hull -> 1 at 0%
  for(const px of [96, 236]){
    if(Math.random() < dt * (2.5 + sev * 15)){
      const dark = Math.random() < sev;
      game.particles.push({
        x: px + rand(-16, 16), y: 498 + rand(-4, 4),
        vx: rand(-10, 20), vy: rand(-70, -34) * (0.7 + sev * 0.6),
        life: rand(0.9, 2.0), maxLife: 2.0,
        kind: 'smoke', color: dark ? '#33322f' : '#77756f',
        size: rand(7, 15) * (0.8 + sev * 0.6), rot: 0, vr: 0, grav: -0.16
      });
    }
  }
  if(frac < 0.3){
    if(Math.random() < dt * 11){
      game.particles.push({
        x: 166 + rand(-40, 60), y: 500 + rand(-4, 2),
        vx: rand(-8, 8), vy: rand(-60, -30),
        life: rand(0.25, 0.5), maxLife: 0.5,
        kind: 'fire', color: '#ff8c2e',
        size: rand(5, 10), rot: 0, vr: 0, grav: -0.3
      });
    }
    if(Math.random() < dt * 5){
      game.particles.push({
        x: 166 + rand(-40, 60), y: 496,
        vx: rand(-30, 30), vy: rand(-140, -60),
        life: rand(0.3, 0.7), maxLife: 0.7,
        kind: 'spark', color: '#ffce54',
        size: rand(2, 3.5), rot: 0, vr: 0, grav: 0.25
      });
    }
  }
}

function drawParticles(dt){
  for(let i = game.particles.length - 1; i >= 0; i--){
    const p = game.particles[i];
    p.life -= dt;
    if(p.life <= 0){ game.particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 900 * p.grav * dt;
    p.rot += p.vr * dt;
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    switch(p.kind){
      case 'smoke':
      case 'poof': {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, 7);
        ctx.fill();
        break;
      }
      case 'fire': {
        ctx.fillStyle = a > 0.5 ? '#ffd75e' : p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, 7); ctx.fill();
        break;
      }
      case 'spark': {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        break;
      }
      case 'shard': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
        ctx.restore();
        break;
      }
      case 'drop': {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, 7); ctx.fill();
        break;
      }
    }
    ctx.globalAlpha = 1;
  }
  // popups
  ctx.textAlign = 'center';
  for(let i = game.popups.length - 1; i >= 0; i--){
    const p = game.popups[i];
    p.life -= dt;
    if(p.life <= 0){ game.popups.splice(i, 1); continue; }
    p.y -= 40 * dt;
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = 'bold 26px Georgia';
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 5;
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  }
}

function drawAmmoIcon(type, x, y, size){
  ctx.save();
  ctx.translate(x, y);
  const r = size * 0.32;
  ctx.lineWidth = 1.8;
  const rim = 'rgba(226,238,246,.85)';
  switch(type){
    case 'ball':
      ctx.fillStyle = '#1a2026';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.strokeStyle = rim; ctx.stroke();
      break;
    case 'split':
      ctx.fillStyle = '#1a2026';
      ctx.strokeStyle = rim;
      for(const [ox, oy] of [[-r * 0.7, r * 0.4], [r * 0.7, r * 0.4], [0, -r * 0.6]]){
        ctx.beginPath(); ctx.arc(ox, oy, r * 0.55, 0, 7); ctx.fill(); ctx.stroke();
      }
      break;
    case 'bomb':
      ctx.fillStyle = '#1a2026';
      ctx.beginPath(); ctx.arc(0, 2, r, 0, 7); ctx.fill();
      ctx.strokeStyle = rim; ctx.stroke();
      ctx.strokeStyle = '#c9a04a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, 2 - r); ctx.quadraticCurveTo(4, -r - 6, 8, -r - 4); ctx.stroke();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(8, -r - 4, 2.5, 0, 7); ctx.fill();
      break;
    case 'heavy':
      ctx.fillStyle = '#2c3a44';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, 7); ctx.fill();
      ctx.strokeStyle = rim; ctx.stroke();
      ctx.fillStyle = '#131c22';
      for(let i = 0; i < 5; i++){
        const a = i * Math.PI * 2 / 5;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, r * 0.16, 0, 7); ctx.fill();
      }
      break;
  }
  ctx.restore();
}

function drawHUD(){
  const L = LEVELS[game.levelIdx];
  // score panel
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(30,18,8,.65)';
  roundRectPath(12, 12, 250, 62, 10); ctx.fill();
  ctx.fillStyle = '#ffe9b0';
  ctx.font = 'bold 20px Georgia';
  ctx.fillText('⚓ ' + L.name, 26, 38);
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 22px Georgia';
  ctx.fillText('Score: ' + game.score, 26, 64);
  // pirates left
  const pl = piratesLeft();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(30,18,8,.65)';
  const pw = 30 + game.piratesTotal * 30;
  roundRectPath(W / 2 - pw / 2, 12, pw, 40, 10); ctx.fill();
  for(let i = 0; i < game.piratesTotal; i++){
    const x = W / 2 - pw / 2 + 30 + i * 30 - 8;
    ctx.font = '22px Georgia';
    ctx.globalAlpha = i < pl ? 1 : 0.25;
    ctx.fillStyle = i < pl ? '#ff6b57' : '#888';
    ctx.fillText('☠', x, 42);
    ctx.globalAlpha = 1;
  }
  // ammo tray
  const total = game.ammo.length;
  const trayW = 26 + total * 46;
  ctx.fillStyle = 'rgba(30,18,8,.65)';
  roundRectPath(12, H - 70, trayW, 58, 10); ctx.fill();
  for(let i = 0; i < total; i++){
    const x = 12 + 36 + i * 46;
    const y = H - 41;
    if(i === game.ammoIndex && game.canFire){
      ctx.fillStyle = 'rgba(255,210,62,.28)';
      ctx.beginPath(); ctx.arc(x, y, 21, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 21, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = i < game.ammoIndex ? 0.22 : 1;
    drawAmmoIcon(game.ammo[i], x, y, 42);
    ctx.globalAlpha = 1;
  }
  // hull integrity (only when the enemy shoots back)
  if(game.enemyGuns.length){
    const pw2 = 216, px = W - pw2 - 12, py = H - 70;
    const hf = game.hullFlash;
    ctx.fillStyle = hf > 0 ? `rgba(${Math.round(30 + 110 * hf)},18,8,.72)` : 'rgba(30,18,8,.65)';
    roundRectPath(px, py, pw2, 58, 10); ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px Georgia';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText('⛵ HULL', px + 14, py + 22);
    const frac = clamp(game.hull / game.hullMax, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    roundRectPath(px + 14, py + 30, pw2 - 28, 16, 6); ctx.fill();
    if(frac > 0){
      ctx.fillStyle = frac > 0.5 ? '#7dc95e' : frac > 0.25 ? '#e8b923' : '#e04f3a';
      roundRectPath(px + 16, py + 32, Math.max(6, (pw2 - 32) * frac), 12, 5); ctx.fill();
    }
  }
  // hint
  if(game.hintT > 0 && game.hintText){
    const a = clamp(game.hintT, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = 'italic bold 24px Georgia';
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 6;
    ctx.strokeText(game.hintText, W / 2, H - 40);
    ctx.fillStyle = '#fff3c8';
    ctx.fillText(game.hintText, W / 2, H - 40);
    ctx.globalAlpha = 1;
  }
  // "tap!" indicator when a special ball is in flight
  const pb = game.primaryBall;
  if(pb && !pb.dead && !pb.abilityUsed && (pb.ballType === 'bomb' || pb.ballType === 'split') && pb.lifeT < 3){
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px Georgia';
    const bob = Math.sin(game.time * 10) * 3;
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4;
    ctx.strokeText('TAP!', pb.pos.x, pb.pos.y - 28 + bob);
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('TAP!', pb.pos.x, pb.pos.y - 28 + bob);
  }
  ctx.restore();
}

/* menu backdrop scene (idle waves) */
function drawMenuScene(t){
  drawBackground(t);
  drawWaterFront(t);
}

function render(dt){
  const t = game.time || performance.now() / 1000;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if(game.state === 'menu' || game.state === 'levels'){
    drawMenuScene(performance.now() / 1000);
    ctx.restore();
    return;
  }
  // screen shake
  if(game.shake > 0){
    ctx.translate(rand(-1, 1) * game.shake * 9, rand(-1, 1) * game.shake * 9);
    game.shake = Math.max(0, game.shake - dt * 2.2);
  }
  drawBackground(t);
  for(const hl of game.hulls) drawHullShape(hl, t);
  for(const gun of game.enemyGuns) drawEnemyGun(gun, dt);
  for(const p of game.platforms) drawPlatformShape(p);
  for(const ch of game.chests) drawChest(ch, t);
  // bodies: statics first
  for(const b of game.world.bodies){
    if(b.im === 0) drawBody(b, t);
    if(b.flash > 0) b.flash = Math.max(0, b.flash - dt * 4);
  }
  for(const b of game.world.bodies) if(b.im !== 0) drawBody(b, t);
  drawCannon(t);
  drawAimUI();
  drawWaterFront(t);
  updateAmbientSmoke(dt);
  drawParticles(dt);
  drawHUD();
  ctx.restore();
  // decay visual timers
  game.recoil = Math.max(0, game.recoil - dt * 4);
  game.muzzleFlash = Math.max(0, game.muzzleFlash - dt * 8);
  game.hullFlash = Math.max(0, game.hullFlash - dt * 1.6);
  if(game.hintT > 0) game.hintT -= dt;
}

/* ========================== 13. DOM / UI FLOW =========================== */
function showOverlay(name){
  for(const id of ['menu', 'levels', 'result']){
    document.getElementById(id).classList.toggle('hidden', id !== name);
  }
  if(name) document.getElementById('ui-buttons').classList.add('hidden');
}

function buildLevelGrid(){
  const grid = document.getElementById('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const unlocked = i === 0 || (save.stars[i - 1] || 0) > 0;
    const el = document.createElement('div');
    el.className = 'level-card' + (unlocked ? '' : ' locked');
    const st = save.stars[i] || 0;
    el.innerHTML =
      `<div class="num">${unlocked ? i + 1 : '🔒'}</div>` +
      `<div class="nm">${L.name}</div>` +
      `<div class="st">` +
        [0, 1, 2].map(k => `<span class="${k < st ? '' : 'off'}">★</span>`).join('') +
      `</div>`;
    if(unlocked){
      el.addEventListener('click', () => { Sound.init(); Sound.play('click'); loadLevel(i); });
    }
    grid.appendChild(el);
  });
}

function toggleMute(){
  Sound.init();
  Sound.muted = !Sound.muted;
  try { localStorage.setItem('ccove_muted', Sound.muted ? '1' : '0'); } catch(e){}
  document.getElementById('btn-mute').textContent = Sound.muted ? '🔇' : '🔊';
}

function wireUI(){
  try { Sound.muted = localStorage.getItem('ccove_muted') === '1'; } catch(e){}
  document.getElementById('btn-mute').textContent = Sound.muted ? '🔇' : '🔊';

  const on = (id, fn) => document.getElementById(id).addEventListener('click', () => {
    Sound.init(); Sound.play('click'); fn();
  });
  on('btn-play', () => { buildLevelGrid(); game.state = 'levels'; showOverlay('levels'); });
  on('btn-back', () => { game.state = 'menu'; showOverlay('menu'); });
  on('btn-retry', () => loadLevel(game.levelIdx));
  on('btn-levels', () => { buildLevelGrid(); game.state = 'levels'; showOverlay('levels'); });
  on('btn-next', () => loadLevel(Math.min(game.levelIdx + 1, LEVELS.length - 1)));
  on('btn-restart', () => loadLevel(game.levelIdx));
  on('btn-map', () => { buildLevelGrid(); game.state = 'levels'; showOverlay('levels'); });
  document.getElementById('btn-mute').addEventListener('click', () => { toggleMute(); });
}

/* fit the 16:9 stage to the window */
function resize(){
  const wrap = document.getElementById('wrap');
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cw = Math.round(W * s), chh = Math.round(H * s);
  wrap.style.width = cw + 'px';
  wrap.style.height = chh + 'px';
  wrap.style.left = Math.round((window.innerWidth - cw) / 2) + 'px';
  wrap.style.top = Math.round((window.innerHeight - chh) / 2) + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * s * dpr);
  canvas.height = Math.round(H * s * dpr);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
}
window.addEventListener('resize', resize);

/* ============================ 14. MAIN LOOP ============================= */
let lastT = performance.now();
let acc = 0;
function frame(now){
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if(dt > 0.05) dt = 0.05;
  if(game.state === 'play' || game.state === 'result'){
    acc += dt;
    let steps = 0;
    while(acc >= PHYS_DT && steps < 6){
      updateGame(PHYS_DT);
      acc -= PHYS_DT;
      steps++;
    }
    if(steps === 6) acc = 0;
  }
  render(dt);
}

/* =============================== 15. INIT =============================== */
wireUI();
resize();
showOverlay('menu');
requestAnimationFrame(frame);

/* debug / test hooks */
window.CCV = {
  game, LEVELS, loadLevel, World, Body, boxShape, circleShape,
  piratesLeft,
  fire(angleDeg, speed){
    if(game.state !== 'play' || game.ammoIndex >= game.ammo.length) return false;
    const a = -angleDeg * Math.PI / 180;
    const dir = v2(Math.cos(a), Math.sin(a));
    game.canFire = false;
    const type = game.ammo[game.ammoIndex];
    game.ammoIndex++;
    const muzzle = add(CANNON, mul(dir, 52));
    game.primaryBall = spawnBall(type, muzzle.x, muzzle.y, mul(dir, speed));
    game.lastActionT = game.time;
    return true;
  },
  useAbility, fireEnemyGun, damageHull
};
