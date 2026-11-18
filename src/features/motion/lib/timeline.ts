import type {
  EasingId,
  Keyframe,
  MotionTitles,
  Projection,
} from "../../../shared/types";
import { clamp } from "../../../shared/math";
import { applyEasing } from "./easing";
import { lerpProjection } from "./interpolate";

export interface MotionSegment {
  kind: "dwell" | "move";
  /** 停留段：所在关键帧下标；运动段：起点关键帧下标 */
  from: number;
  /** 运动段：终点关键帧下标 */
  to: number;
  /** 绝对时间（秒），含片头偏移 */
  start: number;
  end: number;
  easing: EasingId;
}
export interface Timeline {
  /** 片头时长（秒） */
  title: number;
  /** 片尾时长（秒） */
  credits: number;
  /** 运镜部分结束时刻 = 片头 + 运镜时长 */
  motionEnd: number;
  /** 总时长（秒）= 片头 + 运镜 + 片尾 */
  total: number;
  segments: MotionSegment[];
}
export type TimelineSample =
  | { kind: "title"; local: number; duration: number }
  | { kind: "credits"; local: number; duration: number }
  | {
      kind: "pose";
      projection: Projection;
      /** 当前视觉焦点所在的关键帧下标，用于列表高亮 */
      focus: number;
    };

const cardSeconds = (card: { enabled: boolean; duration: number }) =>
  card.enabled ? Math.max(0, card.duration) : 0;

/** 由关键帧序列与片头片尾设置构建时间轴，全部为确定性的纯函数 */
export function buildTimeline(
  keyframes: Keyframe[],
  titles: MotionTitles,
): Timeline {
  const title = cardSeconds(titles.title);
  const credits = cardSeconds(titles.credits);
  const segments: MotionSegment[] = [];
  let t = title;
  keyframes.forEach((kf, i) => {
    const dwell = Math.max(0, kf.dwell);
    segments.push({
      kind: "dwell",
      from: i,
      to: i,
      start: t,
      end: t + dwell,
      easing: kf.easing,
    });
    t += dwell;
    if (i < keyframes.length - 1) {
      const move = Math.max(0, kf.transition);
      segments.push({
        kind: "move",
        from: i,
        to: i + 1,
        start: t,
        end: t + move,
        easing: kf.easing,
      });
      t += move;
    }
  });
  return { title, credits, motionEnd: t, total: t + credits, segments };
}

/**
 * 采样任意时刻的画面。预览（实时播放 / 拖动时间轴）与导出
 * （固定步长采样）共用这一个函数，保证所见即所得。
 */
export function sampleTimeline(
  timeline: Timeline,
  keyframes: Keyframe[],
  time: number,
): TimelineSample {
  const t = clamp(time, 0, timeline.total);
  if (t < timeline.title)
    return { kind: "title", local: t, duration: timeline.title };
  // 片尾区间；若片尾被禁用（时长 0），末尾时刻落在最后关键帧上
  if (
    t >= timeline.motionEnd &&
    (timeline.credits > 0 || !timeline.segments.length)
  )
    return {
      kind: "credits",
      local: t - timeline.motionEnd,
      duration: timeline.credits,
    };
  const segment =
    timeline.segments.find((s) => t >= s.start && t < s.end) ??
    timeline.segments[timeline.segments.length - 1];
  if (!segment || segment.kind === "dwell") {
    const at = segment ? segment.from : 0;
    return {
      kind: "pose",
      projection: { ...keyframes[at].projection },
      focus: at,
    };
  }
  const span = segment.end - segment.start;
  const local = span > 0 ? (t - segment.start) / span : 1;
  const eased = applyEasing(segment.easing, local);
  return {
    kind: "pose",
    projection: lerpProjection(
      keyframes[segment.from].projection,
      keyframes[segment.to].projection,
      eased,
    ),
    focus: segment.to,
  };
}

/** 固定步长采样的总帧数：导出帧数只由总时长与帧率决定，与屏幕刷新率无关 */
export function frameCount(total: number, fps: number) {
  return Math.max(1, Math.round(total * fps));
}

/** 每个关键帧停留段的开始时刻（含片头偏移），用于点击跳转 */
export function keyframeStarts(timeline: Timeline) {
  return timeline.segments.filter((s) => s.kind === "dwell").map((s) => s.start);
}
