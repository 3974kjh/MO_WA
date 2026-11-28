<script lang="ts">
	/**
	 * 지도 탭 단지 목록(1차 접근 경로 — 지도를 못 쓰는 사용자도 같은 정보를 본다, PLAN W3).
	 * 행은 버튼(aria-pressed)이고 지도 핀과 선택 상태를 공유한다. 번호는 지도 핀 번호와 같다.
	 * 위치 정보가 없는 단지도 목록에 남기고 '위치 정보 없음'으로 밝힌다(지도에는 찍지 않음).
	 */
	import { exactAriaLabel, formatWon } from '$lib/format/money';
	import { TIER_LABEL, isLocated, type ComplexItem } from '$lib/maps/points';

	let {
		items,
		selectedId,
		onselect
	}: {
		items: ComplexItem[];
		selectedId: string | null;
		onselect: (id: string) => void;
	} = $props();

	const nf = new Intl.NumberFormat('ko-KR');
	function score(it: ComplexItem): string {
		return it.score == null ? '' : nf.format(Math.round(it.score * 10) / 10);
	}
	function label(it: ComplexItem): string {
		const parts = [
			`${it.rank}번 ${it.name}`,
			it.region,
			TIER_LABEL[it.tier],
			it.score == null ? '점수 없음' : `총점 ${score(it)}점`,
			isLocated(it) ? null : '위치 정보 없음'
		];
		if (it.medPrice != null)
			parts.push(`실거래 중앙값 ${exactAriaLabel(formatWon(it.medPrice * 1e4))}`);
		return parts.filter(Boolean).join(', ');
	}
</script>

<ul class="ml" data-testid="complex-list">
	{#each items as it (it.id)}
		{@const won = it.medPrice != null ? formatWon(it.medPrice * 1e4) : null}
		<li>
			<button
				type="button"
				aria-pressed={selectedId === it.id}
				aria-label={label(it)}
				data-cx={it.id}
				onclick={() => onselect(it.id)}
			>
				<span class="num" class:off={!isLocated(it)} aria-hidden="true">{it.rank}</span>
				<span class="grow" aria-hidden="true">
					<span class="nm">{it.name}</span>
					<span class="meta"
						>{it.region}{#if it.households != null}
							· {nf.format(it.households)}세대{/if} · {TIER_LABEL[it.tier]}{#if !isLocated(it)}
							· <span class="nl">위치 정보 없음</span>{/if}</span
					>
				</span>
				<span class="r" aria-hidden="true">
					<span class="sc"
						>{#if it.score != null}{score(it)}<small>점</small>{:else}<small>점수 없음</small
							>{/if}</span
					>
					{#if won}<span class="pr">{won.text}{won.unit}</span>{/if}
				</span>
			</button>
		</li>
	{/each}
</ul>

<style>
	.ml {
		list-style: none;
		margin: 0;
		padding: 0 10px 8px;
	}
	li {
		border-bottom: 1px solid var(--color-line);
	}
	li:last-child {
		border-bottom: 0;
	}
	button {
		width: 100%;
		display: flex;
		gap: 12px;
		align-items: center;
		background: none;
		border: 0;
		padding: 10px 6px;
		min-height: 56px;
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
		border-radius: var(--radius-sm);
	}
	button:hover {
		background: var(--color-surface-2);
	}
	button[aria-pressed='true'] {
		background: var(--color-accent-soft);
	}
	button:focus-visible {
		outline: 2px solid var(--color-focus);
		outline-offset: -2px;
	}
	.num {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-line-strong);
		font-size: var(--text-xs);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.num.off {
		border-style: dashed;
		color: var(--color-subtle);
	}
	button[aria-pressed='true'] .num {
		background: var(--color-accent);
		color: var(--color-on-accent);
		border-color: var(--color-accent);
	}
	.grow {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.nm {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.meta {
		font-size: var(--text-xs);
		color: var(--color-subtle);
	}
	.nl {
		color: var(--color-muted);
		font-weight: 600;
	}
	.r {
		flex: none;
		text-align: right;
		display: flex;
		flex-direction: column;
	}
	.sc {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.sc small,
	.pr {
		font-size: var(--text-xs);
		color: var(--color-muted);
		font-weight: 400;
	}
</style>
