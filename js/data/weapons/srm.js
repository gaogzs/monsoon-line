/* ---------- 基础短程空空导弹 ----------
   不再是"默认自带"的东西，而是和其他弹一样占挂载点。
   便宜、量大、性能平庸 —— 这就是它作为基准弹的意义。 */
Registry.weapon({
  order: 60,
  id: 'srm', name: 'TOR-2', cn: T('weapons.srm.cn'), kind: 'aam',
  model: 'missile',
  speed: 760, boost: 180, life: 4.5, vsLife: 12.0,
  turn: 1.75, seeker: 'ir', lockCone: 28 * Math.PI / 180, lockDist: 4200,
  dmg: 30, ammo: 8, salvo: 1, flare: 0.38, fuze: 12, blast: 18, blastCore: 2,
  target: 'air',    desc: T('weapons.srm.desc'),
  stat: { dmg: 0.34, spd: 0.50, trn: 0.68, rng: 0.36, ecm: 0.30 },
  attr: { fits: ['tip', 'light', 'heavy'], perPoint: 10,  mass: 95 },
  look: { len: 2.7, dia: 0.13, fin: 'strake' },
  role: T('weapons.srm.role'),
  /* 空空 —— 单发 5 到 30 秒，重弹仍然一场打不了几次 */
  cd: 4.8,
  lead: 0.38
});
