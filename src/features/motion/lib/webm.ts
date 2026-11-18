/**
 * 极简 WebM 封装器：单视频轨（VP8 / VP9），把 WebCodecs 编码出的
 * 压缩帧写成可播放的 .webm。只缓存编码后的压缩数据（码率量级），
 * 不缓存原始帧，因此长片的内存占用与分辨率、帧数解耦。
 */

type Bytes = Uint8Array;

function concat(parts: Bytes[]): Bytes {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
/** EBML 元素 ID：按大端原样写出（这些 ID 的最高字节都非零） */
function idBytes(id: number): Bytes {
  const bytes: number[] = [];
  let v = id;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return Uint8Array.from(bytes);
}
/** EBML 变长尺寸：选择能容纳该值的最短 vint */
function sizeBytes(value: number): Bytes {
  for (let len = 1; len <= 8; len++) {
    if (value <= 2 ** (7 * len) - 2) {
      const bytes = new Array<number>(len);
      let v = value;
      for (let i = len - 1; i >= 0; i--) {
        bytes[i] = v & 0xff;
        v = Math.floor(v / 256);
      }
      bytes[0] |= 1 << (8 - len);
      return Uint8Array.from(bytes);
    }
  }
  throw new Error("EBML 尺寸过大");
}
function element(id: number, data: Bytes): Bytes {
  return concat([idBytes(id), sizeBytes(data.length), data]);
}
function uint(id: number, value: number): Bytes {
  const bytes: number[] = [];
  let v = value;
  do {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  } while (v > 0);
  return element(id, Uint8Array.from(bytes));
}
function text(id: number, value: string): Bytes {
  return element(
    id,
    Uint8Array.from(Array.from(value).map((c) => c.charCodeAt(0) & 0x7f)),
  );
}
function float64(id: number, value: number): Bytes {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setFloat64(0, value);
  return element(id, buf);
}

const CLUSTER_MAX_MS = 30000; // SimpleBlock 相对时间码是 int16，毫秒级最多约 32.7s
const CLUSTER_MAX_FRAMES = 128;

export interface MuxerConfig {
  width: number;
  height: number;
  codec: "V_VP9" | "V_VP8";
  /** 成片总时长（毫秒），写入 Info.Duration，让播放器显示正确时长 */
  durationMs: number;
}

export class WebmMuxer {
  private clusters: Bytes[] = [];
  private blocks: Bytes[] = [];
  private clusterStart = 0;
  private clusterFrames = 0;
  private started = false;

  constructor(private config: MuxerConfig) {}

  addFrame(data: Bytes, timeMs: number, keyframe: boolean) {
    if (
      this.started &&
      (this.clusterFrames >= CLUSTER_MAX_FRAMES ||
        timeMs - this.clusterStart > CLUSTER_MAX_MS)
    )
      this.flushCluster();
    if (!this.started) {
      // 取整后再作差：round(t - n) = round(t) - n（n 为整数），
      // 保证跨 Cluster 边界的帧时间码仍然严格等于 round(t)，无双重取整抖动
      this.clusterStart = Math.round(timeMs);
      this.started = true;
    }
    const relative = Math.round(timeMs - this.clusterStart);
    const block = new Uint8Array(4 + data.length);
    const view = new DataView(block.buffer);
    block[0] = 0x81; // 轨号 1 的 vint 写法
    view.setInt16(1, relative);
    block[3] = keyframe ? 0x80 : 0x00;
    block.set(data, 4);
    this.blocks.push(element(0xa3, block)); // SimpleBlock
    this.clusterFrames++;
  }

  private flushCluster() {
    if (!this.clusterFrames) return;
    const body = concat([
      uint(0xe7, this.clusterStart), // Timecode
      ...this.blocks,
    ]);
    this.clusters.push(element(0x1f43b675, body)); // Cluster
    this.blocks = [];
    this.clusterFrames = 0;
    this.clusterStart = 0;
    this.started = false;
  }

  finish(): Blob {
    this.flushCluster();
    const { width, height, codec, durationMs } = this.config;
    const header = element(
      0x1a45dfa3, // EBML
      concat([
        uint(0x4286, 1), // EBMLVersion
        uint(0x42f7, 1), // EBMLReadVersion
        uint(0x42f2, 4), // EBMLMaxIDLength
        uint(0x42f3, 8), // EBMLMaxSizeLength
        text(0x4282, "webm"), // DocType
        uint(0x4287, 4), // DocTypeVersion
        uint(0x4285, 2), // DocTypeReadVersion
      ]),
    );
    const info = element(
      0x1549a966, // Info
      concat([
        uint(0x2ad7b1, 1_000_000), // TimecodeScale：1ms
        text(0x4d80, "orbit-studio"),
        text(0x5741, "orbit-studio"),
        float64(0x4489, durationMs), // Duration
      ]),
    );
    const tracks = element(
      0x1654ae6b, // Tracks
      element(
        0xae, // TrackEntry
        concat([
          uint(0xd7, 1), // TrackNumber
          uint(0x73c5, 1), // TrackUID
          uint(0x83, 1), // TrackType = video
          uint(0x9c, 0), // FlagLacing
          text(0x86, codec), // CodecID
          element(
            0xe0, // Video
            concat([uint(0xb0, width), uint(0xba, height)]),
          ),
        ]),
      ),
    );
    // Segment 用未知尺寸（流式写法），播放器边读边解析
    const segmentHead = concat([
      idBytes(0x18538067),
      Uint8Array.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    ]);
    return new Blob([header, segmentHead, info, tracks, ...this.clusters], {
      type: "video/webm",
    });
  }
}
