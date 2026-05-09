<template>
  <span v-if="!isVerified">
    <slot />
  </span>
</template>

<script>
export default {
  name: 'ShowAdUnverified',
  props: {
    showadState: { type: Object, default: null },
  },
  computed: {
    isVerified() {
      var state = this.showadState || (this.$page && this.$page.props && this.$page.props.showad);
      return state && state.is_verified;
    },
  },
};
</script>
