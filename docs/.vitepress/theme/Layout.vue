<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import BackgroundAnimation from './components/BackgroundAnimation.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #layout-bottom>
      <BackgroundAnimation />
    </template>
  </Layout>
</template>
