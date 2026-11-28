<script lang="ts">
	/**
	 * 모달 목차 점 (DS v1.7.6 §7-11-0). 표시 여부는 Sheet 가 정한다(본문 넘침 AND [data-toc] ≥ 2 → names 가 채워짐).
	 * 점 6px(현재 accent 8px + soft 링), 누름 PC 28×40·모바일 32×44, PC hover·포커스는 왼쪽 라벨, 누른 뒤 1.3초 라벨.
	 */
	let {
		names,
		cur,
		h,
		scrolls,
		avail,
		onpick
	}: {
		names: string[];
		cur: number;
		h: number;
		scrolls: boolean;
		avail: number;
		onpick: (i: number) => void;
	} = $props();

	let ol = $state<HTMLOListElement>();
	let tip = $state({ i: -1, y: 0, on: false });
	let hold: ReturnType<typeof setTimeout> | undefined;

	function show(e: Event, i: number) {
		const b = e.currentTarget as HTMLElement;
		const r = b.getBoundingClientRect();
		const n = b.closest('nav')!.getBoundingClientRect();
		tip = { i, y: r.top - n.top + r.height / 2, on: true };
	}
	function hide() {
		if (!hold) tip.on = false;
	}
	function pick(e: Event, i: number) {
		onpick(i);
		show(e, i);
		clearTimeout(hold);
		hold = setTimeout(() => {
			hold = undefined;
			if (
				!ol?.contains(document.activeElement) ||
				!document.activeElement?.matches(':focus-visible')
			)
				tip.on = false;
		}, 1300);
	}
	function onkeydown(e: KeyboardEvent) {
		const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
		const b = [...(ol?.querySelectorAll('button') ?? [])];
		const k = b.indexOf(document.activeElement as HTMLButtonElement);
		if (!d || k < 0) return;
		e.preventDefault();
		b[Math.max(0, Math.min(b.length - 1, k + d))].focus();
	}
	$effect(() => {
		if (scrolls) ol?.children[cur]?.scrollIntoView({ block: 'nearest' });
	});
	$effect(() => () => clearTimeout(hold));
</script>

{#if names.length >= 2}
	<nav
		class="sheet-toc"
		class:scrolls
		aria-label="목차"
		style:--toc-h="{h}px"
		style:--toc-max="{avail}px"
	>
		<ol bind:this={ol}>
			{#each names as n, i (i)}
				<li>
					<button
						type="button"
						class="toc-i"
						aria-label={n}
						aria-current={i === cur ? 'location' : undefined}
						{onkeydown}
						onclick={(e) => pick(e, i)}
						onmouseenter={(e) =>
							matchMedia('(hover: hover) and (min-width: 640px)').matches && show(e, i)}
						onmouseleave={hide}
						onfocus={(e) => e.currentTarget.matches(':focus-visible') && show(e, i)}
						onblur={hide}
					></button>
				</li>
			{/each}
		</ol>
		<span class="toc-tip" class:show={tip.on} style:top="{tip.y}px" aria-hidden="true"
			>{names[tip.i] ?? ''}</span
		>
	</nav>
{/if}

<style>
	.sheet-toc {
		--toc-w: 28px;
		position: absolute;
		right: 2px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 3;
		width: var(--toc-w);
		max-height: calc(100% - 16px);
		display: flex;
		flex-direction: column;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.scrolls ol {
		max-height: var(--toc-max);
	}
	.toc-i {
		flex: none;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--toc-w);
		height: var(--toc-h);
		min-height: 0;
		padding: 0;
		border: 0;
		background: transparent;
		border-radius: var(--radius-base);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.toc-i::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-line-strong);
		transition:
			transform 0.15s,
			background-color 0.15s,
			box-shadow 0.15s;
	}
	.toc-i:hover::before {
		background: var(--color-muted);
	}
	.toc-i[aria-current='location']::before {
		background: var(--color-accent);
		transform: scale(1.34);
		box-shadow: 0 0 0 3px var(--color-accent-soft);
	}
	.toc-i:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: -2px;
	}
	.toc-tip {
		position: absolute;
		right: calc(100% + 4px);
		transform: translateY(-50%);
		max-width: 200px;
		padding: 6px 10px;
		border-radius: var(--radius-base);
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-line-strong);
		box-shadow: var(--shadow-pop);
		font-size: var(--text-sm);
		line-height: 1.25rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.12s;
	}
	.toc-tip.show {
		opacity: 1;
	}
	@media (max-width: 639px) {
		.sheet-toc {
			--toc-w: 32px;
			right: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.toc-i::before,
		.toc-tip {
			transition-duration: 0.01ms;
		}
	}
</style>
