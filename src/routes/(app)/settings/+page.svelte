<script lang="ts">
	/**
	 * FE-09 설정: 화면 모드(3단) · 봇 키 · 활동 기록 진입. 키·활동 기록은 시안 없음(G-13) →
	 * 공통 컴포넌트 + design.md §5-2·§5-6.
	 * - 키 원문은 발급 성공 응답(form.apiKey)에서만 1회 표시. load·URL·저장소에는 두지 않는다.
	 * - 폐기는 확인 시트(Sheet)를 거친다. importer는 만료일 필수. 제안 권한은 finance-manager만.
	 */
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import { toast } from '$lib/components/ui/toast.svelte';
	import { formatKstShort } from '$lib/format/datetime';
	import { THEME_LABEL, type ThemeMode } from '$lib/theme/theme';
	import { themeState } from '$lib/theme/themeState.svelte';
	import {
		applyKstOffset,
		expiryRequired,
		FINANCE_MANAGER_PROFILE,
		needsExpiryClearConfirm,
		profileLabel,
		PROPOSE_SCOPES,
		selectableScopes,
		settingsErrorMessage
	} from '$lib/settings/view';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const auditHref = resolve('/settings/audit');

	$effect(() => {
		themeState.sync();
	});
	const themeOptions: { value: ThemeMode; label: string }[] = (
		['system', 'light', 'dark'] as ThemeMode[]
	).map((m) => ({ value: m, label: THEME_LABEL[m] }));

	// ——— 결과 메시지 (원문 키는 form.apiKey에만) ———
	const issued = $derived(
		form && 'ok' in form && form.ok === true && 'apiKey' in form ? form : null
	);
	const actionOk = $derived(form && 'ok' in form && form.ok === true && !('apiKey' in form));
	const failMessage = $derived(
		form && 'ok' in form && form.ok === false
			? settingsErrorMessage('message' in form ? form.message : undefined)
			: null
	);

	let keyHidden = $state(false);
	$effect(() => {
		// 새 발급 응답이 오면 다시 보이게
		if (issued) keyHidden = false;
	});

	async function copyKey() {
		const key = issued?.apiKey;
		if (!key) return;
		try {
			await navigator.clipboard.writeText(key);
			toast.show('키를 복사했어요', { tone: 'ok' });
		} catch {
			toast.show('복사하지 못했어요. 직접 선택해 복사해 주세요.', { tone: 'err' });
		}
	}

	// ——— 발급 폼 ———
	let profile = $state('finance-manager');
	const defaults = $derived(data.profileScopes[profile] ?? []);
	const scopeChoices = $derived(selectableScopes(profile, defaults));
	let picked = $derived<string[]>([...scopeChoices]);
	const scopesValue = $derived(JSON.stringify(picked));
	// N-3: JS 없이(SSR 그대로) 제출하면 hidden scopes는 빈 값 → 서버가 고른 프로필의 기본 권한을 쓴다.
	// SSR 값에 재무 관리 봇 기본값(제안 권한 포함)을 박아 두면 프로필만 바꿔 보낼 때 거부된다.
	// 화면이 살아나면(hydrate) 체크박스 선택을 그대로 싣는다. 서버의 권한 확대 거부는 그대로.
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	// ——— 만료 시각: KST 벽시계 → +09:00 (QA Low-1) ———
	// datetime-local은 오프셋을 담을 수 없으니 화면 값은 두고, 실제로 보내는 FormData만 바꾼다.
	// formdata 이벤트는 JS가 있는 native 제출과 enhance의 new FormData(form) 모두에서 발생한다.
	// enhance 콜백에서도 한 번 더 적용한다(멱등). JS가 없으면 원래 값이 가고 서버가 거부한다.
	function onExpiryFormData(e: FormDataEvent) {
		applyKstOffset(e.formData);
	}
	const kstEnhance: SubmitFunction = ({ formData }) => {
		applyKstOffset(formData);
	};

	// ——— 폐기 확인 ———
	type Bot = PageData['botClients'][number];
	let revokeTarget = $state<Bot | null>(null);

	// ——— 선택 만료 해제 확인 (Info-2, importer 제외) ———
	// JS가 있으면 빈 값 제출을 멈추고 확인 시트를 띄운다. 확인하면 시트 안의 폼이 빈 만료를 보낸다.
	let clearTarget = $state<Bot | null>(null);
	function expiryEnhance(bot: Bot): SubmitFunction {
		return ({ formData, cancel }) => {
			applyKstOffset(formData);
			if (needsExpiryClearConfirm(bot.profile, bot.expires_at, formData.get('expires_at'))) {
				cancel();
				clearTarget = bot;
			}
		};
	}
</script>

<svelte:head><title>설정 · MO_WA</title></svelte:head>

