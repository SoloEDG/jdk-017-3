<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  Clapperboard,
  Plus,
  Play,
  Pause,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Trash2,
  Film,
} from "lucide-vue-next";
import type { StudioDocument, TitleCard, VideoSettings } from "../../../shared/types";
import { easings } from "../lib/easing";
import { frameCount } from "../lib/timeline";
import { MAX_DURATION } from "../lib/keyframes";
import type { MotionApi } from "../model/useMotion";

const props = defineProps<{ doc: StudioDocument; motion: MotionApi }>();
const m = props.motion;
const {
  keyframes,
  titles,
  playhead,
  playing,
  previewing,
  focus,
  exporting,
  progress,
  message,
  total,
  starts,
} = m;

const settings = reactive<VideoSettings>({ size: 768, fps: 30 });
const videoSizes = [
  { value: 512, label: "512 × 512" },
  { value: 768, label: "768 × 768" },
  { value: 1024, label: "1024 × 1024" },
];
const fpsOptions = [24, 30, 60];

const frames = computed(() => frameCount(total.value, settings.fps));
const tooLong = computed(() => total.value > MAX_DURATION);
/** 常驻内存上界：复用帧缓冲 + 有界编码队列，与片长解耦 */
const memoryMb = computed(() =>
  Math.ceil((settings.size ** 2 * 4 * 8) / 1024 ** 2),
);
const canExport = computed(
  () => props.doc.asset && keyframes.value.length > 0 && !tooLong.value,
);

