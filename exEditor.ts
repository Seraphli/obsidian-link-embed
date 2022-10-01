import { Editor, EditorPosition } from 'obsidian';
import { REGEX } from './constants';

interface WordBoundary {
	start: { line: number; ch: number };
	end: { line: number; ch: number };
}

export interface Selected {
	can: boolean;
	text: string;
	boundary: WordBoundary;
}

export class ExEditor {
	public static getSelectedText(editor: Editor, debug: boolean): Selected {
		if (debug) {
			console.log(
				`Link Embed: editor.somethingSelected() ${editor.somethingSelected()}`,
			);
		}
		let cursor = editor.getCursor();
		let wordBoundary: WordBoundary = {
			start: cursor,
			end: cursor,
		};
		if (!editor.somethingSelected()) {
			wordBoundary = this.getWordBoundaries(editor, debug);
			editor.setSelection(wordBoundary.start, wordBoundary.end);
		}
		if (editor.somethingSelected()) {
			return {
				can: true,
				text: editor.getSelection(),
				boundary: {
					start: editor.getCursor('from'),
					end: editor.getCursor('to'),
				},
			};
		}
		return {
			can: false,
			text: editor.getSelection(),
			boundary: wordBoundary,
		};
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
	): WordBoundary {
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
