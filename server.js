const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const players = {};
const worldItems = {
  key: { x: -20, y: 1, z: 18, taken: false },
  hiddenWeapon: { x: 22, y: 1, z: -15, taken: false }
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function spawnLoot(type) {
  return {
    id: `${type}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    type,
    x: rand(-35, 35),
    y: 1,
    z: rand(-35, 35)
  };
}

let randomLoot = [
  ...Array.from({ length: 12 }, () => spawnLoot('ammo')),
  ...Array.from({ length: 8 }, () => spawnLoot('medkit'))
];

let zombies = Array.from({ length: 20 }, (_, i) => ({
  id: `z-${i}`,
  x: rand(-30, 30),
  y: 1,
  z: rand(-30, 30),
  hp: 100
}));

io.on('connection', (socket) => {
  players[socket.id] = {
    id: socket.id,
    x: 0,
    y: 1.7,
    z: 0,
    hp: 100,
    weaponLevel: 1,
    hasKey: false,
    score: 0
  };

  socket.emit('init', {
    id: socket.id,
    players,
    randomLoot,
    zombies,
    worldItems
  });

  socket.broadcast.emit('playerJoined', players[socket.id]);

  socket.on('move', (pos) => {
    if (!players[socket.id]) return;
    players[socket.id] = { ...players[socket.id], ...pos };
    socket.broadcast.emit('playerMoved', players[socket.id]);
  });

  socket.on('pickupLoot', (lootId) => {
    randomLoot = randomLoot.filter((l) => l.id !== lootId);
    io.emit('lootPicked', lootId);
  });

  socket.on('pickupKey', () => {
    if (!players[socket.id] || worldItems.key.taken) return;
    worldItems.key.taken = true;
    players[socket.id].hasKey = true;
    io.emit('keyPicked', socket.id);
  });

  socket.on('pickupWeapon', () => {
    if (!players[socket.id] || worldItems.hiddenWeapon.taken) return;
    worldItems.hiddenWeapon.taken = true;
    players[socket.id].weaponLevel = Math.max(players[socket.id].weaponLevel, 3);
    io.emit('weaponPicked', socket.id);
  });

  socket.on('upgradeWeapon', () => {
    if (!players[socket.id]) return;
    players[socket.id].weaponLevel = Math.min(players[socket.id].weaponLevel + 1, 5);
    io.emit('playerUpgraded', players[socket.id]);
  });

  socket.on('hitZombie', ({ zombieId, damage }) => {
    const zombie = zombies.find((z) => z.id === zombieId);
    if (!zombie || !players[socket.id]) return;
    zombie.hp -= damage;
    if (zombie.hp <= 0) {
      players[socket.id].score += 10;
      zombie.x = rand(-30, 30);
      zombie.z = rand(-30, 30);
      zombie.hp = 100;
      if (Math.random() < 0.4) {
        randomLoot.push(spawnLoot(Math.random() > 0.5 ? 'ammo' : 'medkit'));
        io.emit('lootState', randomLoot);
      }
    }
    io.emit('zombieState', zombies);
    io.emit('scoreState', players);
  });

  socket.on('openDoor', () => {
    if (!players[socket.id] || !players[socket.id].hasKey) return;
    io.emit('doorOpened', socket.id);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

setInterval(() => {
  zombies = zombies.map((z) => ({
    ...z,
    x: z.x + rand(-0.6, 0.6),
    z: z.z + rand(-0.6, 0.6)
  }));
  io.emit('zombieState', zombies);
}, 900);

setInterval(() => {
  if (randomLoot.length < 20) {
    randomLoot.push(spawnLoot(Math.random() > 0.5 ? 'ammo' : 'medkit'));
    io.emit('lootState', randomLoot);
  }
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Game server running at http://localhost:${PORT}`);
});
