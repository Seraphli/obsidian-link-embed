import { Notice } from 'obsidian';

/**
 * Notification types supported by the plugin
 */
export type NoticeType = 'error' | 'success' | 'info' | 'warning';

/**
 * Options for customizing notifications
 */
export interface NoticeOptions {
    /** Whether to log the message to console */
    debug?: boolean;
    /** Duration of the notice in milliseconds */
    duration?: number;
    /** Custom prefix for the notification */
    prefix?: string;
    /** Default message if the content is empty */
    defaultMessage?: string;
    /** Context information to include in logs (e.g. "refreshEmbed", "getFavicon") */
    context?: string;
    /** Whether to display the notice at all (useful to only log in certain cases) */
    showNotice?: boolean;
    /** The type of notification (error, success, info, warning) */
    type?: NoticeType;
}

/**
 * Display a notice to the user with customizable options.
 * Handles different message types and provides consistent formatting.
 *
 * @param message The message to display (Error, string, or any other type)
 * @param typeOrDebugOrOptions Notice type, debug flag, or options object
 * @param debugOrOptions Debug flag or options object (if first param was type)
 * @returns The Notice instance that was created (or null if notice was suppressed)
 */
export function showNotice(
    message?: unknown,
    typeOrDebugOrOptions?: NoticeType | boolean | NoticeOptions,
    debugOrOptions?: boolean | NoticeOptions,
): Notice | null {
    // Parse parameters to handle different call signatures
    let type: NoticeType = 'info';
    let options: NoticeOptions = {};

    // Handle different parameter combinations
    if (typeof typeOrDebugOrOptions === 'string') {
        // First param is type, second can be boolean or options
        type = typeOrDebugOrOptions;
        if (typeof debugOrOptions === 'boolean') {
            options = { debug: debugOrOptions };
        } else if (debugOrOptions) {
            options = debugOrOptions;
        }
    } else if (typeof typeOrDebugOrOptions === 'boolean') {
        // First param is debug flag
        options = { debug: typeOrDebugOrOptions };
    } else if (typeOrDebugOrOptions) {
        // First param is options object
        options = typeOrDebugOrOptions;
        if (options.type) {
            type = options.type;
        }
    }

    // Set type-specific defaults
    const defaults = getDefaultsByType(type);

    // Merge provided options with defaults
    const {
        debug = false,
        duration = defaults.duration,
        prefix = defaults.prefix,
        defaultMessage = defaults.defaultMessage,
        context = 'Link Embed',
        showNotice = true,
    } = options;

    // Extract message based on type
    let finalMessage: string;

    if (message instanceof Error) {
        finalMessage = message.message;
    } else if (typeof message === 'string') {
        finalMessage = message;
    } else if (message === null || message === undefined) {
        finalMessage = defaultMessage;
    } else {
        // Handle other types by converting to string
        try {
            finalMessage = String(message);
        } catch {
            finalMessage = defaultMessage;
        }
    }

    // Log to console if debug is enabled
    if (debug) {
        if (type === 'error' && message instanceof Error) {
            // For errors, log both the message and the full error object
            console.log(`[${context}] ${prefix}: ${finalMessage}`, message);
        } else {
            console.log(`[${context}] ${prefix}: ${finalMessage}`);
        }
    }

    // Display notice if enabled
    if (showNotice) {
        return new Notice(`${prefix}: ${finalMessage}`, duration);
    }

    return null;
}

/**
 * Get default settings based on notice type
 */
function getDefaultsByType(type: NoticeType): {
    duration: number;
    prefix: string;
    defaultMessage: string;
} {
    switch (type) {
        case 'error':
            return {
                duration: 5000,
                prefix: 'Error',
                defaultMessage: 'An operation failed',
            };
        case 'success':
            return {
                duration: 3000,
                prefix: 'Success',
                defaultMessage: 'Operation completed successfully',
            };
        case 'warning':
            return {
                duration: 4000,
                prefix: 'Warning',
                defaultMessage: 'Something needs attention',
            };
        case 'info':
        default:
            return {
                duration: 3000,
                prefix: 'Info',
                defaultMessage: 'Information',
            };
    }
}
