<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const issueOk = $derived(form && 'ok' in form && form.ok === true && 'apiKey' in form);
	const actionOk = $derived(form && 'ok' in form && form.ok === true && !('apiKey' in form));
	const actionFail = $derived(form && 'ok' in form && form.ok === false);
</script>

<svelte:head><title>설정 · MO_WA</title></svelte:head>

<section class="settings" data-testid="settings-page">
	<header class="head">
		<h1>설정</h1>
		<p class="sub">
			봇 연결 키(발급·폐기)와 활동 기록 요약. 전체 설정 UI는 이후 티켓에서 다룹니다.
		</p>
	</header>

	{#if data.error}
		<p class="err" role="alert">{data.error}</p>
	{/if}

	{#if issueOk && form && 'apiKey' in form && form.botClient}
		<div class="once" role="status" data-testid="issued-api-key">
			<p class="once-title">키를 한 번만 보여 줍니다. 지금 복사해 두세요.</p>
			<code class="once-key">{form.apiKey}</code>
			<p class="once-meta">prefix: {form.botClient.key_prefix} · id: {form.botClient.id}</p>
		</div>
	{:else if actionOk}
		<p class="ok" role="status" data-testid="bot-action-ok">반영했습니다.</p>
	{:else if actionFail && form && 'message' in form}
		<p class="err" role="alert" data-testid="bot-action-error">{form.message}</p>
	{/if}

	<section class="block" aria-labelledby="bots-heading">
		<h2 id="bots-heading">봇 클라이언트</h2>

		<form method="POST" action="?/issue" class="issue" data-testid="bot-issue-form">
			<label>
				이름
				<input name="name" required maxlength="120" placeholder="preview-finance-manager" />
			</label>
			<label>
				프로필
				<select name="profile" required>
					<option value="finance-manager">finance-manager</option>
					<option value="equity-analyst">equity-analyst</option>
					<option value="house-signal">house-signal</option>
					<option value="importer">importer</option>
					<option value="custom">custom</option>
				</select>
			</label>
			<label>
				설명
				<input name="description" maxlength="200" />
			</label>
			<label>
				만료 (importer 필수)
				<input name="expires_at" type="datetime-local" />
			</label>
			<label>
				분당 한도
				<input name="rate_limit_per_min" type="number" min="1" max="600" value="60" />
			</label>
			<!-- Optional JSON scopes override for tests / power users; empty = profile defaults -->
			<label>
				스코프 덮어쓰기 (JSON 배열, 비우면 기본)
				<input name="scopes" placeholder="비우면 프로필 기본값" autocomplete="off" />
			</label>
			<Button type="submit" variant="primary" label="키 발급" />
		</form>

		<ul class="list" data-testid="bot-clients-list">
			{#each data.botClients as bot (bot.id)}
				<li class="row" data-bot-id={bot.id} data-revoked={bot.revoked_at ? '1' : '0'}>
					<div class="meta">
						<strong>{bot.name}</strong>
						<span class="muted"
							>{bot.profile} · prefix {bot.key_prefix} · {bot.rate_limit_per_min}/min</span
						>
						<span class="muted">scopes: {bot.scopes.join(', ')}</span>
						{#if bot.expires_at}
							<span class="muted">expires {bot.expires_at}</span>
						{/if}
						{#if bot.revoked_at}
							<span class="revoked">폐기됨 {bot.revoked_at}</span>
						{/if}
					</div>
					{#if !bot.revoked_at}
						<div class="acts">
							<form method="POST" action="?/revoke">
								<input type="hidden" name="id" value={bot.id} />
								<input type="hidden" name="reason" value="user_revoke" />
								<Button type="submit" variant="secondary-pill" compact label="폐기" />
							</form>
							<form method="POST" action="?/setExpiry" class="inline">
								<input type="hidden" name="id" value={bot.id} />
								<input name="expires_at" type="datetime-local" aria-label="만료 시각" />
								<Button type="submit" variant="ghost" compact label="만료 설정" />
							</form>
							<form method="POST" action="?/setRateLimit" class="inline">
								<input type="hidden" name="id" value={bot.id} />
								<input
									name="rate_limit_per_min"
									type="number"
									min="1"
									max="600"
									value={bot.rate_limit_per_min}
									aria-label="분당 한도"
								/>
								<Button type="submit" variant="ghost" compact label="한도" />
							</form>
						</div>
					{/if}
				</li>
			{:else}
				<li class="empty muted">발급된 봇 키가 없습니다.</li>
			{/each}
		</ul>
	</section>

	<section class="block" aria-labelledby="audit-heading">
		<h2 id="audit-heading">활동 기록 규칙 ID</h2>
		{#if Object.keys(data.ruleIdCounts).length === 0}
			<p class="muted">집계할 기록이 없습니다.</p>
		{:else}
			<ul class="rules">
				{#each Object.entries(data.ruleIdCounts) as [ruleId, count] (ruleId)}
					<li><code>{ruleId}</code> · {count}</li>
				{/each}
			</ul>
		{/if}
	</section>
</section>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 28px;
		padding: 8px 0 40px;
		max-width: 720px;
	}
	.head h1 {
		margin: 0;
		font: var(--font-display);
		font-size: 28px;
		letter-spacing: -0.02em;
		color: var(--color-ink);
	}
	.sub {
		margin: 6px 0 0;
		color: var(--color-muted);
		font-size: 14px;
		line-height: 1.4;
	}
	.block h2 {
		margin: 0 0 12px;
		font-size: 18px;
		color: var(--color-ink);
	}
	.issue,
	.inline {
		display: grid;
		gap: 10px;
		margin-bottom: 20px;
	}
	.inline {
		grid-template-columns: 1fr auto;
		align-items: end;
		margin: 0;
	}
	label {
		display: grid;
		gap: 4px;
		font-size: 13px;
		font-weight: 600;
		color: var(--color-ink);
	}
	input,
	select {
		min-height: 40px;
		padding: 8px 12px;
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-md);
		background: var(--color-canvas);
		color: var(--color-ink);
		font-size: 15px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 0;
		border-top: 1px solid var(--color-hairline);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: end;
	}
	.muted {
		color: var(--color-muted);
		font-size: 13px;
	}
	.revoked {
		color: var(--color-danger, #b91c1c);
		font-size: 13px;
	}
	.once {
		padding: 14px;
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-md);
		background: var(--color-surface-pearl, var(--color-canvas-parchment));
	}
	.once-title {
		margin: 0 0 8px;
		font-weight: 600;
	}
	.once-key {
		display: block;
		word-break: break-all;
		font-size: 13px;
		padding: 8px;
		background: var(--color-canvas);
		border-radius: var(--radius-sm);
	}
	.once-meta {
		margin: 8px 0 0;
		font-size: 12px;
		color: var(--color-muted);
	}
	.err {
		color: var(--color-danger, #b91c1c);
		margin: 0;
	}
	.ok {
		color: var(--color-ink);
		margin: 0;
	}
	.rules {
		margin: 0;
		padding-left: 18px;
		font-size: 13px;
	}
	.empty {
		padding: 8px 0;
	}
</style>
