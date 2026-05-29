<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from './Modal.svelte';
	import type { ModalSize } from './types';

	let {
		open,
		title,
		description,
		size = 'lg',
		saving = false,
		saveLabel = '저장',
		formId,
		onClose,
		onSave,
		children
	}: {
		open: boolean;
		title: string;
		description?: string;
		size?: ModalSize;
		saving?: boolean;
		saveLabel?: string;
		formId?: string;
		onClose: () => void;
		onSave?: () => void;
		children: Snippet;
	} = $props();
</script>

<Modal {open} {title} {description} {size} {onClose}>
	{@render children()}

	{#snippet footer()}
		<Button variant="secondary-pill" label="취소" onclick={onClose} />
		<Button
			type={formId ? 'submit' : 'button'}
			form={formId}
			label={saving ? '저장 중' : saveLabel}
			disabled={saving}
			onclick={onSave}
		/>
	{/snippet}
</Modal>
