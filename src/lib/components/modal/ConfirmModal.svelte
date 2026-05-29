<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from './Modal.svelte';

	let {
		open,
		title,
		description,
		confirmLabel = '확인',
		cancelLabel = '취소',
		formId,
		onClose,
		onConfirm
	}: {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		formId?: string;
		onClose: () => void;
		onConfirm?: () => void;
	} = $props();
</script>

<Modal {open} {title} {description} size="sm" {onClose}>
	<p class="text-[17px] leading-[1.47] tracking-[-0.374px] text-ink-muted-80">
		이 작업은 실행 전에 한 번 더 확인이 필요합니다.
	</p>

	{#snippet footer()}
		<Button variant="secondary-pill" label={cancelLabel} onclick={onClose} />
		<Button
			type={formId ? 'submit' : 'button'}
			form={formId}
			label={confirmLabel}
			onclick={onConfirm}
		/>
	{/snippet}
</Modal>
