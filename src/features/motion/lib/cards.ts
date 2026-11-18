import { clamp, smoothstep } from "../../../shared/math";

/** 依据底色亮度选择对比文字色，预览与导出共用同一策略 */
export function cardInk(background: string) {
  const rgb = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return luminance > 0.6 ? "#2c3530" : "#eef3ec";
}
export function cardSubtitle(kind: "title" | "credits") {
  return kind === "title" ? "ORBIT · 小行星工作室" : "ORBIT STUDIO · FIN";
}
/**
 * 片头 / 片尾卡片：画面只是 (文字, 局部时间) 的纯函数，
 * 固定步长采样与实时预览得到完全一致的结果。
 */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  size: number,
  text: string,
  kind: "title" | "credits",
  local: number,
  duration: number,
  background: string,
) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);
  // 头尾各 20%（至多 0.4s）淡入淡出，只取决于局部时间
  const fade = Math.min(0.4, duration * 0.2);
  const alpha =
    fade > 0
      ? smoothstep(0, fade, local) * (1 - smoothstep(duration - fade, duration, local))
      : 1;
  const ink = cardInk(background);
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${Math.round(size / 13)}px "DM Sans", "Noto Sans SC", sans-serif`;
  ctx.fillText(text || (kind === "title" ? "未命名的星球" : "FIN"), size / 2, size / 2 - size * 0.02);
  ctx.font = `400 ${Math.round(size / 42)}px "DM Sans", sans-serif`;
  ctx.globalAlpha = clamp(alpha, 0, 1) * 0.62;
  ctx.fillText(cardSubtitle(kind), size / 2, size / 2 + size * 0.07);
  ctx.restore();
}
