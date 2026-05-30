<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type Phase = "morning" | "afternoon" | "evening" | "night";

const root = ref<HTMLElement | null>(null);
const desktopPath = ref<SVGPathElement | null>(null);
const mobilePath = ref<SVGPathElement | null>(null);
const progress = ref(0.08);
const orbX = ref(58);
const orbY = ref(144);
const isMobile = ref(false);

let frame = 0;
let mediaQuery: MediaQueryList | null = null;

const phase = computed<Phase>(() => {
  if (progress.value < 0.28) return "morning";
  if (progress.value < 0.58) return "afternoon";
  if (progress.value < 0.82) return "evening";
  return "night";
});

const orbTransform = computed(() => `translate(${orbX.value} ${orbY.value})`);

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function activePath() {
  return isMobile.value ? mobilePath.value : desktopPath.value;
}

function updateOrbPosition() {
  const path = activePath();
  if (!path) return;

  const length = path.getTotalLength();
  const point = path.getPointAtLength(length * progress.value);
  orbX.value = point.x;
  orbY.value = point.y;
}

function updateProgress() {
  frame = 0;
  const element = root.value;
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight || 1;
  const start = viewport * 0.75;
  const end = viewport * 0.30;
  const travel = rect.height + start - end;
  progress.value = clamp((start - rect.top) / travel);
  updateOrbPosition();
}

function requestUpdate() {
  if (frame) return;
  frame = window.requestAnimationFrame(updateProgress);
}

function updateMedia() {
  isMobile.value = Boolean(mediaQuery?.matches);
  updateOrbPosition();
}

onMounted(() => {
  mediaQuery = window.matchMedia("(max-width: 959px)");
  updateMedia();
  updateProgress();

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
  mediaQuery.addEventListener("change", updateMedia);
});

onBeforeUnmount(() => {
  if (frame) window.cancelAnimationFrame(frame);
  window.removeEventListener("scroll", requestUpdate);
  window.removeEventListener("resize", requestUpdate);
  mediaQuery?.removeEventListener("change", updateMedia);
});
</script>

