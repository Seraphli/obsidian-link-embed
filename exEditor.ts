import { Editor, EditorPosition } from 'obsidian';
import { REGEX } from './constants';

interface WordBoundaries {
	start: { line: number; ch: number };
	end: { line: number; ch: number };
}

export class ExEditor {
	public static getSelectedText(editor: Editor, debug: boolean): string {
		if (debug) {
			console.log(
				`Link Embed: editor.somethingSelected() ${editor.somethingSelected()}`,
			);
		}
		if (!editor.somethingSelected()) {
			let wordBoundaries = this.getWordBoundaries(editor, debug);
			editor.setSelection(wordBoundaries.start, wordBoundaries.end);
		}
		return editor.getSelection();
	}

	private static cursorWithinBoundaries(
		cursor: EditorPosition,
		match: RegExpMatchArray,
		debug: boolean,
	): boolean {
		let startIndex = match.index;
		let endIndex = match.index + match[0].length;
		if (debug) {
			console.log(
				`Link Embed: cursorWithinBoundaries ${startIndex}, ${cursor.ch}, ${endIndex}`,
			);
		}
		return startIndex <= cursor.ch && cursor.ch <= endIndex;
	}

	private static getWordBoundaries(
		editor: Editor,
		debug: boolean,
	): WordBoundaries {
		let cursor = editor.getCursor();
		let lineText = editor.getLine(cursor.line);

		const urlRegex = new RegExp(REGEX.URL, 'g');
		// Check if we're in a link
		let linksInLine = lineText.matchAll(urlRegex);

		if (debug) {
			console.log('Link Embed: cursor', cursor, 'lineText', lineText);
		}

		for (let match of linksInLine) {
			if (debug) {
				console.log('Link Embed: match', match);
			}
			if (this.cursorWithinBoundaries(cursor, match, debug)) {
				return {
					start: { line: cursor.line, ch: match.index },
					end: {
						line: cursor.line,
						ch: match.index + match[0].length,
					},
				};
			}
		}

		return {
			start: cursor,
			end: cursor,
		};
	}
}
