/* ---------- 上游：舰载防空 ----------
   FAN- 取自 fanta（阻止），与 F- 截击机同一词根。
   数值照 BAD-9 的档位：上游的舰炮护不住整片海，护得住的是这一圈。 */
Registry.weapon({
  order: 490,
  id: 'ss6', name: 'FAN-6', cn: T('weapons.ss6.cn'), kind: 'aam', model: 'missile',
  speed: 960, boost: 330, life: 9.5, vsLife: 22.0,
  turn: 1.45, seeker: 'radar', lockCone: 40 * Math.PI / 180, lockDist: 9500,
  dmg: 46, ammo: 8, salvo: 1, flare: 0.58, fuze: 24, blast: 36, blastCore: 4,
  target: 'air',
  fits: [], perPoint: 0, mass: 0,
  desc: T('weapons.ss6.desc'),
  look: { len: 4.3, dia: 0.25, fin: 'small' },
  role: T('weapons.ss6.role'),
  cd: 15,
  lead: 0.80,
  flareRD: 0.42 // FAN-6 海墙（上游舰载）
});
