Registry.weapon({
  order: 470,
  id: 'dl6', name: 'BIN-6', cn: T('weapons.dl6.cn'), kind: 'aam', model: 'missile',
  speed: 780, boost: 190, life: 4.5, vsLife: 10.0,
  turn: 2.05, seeker: 'ir', lockCone: 36 * Math.PI / 180, lockDist: 3600,
  dmg: 26, salvo: 1, flare: 0.35, fuze: 14, blast: 20, blastCore: 2,
  target: 'air',
  fits: [], perPoint: 3, mass: 95,
  npcFits: ['tip', 'light', 'heavy'],
  desc: T('weapons.dl6.desc'),
  look: { len: 2.9, dia: 0.14, fin: 'strake' },
  role: T('weapons.dl6.role'),
  cd: 4.4,
  lead: 0.48
});
