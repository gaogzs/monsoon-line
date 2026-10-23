(function (Ent) {
  'use strict';
  var $ = Ent.$;
  $.damage = damage; $.hostile = hostile; $.kill = kill; $.killGround = killGround;

  /* ============================================================
     伤害
     ============================================================ */
  function damage(ent, amt, world, source) {
    if (!ent.alive) return false;
    // 附加装甲吊舱（JDA-3 护盾）的全向减伤。只有玩家会带，上限 60%。
    if (ent.armor) amt *= (1 - M3.clamp(ent.armor, 0, 0.6));
    ent.hp -= amt;
    if (source) ent.lastHitBy = source;   // 坠毁也能追到是谁打残的（战报分开记功）
    if (ent.hp <= 0) {
      kill(ent, world, false, source);
      return true;
    }
    return false;
  }

  /* 敌我判据：0 与 1 互为敌，2 是中立 —— 谁都不主动去打它，它也不打别人。
     导弹选目标那几处早就是这条规矩（`g.team > 1` 跳过），
     空中 AI、玩家锁定、预警机报告统一走这里。
     弹丸碰撞**不**走它：流弹照样会误伤中立，和水面中立船一致。 */
  function hostile(a, b) {
    return a.team !== b.team && a.team < 2 && b.team < 2;
  }

  function kill(ent, world, groundImpact, source) {
    if (!ent.alive) return;
    ent.alive = false;
    ent.dead = true;
    var s = ent.kind === 'air' ? (ent.phys.hp > 150 ? 3.2 : 2.2) : 3.5;
    if (world) {
      $.explode(world.particles, ent.pos, s, ent.phys && ent.phys.hp > 150 ? 26 : 20);
      SFX.boom(ent.phys && ent.phys.hp > 150 ? 1.5 : 1.1);
    }
    /* 记下击杀者：战报按"玩家 / 僚机 / 友舰"分开记功。没有直接来源的
       （被打残后坠海、失速撞海）算最后一个命中它的人。 */
    ent.killedBy = source || ent.lastHitBy || null;
    if (source && source.kills !== undefined) source.kills++;
  }

  function killGround(ent, world) {
    if (!ent.alive) return;
    ent.alive = false;
    ent.dead = true;
    if (world) {
      /* 设施/舰船的击毁要单独记一笔：主循环的 world.killed 只数飞机，
         没有这一行"摧毁 3 座浮空平台"在结算上就完全不体现。 */
      // 舰船打掉的不算玩家的战果（ent.killedBy 由 game.js 的 hitTarget 写入）
      var byShip = ent.killedBy && ent.killedBy.kind === 'target';
      if (world.groundKilled !== undefined && ent.team === 1 && !ent.friendlyAsset && !byShip) {
        world.groundKilled++;           // 只有敌方的才算战果：调节单元、准绳、中立船不加分
      }
      var s = (ent.radius || 8) / 6;
      $.explode(world.particles, ent.pos, s, 22 + (ent.radius | 0));
      SFX.bigHit();
    }
  }
})(Ent);
