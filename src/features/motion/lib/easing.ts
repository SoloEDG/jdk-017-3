import type { EasingId } from "../../../shared/types";
import { clamp, smoothstep } from "../../../shared/math";
export const easings: { id: EasingId; label: string }[] = [
  { id: "easeInOut", label: "缓入缓出" },
  { id: "linear", label: "线性" },
  { id: "easeIn", label: "缓入" },
  { id: "easeOut", label: "缓出" },
];
/** 归一化缓动：输入输出都在 [0,1]，端点恒等（f(0)=0, f(1)=1） */
export function applyEasing(id: EasingId, t: number) {
  const x = clamp(t, 0, 1);
  switch (id) {
    case "linear":
      return x;
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return smoothstep(0, 1, x);
  }
}
