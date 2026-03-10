const BANNED_CLASS_RULES = [
  {
    pattern: /\bdark:/u,
    reason: 'Admin pages must rely on shared theme tokens instead of page-level dark mode utility classes.',
  },
  {
    pattern: /\bbg-slate-(?:50|100|200|300|400|500|600|700|800|900)(?:\/[0-9]+)?\b/u,
    reason: 'Use shared admin card/surface styles instead of page-level slate background utilities.',
  },
  {
    pattern: /\btext-slate-(?:50|100|200|300|400|500|600|700|800|900)\b/u,
    reason: 'Use Typography/AppTag semantics instead of page-level slate text color utilities.',
  },
  {
    pattern: /\bborder-slate-(?:50|100|200|300|400|500|600|700|800|900)\b/u,
    reason: 'Use shared admin card/border styles instead of page-level slate border utilities.',
  },
  {
    pattern: /\brounded-(?:lg|xl|2xl|3xl|\[[^\]]+\])\b/u,
    reason: 'Use shared admin shell radius instead of page-level rounded utility classes.',
  },
  {
    pattern: /\bshadow(?:-[a-z0-9-]+)?\b/u,
    reason: 'Use shared admin shell shadow styles instead of page-level shadow utility classes.',
  },
];

function appendText(parts, text) {
  if (typeof text === 'string' && text.trim()) {
    parts.push(text);
  }
}

function collectStaticText(node, parts) {
  if (!node) {
    return;
  }

  switch (node.type) {
    case 'Literal':
      appendText(parts, typeof node.value === 'string' ? node.value : '');
      return;
    case 'TemplateLiteral':
      node.quasis.forEach((quasi) => appendText(parts, quasi.value.cooked || quasi.value.raw || ''));
      return;
    case 'JSXExpressionContainer':
      collectStaticText(node.expression, parts);
      return;
    case 'ArrayExpression':
      node.elements.forEach((element) => collectStaticText(element, parts));
      return;
    case 'ConditionalExpression':
      collectStaticText(node.consequent, parts);
      collectStaticText(node.alternate, parts);
      return;
    case 'LogicalExpression':
      collectStaticText(node.left, parts);
      collectStaticText(node.right, parts);
      return;
    case 'BinaryExpression':
      if (node.operator === '+') {
        collectStaticText(node.left, parts);
        collectStaticText(node.right, parts);
      }
      return;
    case 'CallExpression':
      if (
        node.callee?.type === 'MemberExpression'
        && node.callee.property?.type === 'Identifier'
        && node.callee.property.name === 'join'
      ) {
        collectStaticText(node.callee.object, parts);
      }
      return;
    case 'ParenthesizedExpression':
      collectStaticText(node.expression, parts);
      return;
    default:
      return;
  }
}

function getClassNameText(attributeValue) {
  const parts = [];
  collectStaticText(attributeValue, parts);
  return parts.join(' ');
}

const noAdminPageVisualUtilitiesRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow page-level visual utility classes in admin pages.',
    },
    schema: [],
    messages: {
      bannedClass:
        'Avoid page-level visual utility "{{token}}". {{reason}} If this is a true raw-content or preview block, add a targeted eslint-disable with a justification.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.type !== 'JSXIdentifier' || node.name.name !== 'className' || !node.value) {
          return;
        }

        const classNameText = getClassNameText(node.value);
        if (!classNameText) {
          return;
        }

        const violation = BANNED_CLASS_RULES.find(({ pattern }) => pattern.test(classNameText));
        if (!violation) {
          return;
        }

        const match = classNameText.match(violation.pattern)?.[0] || 'visual utility';
        context.report({
          node,
          messageId: 'bannedClass',
          data: {
            token: match,
            reason: violation.reason,
          },
        });
      },
    };
  },
};

export default {
  rules: {
    'no-admin-page-visual-utilities': noAdminPageVisualUtilitiesRule,
  },
};
