<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ModalSize } from './types';

	let {
		open,
		title,
		description,
		size = 'md',
		dismissible = true,
		closeOnBackdrop = false,
		closeOnEscape = true,
		onClose,
		children,
		footer
	}: {
		open: boolean;
		title?: string;
		description?: string;
		size?: ModalSize;
		dismissible?: boolean;
		closeOnBackdrop?: boolean;
		closeOnEscape?: boolean;
		onClose: () => void;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	let panel: HTMLDivElement | undefined = $state();

	const titleId = $derived(
		title ? `modal-title-${title.replace(/\s+/g, '-').toLowerCase()}` : undefined
	);
	const descriptionId = $derived(
		description
			? `modal-description-${description.slice(0, 16).replace(/\s+/g, '-').toLowerCase()}`
			: undefined
	);
	const sizeClass = $derived(
		{
			sm: 'max-w-[420px]',
			md: 'max-w-[560px]',
			lg: 'max-w-[720px]',
			xl: 'max-w-[960px]',
			fullscreen: 'h-[100dvh] max-w-none rounded-none sm:h-auto sm:max-w-[960px] sm:rounded-lg'
		}[size]
	);

	function requestClose() {
		if (dismissible) onClose();
	}

	function getFocusableElements(container: HTMLElement) {
		return Array.from(
			container.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		).filter((element) => !element.hasAttribute('disabled'));
	}

	function focusPanel() {
		if (!panel) return;
		const [firstFocusable] = getFocusableElements(panel);
		(firstFocusable ?? panel).focus();
	}

	function handleBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget && closeOnBackdrop) requestClose();
	}

	function handleFocusOut(event: FocusEvent) {
		if (!panel) return;

		const related = event.relatedTarget;
		if (related instanceof Node && panel.contains(related)) return;

		requestAnimationFrame(() => {
			if (!open || !panel) return;
			const active = document.activeElement;
			if (active instanceof Node && panel.contains(active)) return;
			focusPanel();
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && closeOnEscape) {
			requestClose();
			return;
		}

		if (event.key !== 'Tab' || !panel) return;

		const focusable = getFocusableElements(panel);
		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement;

		if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!open) return;

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		focusPanel();

		document.addEventListener('keydown', handleKeydown);

		return () => {
			document.body.style.overflow = previousOverflow;
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-surface-black/35 p-md sm:p-xl"
		role="presentation"
		onclick={handleBackdrop}
	>
		<div
			bind:this={panel}
			class="flex max-h-[calc(100dvh-34px)] w-full flex-col overflow-hidden rounded-lg border border-hairline bg-canvas text-ink {sizeClass}"
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={descriptionId}
			tabindex="-1"
			onfocusout={handleFocusOut}
		>
			<header class="flex items-start justify-between gap-lg border-b border-hairline px-lg py-md">
				<div class="grid gap-xxs">
					{#if title}
						<h2
							id={titleId}
							class="font-display text-[34px] leading-[1.47] font-semibold tracking-[-0.374px]"
						>
							{title}
						</h2>
					{/if}
					{#if description}
						<p
							id={descriptionId}
							class="max-w-[54ch] text-[14px] leading-[1.43] tracking-[-0.224px] text-ink-muted-48"
						>
							{description}
						</p>
					{/if}
				</div>
				{#if dismissible}
					<button
						class="grid size-11 shrink-0 place-items-center rounded-full bg-surface-chip-translucent/60 text-ink transition-transform active:scale-95"
						type="button"
						aria-label="닫기"
						onclick={requestClose}
					>
						×
					</button>
				{/if}
			</header>

			<div class="overflow-y-auto px-lg py-lg">
				{@render children()}
			</div>

			{#if footer}
				<footer class="flex flex-wrap justify-end gap-sm border-t border-hairline px-lg py-md">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</div>
{/if}
