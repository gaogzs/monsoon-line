Registry.weapon({
  order: 330,
  id: 'v25', name: 'GUT-25', cn: T('weapons.v25.cn'), kind: 'agm',
  model: 'missile',
  speed: 730, boost: 120, life: 14.0, vsLife: 50.0,
  turn: 0.62, seeker: 'radar', lockCone: 45 * Math.PI / 180, lockDist: 8000,
  dmg: 175,salvo: 1, flare: 0.80, blast: 30, blastCore: 8,
  target: 'ground',
  /* 攻顶：水平距离 > dive 时瞄准点抬高 alt 米，末段俯冲（entities.js） */
  loft: { alt: 1500, dive: 2800 },
  desc: T('weapons.v25.desc'),
  stat: { dmg: 0.82, spd: 0.52, trn: 0.18, rng: 0.85, ecm: 0.82 },
  attr: { fits: ['heavy', 'belly'],        perPoint: 3,  mass: 330 },
  look: { len: 4.0, dia: 0.30, fin: 'small' },
  role: T('weapons.v25.role'),
  needs: ['strike'], // 防区外对地
  cd: 18,
  lead: 0.66,
  flareRD: 0.72 // GUT-25 重锤
});
