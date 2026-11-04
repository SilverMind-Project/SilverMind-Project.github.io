<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

defineProps<{
  name: string;
  label: string;
  width: number;
  height: number;
}>();

const video = ref<HTMLVideoElement | null>(null);
let observer: IntersectionObserver | null = null;

// Plays only while on screen, so nothing downloads or runs out of sight. With reduced motion it
// never plays, and the poster stands in.
onMounted(() => {
  const element = video.value;
  if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) void element.play().catch(() => {});
      else element.pause();
    },
    { threshold: 0.25 },
  );
  observer.observe(element);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <video
    ref="video"
    class="hx-shot"
    :poster="`/videos/${name}.webp`"
    :src="`/videos/${name}.mp4`"
    :width="width"
    :height="height"
    :aria-label="label"
    preload="none"
    muted
    loop
    playsinline
  ></video>
</template>
