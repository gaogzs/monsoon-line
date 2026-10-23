/* 固定发射器（4.3）：不转动，写在 SHIP_LAUNCHERS 里，按 mode 决定出管方向。
   vls 竖直出管；rail 斜置发射架按 yaw / elev。ammo 由 cells 覆盖。
   一口一弹、海上不能重装（现实里的垂发单元和储运发射箱都是这样）：cells = 发射口数。
   salvo: true —— 按整舰的齐射节奏打（turret.js 的 launch），不是每个口一有目标就连发 */
/* 受控（cued）舰空弹发射器：自己不索敌。什么时候打、打谁、打哪种弹仍由 updateTargets
   按关卡给的 weapon / fireCd 和发现规则决定，只是把弹交给这里出管（Turret.cue）。
   备弹不限 —— 射速由 fireCd 管，和改之前一样。 */
Registry.turretGun({ id: 'vlsSam', order: 90, name: T('turretGuns.vlsSam.name'), kind: 'launcher', cued: true, cd: 0.5, ammo: 0,
           air: true, surface: false, launchSpeed: 40 });
