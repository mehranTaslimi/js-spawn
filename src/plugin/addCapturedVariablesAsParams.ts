import * as t from '@babel/types';

export const addCapturedVariablesAsParams = (capturedVars: Set<string>) => {
  const varNames = Array.from(capturedVars).sort();

  const objectProperty = varNames.map((name) =>
    t.objectProperty(t.identifier(name), t.identifier(name), false, true)
  );

  const objectPattern = t.objectPattern(objectProperty);
  const objectExpression = t.objectExpression(objectProperty);

  return { objectPattern, objectExpression };
};
