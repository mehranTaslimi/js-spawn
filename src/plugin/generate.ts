import _generate from '@babel/generator';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
const generate: typeof _generate = (_generate as any).default ?? _generate;

export default generate;
