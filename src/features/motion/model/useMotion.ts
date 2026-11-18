import { computed, reactive, ref } from "vue";
import type {
  MotionTitles,
  Projection,
  StudioDocument,
  VideoJob,
  VideoSettings,
} from "../../../shared/types";
import { clamp } from "../../../shared/math";
import {
  buildTimeline,
  frameCount,
  keyframeStarts,
  sampleTimeline,
} from "../lib/timeline";
import { clampKeyframeTimes, createKeyframe, MAX_DURATION, moveKeyframe } from "../lib/keyframes";
import { encodeVideo } from "../lib/encode";

export function useMotion(doc: StudioDocument) {
  const keyframes = ref<ReturnType<typeof createKeyframe>[]>([]);
  const titles = reactive<MotionTitles>({
    title: { enabled: true, duration: 1.2, text: "我的小行星" },
    credits: { enabled: true, duration: 1.2, text: "感谢观看" },
  });
  const playhead = ref(0);
  const playing = ref(false);
  /** 预览接管中：视口渲染 previewPose / previewCard，而不是当前取景 */
  const previewing = ref(false);
  const previewPose = ref<Projection | null>(null);
  const previewCard = ref<"title" | "credits" | null>(null);
  const previewCardText = ref("");
  const focus = ref(-1);
  const exporting = ref(false);
  const progress = ref(0);
  const message = ref("");
  let controller: AbortController | null = null;
  let raf = 0;
  let lastTick = 0;

  const timeline = computed(() => buildTimeline(keyframes.value, titles));
  const total = computed(() => timeline.value.total);
  const starts = computed(() => keyframeStarts(timeline.value));

  function applyAt(time: number) {
    const sample = sampleTimeline(timeline.value, keyframes.value, time);
    if (sample.kind === "pose") {
      previewPose.value = sample.projection;
      previewCard.value = null;
      focus.value = sample.focus;
    } else {
      previewPose.value = null;
      previewCard.value = sample.kind;
      previewCardText.value =
        sample.kind === "title" ? titles.title.text : titles.credits.text;
      focus.value = -1;
    }
  }
  /** 跳到任意时间预览：时间轴拖动与关键帧跳转都走这里 */
  function scrub(time: number) {
    if (!keyframes.value.length) return;
    pause();
    previewing.value = true;
    playhead.value = clamp(time, 0, total.value);
    applyAt(playhead.value);
  }
  function tick(now: number) {
    if (!playing.value) return;
    playhead.value += (now - lastTick) / 1000;
    lastTick = now;
    if (playhead.value >= total.value) {
      playhead.value = total.value;
      pause();
    }
    applyAt(playhead.value);
    if (playing.value) raf = requestAnimationFrame(tick);
  }
  function play() {
    if (!keyframes.value.length || playing.value) return;
    previewing.value = true;
    if (playhead.value >= total.value) playhead.value = 0;
    playing.value = true;
    lastTick = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    playing.value = false;
    cancelAnimationFrame(raf);
  }
  /** 退出预览：视口恢复显示当前取景 */
  function exitPreview() {
    pause();
    previewing.value = false;
    previewPose.value = null;
    previewCard.value = null;
    focus.value = -1;
  }

  function addKeyframe() {
    // 记录屏幕上实际看到的取景：预览中记录预览姿态，否则记录当前取景
    const seen =
      previewing.value && previewPose.value
        ? previewPose.value
        : doc.projection;
    keyframes.value.push(createKeyframe({ ...seen }));
  }
  function removeKeyframe(id: string) {
    keyframes.value = keyframes.value.filter((kf) => kf.id !== id);
    if (!keyframes.value.length) exitPreview();
    else if (previewing.value) scrub(Math.min(playhead.value, total.value));
  }
  function reorder(from: number, to: number) {
    keyframes.value = moveKeyframe(keyframes.value, from, to);
    if (previewing.value) scrub(Math.min(playhead.value, total.value));
  }
  function normalizeTimes(kf: (typeof keyframes.value)[number]) {
    clampKeyframeTimes(kf);
    if (playhead.value > total.value) playhead.value = total.value;
    if (previewing.value) applyAt(playhead.value);
  }

  async function exportVideo(settings: VideoSettings) {
    if (!doc.asset || exporting.value || !keyframes.value.length) return;
    if (total.value > MAX_DURATION) {
      message.value = `片长 ${total.value.toFixed(1)} 秒超过 ${MAX_DURATION} 秒上限，请精简关键帧或时长`;
      return;
    }
    exporting.value = true;
    progress.value = 0;
    message.value = "";
    controller = new AbortController();
    // 完整快照：编码期间用户继续编辑，不会把新参数混入该任务
    const job: VideoJob = {
      asset: doc.asset,
      // 透明策略：视频没有透明通道，透明区域一律铺画面底色
      edge: { ...doc.edge, transparent: false },
      keyframes: keyframes.value.map((kf) => ({
        ...kf,
        projection: { ...kf.projection },
      })),
      titles: { title: { ...titles.title }, credits: { ...titles.credits } },
      size: settings.size,
      fps: settings.fps,
    };
    try {
      const blob = await encodeVideo(job, controller.signal, (n) => (progress.value = n));
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orbit-motion-${job.size}px-${job.fps}fps.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const jobTotal = buildTimeline(job.keyframes, job.titles).total;
      message.value = `影片已导出：${jobTotal.toFixed(1)} 秒 · ${frameCount(jobTotal, job.fps)} 帧 · 与当前编辑互不影响`;
    } catch (e) {
      message.value = controller.signal.aborted
        ? "已取消导出，可调整参数后重新开始"
        : e instanceof Error
          ? e.message
          : "导出失败";
    } finally {
      exporting.value = false;
      controller = null;
    }
  }
  function cancel() {
    controller?.abort();
  }

  return {
    keyframes,
    titles,
    playhead,
    playing,
    previewing,
    previewPose,
    previewCard,
    previewCardText,
    focus,
    exporting,
    progress,
    message,
    timeline,
    total,
    starts,
    scrub,
    play,
    pause,
    exitPreview,
    addKeyframe,
    removeKeyframe,
    reorder,
    normalizeTimes,
    exportVideo,
    cancel,
  };
}
export type MotionApi = ReturnType<typeof useMotion>;