<template>
  <section id="day-at-home" class="home-section day-section">
    <div class="section-kicker">A day at home</div>
    <h2>Built around real caregiving moments.</h2>

    <div
      ref="root"
      class="cc-day-timeline"
      :class="`is-${phase}`"
      :style="{
        '--progress': progress,
      }"
      aria-label="A sample day with Cognitive Companion"
    >
      <div class="cc-day-orbit" aria-hidden="true">
        <svg class="cc-day-svg cc-day-svg-desktop" viewBox="0 0 1000 250" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="cc-day-gradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stop-color="#82cfff" />
              <stop offset="34%" stop-color="#ffd166" />
              <stop offset="68%" stop-color="#ff8f57" />
              <stop offset="82%" stop-color="#c94894" />
              <stop offset="100%" stop-color="#8b7cff" />
            </linearGradient>
            <radialGradient id="cc-orb-day" cx="38%" cy="32%" r="72%">
              <stop offset="0%" stop-color="#fffdf3" />
              <stop offset="38%" stop-color="#ffe57f" />
              <stop offset="78%" stop-color="#ff9b47" />
              <stop offset="100%" stop-color="#f46944" />
            </radialGradient>
            <radialGradient id="cc-orb-morning" cx="40%" cy="72%" r="70%">
              <stop offset="0%" stop-color="#fff6aa" />
              <stop offset="42%" stop-color="#8ed7ff" />
              <stop offset="100%" stop-color="#6fb7ff" />
            </radialGradient>
            <radialGradient id="cc-orb-night" cx="36%" cy="28%" r="82%">
              <stop offset="0%" stop-color="#5967d9" />
              <stop offset="64%" stop-color="#1d2b65" />
              <stop offset="100%" stop-color="#11182f" />
            </radialGradient>
            <radialGradient id="cc-orb-evening" cx="42%" cy="68%" r="78%">
              <stop offset="0%" stop-color="#ffe38f" />
              <stop offset="48%" stop-color="#ff8f57" />
              <stop offset="100%" stop-color="#6f63d9" />
            </radialGradient>
            <filter id="cc-day-soft-glow" x="-20%" y="-90%" width="140%" height="280%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="0 0 0 0 0.04 0 0 0 0 0.45 0 0 0 0 0.85 0 0 0 0.35 0"
              />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            ref="desktopPath"
            class="cc-day-path-base"
            d="M 58 144 C 220 54 360 54 500 126 C 648 202 778 198 942 112"
            pathLength="1"
          />
          <path
            class="cc-day-path-progress"
            d="M 58 144 C 220 54 360 54 500 126 C 648 202 778 198 942 112"
            pathLength="1"
          />
          <g class="cc-day-stations">
            <g class="cc-station cc-station-morning" transform="translate(58 144)">
              <circle r="20" />
              <path d="M -13 4 H 13" />
              <path d="M -8 4 A 8 8 0 0 1 8 4" />
              <path d="M 0 -4 V -9 M -4.5 -2 L -7.5 -5.5 M 4.5 -2 L 7.5 -5.5" />
            </g>
            <g class="cc-station cc-station-afternoon" transform="translate(299 74)">
              <circle r="20" />
              <circle cx="0" cy="0" r="7" />
              <path d="M 0 -13 V -17 M 0 13 V 17 M -13 0 H -17 M 13 0 H 17 M -9 -9 L -12 -12 M 9 -9 L 12 -12 M -9 9 L -12 12 M 9 9 L 12 12" />
            </g>
            <g class="cc-station cc-station-evening" transform="translate(703 180)">
              <circle r="20" />
              <path d="M -13 3 H 13" />
              <path d="M -7 3 A 7 7 0 0 1 7 3" />
              <path d="M -8 0 H -13 M 8 0 H 13 M -4 -4 L -7 -8 M 4 -4 L 7 -8" />
            </g>
            <g class="cc-station cc-station-night" transform="translate(942 112)">
              <circle r="20" />
              <path class="cc-station-moon" d="M 4 -11 A 12 12 0 1 0 4 11 A 8 8 0 1 1 4 -11" />
              <polygon id="star" points="12 4 9.22 9.27 3 10.11 7.5 14.21 6.44 20 12 17.27 17.56 20 16.5 14.21 21 10.11 14.78 9.27 12 4" class="cc-station-star" transform="translate(5 -13) scale(0.5 0.5)"></polygon>
            </g>
          </g>

          <g class="cc-celestial-svg" :transform="orbTransform">
            <circle class="cc-orb-aura" r="34" />
            <g class="cc-orb-disc">
              <circle class="cc-orb-layer cc-orb-layer-morning" r="20" />
              <circle class="cc-orb-layer cc-orb-layer-day" r="20" />
              <circle class="cc-orb-layer cc-orb-layer-evening" r="20" />
              <circle class="cc-orb-layer cc-orb-layer-night" r="20" />
              <path class="cc-orb-horizon" d="M -14 7 Q 0 2 14 7" />
              <path class="cc-orb-moon" d="M 5 -12 A 14 14 0 1 0 5 12 A 9 9 0 1 1 5 -12" />
              <circle class="cc-orb-star cc-orb-star-one" cx="-9" cy="-8" r="1.7" />
              <circle class="cc-orb-star cc-orb-star-two" cx="15" cy="5" r="1.2" />
              <circle class="cc-orb-glint" cx="-5" cy="-12" r="4" />
            </g>
            <circle class="cc-orb-rim" r="21" />
          </g>
        </svg>

        <svg class="cc-day-svg cc-day-svg-mobile" viewBox="0 0 96 780" preserveAspectRatio="xMidYMin meet">
          <defs>
            <linearGradient id="cc-day-gradient-mobile" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#82cfff" />
              <stop offset="34%" stop-color="#ffd166" />
              <stop offset="68%" stop-color="#ff8f57" />
              <stop offset="82%" stop-color="#c94894" />
              <stop offset="100%" stop-color="#8b7cff" />
            </linearGradient>
            <radialGradient id="cc-orb-day-mobile" cx="38%" cy="32%" r="72%">
              <stop offset="0%" stop-color="#fffdf3" />
              <stop offset="38%" stop-color="#ffe57f" />
              <stop offset="78%" stop-color="#ff9b47" />
              <stop offset="100%" stop-color="#f46944" />
            </radialGradient>
            <radialGradient id="cc-orb-morning-mobile" cx="40%" cy="72%" r="70%">
              <stop offset="0%" stop-color="#fff6aa" />
              <stop offset="42%" stop-color="#8ed7ff" />
              <stop offset="100%" stop-color="#6fb7ff" />
            </radialGradient>
            <radialGradient id="cc-orb-night-mobile" cx="36%" cy="28%" r="82%">
              <stop offset="0%" stop-color="#5967d9" />
              <stop offset="64%" stop-color="#1d2b65" />
              <stop offset="100%" stop-color="#11182f" />
            </radialGradient>
            <radialGradient id="cc-orb-evening-mobile" cx="42%" cy="68%" r="78%">
              <stop offset="0%" stop-color="#ffe38f" />
              <stop offset="48%" stop-color="#ff8f57" />
              <stop offset="100%" stop-color="#6f63d9" />
            </radialGradient>
            <filter id="cc-day-soft-glow-mobile" x="-80%" y="-20%" width="260%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="0 0 0 0 0.04 0 0 0 0 0.45 0 0 0 0 0.85 0 0 0 0.32 0"
              />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            ref="mobilePath"
            class="cc-day-path-base cc-day-path-mobile"
            d="M 48 52 C 20 158 74 246 48 352 C 20 462 76 574 48 785"
            pathLength="1"
          />
          <path
            class="cc-day-path-progress cc-day-path-mobile"
            d="M 48 52 C 20 158 74 246 48 352 C 20 462 76 574 48 785"
            pathLength="1"
          />
          <g class="cc-day-stations">
            <g class="cc-station cc-station-morning" transform="translate(48 48) scale(.82)">
              <circle r="20" />
              <path d="M -13 4 H 13" />
              <path d="M -8 4 A 8 8 0 0 1 8 4" />
              <path d="M 0 -4 V -9 M -4.5 -2 L -7.5 -5.5 M 4.5 -2 L 7.5 -5.5" />
            </g>
            <g class="cc-station cc-station-afternoon" transform="translate(55 295) scale(.82)">
              <circle r="20" />
              <circle cx="0" cy="0" r="7" />
              <path d="M 0 -13 V -17 M 0 13 V 17 M -13 0 H -17 M 13 0 H 17 M -9 -9 L -12 -12 M 9 -9 L 12 -12 M -9 9 L -12 12 M 9 9 L 12 12" />
            </g>
            <g class="cc-station cc-station-evening" transform="translate(50 540) scale(.82)">
              <circle r="20" />
              <path d="M -13 3 H 13" />
              <path d="M -7 3 A 7 7 0 0 1 7 3" />
              <path d="M -8 0 H -13 M 8 0 H 13 M -4 -4 L -7 -8 M 4 -4 L 7 -8" />
            </g>
            <g class="cc-station cc-station-night" transform="translate(48 785) scale(.82)">
              <circle r="20" />
              <path class="cc-station-moon" d="M 4 -11 A 12 12 0 1 0 4 11 A 8 8 0 1 1 4 -11" />
              <polygon id="star" points="12 4 9.22 9.27 3 10.11 7.5 14.21 6.44 20 12 17.27 17.56 20 16.5 14.21 21 10.11 14.78 9.27 12 4" class="cc-station-star" transform="translate(5 -13) scale(0.5 0.5)"></polygon>
            </g>
          </g>

          <g class="cc-celestial-svg cc-celestial-svg-mobile" :transform="orbTransform">
            <circle class="cc-orb-aura" r="30" />
            <g class="cc-orb-disc">
              <circle class="cc-orb-layer cc-orb-layer-morning cc-orb-layer-morning-mobile" r="18" />
              <circle class="cc-orb-layer cc-orb-layer-day cc-orb-layer-day-mobile" r="18" />
              <circle class="cc-orb-layer cc-orb-layer-evening cc-orb-layer-evening-mobile" r="18" />
              <circle class="cc-orb-layer cc-orb-layer-night cc-orb-layer-night-mobile" r="18" />
              <path class="cc-orb-horizon" d="M -13 6 Q 0 2 13 6" />
              <path class="cc-orb-moon" d="M 4 -11 A 13 13 0 1 0 4 11 A 8 8 0 1 1 4 -11" />
              <circle class="cc-orb-star cc-orb-star-one" cx="-8" cy="-7" r="1.5" />
              <circle class="cc-orb-star cc-orb-star-two" cx="13" cy="5" r="1.1" />
              <circle class="cc-orb-glint" cx="-4" cy="-10" r="3.5" />
            </g>
            <circle class="cc-orb-rim" r="19" />
          </g>
        </svg>
      </div>

      <div class="cc-day-copy">
        <article class="cc-day-item">
          <span>Morning</span>
          <p>A medication reminder appears on an e-ink display and can be read aloud.</p>
        </article>
        <article class="cc-day-item">
          <span>Afternoon</span>
          <p>The system notices a routine change and waits for context before alerting.</p>
        </article>
        <article class="cc-day-item">
          <span>Evening</span>
          <p>A senior asks about grandchildren and hears a trusted answer from family-curated memory.</p>
        </article>
        <article class="cc-day-item">
          <span>Night</span>
          <p>A caregiver receives a concise summary instead of a stream of false alarms.</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.day-section {
  padding: 56px 0 12px;
}

