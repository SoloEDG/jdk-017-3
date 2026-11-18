import type { VideoJob } from "../../../shared/types";
import { renderRows } from "../../projection";
import { buildTimeline, frameCount, sampleTimeline } from "./timeline";
import { drawCard } from "./cards";
import { WebmMuxer } from "./webm";

/** 编码队列上限：背压阈值，把驻留的未编码帧限制在常数级 */
const MAX_QUEUE = 6;
/** 关键帧间隔（帧）：约每 2 秒一个关键帧，便于拖动播放 */
const keyframeEvery = (fps: number) => Math.max(1, Math.round(fps * 2));

async function pickCodec(size: number, fps: number) {
  const bitrate = Math.min(24_000_000, Math.max(1_000_000, Math.round(size * size * fps * 0.12)));
  for (const codec of ["vp09.00.10.08", "vp8"] as const) {
    const config: VideoEncoderConfig = {
      codec,
      width: size,
      height: size,
      bitrate,
      framerate: fps,
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported)
        return { config, mux: codec === "vp8" ? ("V_VP8" as const) : ("V_VP9" as const) };
    } catch {
      /* 尝试下一个编码器 */
    }
  }
  return null;
}

/**
 * 把快照任务编码为 WebM 短片。
 * - 固定时间采样：第 i 帧严格取 t = i / fps，与屏幕实际帧率无关；
 * - 流式处理：逐帧即时重算、立即编码并释放，不预缓存整段影片，
 *   常驻内存只有复用的帧缓冲与有界的编码队列（长片内存有上限）；
 * - 任务只读取 job 快照，导出期间继续编辑不会混入新参数；
 * - 随时可通过 signal 取消，取消后编码器被关闭，可再次导出。
 */
export async function encodeVideo(
  job: VideoJob,
  signal: AbortSignal,
  progress: (n: number) => void,
): Promise<Blob> {
  if (typeof VideoEncoder === "undefined")
    throw new Error("当前浏览器不支持 WebCodecs 视频编码，请使用最新版 Chrome / Edge");
  if (!job.keyframes.length) throw new Error("至少需要一个关键帧才能导出影片");
  const picked = await pickCodec(job.size, job.fps);
  if (!picked) throw new Error("当前浏览器不支持 VP8 / VP9 视频编码");

  const timeline = buildTimeline(job.keyframes, job.titles);
  const frames = frameCount(timeline.total, job.fps);
  const muxer = new WebmMuxer({
    width: job.size,
    height: job.size,
    codec: picked.mux,
    durationMs: timeline.total * 1000,
  });

  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      muxer.addFrame(data, chunk.timestamp / 1000, chunk.type === "key");
    },
    error: (e) => (failure = e),
  });
  encoder.configure(picked.config);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = job.size;
  const ctx = canvas.getContext("2d")!;
  // 全片复用同一个像素缓冲，避免随帧数增长的分配
  const pixels = ctx.createImageData(job.size, job.size);
  const snapshot = { asset: job.asset, projection: job.keyframes[0].projection, edge: job.edge };
  const every = keyframeEvery(job.fps);

  try {
    for (let i = 0; i < frames; i++) {
      signal.throwIfAborted();
      if (failure) throw failure;
      const t = Math.min(i / job.fps, timeline.total);
      const sample = sampleTimeline(timeline, job.keyframes, t);
      if (sample.kind === "pose") {
        snapshot.projection = sample.projection;
        renderRows(snapshot, pixels, 0, job.size);
        ctx.putImageData(pixels, 0, 0);
      } else {
        const card = sample.kind === "title" ? job.titles.title : job.titles.credits;
        drawCard(ctx, job.size, card.text, sample.kind, sample.local, sample.duration, job.edge.background);
      }
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1_000_000) / job.fps),
        duration: Math.round(1_000_000 / job.fps),
      });
      encoder.encode(frame, { keyFrame: i % every === 0 });
      frame.close();
      // 背压：编码器积压过多时让出主线程，限制驻留帧数
      while (encoder.encodeQueueSize > MAX_QUEUE) {
        signal.throwIfAborted();
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      progress((i + 1) / frames);
    }
    await encoder.flush();
    if (failure) throw failure;
    return muxer.finish();
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}
