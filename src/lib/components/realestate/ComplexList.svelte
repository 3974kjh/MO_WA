<script lang="ts">
	/**
	 * 지도 탭 단지 목록(1차 접근 경로 — 지도를 못 쓰는 사용자도 같은 정보를 본다, PLAN W3, 시안 v1.7.8 .rm-list).
	 * 행은 버튼(aria-pressed)이고 지도 핀과 선택 상태를 공유한다. 구분은 글리프(모양+글자)+이름으로 읽힌다.
	 * 지도를 못 쓰는 상태(fallback)에서는 행마다 네이버 지도 링크가 붙는다.
	 */
	import { exactAriaLabel, formatWon } from '$lib/format/money';
	import { TIER_LABEL, type ComplexItem } from '$lib/maps/points';
	import NaverLink from './NaverLink.svelte';
	import TierGlyph from './TierGlyph.svelte';

	let {
		items,
		selectedId,
		onselect,
		fallback = false,
		hint = ''
	}: {
		items: ComplexItem[];
		selectedId: string | null;
		onselect: (id: string) => void;
		fallback?: boolean;
		/** 행 읽기 이름 끝에 붙는 안내(겹친 단지 목록: '정보를 열려면 누르세요') */
		hint?: string;
	} = $props();

	const nf = new Intl.NumberFormat('ko-KR');
	const score = (it: ComplexItem) => nf.format(Math.round((it.score ?? 0) * 10) / 10);
	function label(it: ComplexItem): string {
		const parts = [
			it.name,
			TIER_LABEL[it.tier],
			it.score == null ? '점수 없음' : `총점 ${score(it)}점`,
			it.region
		];
		if (it.medPrice != null)
			parts.push(`실거래 중앙값 ${exactAriaLabel(formatWon(it.medPrice * 1e4))}`);
		if (hint) parts.push(hint);
		return parts.filter(Boolean).join(', ');
	}
</script>

<ul class="rm-list" data-testid="complex-list" class:fb={fallback}>
	{#each items as it (it.id)}
		{@const won = it.medPrice != null ? formatWon(it.medPrice * 1e4) : null}
		<li class:has-x={fallback}>
			<button
				type="button"
				class="rm-row"
				aria-pressed={selectedId === it.id}
				aria-label={label(it)}
				data-id={it.id}
				onclick={() => onselect(it.id)}
			>
				<TierGlyph tier={it.tier} size={28} />
				<span class="grow" aria-hidden="true">
					<span class="nm">{it.name}</span>
					<span class="sub"
						>{it.region} · {TIER_LABEL[it.tier]}{#if it.households != null}<span class="hh">
								· {nf.format(it.households)}세대</span
							>{/if}</span
					>
				</span>
				<span class="r" aria-hidden="true">
					{#if it.score != null}
						<b>{score(it)}</b><small>점</small>
					{:else}
						<small>{it.tier === 'ref' ? '점수 없음(참고 등급)' : '점수 없음'}</small>
					{/if}
					{#if won}<span class="p">{won.text}{won.unit}</span>{/if}
				</span>
			</button>
			{#if fallback}<NaverLink item={it} label="네이버 지도" />{/if}
		</li>
	{/each}
</ul>

<style>
	.rm-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		border-bottom: 1px solid var(--color-line);
	}
	li:last-child {
		border-bottom: 0;
	}
	li.has-x {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	li.has-x .rm-row {
		flex: 1 1 auto;
		min-width: 0;
	}
	li.has-x :global(.rm-ext) {
		flex: none;
		padding: 0 8px;
	}
	.rm-row {
		width: 100%;
		display: flex;
		gap: 12px;
		align-items: center;
		background: none;
		border: 0;
		padding: 10px 8px;
		min-height: 60px;
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
		border-radius: var(--radius-sm);
	}
	.rm-row:hover {
		background: var(--color-surface-2);
	}
	.rm-row[aria-pressed='true'] {
		background: var(--color-accent-soft);
	}
	.rm-row:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
	}
	.rm-row :global(svg.g) {
		flex: none;
	}
	.nm {
		display: block;
		font-weight: 600;
		line-height: 1.35rem;
		overflow-wrap: anywhere;
	}
	.sub {
		display: block;
		font-size: var(--text-xs);
		color: var(--color-subtle);
		line-height: 1.2rem;
	}
	.hh {
		display: inline;
	}
	.r {
		margin-left: auto;
		text-align: right;
		flex: none;
	}
	.r b {
		font-size: var(--text-lg);
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.r small {
		font-size: var(--text-xs);
		color: var(--color-subtle);
		font-weight: 500;
	}
	.p {
		display: block;
		font-size: var(--text-xs);
		color: var(--color-muted);
		font-variant-numeric: tabular-nums;
	}
	@media (min-width: 640px) and (max-width: 1023px) {
		.hh {
			display: none;
		}
		.rm-row {
			padding: 10px 6px;
			gap: 10px;
		}
		.r b {
			font-size: var(--text-base);
		}
		.rm-list.fb {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 639px) {
		.rm-row {
			min-height: 64px;
		}
	}
	/* 지도를 못 쓸 때(넓은 화면): 목록이 전체 폭을 쓰고 2열로 */
	@media (min-width: 1024px) {
		.rm-list.fb {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			column-gap: 20px;
		}
	}
	.grow {
		min-width: 0;
	}
</style>
