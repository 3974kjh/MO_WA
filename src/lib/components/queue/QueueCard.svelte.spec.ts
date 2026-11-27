/** M-1: 봇이 보낸 값이 그대로는 반영 안 되는 요청 — '반영'만 막고 이유와 푸는 방법을 보여 준다. */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import QueueCard from './QueueCard.svelte';
import { makeItem } from '../../../../tests/queue/testItem';

const flagged = () =>
	makeItem({
		currency: 'USD',
		proposed_values: { qty: 5, avg_price: 1.00005 }
	});

function q(container: HTMLElement, action: string) {
	return container.querySelector<HTMLElement>(`[data-action="${action}"]`)!;
}

describe('QueueCard · 봇 값 문제(M-1)', () => {
	it('안내 문구를 보여 주고 ‘반영’은 막되 ‘고쳐서 반영’·보류·거절은 연다', async () => {
		const onapprove = vi.fn();
		const onoverride = vi.fn();
		const { container } = render(QueueCard, {
			props: { item: flagged(), onapprove, onoverride }
		});
		const note = container.querySelector('[data-testid="proposed-problem"]');
		expect(note?.textContent).toContain('소수점 아래 4자리를 넘어서');
		expect(note?.textContent).toContain('고쳐서 반영');
		expect(note?.textContent).not.toMatch(/R-[A-Z]+-\d+/);
		expect(q(container, 'approve').getAttribute('aria-disabled')).toBe('true');
		expect(q(container, 'override').getAttribute('aria-disabled')).toBeNull();
		expect(q(container, 'reject').getAttribute('aria-disabled')).toBeNull();
		q(container, 'approve').click();
		expect(onapprove).not.toHaveBeenCalled();
		q(container, 'override').click();
		expect(onoverride).toHaveBeenCalledTimes(1);
	});

	it('정상 요청에는 안내가 없고 ‘반영’이 열려 있다', () => {
		const onapprove = vi.fn();
		const { container } = render(QueueCard, { props: { item: makeItem(), onapprove } });
		expect(container.querySelector('[data-testid="proposed-problem"]')).toBeNull();
		expect(q(container, 'approve').getAttribute('aria-disabled')).toBeNull();
		q(container, 'approve').click();
		expect(onapprove).toHaveBeenCalledTimes(1);
	});
});
