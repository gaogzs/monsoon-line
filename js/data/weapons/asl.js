/* ---------- 对地与反大型 ---------- */
Registry.weapon({
  order: 160,
  tags: ['ballistic'],
  /* 无动力 / 有制导 —— 这一类里最典型的一种。

     desc 本来就写着"无动力滑翔制导炸弹"，但数据里带着 boost: 90
     （发动机推力），于是它在游戏里是一枚有动力的导弹：一路拉烟、
     还有自己的动力段。滑翔弹靠的是投放时的动能和弹翼，没有发动机。 */
  id: 'asl', name: 'GUT-9', cn: T('weapons.asl.cn'), kind: 'agm',
  model: 'bomb',
  speed: 320, life: 14.0, vsLife: 26.0,
  turn: 0.55, seeker: 'ir', lockCone: 40 * Math.PI / 180, lockDist: 35000,   // 按高空（8–12 km、300 m/s 左右）投放的滑翔距离定；低空投放够不着这么远
  dmg: 150, ammo: 4, salvo: 1, blast: 30, blastCore: 8,
  /* flare 是"被干扰弹骗到的概率"，它属于**导引头**，不属于发动机。
     滑翔锤没有发动机，但有红外导引头 —— 所以 flare 该留。
     （我上一轮按 unguided 删除制导类字段时把它一起删了，那是错的。） */
  flare: 0.55,
  target: 'ground',
  glide: 2.5,      // 升阻比：把下沉换成前进，见 entities.js stepMissile
  fin: 25,         // 弹翼修正的加速度上限（m/s²，海平面 250 m/s 时，随 ρ·v² 变）：只能横向修和往下压，托不住重力
  desc: T('weapons.asl.desc'),
  stat: { dmg: 0.52, spd: 0.20, trn: 0.30, rng: 0.48, ecm: 0.60 },
  attr: { fits: ['light', 'heavy'],        perPoint: 6,  mass: 240 },
  look: { len: 3.9, dia: 0.30, fin: 'cruise' },
  role: T('weapons.asl.role'),
  cd: 11,
  lead: 0.65
});
