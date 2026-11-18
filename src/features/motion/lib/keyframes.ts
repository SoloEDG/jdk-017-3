import type { Keyframe, Projection } from "../../../shared/types";
import { clamp } from "../../../shared/math";

export const MAX_DURATION = 300; // 片长上限（秒），配合流式编码给出硬内存上界
const MAX_FIELD = 60; // 单段停留 / 转场时长上限（秒）

export function createKeyframe(projection: Projection): Keyframe {
  return {
    id: crypto.randomUUID(),
    projection: { ...projection },
    dwell: 1.5,
    transition: 2,
    easing: "easeInOut",
  };
}
/** 把时间字段钳回合法范围，非法输入回退为 0 */
export function clampKeyframeTimes(kf: Keyframe) {
  kf.dwell = Number.isFinite(kf.dwell) ? clamp(kf.dwell, 0, MAX_FIELD) : 0;
  kf.transition = Number.isFinite(kf.transition)
    ? clamp(kf.transition, 0, MAX_FIELD)
    : 0;
}
/** 拖动排序：把 from 位置的元素移动到 to 位置，返回新数组 */
export function moveKeyframe<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(clamp(to, 0, next.length), 0, item);
  return next;
}