.cc-day-timeline {
  --progress: 0.08;
  position: relative;
  margin-top: 34px;
}

.cc-day-orbit {
  position: relative;
  width: 100%;
  aspect-ratio: 1000 / 250;
  min-height: 210px;
}

.cc-day-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.cc-day-svg-mobile {
  display: none;
}

.cc-day-path-base,
.cc-day-path-progress {
  fill: none;
  stroke-linecap: round;
  stroke-width: 6.5;
  vector-effect: non-scaling-stroke;
}

.cc-day-path-base {
  stroke: url("#cc-day-gradient");
  opacity: 0.28;
}

.cc-day-path-progress {
  filter: url("#cc-day-soft-glow");
  stroke: url("#cc-day-gradient");
}

.cc-day-path-mobile {
  stroke: url("#cc-day-gradient-mobile");
}

.cc-day-path-progress.cc-day-path-mobile {
  filter: url("#cc-day-soft-glow-mobile");
}

.dark .cc-day-path-base {
  opacity: 0.46;
}

.dark .cc-day-path-progress {
  opacity: 0.96;
}

.cc-station {
  color: var(--vp-c-brand-1);
}

.cc-station > circle {
  fill: color-mix(in srgb, var(--vp-c-bg) 82%, white 18%);
  stroke: rgba(10, 132, 255, 0.24);
  stroke-width: 1.4;
  vector-effect: non-scaling-stroke;
}