const dragIndex = ref(-1);
const dropIndex = ref(-1);
function onDragStart(i: number, e: DragEvent) {
  dragIndex.value = i;
  e.dataTransfer?.setData("text/plain", String(i));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function onDragOver(i: number, e: DragEvent) {
  e.preventDefault();
  if (dragIndex.value >= 0 && i !== dragIndex.value) dropIndex.value = i;
}
function onDrop(i: number, e: DragEvent) {
  e.preventDefault();
  if (dragIndex.value >= 0 && dragIndex.value !== i)
    m.reorder(dragIndex.value, i);
  onDragEnd();
}
function onDragEnd() {
  dragIndex.value = -1;
  dropIndex.value = -1;
}
function clampCard(card: TitleCard) {
  card.duration = Math.min(10, Math.max(0, card.duration || 0));
}
function describe(kf: (typeof keyframes.value)[number]) {
  const p = kf.projection;
  const mode = p.mode === "tunnel" ? "隧道 · " : "";
  return `${mode}水平 ${Math.round(p.yaw)}° · 俯仰 ${Math.round(p.pitch)}° · 旋转 ${Math.round(p.roll)}° · ${p.zoom.toFixed(2)}×`;
}
</script>

<template>
  <section class="panel motion-panel" id="motion-panel">
    <div class="section-label">
      <span>06 / 运镜影片</span><Clapperboard :size="16" />
    </div>

    <button class="text-button add-kf" :disabled="!doc.asset" @click="m.addKeyframe()">
      <Plus :size="13" /> 记录当前取景为关键帧
    </button>
    <p v-if="!keyframes.length" class="mini">
      调好取景后点「记录当前取景」，至少一个关键帧即可生成短片；多个关键帧之间会自动运镜。
    </p>

    <div
      v-for="(kf, i) in keyframes"
      :key="kf.id"
      class="kf-row"
      :class="{
        active: i === focus,
        dragging: i === dragIndex,
        'drop-target': i === dropIndex,
      }"
      draggable="true"
      @dragstart="onDragStart(i, $event)"
      @dragover="onDragOver(i, $event)"
      @drop="onDrop(i, $event)"
      @dragend="onDragEnd"
    >
      <span class="kf-grip" title="拖动排序"><GripVertical :size="14" /></span>
      <div class="kf-main">
        <button class="kf-title" @click="m.scrub(starts[i] ?? 0)">
          <b>#{{ i + 1 }}</b> {{ describe(kf) }}
        </button>
        <div class="kf-fields">
          <label
            >停留
            <input
              type="number"
              min="0"
              max="60"
              step="0.1"
              v-model.number="kf.dwell"
              @change="m.normalizeTimes(kf)"
              :aria-label="`关键帧 ${i + 1} 停留时间`"
            />s</label
          >
          <template v-if="i < keyframes.length - 1">
            <label
              >转场
              <input
                type="number"
                min="0"
                max="60"
                step="0.1"
                v-model.number="kf.transition"
                @change="m.normalizeTimes(kf)"
                :aria-label="`关键帧 ${i + 1} 转场时间`"
              />s</label
            >
            <label
              >缓动
              <select v-model="kf.easing" :aria-label="`关键帧 ${i + 1} 缓动方式`">
                <option v-for="e in easings" :value="e.id">{{ e.label }}</option>
              </select></label
            >
          </template>
        </div>
      </div>
      <div class="kf-ops">
        <button
          aria-label="上移关键帧"
          :disabled="i === 0"
          @click="m.reorder(i, i - 1)"
        >
          <ChevronUp :size="13" /></button
        ><button
          aria-label="下移关键帧"
          :disabled="i === keyframes.length - 1"
          @click="m.reorder(i, i + 1)"
        >
          <ChevronDown :size="13" /></button
        ><button aria-label="删除关键帧" @click="m.removeKeyframe(kf.id)">
          <Trash2 :size="13" />
        </button>
      </div>
    </div>

    <div class="timeline" v-if="keyframes.length">
      <button
        class="play-button"
        :aria-label="playing ? '暂停' : '播放'"
        @click="playing ? m.pause() : m.play()"
      >
        <Pause v-if="playing" :size="14" /><Play v-else :size="14" />
      </button>
      <input
        type="range"
        aria-label="时间轴"
        :max="total"
        step="0.01"
        :value="playhead"
        @input="m.scrub(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="time">{{ playhead.toFixed(1) }} / {{ total.toFixed(1) }}s</span>
    </div>
    <button v-if="previewing" class="text-button" @click="m.exitPreview()">
      退出预览，回到当前取景
    </button>

    <div class="titles-block">
      <div class="title-row" v-for="card in [titles.title, titles.credits]" :key="card === titles.title ? 'title' : 'credits'">
        <label class="check"
          ><input type="checkbox" v-model="card.enabled" />{{
            card === titles.title ? "片头" : "片尾"
          }}</label
        >
        <input
          class="card-text"
          type="text"
          maxlength="24"
          v-model="card.text"
          :disabled="!card.enabled"
          :aria-label="card === titles.title ? '片头文字' : '片尾文字'"
        />
        <input
          class="card-duration"
          type="number"
          min="0"
          max="10"
          step="0.1"
          v-model.number="card.duration"
          :disabled="!card.enabled"
          @change="clampCard(card)"
          :aria-label="card === titles.title ? '片头时长' : '片尾时长'"
        />
      </div>
    </div>

    <label class="field-label" for="video-size">画面尺寸</label>
    <select id="video-size" aria-label="画面尺寸" v-model.number="settings.size" :disabled="exporting">
      <option v-for="s in videoSizes" :value="s.value">{{ s.label }}</option>
    </select>
    <div class="format-row">
      <span>帧率</span>
      <div class="segmented small">
        <button
          v-for="f in fpsOptions"
          :disabled="exporting"
          :class="{ active: settings.fps === f }"
          @click="settings.fps = f"
        >
          {{ f }}
        </button>
      </div>
    </div>

    <p v-if="doc.edge.transparent" class="mini notice">
      透明策略：影片不含透明通道，透明区域将以底色 {{ doc.edge.background }} 铺底。
    </p>
    <p class="mini">
      总时长 {{ total.toFixed(1) }} 秒 · 共 {{ frames }} 帧 · 固定步长
      {{ (1000 / settings.fps).toFixed(1) }} ms 采样，与屏幕帧率无关
    </p>
    <p class="mini">
      逐帧渲染即时编码 · 峰值内存约 {{ memoryMb }} MB＋成片大小，与片长无关（上限
      {{ MAX_DURATION }} 秒）
    </p>
    <p v-if="tooLong" class="error" role="alert">
      片长超过 {{ MAX_DURATION }} 秒上限，请精简关键帧或缩短时长
    </p>

    <button
      class="primary export-button"
      :disabled="!canExport || exporting"
      @click="m.exportVideo(settings)"
    >
      <Film :size="16" />{{
        exporting ? `正在导出 ${Math.round(progress * 100)}%` : "导出运镜影片"
      }}<span v-if="!exporting">↗</span>
    </button>
    <button v-if="exporting" class="text-button" @click="m.cancel()">取消导出</button>
    <p v-if="message" role="status" class="mini">{{ message }}</p>
  </section>
</template>
