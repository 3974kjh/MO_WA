/** 토스트 상태 (FE-02, DS §9: 성공 2.6초, role=status). ToastHost가 앱에 하나만 렌더한다. */
export type ToastTone = 'default' | 'ok' | 'err';

export interface ToastItem {
	id: number;
	message: string;
	tone: ToastTone;
	action?: { label: string; onclick: () => void };
}

class ToastStore {
	items = $state<ToastItem[]>([]);
	#seq = 0;

	show(
		message: string,
		opts: { tone?: ToastTone; duration?: number; action?: ToastItem['action'] } = {}
	) {
		const id = ++this.#seq;
		this.items.push({ id, message, tone: opts.tone ?? 'default', action: opts.action });
		const ms = opts.duration ?? 2600;
		if (ms > 0) setTimeout(() => this.dismiss(id), ms);
		return id;
	}

	dismiss(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

export const toast = new ToastStore();
