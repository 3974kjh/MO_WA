<script lang="ts">
	/** 입력 테두리 v1.7.3 상태 점검용: .input 과 .mw-input-group */
</script>

<label class="label" for="reason">
	<span class="label-text">거절 이유</span>
	<textarea id="reason" class="input" rows="3"></textarea>
</label>
<label class="label" for="reason-invalid">
	<span class="label-text">거절 이유(오류)</span>
	<textarea id="reason-invalid" class="input" aria-invalid="true" rows="3"></textarea>
</label>
<div class="mw-input-group" data-testid="group">
	<input id="email-ok" type="email" value="" />
	<button type="button" class="btn-icon" aria-label="비밀번호 보기"></button>
</div>
<div class="mw-input-group" data-invalid data-testid="group-invalid">
	<input id="email-bad" type="email" aria-invalid="true" />
</div>
