export interface Projection {
  mode: "planet" | "tunnel";
  zoom: number;
  yaw: number;
  pitch: number;
  roll: number;
}
export interface Edge {
  seam: number;
  feather: number;
  background: string;
  transparent: boolean;
}
export interface Asset {
  id: string;
  name: string;
  width: number;
  height: number;
  data: ImageData;
  thumbnail: string;
}
export interface StudioDocument {
  asset: Asset | null;
  projection: Projection;
  edge: Edge;
}
export interface ExportSettings {
  size: number;
  format: "png" | "jpeg";
  quality: number;
}
export interface RenderSnapshot {
  asset: Asset;
  projection: Projection;
  edge: Edge;
}
export type EasingId = "linear" | "easeIn" | "easeOut" | "easeInOut";
export interface Keyframe {
  id: string;
  projection: Projection;
  /** 停留时间（秒）：镜头保持在该取景上的时长 */
  dwell: number;
  /** 转场时间（秒）：从该关键帧运动到下一关键帧的时长，末帧忽略 */
  transition: number;
  /** 转场缓动方式，作用于离开该关键帧的运动段 */
  easing: EasingId;
}
export interface TitleCard {
  enabled: boolean;
  /** 片头 / 片尾卡片时长（秒） */
  duration: number;
  text: string;
}
export interface MotionTitles {
  title: TitleCard;
  credits: TitleCard;
}
export interface VideoSettings {
  size: number;
  fps: number;
}
/** 导出任务启动时的完整快照，编码期间继续编辑不会混入旧任务 */
export interface VideoJob {
  asset: Asset;
  edge: Edge;
  keyframes: Keyframe[];
  titles: MotionTitles;
  size: number;
  fps: number;
}
