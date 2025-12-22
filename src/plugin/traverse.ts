import _traverse from '@babel/traverse';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
const traverse: typeof _traverse = (_traverse as any).default ?? _traverse;

export default traverse;
