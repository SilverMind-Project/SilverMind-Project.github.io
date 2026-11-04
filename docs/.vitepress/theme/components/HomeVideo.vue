<script setup lang="ts">
import { ref } from "vue";

const VIDEO_ID = "Xur5_7VcWJg";

// YouTube loads only after a click: opening the page sends nothing to a third party.
const playing = ref(false);
</script>

<template>
  <div class="hx-video">
    <iframe
      v-if="playing"
      :src="`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1`"
      title="Cognitive Companion demo"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
    ></iframe>
    <button v-else class="hx-video__poster" type="button" @click="playing = true">
      <img
        src="/photos/caregiver-work-wide.webp"
        width="2000"
        height="1116"
        loading="lazy"
        alt="A man at his desk reading an update on his phone"
      />
      <span class="hx-video__play">Play the demo</span>
    </button>
  </div>
</template>
