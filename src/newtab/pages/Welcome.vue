<template>
  <div class="mx-auto max-w-xl py-16">
    <h1 class="mb-8 text-3xl font-semibold">
      {{ t('welcome.title') }}
    </h1>
    <p>
      Get started by reading the documentation or browsing workflows in the
      Turium Marketplace. <br />
      To learn how to use Turium, watch the tutorials on our YouTube Channel.
    </p>
    <div class="mt-8 flex items-center space-x-2">
      <a
        v-for="link in links"
        :key="link.name"
        :href="link.url"
        target="_blank"
        rel="noopener"
        class="hoverable w-40 flex-1 rounded-lg border-2 p-4 transition"
      >
        <v-remixicon size="28" :name="link.icon" />
        <p class="mt-2">
          {{ link.name }}
        </p>
      </a>
    </div>
    <div class="mt-8">
      <p>{{ t('home.communities') }}</p>
      <div class="mt-2 flex items-center space-x-2">
        <a
          v-for="link in communities"
          :key="link.name"
          :href="link.url"
          target="_blank"
          rel="noopener"
          class="hoverable w-40 rounded-lg border-2 p-4 transition"
        >
          <v-remixicon size="28" :name="link.icon" />
          <p class="mt-2">
            {{ link.name }}
          </p>
        </a>
      </div>
    </div>
  </div>
</template>
<script setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const communities = [
  {
    name: 'GitHub',
    icon: 'riGithubFill',
    url: 'https://github.com/xaana',
  },

];
const links = [
];
</script>
