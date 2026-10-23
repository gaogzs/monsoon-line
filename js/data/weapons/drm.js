/* ---------- 上游：无人僚机专用（玩家挂不上） ----------
   TOR-2 的弹体与导引头改装：战斗部加大、导引头罩换成双模式。
   对空对地同一个锁定距离（target:'any'）。携弹量比同定位的 TOR-2 多约一半。 */
Registry.weapon({
  order: 500,
  id: 'drm', name: 'TOR-3', cn: T('weapons.drm.cn'), kind: 'aam',
  model: 'missile',
  speed: 760, boost: 180, life: 4.5, vsLife: 12.0,
  turn: 1.75, seeker: 'ir', lockCone: 28 * Math.PI / 180, lockDist: 4200,
  dmg: 30, ammo: 30, salvo: 1, flare: 0.38, fuze: 12, blast: 18, blastCore: 2,
  target: 'any',
  fits: [], perPoint: 15, mass: 60,
  npcFits: ['light', 'heavy'],
  desc: T('weapons.drm.desc'),
  stat: { dmg: 0.34, spd: 0.50, trn: 0.68, rng: 0.36, ecm: 0.30 },
  look: { len: 2.7, dia: 0.13, fin: 'strake', nose: 'dual' },
  role: T('weapons.drm.role'),
  cd: 4.8,
  lead: 0.38
});
