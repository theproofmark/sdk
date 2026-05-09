<template>
  <span v-if="expiresAt">
    {{ formattedTime }}
  </span>
</template>

<script>
export default {
  name: 'ShowAdExpiryCountdown',
  props: {
    showadState: { type: Object, default: null },
    format: { type: String, default: 'mm:ss' }, // 'mm:ss', 'seconds', 'human'
  },
  data() {
    return {
      remaining: 0,
      timer: null,
    };
  },
  computed: {
    state() {
      return this.showadState || (this.$page && this.$page.props && this.$page.props.showad);
    },
    expiresAt() {
      return this.state ? this.state.expires_at : null;
    },
    formattedTime() {
      if (this.remaining <= 0) return 'Expired';

      var seconds = this.remaining;
      if (this.format === 'seconds') return seconds + 's';

      var mins = Math.floor(seconds / 60);
      var secs = seconds % 60;

      if (this.format === 'human') {
        if (mins > 0) return mins + 'm ' + secs + 's';
        return secs + 's';
      }

      // Default mm:ss
      return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    },
  },
  mounted() {
    this.updateRemaining();
    this.timer = setInterval(this.updateRemaining, 1000);
  },
  beforeDestroy() {
    if (this.timer) clearInterval(this.timer);
  },
  // Vue 3 compatibility
  beforeUnmount() {
    if (this.timer) clearInterval(this.timer);
  },
  methods: {
    updateRemaining() {
      if (!this.expiresAt) {
        this.remaining = 0;
        return;
      }
      this.remaining = Math.max(0, Math.floor((this.expiresAt - Date.now()) / 1000));
      if (this.remaining <= 0) {
        this.$emit('expired');
        if (this.timer) clearInterval(this.timer);
      }
    },
  },
};
</script>
