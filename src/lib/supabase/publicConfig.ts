/** Reject missing and placeholder public Supabase settings (M-2). Never log secret values. */
export function isUsableSupabasePublicConfig(
	url: string | undefined,
	anonKey: string | undefined
): boolean {
	const trimmedUrl = url?.trim() ?? '';
	const trimmedKey = anonKey?.trim() ?? '';
	if (!trimmedUrl || !trimmedKey) return false;

	const lowerUrl = trimmedUrl.toLowerCase();
	if (
		lowerUrl.includes('example.supabase.co') ||
		lowerUrl.includes('your-project') ||
		lowerUrl.includes('placeholder')
	) {
		return false;
	}

	const lowerKey = trimmedKey.toLowerCase();
	if (
		lowerKey === 'public-anon-key' ||
		lowerKey.includes('your-anon-key') ||
		lowerKey.includes('placeholder')
	) {
		return false;
	}

	return true;
}
