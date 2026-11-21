/** 노드를 body 끝으로 옮긴다. backdrop-filter·transform이 있는 조상 안에서도 fixed 시트가 화면 기준으로 뜨게 한다. */
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
