const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const TICK = 1000 / 30;
const MAP_W = 20;
const MAP_H = 20;

const map = [
  '####################',
  '#....#.............#',
  '#....#...####......#',
  '#........#..#......#',
  '#........#..#......#',
  '#...######..#####..#',
  '#..................#',
  '#..###.....K.......#',
  '#..#.#.............#',
  '#..#.#...######....#',
  '#......D.#....#....#',
  '#........#....#....#',
  '#........#....#....#',
  '#..######....##....#',
  '#..................#',
  '#....H.............#',
  '#..................#',
  '#.............S....#',
  '#..................#',
  '####################'
].map((r) => r.split(''));

const state = {
  players: new Map(),
  zombies: [],
  items: [],
  bullets: []
};

let nextId = 1;
let nextZombieId = 1;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function isWall(x, y) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H) return true;
  const cell = map[gy][gx];
  return cell === '#' || cell === 'D';
}

function findFreeSpot() {
  for (let i = 0; i < 1000; i++) {
    const x = rand(1.5, MAP_W - 1.5);
    const y = rand(1.5, MAP_H - 1.5);
    if (!isWall(x, y)) return { x, y };
  }
  return { x: 2, y: 2 };
}

function spawnZombie() {
  if (state.zombies.length > 20) return;
  const p = findFreeSpot();
  state.zombies.push({ id: nextZombieId++, x: p.x, y: p.y, hp: 40, speed: 0.01 + Math.random() * 0.02 });
}

function spawnItem(kind) {
  const p = findFreeSpot();
  state.items.push({ id: `i${Date.now()}${Math.random()}`, kind, x: p.x, y: p.y });
}

setInterval(() => {
  if (Math.random() < 0.18) spawnZombie();
  if (Math.random() < 0.08) spawnItem('ammo');
  if (Math.random() < 0.05) spawnItem('med');
}, 1000);

function update() {
  const players = [...state.players.values()];

  for (const z of state.zombies) {
    let target = null;
    let best = 9999;
    for (const p of players) {
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < best) {
        best = d;
        target = p;
      }
    }
    if (target) {
      const dx = target.x - z.x;
      const dy = target.y - z.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = z.x + (dx / len) * z.speed;
      const ny = z.y + (dy / len) * z.speed;
      if (!isWall(nx, ny)) {
        z.x = nx;
        z.y = ny;
      }
      if (best < 0.65) {
        target.hp -= 0.25;
      }
    }
  }

  state.bullets = state.bullets.filter((b) => {
    b.x += Math.cos(b.a) * b.speed;
    b.y += Math.sin(b.a) * b.speed;
    if (isWall(b.x, b.y)) return false;

    for (const z of state.zombies) {
      const d = Math.hypot(z.x - b.x, z.y - b.y);
      if (d < 0.4) {
        z.hp -= b.damage;
        if (z.hp <= 0) {
          const owner = state.players.get(b.owner);
          if (owner) {
            owner.score += 10;
            owner.xp += 10;
            if (owner.xp >= owner.nextLevelXp) {
              owner.xp = 0;
              owner.weaponLevel += 1;
              owner.damage += 6;
              owner.fireCooldown = Math.max(100, owner.fireCooldown - 25);
              owner.magSize += 2;
              owner.ammo = owner.magSize;
            }
          }
        }
        return false;
      }
    }

    return b.life-- > 0;
  });

  state.zombies = state.zombies.filter((z) => z.hp > 0);

  for (const p of players) {
    if (p.hp <= 0) {
      p.hp = 100;
      const s = findFreeSpot();
      p.x = s.x;
      p.y = s.y;
      p.hasKey = false;
      map[10][7] = 'D';
    }

    for (const it of state.items) {
      if (Math.hypot(it.x - p.x, it.y - p.y) < 0.7) {
        if (it.kind === 'ammo') p.reserveAmmo += 18;
        if (it.kind === 'med') p.hp = Math.min(100, p.hp + 35);
        it.picked = true;
      }
    }

    const keyPos = { x: 10.5, y: 7.5 };
    if (!p.hasKey && Math.hypot(p.x - keyPos.x, p.y - keyPos.y) < 0.8) p.hasKey = true;

    const hiddenWeaponPos = { x: 5.5, y: 15.5 };
    if (!p.hasHiddenWeapon && Math.hypot(p.x - hiddenWeaponPos.x, p.y - hiddenWeaponPos.y) < 0.8) {
      p.hasHiddenWeapon = true;
      p.weaponName = 'SMG Rahasia';
      p.damage += 8;
      p.fireCooldown = Math.max(80, p.fireCooldown - 30);
      p.magSize += 8;
      p.ammo = p.magSize;
      p.reserveAmmo += 40;
    }

    if (p.hasKey && Math.hypot(p.x - 7.5, p.y - 10.5) < 1.2) {
      map[10][7] = '.';
    }
  }

  state.items = state.items.filter((i) => !i.picked);

  const payload = JSON.stringify({
    type: 'state',
    map,
    players: players.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, a: p.a, hp: p.hp, weaponLevel: p.weaponLevel })),
    zombies: state.zombies,
    items: state.items,
    bullets: state.bullets
  });

  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

setInterval(update, TICK);

wss.on('connection', (ws) => {
  const id = `p${nextId++}`;
  const s = findFreeSpot();
  const player = {
    id,
    name: `Pemain-${id.slice(1)}`,
    x: s.x,
    y: s.y,
    a: 0,
    hp: 100,
    ammo: 30,
    reserveAmmo: 90,
    magSize: 30,
    weaponName: 'Pistol',
    weaponLevel: 1,
    xp: 0,
    nextLevelXp: 50,
    score: 0,
    hasKey: false,
    hasHiddenWeapon: false,
    damage: 20,
    fireCooldown: 280,
    lastShot: 0
  };
  state.players.set(id, player);

  ws.send(JSON.stringify({ type: 'hello', id, self: player }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const p = state.players.get(id);
    if (!p) return;

    if (msg.type === 'move') {
      const nx = msg.x;
      const ny = msg.y;
      if (!isWall(nx, ny)) {
        p.x = nx;
        p.y = ny;
      }
      p.a = msg.a;
    }

    if (msg.type === 'shoot') {
      const now = Date.now();
      if (now - p.lastShot < p.fireCooldown) return;
      if (p.ammo <= 0) return;
      p.lastShot = now;
      p.ammo -= 1;
      state.bullets.push({ owner: id, x: p.x, y: p.y, a: p.a, speed: 0.22, life: 28, damage: p.damage });
    }

    if (msg.type === 'reload') {
      const need = p.magSize - p.ammo;
      const take = Math.min(need, p.reserveAmmo);
      p.ammo += take;
      p.reserveAmmo -= take;
    }

    if (msg.type === 'syncSelf') {
      ws.send(JSON.stringify({
        type: 'self',
        self: {
          hp: p.hp,
          ammo: p.ammo,
          reserveAmmo: p.reserveAmmo,
          weaponName: p.weaponName,
          weaponLevel: p.weaponLevel,
          score: p.score,
          hasKey: p.hasKey
        }
      }));
    }
  });

  ws.on('close', () => {
    state.players.delete(id);
  });
});

server.listen(3000, () => {
  console.log('Server berjalan di http://localhost:3000');
});
