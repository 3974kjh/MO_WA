<script lang="ts">
	/**
	 * 메뉴 이동 로딩 패널. 본문 영역(사이드바·상단바는 그대로)에 뜬다.
	 * 문구는 바 위(aria-live), 퍼센트는 바 오른쪽 위. 게이지는 transform으로만 움직인다(레이아웃 없음).
	 * 색은 기존 토큰만 쓰고 면·테두리·그림자는 전역 .card를 재사용한다. 동작 줄이기: 전환·애니메이션은 tokens.css 전역 규칙이 끄고, 무한 광택만 여기서 숨긴다.
	 */
	let {
		name,
		step,
		percent,
		done = false
	}: {
		/** 목적지 화면 이름 */
		name: string;
		/** 지금 단계 문구 */
		step: string;
		/** 0~100 정수 */
		percent: number;
		/** 완료 연출(100%를 채운 뒤 서서히 사라짐) */
		done?: boolean;
	} = $props();
</script>

<div class="wrap" class:done data-testid="nav-loading">
	<section class="panel card">
		<p class="name">{name}</p>
		<div class="row">
			<p class="step" aria-live="polite" aria-atomic="true">{step}</p>
			<span class="pct num" aria-hidden="true">{percent}%</span>
		</div>
		<div
			class="track"
			role="progressbar"
			aria-label="{name} 화면 준비"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={percent}
			aria-valuetext="{name} 화면 준비 {percent}%"
		>
			<div class="fill" style:transform="translateX({percent - 100}%)"></div>
		</div>
	</section>
</div>

<style>
	.wrap {
		position: absolute;
		inset: 0 0 auto 0;
		display: flex;
		justify-content: center;
		padding-top: clamp(24px, 12vh, 120px);
		pointer-events: none;
		animation: nl-fade 200ms var(--ease-out) both;
	}
	.panel {
		width: min(100%, 440px);
		padding: 20px;
		border-radius: var(--radius-md);
	}
	.name {
		margin: 0 0 4px;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-muted);
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
		font-size: var(--text-md);
		font-weight: 600;
	}
	.step {
		margin: 0;
	}
	.pct {
		color: var(--color-accent);
	}
	.track {
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--color-surface-3);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: var(--radius-full);
		background: var(--color-accent);
		transition: transform 420ms var(--ease-out);
		overflow: hidden;
	}
	/* 은은한 광택: 게이지 안에서만 지나간다 */
	.fill::after {
		content: '';
		display: block;
		height: 100%;
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in srgb, var(--color-on-accent) 38%, transparent),
			transparent
		);
		transform: translateX(-100%);
		animation: nl-sheen 1.6s ease-in-out infinite;
	}
	/* 완료: 게이지를 빠르게 100%까지 채운 뒤(220ms) 서서히 사라진다(총 FINISH_HOLD_MS 안) */
	.done {
		animation: nl-out 200ms var(--ease-out) 260ms forwards;
	}
	.done .fill {
		transition-duration: 220ms;
	}
	@keyframes nl-fade {
		from {
			opacity: 0;
		}
	}
	@keyframes nl-out {
		to {
			opacity: 0;
		}
	}
	@keyframes nl-sheen {
		to {
			transform: translateX(100%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fill::after {
			display: none;
		}
	}
</style>