.cc-station path,
.cc-station circle:not(:first-child) {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.cc-station-morning {
  color: #53b7f2;
}

.cc-station-afternoon {
  color: #f2a900;
}

.cc-station-evening {
  color: #ef7b45;
}

.cc-station-night {
  color: #887cff;
}

.cc-station-moon,
.cc-station-star {
  fill: currentColor;
  stroke: none;
}

.dark .cc-station > circle:first-child {
  fill: color-mix(in srgb, var(--vp-c-bg) 88%, white 12%);
  stroke: rgba(255, 255, 255, 0.22);
}

.cc-celestial-svg {
  transition: transform 0.14s linear;
  filter: drop-shadow(0 16px 22px rgba(20, 69, 118, 0.24));
}

.dark .cc-celestial-svg {
  filter: drop-shadow(0 14px 22px rgba(0, 0, 0, 0.34));
}

.cc-orb-aura {
  fill: rgba(255, 210, 102, 0.18);
  opacity: 0.9;
}

.cc-orb-disc {
  transform-origin: center;
}

.cc-orb-layer {
  opacity: 0;
  transition: opacity 0.32s ease;
}

.cc-orb-layer-morning {
  fill: url("#cc-orb-morning");
}

.cc-orb-layer-day {
  fill: url("#cc-orb-day");
}

.cc-orb-layer-evening {
  fill: url("#cc-orb-evening");
}

.cc-orb-layer-night {
  fill: url("#cc-orb-night");
}

.cc-orb-layer-morning-mobile {
  fill: url("#cc-orb-morning-mobile");
}

.cc-orb-layer-day-mobile {
  fill: url("#cc-orb-day-mobile");
}

.cc-orb-layer-evening-mobile {
  fill: url("#cc-orb-evening-mobile");
}

.cc-orb-layer-night-mobile {
  fill: url("#cc-orb-night-mobile");
}

.cc-orb-rim {
  fill: none;
  stroke: rgba(255, 255, 255, 0.84);
  stroke-width: 1.6;
}

.cc-orb-glint {
  fill: rgba(255, 255, 255, 0.82);
}

.cc-orb-horizon {
  fill: none;
  stroke: rgba(255, 255, 255, 0.66);
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0;
  transition: opacity 0.32s ease;
}

.cc-orb-moon {
  fill: #f6f4ff;
  opacity: 0;
  transition: opacity 0.32s ease;
}

.cc-orb-star {
  fill: #f9f2ff;
  opacity: 0;
  transition: opacity 0.32s ease;
}

.is-morning .cc-orb-layer-morning,
.is-afternoon .cc-orb-layer-day,
.is-evening .cc-orb-layer-evening,
.is-night .cc-orb-layer-night {
  opacity: 1;
}

.is-morning .cc-orb-horizon,
.is-evening .cc-orb-horizon,
.is-night .cc-orb-moon,
.is-night .cc-orb-star {
  opacity: 1;
}

.is-morning .cc-orb-aura {
  fill: rgba(130, 207, 255, 0.22);
}

.is-evening .cc-orb-aura {
  fill: rgba(255, 143, 87, 0.20);
}

.is-night .cc-orb-aura {
  fill: rgba(139, 124, 255, 0.22);
}

.cc-day-copy {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-top: 8px;
}

.cc-day-item {
  position: relative;
  padding: 18px 18px 20px;
  border: 1px solid transparent;
  border-radius: 16px;
  transition:
    background-color 0.28s ease,
    border-color 0.28s ease,
    box-shadow 0.28s ease,
    transform 0.28s ease;
}

.cc-day-item span {
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 700;
}

.cc-day-item p {
  margin-top: 12px;
  max-width: 260px;
  font-size: 16px;
  line-height: 1.58;
}

.is-morning .cc-day-item:nth-child(1),
.is-afternoon .cc-day-item:nth-child(2),
.is-evening .cc-day-item:nth-child(3),
.is-night .cc-day-item:nth-child(4) {
  background: color-mix(in srgb, var(--vp-c-brand-soft) 38%, transparent);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 22%, transparent);
  box-shadow: 0 18px 40px rgba(16, 96, 176, 0.10);
  transform: translateY(-2px);
}

