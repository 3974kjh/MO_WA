<script lang="ts">
	/**
	 * FE-09 활동 기록 (G-13: 시안 없음 → 공통 컴포넌트 + design.md §5-6). 읽기 전용.
	 * 봇·툴·결과·WARN(규칙 ID) 필터는 URL 쿼리(서버 적용). 행을 누르면 상세(args_preview) 시트.
	 */
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import type { Col } from '$lib/components/ui/types';
	import { formatKstShort } from '$lib/format/datetime';
	import {
		AUDIT_RESULTS,
		auditFilterActive,
		argsPreview,
		auditResultLabel
	} from '$lib/settings/view';

	let { data }: { data: PageData } = $props();

	type Row = PageData['rows'][number];

	const base = resolve('/settings/audit');
	const settingsHref = resolve('/settings');

	const botName = $derived(new Map(data.bots.map((b) => [b.id, b.name])));
	const ruleEntries = $derived(
		Object.entries(data.ruleIdCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
	);
	const active = $derived(auditFilterActive(data.filter));

	function actor(r: Row): string {
		if (r.bot_client_id) return botName.get(r.bot_client_id) ?? '알 수 없는 봇';
		return r.actor_type === 'user' ? '나' : '시스템';
	}

	function ruleHref(ruleId: string): string {
		return `${base}?rule=${encodeURIComponent(ruleId)}`;
	}

	let detail = $state<Row | null>(null);
	const preview = $derived(detail ? argsPreview(detail.args_preview) : null);

	const columns: Col<Row>[] = [
		{ key: 'when', label: '시각', num: true, render: whenCell },
		{ key: 'actor', label: '봇', render: actorCell },
		{ key: 'tool', label: '툴', title: true, render: toolCell },
		{ key: 'result', label: '결과', render: resultCell },
		{ key: 'warn', label: '경고', render: warnCell },
		{ key: 'open', label: '상세', align: 'right', render: openCell }
	];
</script>

{#snippet whenCell(r: Row)}{formatKstShort(r.created_at)}{/snippet}
{#snippet actorCell(r: Row)}{actor(r)}{/snippet}
{#snippet toolCell(r: Row)}<span class="tool">{r.tool}</span>{/snippet}
{#snippet resultCell(r: Row)}{auditResultLabel(r.result)}{/snippet}
{#snippet warnCell(r: Row)}{r.rule_ids.length > 0 ? `${r.rule_ids.length}건` : '—'}{/snippet}
{#snippet openCell(r: Row)}
	<button
		type="button"
		class="link"
		data-action="audit-open"
		aria-label="{r.tool} 상세"
		onclick={() => (detail = r)}>상세</button
	>
{/snippet}

<svelte:head><title>활동 기록 · MO_WA</title></svelte:head>

<section class="audit" data-testid="audit-page">
	<header class="head">
		<p class="back"><a href={settingsHref}>← 설정</a></p>
		<h1>활동 기록</h1>
		<p class="mw-sub">봇이 한 일을 최근순으로 보여 줘요. 읽기 전용이에요.</p>
	</header>

	{#if data.error}
		<Banner tone="err">{data.error}</Banner>
	{/if}

	<form method="GET" action={base} class="filters" data-testid="audit-filters">
		<label>
			봇
			<select name="bot" value={data.filter.bot}>
				<option value="">전체</option>
				{#each data.bots as b (b.id)}
					<option value={b.id}>{b.name}</option>
				{/each}
			</select>
		</label>
		<label>
			툴
			<input name="tool" value={data.filter.tool} placeholder="툴 이름 그대로" maxlength="80" />
		</label>
		<label>
			결과
			<select name="result" value={data.filter.result}>
				<option value="">전체</option>
				{#each AUDIT_RESULTS as r (r)}
					<option value={r}>{auditResultLabel(r)}</option>
				{/each}
			</select>
		</label>
		<label class="check">
			<input type="checkbox" name="warn" value="1" checked={data.filter.warn} />
			경고 있는 것만
		</label>
		<input type="hidden" name="rule" value={data.filter.rule} />
		<div class="btns">
			<Button type="submit" variant="primary" compact label="적용" />
			{#if active}
				<a class="reset" href={base} data-testid="audit-reset">필터 초기화</a>
			{/if}
		</div>
	</form>

	<Card>
		<h2 class="mw-h2">경고 규칙별 건수</h2>
		{#if ruleEntries.length === 0}
			<p class="muted">경고가 남은 기록이 없어요.</p>
		{:else}
			<ul class="rules" data-testid="audit-rule-counts">
				{#each ruleEntries as [ruleId, count] (ruleId)}
					<li>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve('/settings/audit') + 쿼리 -->
						<a
							class="rule"
							aria-current={data.filter.rule === ruleId ? 'true' : undefined}
							href={ruleHref(ruleId)}><code>{ruleId}</code> <span class="num">{count}</span></a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	{#if data.truncated}
		<Banner tone="info">최근 기록 일부만 보여 줘요. 필터로 좁혀 보세요.</Banner>
	{/if}

	{#if data.rows.length === 0 && !data.error}
		<Card>
			<EmptyState
				icon="🧾"
				title={active ? '조건에 맞는 기록이 없어요' : '아직 활동 기록이 없어요'}
				desc={active ? '필터를 바꾸거나 초기화해 보세요.' : '봇이 일하면 여기에 쌓여요.'}
			/>
		</Card>
	{:else if data.rows.length > 0}
		<Card flush>
			<DataTable
				{columns}
				rows={data.rows}
				mobile="cards"
				caption="활동 기록"
				rowKey={(r) => String(r.id)}
			/>
		</Card>
	{/if}
</section>

<Sheet open={detail != null} onclose={() => (detail = null)} variant="center" title="활동 상세">
	{#if detail}
		<dl class="dl" data-testid="audit-detail">
			<dt>시각</dt>
			<dd>{formatKstShort(detail.created_at)}</dd>
			<dt>봇</dt>
			<dd>{actor(detail)}</dd>
			<dt>툴</dt>
			<dd>{detail.tool}</dd>
			<dt>결과</dt>
			<dd>{auditResultLabel(detail.result)}</dd>
			{#if detail.rule_ids.length > 0}
				<dt>경고 규칙</dt>
				<dd>{detail.rule_ids.join(', ')}</dd>
			{/if}
			{#if detail.duration_ms != null}
				<dt>걸린 시간</dt>
				<dd class="num">{detail.duration_ms}ms</dd>
			{/if}
		</dl>
		{#if preview?.text}
			<p class="lbl">보낸 내용 미리보기</p>
			<pre class="args" data-testid="audit-args">{preview.text}</pre>
			{#if preview.truncated}
				<p class="cut" data-testid="audit-args-cut">내용이 길어 앞부분만 보여 줘요.</p>
			{/if}
		{/if}
	{/if}
	{#snippet footer()}
		<Button variant="secondary-pill" compact label="닫기" onclick={() => (detail = null)} />
	{/snippet}
</Sheet>

<style>
	.audit {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding-bottom: 40px;
	}
	.head h1 {
		margin: 0;
		font: var(--font-display);
		font-size: 28px;
		color: var(--color-ink);
	}
	.back {
		margin: 0 0 4px;
		font-size: var(--text-sm);
	}
	.mw-sub,
	.muted {
		margin: 6px 0 0;
		color: var(--color-muted);
		font-size: var(--text-sm);
	}
	.filters {
		display: grid;
		gap: 10px;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		align-items: end;
	}
	label {
		display: grid;
		gap: 4px;
		font-size: 13px;
		font-weight: 600;
		color: var(--color-ink);
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
	}
	input:not([type='checkbox']):not([type='hidden']),
	select {
		min-height: 40px;
		padding: 8px 12px;
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-md);
		background: var(--color-canvas);
		color: var(--color-ink);
		font-size: 15px;
	}
	.btns {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.reset,
	.link {
		font-size: var(--text-sm);
		color: var(--color-ink);
		text-decoration: underline;
		background: none;
		border: 0;
		cursor: pointer;
		padding: 4px;
	}
	.mw-h2 {
		margin: 0 0 8px;
		font-size: 16px;
		color: var(--color-ink);
	}
	.rules {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.rule {
		display: inline-flex;
		gap: 6px;
		padding: 4px 10px;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-full);
		font-size: 13px;
		color: var(--color-ink);
		text-decoration: none;
	}
	.rule[aria-current='true'] {
		background: var(--color-canvas-parchment);
		font-weight: 600;
	}
	.tool {
		font-family: var(--font-mono, monospace);
		font-size: 13px;
	}
	.dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 14px;
		margin: 0 0 12px;
		font-size: var(--text-sm);
	}
	.dl dt {
		color: var(--color-muted);
	}
	.dl dd {
		margin: 0;
		color: var(--color-ink);
		word-break: break-all;
	}
	.lbl {
		margin: 0 0 4px;
		font-size: 12px;
		color: var(--color-muted);
	}
	.args {
		margin: 0;
		padding: 10px;
		max-height: 240px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-all;
		font-size: 12px;
		background: var(--color-canvas-parchment);
		border-radius: var(--radius-sm);
	}
	.cut {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--color-muted);
	}
</style>
