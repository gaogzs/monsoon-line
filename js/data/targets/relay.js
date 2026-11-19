Registry.target({
  order: 20,
  id: 'relay', model: 'relay',
  tags: ['relay'],
  gunResist: 0.7,   // 高空中继平台：桁架结构，弹丸大多穿过
  /* 自卫火力（批次 6.6）：顶部一台旋转架舰空弹 + 机头 / 机尾各一座近防炮。
     坐标对着 js/models/targets/relay.js：机身上沿 y = 7.5、设备舱上沿 y = 11（z −30 ~ 14）。
     射界不是全向：机头炮压不到正后方，机尾炮压不到正前方，各留约 50° 的死角 */
  sam: 'dl9',
  mounts: [
    _m('noseCiws', 'ciws20', [0, 8.6, 36], 0, { yawMin: -2.4, yawMax: 2.4, pitchMin: -0.2, pitchMax: 1.5 }, null, 'ciws'),
    _m('tailCiws', 'ciws20', [0, 11.6, -26], Math.PI, { yawMin: -2.4, yawMax: 2.4, pitchMin: -0.2, pitchMax: 1.5 }, null, 'ciws')
  ],
  launchers: [_L('sam', 'rotSam', [0, 11.6, -4], 'turret', 0, ARC_CIWS, 'lnch')]
});