.dark .is-morning .cc-day-item:nth-child(1),
.dark .is-afternoon .cc-day-item:nth-child(2),
.dark .is-evening .cc-day-item:nth-child(3),
.dark .is-night .cc-day-item:nth-child(4) {
  background: rgba(255, 255, 255, 0.045);
  border-color: rgba(255, 255, 255, 0.10);
  box-shadow: none;
}

@media (prefers-reduced-motion: no-preference) {
  .cc-celestial-svg {
    animation: cc-orb-float 5.5s ease-in-out infinite;
  }
}

@keyframes cc-orb-float {
  0%, 100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -3px;
  }
}

@media (max-width: 959px) {
  .cc-day-timeline {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    column-gap: 10px;
    margin-top: 30px;
  }

  .cc-day-orbit {
    grid-row: 1;
    width: 76px;
    height: 760px;
    min-height: 760px;
    aspect-ratio: auto;
  }

  .cc-day-svg-desktop {
    display: none;
  }

  .cc-day-svg-mobile {
    display: block;
  }

  .cc-day-path-base,
  .cc-day-path-progress {
    stroke-width: 5.5;
  }

  .cc-day-copy {
    grid-template-columns: 1fr;
    gap: 28px;
    margin-top: 8px;
  }

  .cc-day-item {
    min-height: 154px;
    padding: 16px 0 0 16px;
    border: 0;
  }

  .cc-day-item p {
    max-width: 290px;
  }

  .is-morning .cc-day-item:nth-child(1),
  .is-afternoon .cc-day-item:nth-child(2),
  .is-evening .cc-day-item:nth-child(3),
  .is-night .cc-day-item:nth-child(4) {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    transform: none;
  }
}
</style>
