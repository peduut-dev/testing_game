import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/PointerLockControls.js';

const socket = io();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9ff);
scene.fog = new THREE.Fog(0x9ec9ff, 30, 150);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1.3);
light.position.set(10, 20, 5);
scene.add(light, new THREE.AmbientLight(0xffffff, 0.5));

const controls = new PointerLockControls(camera, document.body);
document.body.addEventListener('click', () => controls.lock());
scene.add(controls.getObject());

const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshLambertMaterial({ color: 0x4c8a3f }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

for (let i = 0; i < 35; i++) {
  const rumah = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 8), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xd9b38c : 0xb3c7d9 }));
  rumah.position.set((Math.random() - 0.5) * 130, 3, (Math.random() - 0.5) * 130);
  scene.add(rumah);
}

const door = new THREE.Mesh(new THREE.BoxGeometry(4, 7, 0.5), new THREE.MeshLambertMaterial({ color: 0x4b2e1d }));
door.position.set(30, 3.5, 0);
scene.add(door);

const statusEl = document.getElementById('stats');
const scoreEl = document.getElementById('score');
const state = { hp: 100, ammo: 30, weaponLevel: 1, key: false, id: null, score: 0 };
const keys = {};
const others = new Map();
const zombies = new Map();
const loot = new Map();
let keyMesh = null;
let hiddenWeaponMesh = null;

function makeZombie(z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.2, 1.8), new THREE.MeshLambertMaterial({ color: 0x4caf50 }));
  mesh.position.set(z.x, z.y + 1.6, z.z);
  scene.add(mesh);
  zombies.set(z.id, { ...z, mesh });
}
function makeLoot(l) {
  const color = l.type === 'ammo' ? 0x1e90ff : 0xff4d6d;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(l.x, l.y, l.z);
  scene.add(mesh);
  loot.set(l.id, { ...l, mesh });
}

socket.on('init', (data) => {
  state.id = data.id;
  Object.values(data.players).forEach((p) => {
    if (p.id === state.id) return;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.2), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    m.position.set(p.x, p.y, p.z);
    scene.add(m);
    others.set(p.id, m);
  });
  data.zombies.forEach(makeZombie);
  data.randomLoot.forEach(makeLoot);

  if (!data.worldItems.key.taken) {
    keyMesh = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.16, 8, 20), new THREE.MeshLambertMaterial({ color: 0xf7d038 }));
    keyMesh.position.set(data.worldItems.key.x, data.worldItems.key.y + 1, data.worldItems.key.z);
    scene.add(keyMesh);
  }

  if (!data.worldItems.hiddenWeapon.taken) {
    hiddenWeaponMesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0x9b59b6 }));
    hiddenWeaponMesh.position.set(data.worldItems.hiddenWeapon.x, data.worldItems.hiddenWeapon.y + 1, data.worldItems.hiddenWeapon.z);
    scene.add(hiddenWeaponMesh);
  }
});

function refreshHUD() {
  statusEl.textContent = `HP: ${state.hp} | Ammo: ${state.ammo} | Weapon Lv: ${state.weaponLevel} | Key: ${state.key ? 'Ya' : 'Tidak'}`;
}
refreshHUD();

socket.on('playerJoined', (p) => {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.2), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  m.position.set(p.x, p.y, p.z);
  scene.add(m);
  others.set(p.id, m);
});
socket.on('playerMoved', (p) => others.get(p.id)?.position.set(p.x, p.y, p.z));
socket.on('playerLeft', (id) => { if (others.has(id)) { scene.remove(others.get(id)); others.delete(id); } });
socket.on('lootPicked', (id) => { const l = loot.get(id); if (!l) return; scene.remove(l.mesh); loot.delete(id); });
socket.on('lootState', (list) => {
  list.forEach((l) => { if (!loot.has(l.id)) makeLoot(l); });
});
socket.on('zombieState', (zs) => {
  zs.forEach((z) => {
    const ex = zombies.get(z.id);
    if (!ex) return makeZombie(z);
    ex.mesh.position.x = z.x;
    ex.mesh.position.z = z.z;
    ex.hp = z.hp;
  });
});
socket.on('keyPicked', () => { if (keyMesh) { scene.remove(keyMesh); keyMesh = null; } });
socket.on('weaponPicked', () => { if (hiddenWeaponMesh) { scene.remove(hiddenWeaponMesh); hiddenWeaponMesh = null; } });
socket.on('playerUpgraded', (p) => { if (p.id === state.id) { state.weaponLevel = p.weaponLevel; refreshHUD(); }});
socket.on('doorOpened', () => { door.position.y = -20; });
socket.on('scoreState', (players) => {
  const top = Object.values(players).sort((a, b) => b.score - a.score).slice(0, 5).map((p) => `${p.id.slice(0, 4)}:${p.score}`).join(' | ');
  scoreEl.textContent = `Skor: ${top}`;
});

document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'u') socket.emit('upgradeWeapon');
  if (e.key.toLowerCase() === 'o' && state.key) socket.emit('openDoor');
});
document.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

document.addEventListener('mousedown', () => {
  if (state.ammo <= 0) return;
  state.ammo -= 1;
  refreshHUD();
  const origin = controls.getObject().position;
  let nearest = null;
  zombies.forEach((z) => {
    const d = origin.distanceTo(z.mesh.position);
    if (!nearest || d < nearest.d) nearest = { d, z };
  });
  if (nearest && nearest.d < 15) {
    socket.emit('hitZombie', { zombieId: nearest.z.id, damage: 20 + (state.weaponLevel * 10) });
  }
});

function tryPickup() {
  const p = controls.getObject().position;
  loot.forEach((l) => {
    if (p.distanceTo(l.mesh.position) < 2) {
      socket.emit('pickupLoot', l.id);
      if (l.type === 'ammo') state.ammo += 15;
      if (l.type === 'medkit') state.hp = Math.min(100, state.hp + 25);
      refreshHUD();
    }
  });
  if (keyMesh && p.distanceTo(keyMesh.position) < 2.2) {
    state.key = true;
    socket.emit('pickupKey');
    refreshHUD();
  }
  if (hiddenWeaponMesh && p.distanceTo(hiddenWeaponMesh.position) < 2.2) {
    state.weaponLevel = Math.max(state.weaponLevel, 3);
    socket.emit('pickupWeapon');
    refreshHUD();
  }
}
document.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'e') tryPickup(); });

function animate() {
  requestAnimationFrame(animate);
  const speed = 0.2;
  if (keys.w) controls.moveForward(speed);
  if (keys.s) controls.moveForward(-speed);
  if (keys.a) controls.moveRight(-speed);
  if (keys.d) controls.moveRight(speed);
  controls.getObject().position.y = 1.7;
  socket.emit('move', controls.getObject().position);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
