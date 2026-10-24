/* --- 下游：格斗 --- */
Registry.weapon({
  order: 440,
  tags: ['twinSeeker'],
  id: 'vbn', name: 'BIN-9', cn: T('weapons.vbn.cn'), kind: 'aam',
  model: 'missile',
  speed: 780, boost: 300, life: 4.0, vsLife: 10.0,
  turn: 2.10, seeker: 'ir', lockCone: 40 * Math.PI / 180, lockDist: 4200,
  dmg: 42, cd: 8, salvo: 1, flare: 0.58, fuze: 12, blast: 18, blastCore: 2,
  target: 'air',
  /* 双导引头：第一次骗中只打掉一个（entities.js 的 breakLock / m.seekers） */
  fits: [], perPoint: 1, mass: 110,
  npcFits: ['tip', 'light', 'heavy'],
  desc: T('weapons.vbn.desc'),
  stat: { dmg: 0.48, spd: 0.52, trn: 0.62, rng: 0.34, ecm: 0.26 },
  look: { len: 3.6, dia: 0.18, fin: 'small' },
  role: T('weapons.vbn.role'),
  lead: 0.66
});
