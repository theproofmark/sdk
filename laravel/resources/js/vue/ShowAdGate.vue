<template>
  <div v-if="isVerified">
    <slot />
  </div>
  <div v-else-if="isLoading">
    <slot name="loading">
      <div style="text-align: center; padding: 2rem;">
        <div style="display: inline-block; width: 2rem; height: 2rem; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: showad-spin 0.8s linear infinite;"></div>
        <p style="margin-top: 0.5rem; color: #6b7280;">Checking verification...</p>
      </div>
    </slot>
  </div>
  <div v-else>
    <slot name="unverified">
      <div style="text-align: center; padding: 2rem;">
        <p style="margin-bottom: 1rem; color: #6b7280;">This content requires verification.</p>
        <button
          @click="redirectToVideoAd"
          style="padding: 0.75rem 1.5rem; background-color: #3b82f6; color: white; border: none; border-radius: 0.375rem; font-weight: 600; cursor: pointer;"
        >
          Watch Ad to Unlock
        </button>
      </div>
    </slot>
  </div>
</template>

<script>
export default {
  name: 'ShowAdGate',
  props: {
    /**
     * Override the auto-detected showad props from Inertia.
     */
    showadState: {
      type: Object,
      default: null,
    },
    /**
     * Custom return URL for the video ad redirect.
     */
    returnUrl: {
      type: String,
      default: null,
    },
  },
  computed: {
    state() {
      if (this.showadState) return this.showadState;
      // Read from Inertia shared props
      if (this.$page && this.$page.props && this.$page.props.showad) {
        return this.$page.props.showad;
      }
      return { is_verified: false, redirect_url: null };
    },
    isVerified() {
      return this.state && this.state.is_verified;
    },
    isLoading() {
      return false; // Server-side verification is synchronous
    },
    redirectUrl() {
      return this.state ? this.state.redirect_url : null;
    },
  },
  methods: {
    redirectToVideoAd() {
      var url = this.returnUrl || this.redirectUrl;
      if (url) {
        window.location.href = url;
      } else if (window.ShowAd) {
        window.ShowAd.redirectToVideoAd(this.returnUrl);
      }
    },
  },
};
</script>

<style scoped>
@keyframes showad-spin {
  to { transform: rotate(360deg); }
}
</style>
