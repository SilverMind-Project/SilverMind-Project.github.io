<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import BackgroundAnimation from './components/BackgroundAnimation.vue'
import NeuronHeroText from './components/NeuronHeroText.vue'

const { Layout } = DefaultTheme
const { frontmatter } = useData()
</script>

<template>
  <Layout>
    <template #home-hero-info>
      <h1 class="vh-heading">
        <NeuronHeroText />
        <span
          v-if="frontmatter.hero?.text"
          class="vh-text"
          v-html="frontmatter.hero.text"
        />
      </h1>
      <p
        v-if="frontmatter.hero?.tagline"
        class="vh-tagline"
        v-html="frontmatter.hero.tagline"
      />
    </template>
    <template #layout-bottom>
      <BackgroundAnimation />
    </template>
  </Layout>
</template>
