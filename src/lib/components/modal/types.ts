import type { Snippet } from 'svelte';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';

export type ModalProps = {
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
};
