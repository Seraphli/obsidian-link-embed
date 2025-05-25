/**
 * Utility function to format date strings
 * Supports various formats like YYYY-MM-DD, MM-DD-YYYY, etc.
 *
 * @returns A function that accepts a format string and returns formatted date
 */
export function formatDate() {
	return (text: string) => {
		const now = new Date();
		try {
			// If text is empty, return standard ISO format
			if (!text.trim()) return now.toISOString().split('T')[0];

			// Simple replacements for common formats
			return text
				.replace('YYYY', String(now.getFullYear()))
				.replace('MM', String(now.getMonth() + 1).padStart(2, '0'))
				.replace('DD', String(now.getDate()).padStart(2, '0'))
				.replace('HH', String(now.getHours()).padStart(2, '0'))
				.replace('mm', String(now.getMinutes()).padStart(2, '0'))
				.replace('ss', String(now.getSeconds()).padStart(2, '0'));
		} catch (e) {
			console.log('[Link Embed] Error formatting date:', e);
			return now.toISOString().split('T')[0];
		}
	};
}
