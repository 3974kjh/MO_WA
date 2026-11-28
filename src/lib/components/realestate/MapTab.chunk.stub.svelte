<script lang="ts">
	/** 청크 늦은 성공 시험용 스텁. 실제 지도는 그리지 않는다. */
	let { ...rest }: Record<string, unknown> = $props();
</script>

<div data-testid="complex-map-stub" data-state="ready" data-props={Object.keys(rest).length}></div>
