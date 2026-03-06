import React from 'react';

interface PrivacyPolicyContentProps {
    content?: string;
    emptyText: string;
    className?: string;
    plainTextClassName?: string;
    htmlClassName?: string;
}

const ALLOWED_TAGS = new Set([
    'a',
    'b',
    'blockquote',
    'br',
    'code',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'i',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'u',
    'ul',
]);

const DROP_CONTENT_TAGS = new Set([
    'iframe',
    'object',
    'script',
    'style',
]);

const SAFE_PROTOCOLS = new Set([
    'http:',
    'https:',
    'mailto:',
    'tel:',
]);

const DEFAULT_HTML_CLASSNAME = [
    '[&_a]:font-medium',
    '[&_a]:text-blue-600',
    '[&_a]:underline',
    '[&_a]:underline-offset-2',
    '[&_blockquote]:border-l-4',
    '[&_blockquote]:border-slate-200',
    '[&_blockquote]:pl-4',
    '[&_blockquote]:italic',
    '[&_code]:rounded',
    '[&_code]:bg-slate-100',
    '[&_code]:px-1.5',
    '[&_code]:py-0.5',
    '[&_h1]:text-lg',
    '[&_h1]:font-semibold',
    '[&_h1]:leading-snug',
    '[&_h2]:text-base',
    '[&_h2]:font-semibold',
    '[&_h2]:leading-snug',
    '[&_h3]:font-semibold',
    '[&_h4]:font-semibold',
    '[&_li]:my-1',
    '[&_ol]:list-decimal',
    '[&_ol]:pl-5',
    '[&_p]:m-0',
    '[&_p+p]:mt-3',
    '[&_pre]:overflow-x-auto',
    '[&_pre]:rounded-lg',
    '[&_pre]:bg-slate-100',
    '[&_pre]:p-3',
    '[&_strong]:font-semibold',
    '[&_ul]:list-disc',
    '[&_ul]:pl-5',
].join(' ');

const joinClassNames = (...values: Array<string | undefined>) => values.filter(Boolean).join(' ');

const looksLikeHtml = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value);

const sanitizeHref = (href: string): string | null => {
    const trimmedHref = href.trim();
    if (!trimmedHref) return null;
    if (trimmedHref.startsWith('#')) return trimmedHref;

    try {
        const url = new URL(trimmedHref, window.location.origin);
        if (!SAFE_PROTOCOLS.has(url.protocol)) {
            return null;
        }
        return trimmedHref;
    } catch {
        return null;
    }
};

const appendSanitizedChildren = (source: ParentNode, target: Node, outputDoc: Document) => {
    source.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            target.appendChild(outputDoc.createTextNode(node.textContent || ''));
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        const element = node as HTMLElement;
        const tagName = element.tagName.toLowerCase();

        if (DROP_CONTENT_TAGS.has(tagName)) {
            return;
        }

        if (!ALLOWED_TAGS.has(tagName)) {
            appendSanitizedChildren(element, target, outputDoc);
            return;
        }

        const sanitizedElement = outputDoc.createElement(tagName);

        if (tagName === 'a') {
            const safeHref = sanitizeHref(element.getAttribute('href') || '');
            if (safeHref) {
                sanitizedElement.setAttribute('href', safeHref);
                sanitizedElement.setAttribute('rel', 'noopener noreferrer nofollow');
                if (/^https?:/i.test(safeHref)) {
                    sanitizedElement.setAttribute('target', '_blank');
                }
            }
        }

        appendSanitizedChildren(element, sanitizedElement, outputDoc);
        target.appendChild(sanitizedElement);
    });
};

const sanitizeSimpleHtml = (value: string) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return value;
    }

    const parsed = new DOMParser().parseFromString(value, 'text/html');
    const outputDoc = document.implementation.createHTMLDocument('privacy-policy');
    const container = outputDoc.createElement('div');

    appendSanitizedChildren(parsed.body, container, outputDoc);
    return container.innerHTML.trim();
};

const PrivacyPolicyContent: React.FC<PrivacyPolicyContentProps> = ({
    content,
    emptyText,
    className,
    plainTextClassName,
    htmlClassName,
}) => {
    const normalizedContent = String(content ?? '').trim();
    const plainTextClasses = joinClassNames(className, 'whitespace-pre-wrap', plainTextClassName);

    if (!normalizedContent) {
        return <div className={plainTextClasses}>{emptyText}</div>;
    }

    if (!looksLikeHtml(normalizedContent)) {
        return <div className={plainTextClasses}>{normalizedContent}</div>;
    }

    const sanitizedHtml = sanitizeSimpleHtml(normalizedContent);
    if (!sanitizedHtml) {
        return <div className={plainTextClasses}>{emptyText}</div>;
    }

    return (
        <div
            className={joinClassNames(className, DEFAULT_HTML_CLASSNAME, htmlClassName)}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
    );
};

export default PrivacyPolicyContent;
