/* ============================================================
   设施 / 调节单元（没有独立数据表的目标，按模型名取默认值）

   字段：
     model      对应 MODELS 里的模型
     tags       机制标签（见 js/core/tags.js）：hard = 加固设施（普通战斗部打折、
                集束更狠，侵彻弹全额）；regulator / relay / sam = 被击毁时触发各自的结算
     gunResist  机炮抗性。小口径航炮（cal ≤ Ent.SMALL_CAL）打在它身上只剩 (1 − gunResist)。
                机炮射速太高，命中就是一片 —— 对大块头、厚结构或"打个孔也无所谓"的东西，
                这一片不该等于一枚对地弹。飞机写在 AIRCRAFT[].gunResist，舰船写在
                SHIPS[].gunResist；spawnTarget 传了 gunResist 就以传入为准。
     sam / mounts / launchers   自卫火力（可选，写法同 PLATFORMS）：spawnTarget 按模型名取来
                Turret.attach，sam 落到 t.weapon（旋转架舰空弹由 updateTargets 驱动）。
                中立单位（team 2）不开火，所以别给调节单元写；关卡传 armed:false 可关掉。
   ============================================================ */