<section class="settings" data-testid="settings-page">
	<header class="head">
		<h1>설정</h1>
	</header>

	{#if data.error}
		<Banner tone="err">{data.error}</Banner>
	{/if}

	<Card>
		<h2 class="mw-h2">화면 모드</h2>
		<p class="muted">상단바 버튼과 같은 설정이에요.</p>
		<div data-testid="theme-setting">
			<SegmentedControl
				ariaLabel="화면 모드"
				options={themeOptions}
				value={themeState.mode}
				onchange={(m) => themeState.set(m)}
			/>
		</div>
	</Card>

	{#if issued}
		{#if !keyHidden}
			<div class="once" role="status" data-testid="issued-api-key">
				<p class="once-title">
					키는 지금 한 번만 보여 드려요. 닫거나 새로고침하면 다시 볼 수 없어요.
				</p>
				<code class="once-key">{issued.apiKey}</code>
				<p class="once-meta">{issued.botClient.name} · 식별 앞자리 {issued.botClient.key_prefix}</p>
				<div class="once-acts">
					<Button variant="primary" compact label="복사" onclick={copyKey} />
					<Button
						variant="secondary-pill"
						compact
						label="닫기"
						onclick={() => (keyHidden = true)}
					/>
				</div>
			</div>
		{/if}
	{:else if actionOk}
		<p class="ok" role="status" data-testid="bot-action-ok">반영했어요.</p>
	{:else if failMessage}
		<Banner tone="err"><span data-testid="bot-action-error">{failMessage}</span></Banner>
	{/if}

	<Card>
		<h2 class="mw-h2" id="bots-heading">봇 키</h2>

		<form
			method="POST"
			action="?/issue"
			class="issue"
			data-testid="bot-issue-form"
			onformdata={onExpiryFormData}
			use:enhance={kstEnhance}
		>
			<label>
				이름
				<input class="input" name="name" required maxlength="120" placeholder="예: 재무 봇" />
			</label>
			<label>
				프로필
				<select
					class="select"
					name="profile"
					required
					bind:value={profile}
					data-testid="issue-profile"
				>
					{#each Object.keys(data.profileScopes) as p (p)}
						<option value={p}>{profileLabel(p)}</option>
					{/each}
				</select>
			</label>
			<label>
				설명
				<input class="input" name="description" maxlength="200" />
			</label>
			<label>
				만료 {expiryRequired(profile) ? '(필수)' : '(선택)'}
				<input
					class="input"
					name="expires_at"
					type="datetime-local"
					required={expiryRequired(profile)}
					data-testid="issue-expiry"
				/>
			</label>
			<label>
				분당 한도
				<input class="input" name="rate_limit_per_min" type="number" min="1" max="600" value="60" />
			</label>
			<fieldset class="scopes" data-testid="issue-scopes">
				<legend>권한 범위</legend>
				{#each scopeChoices as s (s)}
					<label class="check">
						<input
							class="checkbox"
							type="checkbox"
							value={s}
							checked={picked.includes(s)}
							onchange={(e) => {
								picked = e.currentTarget.checked ? [...picked, s] : picked.filter((x) => x !== s);
							}}
						/>
						{s}
					</label>
				{/each}
				{#if profile !== FINANCE_MANAGER_PROFILE}
					<p class="muted" data-testid="propose-note">
						제안 권한({PROPOSE_SCOPES.join(', ')})은 재무 관리 봇에서만 켤 수 있어요.
					</p>
				{/if}
			</fieldset>
			<input type="hidden" name="scopes" value={hydrated ? scopesValue : ''} />
			<Button type="submit" variant="primary" label="키 발급" disabled={picked.length === 0} />
		</form>

		{#if data.botClients.length === 0}
			<EmptyState icon="🔑" title="발급한 키가 없어요" desc="위에서 봇 키를 발급해 보세요." />
		{:else}
			<ul class="list" data-testid="bot-clients-list">
				{#each data.botClients as bot (bot.id)}
					<li class="row" data-bot-id={bot.id} data-revoked={bot.revoked_at ? '1' : '0'}>
						<div class="meta">
							<strong>{bot.name}</strong>
							<span class="muted"
								>{profileLabel(bot.profile)} · 앞자리 {bot.key_prefix} · 분당 {bot.rate_limit_per_min}회</span
							>
							<span class="muted">권한: {bot.scopes.join(', ')}</span>
							<span class="muted" data-testid="last-used"
								>마지막 사용 {bot.last_used_at ? formatKstShort(bot.last_used_at) : '없음'}</span
							>
							{#if bot.expires_at}
								<span class="muted">만료 {formatKstShort(bot.expires_at)}</span>
							{/if}
							{#if bot.revoked_at}
								<span class="revoked">폐기됨 {formatKstShort(bot.revoked_at)}</span>
							{/if}
						</div>
						{#if !bot.revoked_at}
							<div class="acts">
								<form
									method="POST"
									action="?/setExpiry"
									class="inline"
									data-testid="set-expiry-form"
									onformdata={onExpiryFormData}
									use:enhance={expiryEnhance(bot)}
								>
									<input type="hidden" name="id" value={bot.id} />
									<input
										class="input"
										name="expires_at"
										type="datetime-local"
										aria-label="만료 시각"
										required={expiryRequired(bot.profile)}
									/>
									<Button type="submit" variant="ghost" compact label="만료 설정" />
								</form>
								<form method="POST" action="?/setRateLimit" class="inline" use:enhance>
									<input type="hidden" name="id" value={bot.id} />
									<input
										class="input"
										name="rate_limit_per_min"
										type="number"
										min="1"
										max="600"
										value={bot.rate_limit_per_min}
										aria-label="분당 한도"
									/>
									<Button type="submit" variant="ghost" compact label="한도 변경" />
								</form>
								<Button
									variant="secondary-pill"
									compact
									label="폐기"
									onclick={() => (revokeTarget = bot)}
								/>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<Card>
		<h2 class="mw-h2">활동 기록</h2>
		<p class="muted">봇이 한 일과 경고를 확인해요.</p>
		<a class="more" href={auditHref} data-testid="audit-link">활동 기록 보기</a>
	</Card>
</section>

<!-- 폐기 확인(N-1): 폼은 시트 안에서 대상 키가 있을 때만 존재한다. 확인 버튼이 이 폼을 제출한다. -->
<Sheet
	open={revokeTarget != null}
	onclose={() => (revokeTarget = null)}
	variant="center"
	title="키를 폐기할까요?"
>
	{#if revokeTarget}
		<p class="confirm" data-testid="revoke-confirm">
			<b>{revokeTarget.name}</b> 키를 폐기하면 이 봇은 바로 접속할 수 없고, 되돌릴 수 없어요.
		</p>
		<form
			id="revoke-form"
			method="POST"
			action="?/revoke"
			use:enhance={() => {
				return async ({ update }) => {
					revokeTarget = null;
					await update();
				};
			}}
		>
			<input type="hidden" name="id" value={revokeTarget.id} />
			<input type="hidden" name="reason" value="user_revoke" />
		</form>
	{/if}
	{#snippet footer()}
		<Button variant="secondary-pill" compact label="취소" onclick={() => (revokeTarget = null)} />
		<Button type="submit" form="revoke-form" variant="primary" compact label="폐기" />
	{/snippet}
</Sheet>

<!-- 선택 만료 해제 확인(Info-2): 확인 버튼이 시트 안의 폼으로 빈 만료를 보낸다 -->
<Sheet
	open={clearTarget != null}
	onclose={() => (clearTarget = null)}
	variant="center"
	title="만료를 해제할까요?"
>
	{#if clearTarget}
		<p class="confirm" data-testid="expiry-clear-confirm">
			<b>{clearTarget.name}</b> 키의 만료({clearTarget.expires_at
				? formatKstShort(clearTarget.expires_at)
				: '—'})를 해제하면, 폐기하기 전까지 계속 쓸 수 있어요.
		</p>
		<form
			id="expiry-clear-form"
			method="POST"
			action="?/setExpiry"
			use:enhance={() => {
				return async ({ update }) => {
					clearTarget = null;
					await update();
				};
			}}
		>
			<input type="hidden" name="id" value={clearTarget.id} />
			<input type="hidden" name="expires_at" value="" />
		</form>
	{/if}
	{#snippet footer()}
		<Button variant="secondary-pill" compact label="취소" onclick={() => (clearTarget = null)} />
		<Button type="submit" form="expiry-clear-form" variant="primary" compact label="만료 해제" />
	{/snippet}
</Sheet>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 16px;
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
	.mw-h2 {
		margin: 0 0 8px;
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
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 400;
	}
	.scopes {
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-md);
		padding: 10px 12px;
		display: grid;
		gap: 6px;
		margin: 0;
	}
	.scopes legend {
		font-size: 13px;
		font-weight: 600;
		padding: 0 4px;
	}
	/* 입력·선택 상자는 Skeleton input·select + skeleton-overrides.css (DS §7-0) */
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
		word-break: break-all;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: end;
	}
	.muted {
		margin: 0;
		color: var(--color-muted);
		font-size: 13px;
	}
	.revoked {
		color: var(--color-muted);
		font-size: 13px;
		font-weight: 600;
	}
	.once {
		padding: 14px;
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-md);
		background: var(--color-canvas-parchment);
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
		user-select: all;
	}
	.once-meta {
		margin: 8px 0;
		font-size: 12px;
		color: var(--color-muted);
	}
	.once-acts {
		display: flex;
		gap: 8px;
	}
	.ok {
		color: var(--color-ink);
		margin: 0;
	}
	.more {
		display: inline-block;
		margin-top: 8px;
		color: var(--color-ink);
		text-decoration: underline;
	}
	.confirm {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-muted);
		line-height: 1.6;
	}
</style>
