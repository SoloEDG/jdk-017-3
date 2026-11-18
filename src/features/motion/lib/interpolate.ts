import type { Projection } from "../../../shared/types";
import { lerp, wrap } from "../../../shared/math";
/**
 * 角度插值走短路径：把差值折进 (-180, 180]，
 * 例如 350° → 10° 的差值是 +20° 而不是 -340°。
 */
export function lerpAngle(a: number, b: number, t: number) {
  const delta = wrap(b - a + 180, 360) - 180;
  return wrap(a + delta * t, 360);
}
/**
 * 取景插值。每个分量都是 t 的连续函数，因此合成朝向也连续：
 * 水平 / 画面旋转走角度短路径，俯仰在 ±85° 内线性过渡，
 * 尺度按对数插值（等比缩放观感匀速），投影模式在中点切换。
 * 任意时刻都不会出现突然翻转。
 */
export function lerpProjection(
  a: Projection,
  b: Projection,
  t: number,
): Projection {
  return {
    mode: t < 0.5 ? a.mode : b.mode,
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), t)),
    yaw: lerpAngle(a.yaw, b.yaw, t),
    pitch: lerp(a.pitch, b.pitch, t),
    roll: lerpAngle(a.roll, b.roll, t),
  };
}
