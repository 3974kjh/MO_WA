/**
 * 토스트 상태 (FE-02, DS §9: 성공 2.6초, role=status). ToastHost가 앱에 하나만 렌더한다.
 * v1.7.0(D-2 stage 2, DS §7-0): 화면은 Skeleton `Toast.Group`(ToastGroup.svelte)이 그린다. 이 저장소가 유일한 어댑터라
 * 호출부(`toast.show/dismiss`)와 `toast.items`(테스트가 읽음)는 그대로이고, 시간(2.6초·5초 되돌리기)도 여기서만 센다.
 */
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
