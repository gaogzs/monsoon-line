Registry.weapon({
  order: 270,
  tags: ['highAltImmune'],
  id: 'hva', name: 'SPO-9', cn: T('weapons.hva.cn'), kind: 'aam',
  model: 'missile',
  speed: 980, boost: 240, life: 8.0, vsLife: 18.0,
  turn: 1.30, seeker: 'radar', lockCone: 34 * Math.PI / 180, lockDist: 11000,
  dmg: 62, ammo: 1, salvo: 1, flare: 0.70, fuze: 26, blast: 48, blastCore: 7,
  target: 'air', desc: T('weapons.hva.desc'),
  stat: { dmg: 0.78, spd: 0.84, trn: 0.38, rng: 0.88, ecm: 0.24 },
  attr: { fits: ['heavy'],                 perPoint: 2,  mass: 560 },
  look: { len: 4.7, dia: 0.28, fin: 'small', boost: true },
  role: T('weapons.hva.role'),
  needs: ['intercept'], // 极高空拦截弹
  cd: 26,
  lead: 0.80,
  /* BIN-6 / BIN-9 原来也在这里，但它们是红外弹 —— 下面的循环本来就会
     跳过它们，留着只是两行死数据，删掉。 */
  flareRD: 0.40 // SPO-9 落雷
});
