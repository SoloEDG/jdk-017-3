import { watch, onBeforeUnmount, type Ref, ref } from "vue";
import type { Projection, StudioDocument } from "../../../shared/types";
import { renderPreview } from "../../projection";
export function usePreview(
  doc: StudioDocument,
  canvas: Ref<HTMLCanvasElement | undefined>,
  override?: Ref<Projection | null>,
) {
  const rendering = ref(false);
  let frame = 0;
  watch(
    () => [
      canvas.value,
      doc.asset,
      JSON.stringify(doc.projection),
      JSON.stringify(doc.edge),
      JSON.stringify(override?.value ?? null),
    ],
    () => {
      cancelAnimationFrame(frame);
      rendering.value = true;
      frame = requestAnimationFrame(() => {
        if (canvas.value && doc.asset)
          renderPreview(
            canvas.value,
            {
              asset: doc.asset,
              projection: { ...(override?.value ?? doc.projection) },
              edge: { ...doc.edge },
            },
            600,
          );
        rendering.value = false;
      });
    },
    { immediate: true, flush: "post" },
  );
  onBeforeUnmount(() => cancelAnimationFrame(frame));
  return { rendering };
}
