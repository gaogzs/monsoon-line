/* ---------- 补位：三个此前没有对应型号的定位 ---------- */
Registry.weapon({
  order: 260,
  id: 'swm', name: 'GIR-12', cn: T('weapons.swm.cn'), kind: 'aam',
  model: 'missile',
  speed: 720, boost: 300, life: 3.5, vsLife: 9.0,
  turn: 2.55, seeker: 'ir', lockCone: 32 * Math.PI / 180, lockDist: 3400,
  dmg: 16, ammo: 8, salvo: 4, flare: 0.44, fuze: 8, blast: 14, blastCore: 2,
  target: 'air',    desc: T('weapons.swm.desc'),
  stat: { dmg: 0.16, spd: 0.44, trn: 0.72, rng: 0.28, ecm: 0.22 },
  attr: { fits: ['tip', 'light', 'heavy'], perPoint: 20, mass: 62 },
  look: { len: 1.9, dia: 0.10, fin: 'strake', nest: 'box', cells: 4 },
  role: T('weapons.swm.role'),
  cd: 4.4,
  lead: 0.44
});
