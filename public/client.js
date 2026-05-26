const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hpEl = document.getElementById('hp');
const ammoEl = document.getElementById('ammo');
const reserveEl = document.getElementById('reserve');
const weaponEl = document.getElementById('weapon');
const weaponLvEl = document.getElementById('weaponLv');
const scoreEl = document.getElementById('score');
const keyEl = document.getElementById('key');
const promptEl = document.getElementById('prompt');

let W = innerWidth;
let H = innerHeight;
canvas.width = W;
canvas.height = H;
window.addEventListener('resize', () => {
  W = innerWidth;
  H = innerHeight;
  canvas.width = W;
  canvas.height = H;
});

const ws = new WebSocket(`ws://${location.host}`);
let myId = null;
let me = { x: 2, y: 2, a: 0, hp: 100, ammo: 30, reserveAmmo: 90, weaponName: 'Pistol', weaponLevel: 1, score: 0, hasKey: false };
let state = { map: [], players: [], zombies: [], items: [], bullets: [] };

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'hello') {
    myId = msg.id;
    Object.assign(me, msg.self);
  } else if (msg.type === 'state') {
    state = msg;
  } else if (msg.type === 'self') {
    Object.assign(me, msg.self);
  }
};

const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'r') ws.send(JSON.stringify({ type: 'reload' }));
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

canvas.addEventListener('click', () => {
  canvas.requestPointerLock();
  promptEl.textContent = 'WASD gerak, mouse bidik, klik tembak, R reload';
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) me.a += e.movementX * 0.0025;
});

document.addEventListener('mousedown', (e) => {
  if (e.button === 0) ws.send(JSON.stringify({ type: 'shoot' }));
});

function isWall(x, y) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (!state.map[gy] || !state.map[gy][gx]) return true;
  return state.map[gy][gx] === '#' || state.map[gy][gx] === 'D';
}

function move(dt) {
  const speed = dt * 0.004;
  let dx = 0, dy = 0;
  if (keys.has('w')) { dx += Math.cos(me.a) * speed; dy += Math.sin(me.a) * speed; }
  if (keys.has('s')) { dx -= Math.cos(me.a) * speed; dy -= Math.sin(me.a) * speed; }
  if (keys.has('a')) { dx += Math.cos(me.a - Math.PI / 2) * speed; dy += Math.sin(me.a - Math.PI / 2) * speed; }
  if (keys.has('d')) { dx += Math.cos(me.a + Math.PI / 2) * speed; dy += Math.sin(me.a + Math.PI / 2) * speed; }

  const nx = me.x + dx;
  const ny = me.y + dy;
  if (!isWall(nx, me.y)) me.x = nx;
  if (!isWall(me.x, ny)) me.y = ny;

  ws.send(JSON.stringify({ type: 'move', x: me.x, y: me.y, a: me.a }));
}

function castRays() {
  const fov = Math.PI / 3;
  const rays = 220;
  const depth = 22;
  const wallDepth = [];

  ctx.fillStyle = '#6fa8dc';
  ctx.fillRect(0, 0, W, H / 2);
  ctx.fillStyle = '#4b4f56';
  ctx.fillRect(0, H / 2, W, H / 2);

  for (let i = 0; i < rays; i++) {
    const ra = me.a - fov / 2 + (i / rays) * fov;
    let d = 0;
    while (d < depth) {
      d += 0.03;
      const x = me.x + Math.cos(ra) * d;
      const y = me.y + Math.sin(ra) * d;
      if (isWall(x, y)) break;
    }
    const cd = d * Math.cos(ra - me.a);
    wallDepth[i] = cd;
    const h = Math.min(H, (H * 0.92) / (cd + 0.0001));
    const x = (i / rays) * W;
    const shade = Math.max(25, 220 - cd * 17);
    ctx.fillStyle = `rgb(${shade},${shade-20},${shade-30})`;
    ctx.fillRect(x, (H - h) / 2, W / rays + 1, h);
  }

  const sprites = [];
  for (const z of state.zombies) sprites.push({ ...z, color: 'rgba(58,255,81,0.95)', size: 0.8 });
  for (const p of state.players) if (p.id !== myId) sprites.push({ ...p, color: 'rgba(80,160,255,0.95)', size: 0.8 });
  for (const it of state.items) {
    sprites.push({ ...it, color: it.kind === 'ammo' ? 'rgba(255,214,10,0.95)' : 'rgba(255,60,60,0.95)', size: 0.45 });
  }

  sprites.sort((a, b) => Math.hypot(b.x - me.x, b.y - me.y) - Math.hypot(a.x - me.x, a.y - me.y));

  for (const s of sprites) {
    const dx = s.x - me.x;
    const dy = s.y - me.y;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) - me.a;
    if (Math.abs(ang) > Math.PI / 2) continue;
    const sx = (0.5 + (ang / (Math.PI / 3))) * W;
    const size = (H * s.size) / dist;
    const rayI = Math.floor((sx / W) * 220);
    if (rayI < 0 || rayI >= 220 || wallDepth[rayI] < dist) continue;
    ctx.fillStyle = s.color;
    ctx.fillRect(sx - size / 2, H / 2 - size / 2, size, size);
  }

  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 8, H / 2);
  ctx.lineTo(W / 2 + 8, H / 2);
  ctx.moveTo(W / 2, H / 2 - 8);
  ctx.lineTo(W / 2, H / 2 + 8);
  ctx.stroke();
}

let last = performance.now();
setInterval(() => ws.send(JSON.stringify({ type: 'syncSelf' })), 200);

function loop(t) {
  const dt = t - last;
  last = t;
  move(dt);
  castRays();

  hpEl.textContent = Math.round(me.hp);
  ammoEl.textContent = me.ammo;
  reserveEl.textContent = me.reserveAmmo;
  weaponEl.textContent = me.weaponName;
  weaponLvEl.textContent = me.weaponLevel;
  scoreEl.textContent = me.score;
  keyEl.textContent = me.hasKey ? 'Sudah' : 'Belum';

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
