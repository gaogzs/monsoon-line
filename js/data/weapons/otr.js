/* --- 分水群岛国：两边卖的旧货 --- */
Registry.weapon({
  order: 450,
  id: 'otr', name: 'TOR-1', cn: T('weapons.otr.cn'), kind: 'aam',
  model: 'missile',
  speed: 620, boost: 200, life: 3.0, vsLife: 7.0,
  turn: 1.35, seeker: 'ir', lockCone: 24 * Math.PI / 180, lockDist: 3000,
  dmg: 32, ammo: 2, cd: 6, salvo: 1, flare: 0.86, fuze: 18, blast: 28, blastCore: 8,
  target: 'air',
  fits: [], perPoint: 0, mass: 0,
  npcFits: ['tip', 'light', 'heavy'],
  desc: T('weapons.otr.desc'),
  stat: { dmg: 0.34, spd: 0.40, trn: 0.34, rng: 0.18, ecm: 0.10 },
  look: { len: 2.8, dia: 0.14, fin: 'small' },
  role: T('weapons.otr.role'),
  lead: 0.32
});
